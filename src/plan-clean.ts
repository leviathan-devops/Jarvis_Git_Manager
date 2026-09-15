// Jarvis Git Manager — plan-clean: dry-run cleanup preview. ZERO git
// mutations. Reads the live worktree state (via health collection), writes
// one ~/.omp/git-manager/preview-<utc>.json file (+ best-effort sqlite row),
// prints the PlanCleanJson on stdout.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normPath } from "./status.ts";
import { collectHealth, ensureStore, PLUTUS_AGENT, STORE_DIR, WT_ROOT } from "./health.ts";
import type { PlanCleanJson, PreviewOp } from "./types.ts";

function utcStamp(d: Date = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

function underWt(p: string): boolean {
  return p === WT_ROOT || p.startsWith(WT_ROOT + "/");
}

export async function run(_args: string[]): Promise<void> {
  const health = await collectHealth();
  const ops: PreviewOp[] = [];

  // Relocate wrapper-hosted keep-live workers (e.g. omp-worker-1 nested
  // inside ~/.omp/wt/plutus-main-66dfa4c) into PLUTUS/agent/.worktrees/<branch>.
  // LIVE WINS: only propose when the target path exists on disk right now.
  for (const w of health.worktrees) {
    if (w.class !== "keep-live" || !underWt(w.path)) continue;
    if (!existsSync(w.path)) continue;
    const name =
      w.branch && w.branch !== "detached" && w.branch.length > 0
        ? w.branch.replace(/^refs\/heads\//, "")
        : w.path.split("/").pop() ?? "worker";
    const dest = join(PLUTUS_AGENT, ".worktrees", name);
    if (normPath(dest) === normPath(w.path)) continue;
    ops.push({
      action: "relocate",
      target: w.path,
      dest,
      reason: `wrapper-hosted keep-live worker (branch ${w.branch ?? "unknown"}) belongs under PLUTUS/agent/.worktrees`,
    });
  }

  // Optional: drop leftover wrappers that are NOT keep-live. Preview only.
  for (const w of health.worktrees) {
    if (w.class !== "leftover" || !underWt(w.path)) continue;
    if (!existsSync(w.path)) continue;
    ops.push({
      action: "drop-wrapper",
      target: w.path,
      reason: `leftover wrapper (branch ${w.branch ?? "unknown"}), not keep-live`,
    });
  }

  const keep = health.worktrees
    .filter((w) => w.class === "keep-live")
    .map((w) => w.path)
    .sort();
  const measuredAt = new Date().toISOString();
  const previewId = `preview-${utcStamp()}`;
  const json: PlanCleanJson = { previewId, ops, keep, measuredAt };

  mkdirSync(STORE_DIR, { recursive: true });
  const file = join(STORE_DIR, `${previewId}.json`);
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");

  const db = ensureStore();
  if (db) {
    try {
      db.prepare("INSERT OR REPLACE INTO git_preview(id,json,status,created) VALUES (?,?,?,?)").run(
        previewId,
        JSON.stringify(json),
        "pending",
        measuredAt,
      );
    } catch {
      // persist optional
    }
    try {
      db.close();
    } catch {
      // ignore
    }
  }

  process.stdout.write(JSON.stringify(json) + "\n");
  process.stderr.write(`preview ${previewId} -> ${file} (${ops.length} ops, ZERO git mutations)\n`);
}
