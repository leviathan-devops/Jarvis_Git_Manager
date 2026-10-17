// Jarvis Git Manager — commit-cone: stage an owned cone and commit it.
// Product porcelain: agents never type raw git for commits.
//
// Contract:
//   bun commit-cone.ts --cwd <repo> --paths <a,b,c> --message <m>
// --cwd defaults to process.cwd(). --paths is comma-separated and required.
// --message is required. Each cone path resolves against --cwd.
//
// Refusals (exit 2): cwd toplevel == HOME -> HOME-LEAK; cwd toplevel == SHELL
// -> PUFFER-PARENT; any cone path outside the repo toplevel, or a toplevel
// that is neither a keep-live product root nor a /tmp throwaway probe,
// -> UNOWNED-PATH; any secret pattern in cone content or in the cone diff
// -> SECRET-HIT (file names only, never values), before anything is staged.
// Failures (exit 1): missing/empty --paths or --message, cwd outside a git
// repo, git add/commit/rev-parse errors.
//
// Staging uses explicit pathspecs only (`git add -- <paths...>`). The commit
// appends a wave trailer line. Stdout is one JSON object:
//   {action:"commit-cone", sha, files, dry:false}.
// A sqlite git_op row is written best-effort; store failure never fails commit.
import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { HOME, SHELL, isKeepLive } from "./keep-table.ts";
import { refuse } from "./refuse.ts";
import type { Token } from "./types.ts";

function argVal(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === name) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) return undefined;
      return v;
    }
    if (a.startsWith(name + "=")) return a.slice(name.length + 1);
  }
  return undefined;
}

function stripSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

// Lexical containment: p == root or p under root/.
function under(root: string, p: string): boolean {
  if (p === root) return true;
  const rel = relative(root, p);
  return rel !== "" && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}

// Same check through real paths when the lexical check fails (cwd reached
// through a symlink). Missing paths fall back to the lexical answer.
function underLive(root: string, p: string): boolean {
  if (under(root, p)) return true;
  try {
    if (under(realpathSync(root), realpathSync(p))) return true;
  } catch {
    // missing path: try the nearest existing ancestor below
  }
  try {
    const dir = dirname(p);
    if (dir === p) return false;
    return under(realpathSync(root), join(realpathSync(dir), p.slice(dir.length + 1)));
  } catch {
    return false;
  }
}

// Throwaway probe roots: the only non-keep-live toplevels commit-cone ever
// writes in. Hardcoded /tmp and /var/tmp only. TMPDIR / os.tmpdir() is
// caller-controlled and is not an exemption. Compare canonical paths so a
// symlink cannot escape. A missing toplevel or probe root (ENOENT/ENOTDIR)
// does not grant probe ownership. Every other filesystem error propagates.
class ProbeFs {
  static isAbsent(err: unknown): boolean {
    if (typeof err !== "object" || err === null || !("code" in err)) return false;
    const code = (err as { code?: unknown }).code;
    return code === "ENOENT" || code === "ENOTDIR";
  }
}

function isProbeRoot(tl: string): boolean {
  const roots: string[] = ["/tmp", "/var/tmp"];
  let realTl: string;
  try {
    realTl = stripSlash(realpathSync(tl));
  } catch (err) {
    if (!ProbeFs.isAbsent(err)) throw err;
    return false;
  }
  return roots.some((r) => {
    let root: string;
    try {
      root = stripSlash(realpathSync(r));
    } catch (err) {
      if (!ProbeFs.isAbsent(err)) throw err;
      return false;
    }
    return realTl === root || realTl.startsWith(root + "/");
  });
}

// Secret patterns, built from fragments so this file's own source never
// matches its own scan. Four shapes: sk- long keys, api keys, token
// assignments, password assignments. Five call sites share this predicate.
function hasSecretText(s: string): boolean {
  const sk = new RegExp("sk-" + "[A-Za-z0-9]{20,}");
  const apiKey = new RegExp("api" + "_" + "key", "i");
  const tokenEq = new RegExp("token" + "\\s*=", "i");
  const passwordEq = new RegExp("pass" + "word" + "\\s*=", "i");
  return sk.test(s) || apiKey.test(s) || tokenEq.test(s) || passwordEq.test(s);
}

function git(cwd: string, gitArgs: string[]): { code: number; out: string; err: string } {
  const r = Bun.spawnSync(["git", "-C", cwd, ...gitArgs], { stdout: "pipe", stderr: "pipe" });
  const decode = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (v instanceof Uint8Array) return new TextDecoder().decode(v);
    return String(v ?? "");
  };
  return { code: r.exitCode, out: decode(r.stdout), err: decode(r.stderr).trim() };
}

export async function run(args: string[]): Promise<void> {
  const cwdRaw = argVal(args, "--cwd") ?? process.cwd();
  const pathsRaw = argVal(args, "--paths");
  const messageRaw = argVal(args, "--message");

  const wanted = (pathsRaw ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (wanted.length === 0) {
    process.stderr.write("commit-cone: --paths <comma-separated> is required and must name at least one path\n");
    process.exit(1);
  }
  if (messageRaw === undefined || messageRaw.trim().length === 0) {
    process.stderr.write("commit-cone: --message <text> is required\n");
    process.exit(1);
  }
  const message = messageRaw;

  const cwd = stripSlash(resolve(cwdRaw));
  const cones = [...new Set(wanted.map((p) => stripSlash(resolve(cwd, p))))];

  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) {
    process.stderr.write(`commit-cone: not inside a git repo: ${cwd}\n`);
    process.exit(1);
  }
  const tl = stripSlash(top.out.trim().split("\n")[0] ?? "");
  if (tl === "") {
    process.stderr.write(`commit-cone: empty toplevel for cwd ${cwd}\n`);
    process.exit(1);
  }
  if (tl === stripSlash(resolve(HOME))) {
    refuse("HOME-LEAK", `cwd toplevel is HOME (${tl}); refusing commit`);
  }
  if (tl === stripSlash(resolve(SHELL))) {
    refuse("PUFFER-PARENT", `cwd toplevel is SHELL (${tl}); run commit-cone from a product repo cwd instead`);
  }

  const keep = isKeepLive(tl);
  const probe = isProbeRoot(tl);
  for (const c of cones) {
    if (!underLive(tl, c)) {
      refuse("UNOWNED-PATH", `cone path ${c} sits outside repo toplevel ${tl}; refusing commit`);
    }
    if (keep && !isKeepLive(c)) {
      refuse("UNOWNED-PATH", `cone path ${c} sits outside the keep-live product root; refusing commit`);
    }
    if (!keep && !probe) {
      refuse("UNOWNED-PATH", `repo toplevel ${tl} is neither a keep-live product root nor a throwaway probe; refusing commit`);
    }
  }

  // Secret scan BEFORE staging. Working-tree bodies of changed cone files
  // plus the cone diff vs HEAD (vs index when HEAD is unborn, so staged
  // content with no working-tree trace is still caught). Unchanged files
  // stage nothing, so there is no new content to leak from them. Hits report
  // file names only, never values.
  const headUnborn = git(tl, ["rev-parse", "--verify", "HEAD"]).code !== 0;
  const base: string[] = headUnborn ? ["diff", "--cached"] : ["diff", "HEAD"];
  const rels = cones.map((c) => (c === tl ? "." : relative(tl, c)));

  const changedAbs: string[] = [];
  const nameProcs: string[][] = [];
  if (!headUnborn) {
    nameProcs.push(["diff", "HEAD", "--name-only", "-z", "--", ...rels]);
    nameProcs.push(["diff", "--cached", "--name-only", "-z", "--", ...rels]);
    nameProcs.push(["diff", "--name-only", "-z", "--", ...rels]);
  } else {
    nameProcs.push(["diff", "--cached", "--name-only", "-z", "--", ...rels]);
    nameProcs.push(["diff", "--name-only", "-z", "--", ...rels]);
  }
  nameProcs.push(["ls-files", "--others", "--exclude-standard", "-z", "--", ...rels]);
  for (const a of nameProcs) {
    const r = git(tl, a);
    if (r.code !== 0) continue;
    for (const n of r.out.split("\0").filter((s) => s.length > 0)) {
      const abs = stripSlash(resolve(tl, n));
      if (underLive(tl, abs) && !changedAbs.includes(abs)) changedAbs.push(abs);
    }
  }

  const hits: string[] = [];
  const noteHit = (f: string): void => {
    if (!hits.includes(f)) hits.push(f);
  };
  for (const f of changedAbs) {
    let isReg = false;
    try {
      isReg = statSync(f).isFile();
    } catch {
      continue;
    }
    if (!isReg) continue;
    let body: string;
    try {
      body = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (hasSecretText(body)) noteHit(f);
  }
  // HEAD-born scan: staged index bodies (cat-file :<path>) catch a secret
  // committed via `git add` even when the working-tree twin is clean.
  for (const f of changedAbs) {
    if (tl !== f.slice(0, tl.length)) continue;
    const rel = f === tl ? "." : relative(tl, f);
    const staged = git(tl, ["cat-file", "-p", `:${rel}`]);
    if (staged.code !== 0) continue;
    if (hasSecretText(staged.out)) noteHit(f);
  }
  const combined = git(tl, [...base, "--", ...rels]);
  if (combined.code === 0 && hasSecretText(combined.out)) {
    let narrowed = false;
    for (const c of cones) {
      const r = c === tl ? "." : relative(tl, c);
      const per = git(tl, [...base, "--", r]);
      if (per.code !== 0 || !hasSecretText(per.out)) continue;
      let cIsFile = false;
      try {
        cIsFile = statSync(c).isFile();
      } catch {
        cIsFile = false;
      }
      if (cIsFile) {
        noteHit(c);
        narrowed = true;
        continue;
      }
      let local = false;
      const nm = git(tl, [...base, "--name-only", "-z", "--", r]);
      if (nm.code === 0) {
        for (const n of nm.out.split("\0").filter((s) => s.length > 0)) {
          const abs = stripSlash(resolve(tl, n));
          const fd = git(tl, [...base, "--", n]);
          if (fd.code === 0 && hasSecretText(fd.out)) {
            noteHit(abs);
            narrowed = true;
            local = true;
          }
        }
      }
      if (!local) {
        noteHit(c);
        narrowed = true;
      }
    }
    if (!narrowed) for (const c of cones) noteHit(c);
  }
  if (hits.length > 0) {
    const names = [...hits].sort().join(" ");
    // New token string (SKILL.md documents it): cast keeps the frozen Token
    // union untouched — W2 owns only this file, never types.ts.
    refuse("SECRET-HIT" as Token, `refusing commit; secret pattern in ${hits.length} file(s): ${names}`);
  }

  const add = git(tl, ["add", "--", ...rels]);
  if (add.code !== 0) {
    process.stderr.write(`commit-cone: git add failed: ${add.err || "unknown error"}\n`);
    process.exit(1);
  }
  const fullMessage = `${message}\n\nwave: commit-cone`;
  const commit = git(tl, ["commit", "-m", fullMessage]);
  if (commit.code !== 0) {
    process.stderr.write(`commit-cone: git commit failed: ${(commit.err || "unknown error").slice(0, 300)}\n`);
    process.exit(1);
  }
  const rev = git(tl, ["rev-parse", "HEAD"]);
  const sha = rev.out.trim();
  if (rev.code !== 0 || sha === "") {
    process.stderr.write("commit-cone: commit ran but rev-parse HEAD failed\n");
    process.exit(1);
  }

  try {
    const dir = `${process.env.HOME ?? HOME}/.omp/git-manager`;
    mkdirSync(dir, { recursive: true });
    const db = new Database(`${dir}/store.sqlite`);
    try {
      db.exec("PRAGMA journal_mode=WAL;");
      db.exec(
        "CREATE TABLE IF NOT EXISTS git_op (preview_id TEXT NOT NULL, action TEXT NOT NULL, result TEXT NOT NULL, ts TEXT NOT NULL);" +
          "CREATE INDEX IF NOT EXISTS idx_git_op_preview ON git_op(preview_id);",
      );
      db.prepare("INSERT INTO git_op(preview_id,action,result,ts) VALUES (?,?,?,?)").run(
        "commit-cone",
        "commit-cone",
        sha,
        new Date().toISOString(),
      );
    } finally {
      try {
        db.close();
      } catch {
        // ignore close errors: the commit above is the deliverable
      }
    }
  } catch {
    // store is best-effort: the commit above is the deliverable
  }

  process.stdout.write(JSON.stringify({ action: "commit-cone", sha, files: cones, dry: false }) + "\n");
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
