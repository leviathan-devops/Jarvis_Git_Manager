// Jarvis Git Manager — health: classify every known worktree.
// Reads git only (rev-parse + worktree list on SHELL, PLUTUS/agent, GI).
// Zero git mutations. Persists rows to the sqlite store on a best-effort
// basis (persist is optional; classification never depends on it).
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { HOME, SHELL, isKeepLive } from "./keep-table.ts";
import type { HealthJson, HealthWorktree, WorktreeClass } from "./types.ts";
import { normPath, runGit, parseWorktreePorcelain } from "./status.ts";

export const PLUTUS_AGENT = join(SHELL, "PLUTUS/agent");
export const GI_DIR = join(SHELL, "Graph_Intelligence");
export const WT_ROOT = join(HOME, ".omp/wt");
export const SHELL_GIT = join(SHELL, ".git");
export const PLUTUS_GIT = join(PLUTUS_AGENT, ".git");
export const GI_GIT = join(GI_DIR, ".git");
export const STORE_DIR = join(HOME, ".omp/git-manager");
export const STORE_FILE = join(STORE_DIR, "store.sqlite");

function underWt(p: string): boolean {
  return p === WT_ROOT || p.startsWith(WT_ROOT + "/");
}

function commonDirOf(absPath: string): string | null {
  try {
    const r = Bun.spawnSync(["git", "-C", absPath, "rev-parse", "--git-common-dir"]);
    if (r.exitCode !== 0) return null;
    const raw = r.stdout.toString().trim();
    if (!raw) return null;
    // rev-parse prints absolute for linked worktrees, relative (.git) at repo root.
    return normPath(isAbsolute(raw) ? raw : join(absPath, raw));
  } catch {
    return null;
  }
}

function hasNestedProductGit(absPath: string): boolean {
  return (
    existsSync(join(absPath, "PLUTUS/agent/.git")) ||
    existsSync(join(absPath, "Graph_Intelligence/.git"))
  );
}

// MASTER §38 wrapper detect: path under ~/.omp/wt AND git common-dir is
// SHELL .git AND a nested PLUTUS/GI .git exists inside -> wrapper.
// Nested worktree whose common-dir is the PLUTUS/agent (or GI) .git, or any
// path in the keep table, -> keep-live. LIVE WINS over the static table.
export function classifyWorktree(absPath: string, mainToplevels: Set<string>): WorktreeClass {
  const p = normPath(absPath);
  if (isKeepLive(p)) return "keep-live";
  const common = commonDirOf(p);
  if (common === normPath(PLUTUS_GIT) || common === normPath(GI_GIT)) return "keep-live";
  const shellGit = normPath(SHELL_GIT);
  if (
    underWt(p) &&
    common !== null &&
    (common === shellGit || common.startsWith(shellGit + "/")) &&
    hasNestedProductGit(p)
  ) {
    return "wrapper";
  }
  if (mainToplevels.has(p)) return "product";
  return "leftover";
}

export async function collectHealth(extraSources: string[] = []): Promise<HealthJson> {
  const JGM_ROOT = "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/Jarvis_Git_Manager";
  const sources = [SHELL, PLUTUS_AGENT, GI_DIR, JGM_ROOT, ...extraSources].filter((s) => existsSync(s));
  const toplevels = new Set<string>();
  const entries: { toplevel: string; path: string; branch: string; head: string }[] = [];
  for (const src of sources) {
    let toplevel: string;
    try {
      toplevel = normPath((await runGit(src, "rev-parse", "--show-toplevel")).trim());
    } catch {
      continue;
    }
    toplevels.add(toplevel);
    let list: string;
    try {
      list = await runGit(src, "worktree", "list", "--porcelain");
    } catch {
      continue;
    }
    for (const w of parseWorktreePorcelain(list)) {
      entries.push({ toplevel, path: w.path, branch: w.branch, head: w.head });
    }
  }
  const seen = new Set<string>();
  const worktrees: HealthWorktree[] = [];
  for (const e of entries) {
    if (seen.has(e.path)) continue;
    seen.add(e.path);
    worktrees.push({
      path: e.path,
      repo: e.toplevel,
      branch: e.branch,
      head: e.head,
      class: classifyWorktree(e.path, toplevels),
    });
  }
  worktrees.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { worktrees };
}

// Mkdir the store dir, open sqlite in WAL mode, apply schema.sql.
// Returns null when persistence is unavailable; callers must not fail.
export function ensureStore(): Database | null {
  try {
    mkdirSync(STORE_DIR, { recursive: true });
    const db = new Database(STORE_FILE);
    db.exec("PRAGMA journal_mode=WAL;");
    db.exec("PRAGMA busy_timeout=5000;");
    const schema = readFileSync(join(import.meta.dir, "schema.sql"), "utf8");
    db.exec(schema);
    return db;
  } catch {
    return null;
  }
}

export async function run(_args: string[]): Promise<void> {
  const health = await collectHealth();
  const db = ensureStore();
  if (db) {
    try {
      const ins = db.prepare(
        "INSERT OR REPLACE INTO git_worktree(path,repo,branch,class,keep,head) VALUES (?,?,?,?,?,?)",
      );
      for (const w of health.worktrees) {
        ins.run(w.path, w.repo, w.branch, w.class, isKeepLive(w.path) ? 1 : 0, w.head);
      }
    } catch {
      // persist optional: classification output is the deliverable
    }
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  process.stdout.write(JSON.stringify(health) + "\n");
}
