// Jarvis Git Manager — provisioner (W4 layout).
// Depth-1 only: inits exactly <dir>/.git (bare) + <dir>/main (worktree).
// NEVER recurses, never touches parent repos, never provisions product trees.
// Refuses (exit 2): dotdirs, docs, reports, GLOBAL_MASTER_CONTEXT, HOME,
// SHELL itself, keep-live paths, any tree already containing .git
// (read-only `find <dir> -maxdepth 3 -name .git`, never writes before the check).
// Init: git init --bare <dir>/.git + empty-tree commit on main +
// `git --git-dir <dir>/.git worktree add <dir>/main main`.
// Stdout: one JSON object. Stderr: human. Exit 0 pass, 1 fail, 2 refuse.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { HOME, SHELL, isKeepLive } from "./keep-table.ts";
import { refuse } from "./refuse.ts";

function argVal(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const n of names) {
      if (a === n) return args[i + 1];
      if (a.startsWith(n + "=")) return a.slice(n.length + 1);
    }
  }
  return undefined;
}

function norm(p: string): string {
  const t = p.trim();
  return t.length > 1 && t.endsWith("/") ? t.slice(0, -1) : t;
}

function base(p: string): string {
  const n = norm(p);
  const i = n.lastIndexOf("/");
  return i < 0 ? n : n.slice(i + 1);
}

function git(args: string[], extraEnv?: Record<string, string>): { code: number; out: string; err: string } {
  const r = spawnSync("git", args, {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "jarvis-git-manager",
      GIT_AUTHOR_EMAIL: "jgm@localhost",
      GIT_COMMITTER_NAME: "jarvis-git-manager",
      GIT_COMMITTER_EMAIL: "jgm@localhost",
      ...extraEnv,
    },
  });
  const out = typeof r.stdout === "string" ? r.stdout.trim() : "";
  const err = typeof r.error === "object" && r.error !== null
    ? String((r.error as Error).message ?? r.error)
    : (typeof r.stderr === "string" ? r.stderr.trim() : "");
  return { code: typeof r.status === "number" ? r.status : 1, out, err };
}

function fail(msg: string): never {
  process.stderr.write(`provision: ${msg}\n`);
  process.exit(1);
}

/** Read-only: any .git at or under dir within depth 3. Never writes. */
function findNestedGit(dir: string): string | null {
  if (existsSync(`${dir}/.git`)) return `${dir}/.git`;
  const r = spawnSync("find", [dir, "-maxdepth", "3", "-name", ".git", "-print", "-quit"], {
    encoding: "utf8",
  });
  if (typeof r.status === "number" && r.status === 0 && typeof r.stdout === "string") {
    const hit = r.stdout.trim().split("\n")[0]?.trim() ?? "";
    if (hit) return hit;
  }
  return null;
}

const SKIP_NAMES: Record<string, true> = {
  docs: true,
  reports: true,
  GLOBAL_MASTER_CONTEXT: true,
};

export async function run(args: string[]): Promise<void> {
  const dirRaw = argVal(args, "--dir");
  if (!dirRaw) {
    process.stderr.write("provision: --dir <abs-path> is required\n");
    process.exit(1);
  }
  if (!dirRaw.startsWith("/")) {
    process.stderr.write(`provision: --dir must be absolute, got: ${dirRaw}\n`);
    process.exit(1);
  }
  const dir = norm(dirRaw);
  const name = base(dir);

  if (name.length === 0 || name === "/" || name.startsWith(".")) {
    refuse("UNOWNED-PATH", `refusing to provision dotdir: ${dir}`);
  }
  if (SKIP_NAMES[name] === true) {
    refuse("UNOWNED-PATH", `refusing to provision reserved name '${name}': ${dir}`);
  }
  if (dir === norm(HOME)) {
    refuse("HOME-LEAK", `refusing to provision HOME itself: ${dir}`);
  }
  if (dir === norm(SHELL)) {
    refuse("UNOWNED-PATH", `refusing to provision SHELL itself (${SHELL})`);
  }
  if (isKeepLive(dir)) {
    refuse("LIVE-WORKER", `target ${dir} is keep-live; refusing provision`);
  }

  // Depth-1 only: this module inits exactly <dir>/.git + <dir>/main.
  // No recursion, no parent handling, no second tree.
  const gitDir = `${dir}/.git`;
  const worktree = `${dir}/main`;

  if (existsSync(dir)) {
    const hit = findNestedGit(dir);
    if (hit !== null) {
      refuse("UNOWNED-PATH", `tree already contains .git at ${hit}; refusing provision of ${dir}`);
    }
  }

  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    fail(`cannot mkdir ${dir}: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Re-check after mkdir (TOCTOU guard): still no .git before we write.
  if (existsSync(gitDir)) {
    refuse("UNOWNED-PATH", `tree already contains .git at ${gitDir}; refusing provision of ${dir}`);
  }

  const init = git(["init", "--bare", gitDir]);
  if (init.code !== 0) fail(`git init --bare ${gitDir} failed: ${init.err || init.out}`);

  const tree = git(["--git-dir", gitDir, "hash-object", "-t", "tree", "/dev/null"]);
  if (tree.code !== 0 || !tree.out) fail(`hash empty tree failed: ${tree.err || tree.out}`);
  const commit = git(["--git-dir", gitDir, "commit-tree", tree.out, "-m", "provision init"]);
  if (commit.code !== 0 || !commit.out) fail(`empty-tree commit failed: ${commit.err || commit.out}`);
  const sha = commit.out.trim();

  const ref = git(["--git-dir", gitDir, "update-ref", "refs/heads/main", sha]);
  if (ref.code !== 0) fail(`update-ref refs/heads/main failed: ${ref.err || ref.out}`);
  const head = git(["--git-dir", gitDir, "symbolic-ref", "HEAD", "refs/heads/main"]);
  if (head.code !== 0) fail(`symbolic-ref HEAD failed: ${head.err || head.out}`);

  const add = git(["--git-dir", gitDir, "worktree", "add", worktree, "main"]);
  if (add.code !== 0) fail(`worktree add ${worktree} failed: ${add.err || add.out}`);

  process.stderr.write(`provision: ${dir} -> bare ${gitDir} + worktree ${worktree} (main ${sha.slice(0, 12)})\n`);
  process.stdout.write(
    JSON.stringify({
      action: "provision",
      dir,
      gitDir,
      worktree,
      branch: "main",
      commit: sha,
      dry: false,
      mutate: true,
    }) + "\n",
  );
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
