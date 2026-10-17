// Leftover archive acceptance. Each test builds its own git repo and
// worktrees under a private temp directory.
//
// Watched-red-first: JGM_ARCHIVE_PLANTED_BUG=1 forces the old no-op
// (leftovers are classified and left in place). The archive test fails
// on that planted case. CI runs that red case before the real suite.
import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArchiveInterrupted,
  archiveLeftovers,
  type ArchiveReport,
} from "../src/archive-leftover.ts";

const bun = process.execPath;
const cli = join(import.meta.dir, "..", "src", "git-manager.ts");
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]): string {
  const r = spawnSync(
    "git",
    ["-c", "core.fsmonitor=false", "-c", "commit.gpgsign=false", "-C", cwd, ...args],
    {
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
    },
  );
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
}

interface Fixture {
  root: string;
  repo: string;
  archive: string;
}

function initFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "jgm-gk1-"));
  temps.push(root);
  const repo = join(root, "repo");
  const archive = join(root, "archive");
  spawnSync("git", ["init", "-q", "-b", "main", repo], { encoding: "utf8" });
  git(repo, ["config", "user.email", "jgm-test@example.com"]);
  git(repo, ["config", "user.name", "jgm-test"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  git(repo, ["config", "core.fsmonitor", "false"]);
  mkdirSync(join(repo, "sub"));
  writeFileSync(join(repo, "file.txt"), "hello\n");
  writeFileSync(join(repo, "sub", "a.txt"), "nested\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "init"]);
  return { root, repo, archive };
}

function addWorktree(repo: string, dest: string, branch: string): void {
  git(repo, ["worktree", "add", "-q", "-b", branch, dest]);
}

function fileMap(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        stack.push(abs);
        continue;
      }
      const rel = abs.slice(root.length + 1);
      out[rel] = createHash("sha256").update(readFileSync(abs)).digest("hex");
    }
  }
  return out;
}

function fileCount(root: string): number {
  if (!existsSync(root)) return 0;
  return Object.keys(fileMap(root)).length;
}

function adminMap(repo: string, worktreeBase: string): Record<string, string> {
  const dir = join(repo, ".git", "worktrees", worktreeBase);
  if (!existsSync(dir)) return {};
  return fileMap(dir);
}

test("a leftover gets archived", async () => {
  const fx = initFixture();
  const wt = join(fx.root, "wt-left");
  addWorktree(fx.repo, wt, "leftover/old");
  const before = fileMap(wt);
  const mainFile = readFileSync(join(fx.repo, "file.txt"), "utf8");

  const report = await archiveLeftovers({
    repo: fx.repo,
    archiveDir: fx.archive,
    apply: true,
  });

  expect(report.mutated).toBe(true);
  expect(report.archived.length).toBe(1);
  const archived = report.archived[0];
  if (archived === undefined) throw new Error("missing archive record");
  expect(existsSync(wt)).toBe(false);
  expect(fileMap(archived.dest)).toEqual(before);
  const manifest = JSON.parse(readFileSync(archived.manifest, "utf8")) as {
    state: string;
    source: string;
    branch: string;
    head: string;
  };
  expect(manifest.state).toBe("archived");
  expect(manifest.source).toBe(wt);
  expect(manifest.branch).toBe("leftover/old");
  expect(manifest.head.length).toBeGreaterThan(0);
  const list = git(fx.repo, ["worktree", "list", "--porcelain"]);
  expect(list).toContain(archived.dest);
  expect(list).not.toContain(`worktree ${wt}`);
  expect(git(fx.repo, ["branch", "--list", "leftover/old"])).toContain("leftover/old");
  expect(readFileSync(join(fx.repo, "file.txt"), "utf8")).toBe(mainFile);
});

test("an active or dirty worktree is never touched", async () => {
  const fx = initFixture();
  const dirty = join(fx.root, "wt-dirty");
  const active = join(fx.root, "wt-active");
  const left = join(fx.root, "wt-left");
  addWorktree(fx.repo, dirty, "dirty/one");
  addWorktree(fx.repo, active, "active/one");
  addWorktree(fx.repo, left, "leftover/one");
  writeFileSync(join(dirty, "file.txt"), "changed\n");
  git(fx.repo, ["worktree", "lock", active, "--reason", "in-use"]);

  const dirtyFiles = fileMap(dirty);
  const activeFiles = fileMap(active);
  const dirtyAdmin = adminMap(fx.repo, "wt-dirty");
  const activeAdmin = adminMap(fx.repo, "wt-active");

  const report = await archiveLeftovers({
    repo: fx.repo,
    archiveDir: fx.archive,
    apply: true,
  });

  expect(existsSync(dirty)).toBe(true);
  expect(existsSync(active)).toBe(true);
  expect(fileMap(dirty)).toEqual(dirtyFiles);
  expect(fileMap(active)).toEqual(activeFiles);
  expect(adminMap(fx.repo, "wt-dirty")).toEqual(dirtyAdmin);
  expect(adminMap(fx.repo, "wt-active")).toEqual(activeAdmin);
  expect(readFileSync(join(dirty, "file.txt"), "utf8")).toBe("changed\n");
  expect(readFileSync(join(active, "file.txt"), "utf8")).toBe("hello\n");
  expect(readFileSync(join(fx.repo, "sub", "a.txt"), "utf8")).toBe("nested\n");
  const skipped = new Map(report.skipped.map((row) => [row.path, row.disposition]));
  expect(skipped.get(dirty)).toBe("skip-dirty");
  expect(skipped.get(active)).toBe("skip-active");
  expect(existsSync(left)).toBe(false);
  const list = git(fx.repo, ["worktree", "list", "--porcelain"]);
  expect(list).toContain(`worktree ${dirty}`);
  expect(list).toContain(`worktree ${active}`);
});

test("dry-run changes nothing", async () => {
  const fx = initFixture();
  const wt = join(fx.root, "wt-left");
  addWorktree(fx.repo, wt, "leftover/dry");
  const before = fileMap(wt);
  const listBefore = git(fx.repo, ["worktree", "list", "--porcelain"]);

  const report = await archiveLeftovers({
    repo: fx.repo,
    archiveDir: fx.archive,
    apply: false,
  });

  expect(report.dry).toBe(true);
  expect(report.apply).toBe(false);
  expect(report.mutated).toBe(false);
  expect(report.archived).toEqual([]);
  expect(report.planned.map((row) => row.path)).toEqual([wt]);
  expect(existsSync(fx.archive)).toBe(false);
  expect(existsSync(wt)).toBe(true);
  expect(fileMap(wt)).toEqual(before);
  expect(git(fx.repo, ["worktree", "list", "--porcelain"])).toBe(listBefore);

  const cliRun = spawnSync(
    bun,
    [
      cli,
      "archive-leftover",
      "--repo",
      fx.repo,
      "--archive-dir",
      fx.archive,
    ],
    { encoding: "utf8" },
  );
  expect(cliRun.status).toBe(0);
  const body = JSON.parse(cliRun.stdout) as ArchiveReport;
  expect(body.dry).toBe(true);
  expect(body.mutated).toBe(false);
  expect(existsSync(fx.archive)).toBe(false);
  expect(fileMap(wt)).toEqual(before);
  expect(git(fx.repo, ["worktree", "list", "--porcelain"])).toBe(listBefore);
});

test("an archive interrupted part-way is recoverable", async () => {
  const fx = initFixture();
  const wt = join(fx.root, "wt-left");
  addWorktree(fx.repo, wt, "leftover/partial");
  const before = fileMap(wt);

  let caught: unknown;
  try {
    await archiveLeftovers({
      repo: fx.repo,
      archiveDir: fx.archive,
      apply: true,
      faultAfterMoves: 1,
    });
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ArchiveInterrupted);

  const idDir = readdirSync(fx.archive).find((name) => existsSync(join(fx.archive, name, "manifest.json")));
  if (idDir === undefined) throw new Error("partial manifest was not written");
  const journalPath = join(fx.archive, idDir, "manifest.json");
  const partial = JSON.parse(readFileSync(journalPath, "utf8")) as {
    state: string;
    source: string;
    dest: string;
    moved: string[];
    files: { rel: string; sha256: string }[];
  };
  expect(partial.state).toBe("moving");
  expect(partial.source).toBe(wt);
  expect(partial.moved.length).toBe(1);
  expect(fileCount(wt)).toBeGreaterThan(0);
  expect(fileCount(partial.dest)).toBeGreaterThan(0);
  expect(fileCount(wt) + fileCount(partial.dest)).toBe(partial.files.length);

  const resumed = await archiveLeftovers({
    repo: fx.repo,
    archiveDir: fx.archive,
    apply: true,
  });
  expect(resumed.resumed.length).toBe(1);
  expect(existsSync(wt)).toBe(false);
  expect(fileMap(partial.dest)).toEqual(before);
  const done = JSON.parse(readFileSync(journalPath, "utf8")) as { state: string; moved: string[] };
  expect(done.state).toBe("archived");
  expect(done.moved.length).toBe(partial.files.length);
  const list = git(fx.repo, ["worktree", "list", "--porcelain"]);
  expect(list).toContain(partial.dest);
  expect(git(fx.repo, ["branch", "--list", "leftover/partial"])).toContain("leftover/partial");

  const again = await archiveLeftovers({
    repo: fx.repo,
    archiveDir: fx.archive,
    apply: true,
  });
  expect(again.mutated).toBe(false);
  expect(again.archived).toEqual([]);
  expect(fileMap(partial.dest)).toEqual(before);
});

test("a delete verb is refused and nothing is archived", () => {
  const fx = initFixture();
  const wt = join(fx.root, "wt-left");
  addWorktree(fx.repo, wt, "leftover/keep");
  const before = fileMap(wt);
  const r = spawnSync(
    bun,
    [
      cli,
      "archive-leftover",
      "delete",
      "--repo",
      fx.repo,
      "--archive-dir",
      fx.archive,
      "--apply",
    ],
    { encoding: "utf8" },
  );
  expect(r.status).toBe(2);
  expect(r.stderr).toContain("only archives");
  expect(existsSync(wt)).toBe(true);
  expect(existsSync(fx.archive)).toBe(false);
  expect(fileMap(wt)).toEqual(before);
});
