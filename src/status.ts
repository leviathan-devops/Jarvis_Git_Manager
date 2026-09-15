// Jarvis Git Manager — status: read-only repo probe. Never mutates git.
// Reads: git -C <cwd> rev-parse (toplevel, common-dir, branch, head) +
// git worktree list --porcelain. Refuses HOME-LEAK on the HOME repo.
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { HOME, SHELL } from "./keep-table.ts";
import type { StatusJson, StatusWorktree } from "./types.ts";
import { refuse } from "./refuse.ts";

export function normPath(p: string): string {
  const n = resolve(p);
  return n.length > 1 && n.endsWith("/") ? n.slice(0, -1) : n;
}

export function cwdArg(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd" && i + 1 < args.length) return normPath(args[i + 1]);
    if (a.startsWith("--cwd=")) return normPath(a.slice("--cwd=".length));
  }
  return normPath(process.cwd());
}

export async function runGit(cwd: string, ...gitArgs: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "-C", cwd, ...gitArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`git ${gitArgs.join(" ")} failed in ${cwd}: ${err.trim()}`);
  }
  return out;
}

export function parseWorktreePorcelain(out: string): StatusWorktree[] {
  const rows: StatusWorktree[] = [];
  for (const block of out.split("\n\n")) {
    let path = "";
    let branch = "";
    let head = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length).trim();
      else if (line.startsWith("HEAD ")) head = line.slice("HEAD ".length).trim();
      else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
      } else if (line.trim() === "detached") branch = "detached";
    }
    if (path) rows.push({ path: normPath(path), branch, head });
  }
  return rows;
}

function fail(msg: string): never {
  process.stderr.write(`status: ${msg}\n`);
  process.exit(1);
}

export async function run(args: string[]): Promise<void> {
  const cwd = cwdArg(args);
  let rev: string;
  try {
    rev = await runGit(
      cwd,
      "rev-parse",
      "--show-toplevel",
      "--git-common-dir",
      "--abbrev-ref",
      "HEAD",
      "--short",
      "HEAD",
    );
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  const lines = rev!
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 4) fail(`unexpected rev-parse output in ${cwd}: ${JSON.stringify(lines)}`);
  const repoRoot = normPath(lines[0]);
  if (repoRoot === normPath(HOME)) {
    refuse("HOME-LEAK", `cwd ${cwd} resolves to HOME repo ${repoRoot}`);
  }
  const commonDir = resolve(cwd, lines[1]);
  const branch = lines[2];
  const head = lines[3];
  let worktrees: StatusWorktree[];
  try {
    worktrees = parseWorktreePorcelain(await runGit(cwd, "worktree", "list", "--porcelain"));
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
  const nestedGit: string[] = [];
  if (repoRoot === normPath(SHELL)) {
    for (const rel of ["PLUTUS/agent/.git", "Graph_Intelligence/.git"]) {
      const p = join(repoRoot, rel);
      if (existsSync(p)) nestedGit.push(p);
    }
  }
  const json: StatusJson = { repoRoot, commonDir, branch, head, nestedGit, leak: false, worktrees: worktrees! };
  process.stdout.write(JSON.stringify(json) + "\n");
}
