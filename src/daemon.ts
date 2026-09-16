// Jarvis Git Manager — daemon tick: observe + store only.
// One tick: collect health, upsert git_worktree rows, record adopt notes
// for product|leftover rows under a watched root, record mark-gone notes
// for stored paths missing from health. Observes and stores only: it never
// changes git state and never deletes store rows.
import { resolve } from "node:path";
import {
  GI_DIR,
  PLUTUS_AGENT,
  collectHealth,
  ensureStore,
} from "./health.ts";
import { isKeepLive } from "./keep-table.ts";

const JGM_ROOT = resolve(import.meta.dir, "..");
// Product roots the daemon watches for adoption notes.
const WATCHED_ROOTS: string[] = [PLUTUS_AGENT, GI_DIR, JGM_ROOT];

interface TickJson {
  tick: string;
  upserts: number;
  adopts: number;
  gone: number;
  classes: Record<string, number>;
}

async function main(): Promise<TickJson> {
  const now = new Date().toISOString();
  const health = await collectHealth();
  const classes: Record<string, number> = {};
  for (const w of health.worktrees) {
    classes[w.class] = (classes[w.class] ?? 0) + 1;
  }
  let upserts = 0;
  let adopts = 0;
  let gone = 0;
  const db = ensureStore();
  if (db) {
    try {
      const stored = new Set<string>();
      try {
        const rows = db.query("SELECT path FROM git_worktree").all() as { path: string }[];
        for (const row of rows) stored.add(row.path);
      } catch {
        // fresh store: nothing stored yet, nothing can vanish
      }
      const live = new Set(health.worktrees.map((w) => w.path));
      const upsert = db.prepare(
        "INSERT OR REPLACE INTO git_worktree(path,repo,branch,class,keep,head) VALUES (?,?,?,?,?,?)",
      );
      for (const w of health.worktrees) {
        upsert.run(w.path, w.repo, w.branch, w.class, isKeepLive(w.path) ? 1 : 0, w.head);
        upserts += 1;
      }
      const note = db.prepare(
        "INSERT INTO git_op(preview_id,action,result,ts) VALUES (?,?,?,?)",
      );
      for (const w of health.worktrees) {
        const watched = WATCHED_ROOTS.some((root) => w.path === root || w.path.startsWith(root + "/"));
        if ((w.class === "product" || w.class === "leftover") && watched) {
          note.run("daemon-adopt", "adopt-note", w.path, now);
          adopts += 1;
        }
      }
      for (const path of stored) {
        if (!live.has(path)) {
          note.run("daemon-sweep", "mark-gone", path, now);
          gone += 1;
        }
      }
    } finally {
      try {
        db.close();
      } catch {
        // ignore close errors: the tick output is the deliverable
      }
    }
  }
  return { tick: now, upserts, adopts, gone, classes };
}

try {
  const tick = await main();
  process.stdout.write(JSON.stringify(tick) + "\n");
} catch (e) {
  process.stderr.write(`daemon: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
