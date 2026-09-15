// Jarvis Git Manager — preview store + execute gate (W3 cleanup owns this file).
// READ-ONLY deps: types.ts keep-table.ts refuse.ts schema.sql. Never edits them.
// Never mutates git. Default dry. Execute requires --approved <preview-id> AND
// JGM_ALLOW_MUTATE=1. Operator approval is NOT present this wave, so every
// path below stays dry; the armed branch is fail-closed code, never taken here.

import { Database } from "bun:sqlite";
import { Glob } from "bun";
// Static sibling imports: used only inside runExecute at call time, after both
// sides of the preview<->relocate/drop-wrapper cycle finish initializing.
import { run as runRelocate } from "./relocate.ts";
import { run as runDropWrapper } from "./drop-wrapper.ts";
import { run as runIgnoreShell } from "./ignore-shell.ts";
import { existsSync } from "node:fs";
import { refuse } from "./refuse.ts";
import type { PlanCleanJson, PreviewOp } from "./types.ts";

export const STORE_DIR = `${process.env.HOME ?? "/home/leviathan"}/.omp/git-manager`;
export const STORE_DB = `${STORE_DIR}/store.sqlite`;

export type PreviewDoc = PlanCleanJson & Record<string, unknown>;

/** Drop a leading action word so run() accepts both ["--dry"] and ["relocate","--dry"]. */
export function stripAction(args: string[], names: string[]): string[] {
  if (args.length > 0 && names.includes(args[0] as string)) return args.slice(1);
  return args;
}

/** --name value | --name=value. Null when the flag is absent or valueless. */
export function flagValue(args: string[], name: string): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === name) {
      const v = args[i + 1];
      if (v !== undefined && !v.startsWith("--")) return v;
      return null;
    }
    if (a.startsWith(name + "=")) return a.slice(name.length + 1);
  }
  return null;
}

/** --approved <id> | --approved=<id> */
export function parseApproved(args: string[]): string | null {
  return flagValue(args, "--approved");
}

function safeId(id: string): boolean {
  return (
    id.length > 0 &&
    id.length <= 256 &&
    !id.includes("/") &&
    !id.includes("\0") &&
    !id.includes("..")
  );
}

async function loadFromFiles(id: string): Promise<PreviewDoc | null> {
  if (safeId(id)) {
    try {
      const raw = await Bun.file(`${STORE_DIR}/preview-${id}.json`).text();
      return JSON.parse(raw) as PreviewDoc;
    } catch {
      // fall through to directory sweep
    }
  }
  try {
    const glob = new Glob("preview-*.json");
    for await (const f of glob.scan({ cwd: STORE_DIR, absolute: true })) {
      try {
        const doc = JSON.parse(await Bun.file(f).text()) as PreviewDoc;
        if (doc.previewId === id) return doc;
        const rec = doc as unknown as Record<string, unknown>;
        if (typeof rec["id"] === "string" && rec["id"] === id) return doc;
      } catch {
        // skip unreadable members
      }
    }
  } catch {
    // store dir missing -> null
  }
  return null;
}

function loadFromSqlite(id: string): PreviewDoc | null {
  if (!safeId(id) || !existsSync(STORE_DB)) return null;
  try {
    const db = new Database(STORE_DB, { readonly: true });
    try {
      const row = db
        .query("SELECT json FROM git_preview WHERE id = ?")
        .get(id) as { json: string } | null;
      if (!row) return null;
      return JSON.parse(row.json) as PreviewDoc;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Load a preview by id from preview-*.json first, sqlite second. Null = unknown id. */
export async function loadPreview(id: string): Promise<PreviewDoc | null> {
  const fromFiles = await loadFromFiles(id);
  if (fromFiles) return fromFiles;
  return loadFromSqlite(id);
}

/** Collect every expected path->sha pair the preview carries, across plan-clean shapes. */
export function collectExpectedShas(pv: PreviewDoc): Map<string, string> {
  const out = new Map<string, string>();
  const put = (k: unknown, v: unknown) => {
    if (
      typeof k === "string" &&
      k.length > 0 &&
      typeof v === "string" &&
      /^[0-9a-f]{4,40}$/i.test(v)
    ) {
      out.set(k, v);
    }
  };
  const rec = pv as unknown as Record<string, unknown>;
  for (const key of ["shas", "heads", "measured", "measuredShas"]) {
    const m = rec[key];
    if (m !== null && typeof m === "object" && !Array.isArray(m)) {
      for (const [k, v] of Object.entries(m as Record<string, unknown>)) put(k, v);
    }
  }
  if (Array.isArray(pv.ops)) {
    for (const op of pv.ops) {
      const o = op as unknown as Record<string, unknown>;
      const target = o["target"] ?? o["path"] ?? o["repo"];
      const sha = o["head"] ?? o["sha"] ?? o["headSha"] ?? o["expectedHead"];
      put(target, sha);
    }
  }
  return out;
}

/** Read-only HEAD measurement. Never mutates. Null when the path is not a readable repo. */
export function measureHead(dir: string): string | null {
  try {
    const p = Bun.spawnSync(["git", "-C", dir, "rev-parse", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (p.exitCode !== 0) return null;
    const s = p.stdout.toString().trim();
    return /^[0-9a-f]{40}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

/** Compare preview SHAs against live measurement. Any drift (or unreadable path) = stale. */
export function verifyShas(pv: PreviewDoc): { ok: boolean; detail: string } {
  const expected = collectExpectedShas(pv);
  if (expected.size === 0) {
    return { ok: true, detail: "no measured SHAs in preview; nothing to compare" };
  }
  const drift: string[] = [];
  for (const [path, sha] of expected) {
    const live = measureHead(path);
    if (live === null || live !== sha.toLowerCase()) {
      drift.push(`${path}: preview=${sha} live=${live ?? "unreadable"}`);
    }
  }
  if (drift.length > 0) {
    return { ok: false, detail: `SHA drift vs preview: ${drift.join("; ")}` };
  }
  return { ok: true, detail: `${expected.size} SHAs match` };
}

/**
 * execute --approved <preview-id>.
 * Missing flag, unknown id, or SHA drift -> STALE-PREVIEW exit 2.
 * Valid id without JGM_ALLOW_MUTATE=1 stays dry (exit 0, no mutation).
 */
export async function runExecute(args: string[]): Promise<void> {
  const a = stripAction(args, ["execute"]);
  const id = parseApproved(a);
  if (!id) {
    refuse(
      "STALE-PREVIEW",
      "execute requires --approved <preview-id>; default is dry, refusing mutate",
    );
  }
  const pv = await loadPreview(id);
  if (!pv) {
    refuse(
      "STALE-PREVIEW",
      `preview ${id} not found under ${STORE_DIR}/preview-*.json or ${STORE_DB}`,
    );
  }
  const check = verifyShas(pv);
  if (!check.ok) {
    refuse("STALE-PREVIEW", `preview ${id} is stale: ${check.detail}`);
  }
  const ops = (Array.isArray(pv.ops) ? pv.ops : []) as PreviewOp[];
  if (process.env.JGM_ALLOW_MUTATE !== "1") {
    process.stderr.write(
      `execute ${id}: dry run (JGM_ALLOW_MUTATE!=1; operator approval not present this wave)\n`,
    );
    console.log(
      JSON.stringify({
        action: "execute",
        dry: true,
        previewId: id,
        ops: ops.length,
        shaCheck: check.detail,
      }),
    );
    return;
  }
  // Armed path: operator approval + env gate both present (never this wave).
  // Dispatches each op back through its owning module with the same approved id;
  // those modules re-validate the preview and re-check safety before touching git.
  const results: Array<Record<string, unknown>> = [];
  for (const op of ops) {
    if (op.action === "relocate") {
      const rargs = ["relocate", "--approved", id];
      if (typeof op.target === "string" && op.target.length > 0) {
        rargs.push("--source", op.target);
      }
      if (typeof op.dest === "string" && op.dest.length > 0) {
        rargs.push("--dest", op.dest);
      }
      await runRelocate(rargs);
      results.push({ action: op.action, ok: true });
    } else if (op.action === "drop-wrapper") {
      if (typeof op.target !== "string" || op.target.length === 0) {
        process.stderr.write(`execute ${id}: drop-wrapper op without target; aborting\n`);
        process.exit(1);
      }
      await runDropWrapper(["drop-wrapper", "--target", op.target, "--approved", id]);
      results.push({ action: op.action, target: op.target, ok: true });
    } else if (op.action === "ignore-shell") {
      await runIgnoreShell(["ignore-shell", "--approved", id]);
      results.push({ action: op.action, ok: true });
    } else {
      process.stderr.write(`execute ${id}: unknown op action ${op.action}; aborting\n`);
      process.exit(1);
    }
  }
  console.log(JSON.stringify({ action: "execute", dry: false, previewId: id, results }));
}

/**
 * preview [--id <id> | <id>] shows one preview; bare preview lists known ids.
 * preview execute --approved <id> delegates to runExecute. Read-only.
 */
export async function run(args: string[]): Promise<void> {
  const a = stripAction(args, ["preview"]);
  if (a.includes("execute") || a.includes("--approved") || parseApproved(a) !== null) {
    await runExecute(a);
    return;
  }
  const id =
    flagValue(a, "--id") ??
    (a.length === 1 && !(a[0] as string).startsWith("--") ? (a[0] as string) : null);
  if (id) {
    const pv = await loadPreview(id);
    if (!pv) {
      refuse(
        "STALE-PREVIEW",
        `preview ${id} not found under ${STORE_DIR}/preview-*.json or ${STORE_DB}`,
      );
    }
    const check = verifyShas(pv);
    console.log(
      JSON.stringify({
        action: "preview",
        previewId: id,
        fresh: check.ok,
        shaCheck: check.detail,
        preview: pv,
      }),
    );
    return;
  }
  const ids: string[] = [];
  try {
    const glob = new Glob("preview-*.json");
    for await (const f of glob.scan({ cwd: STORE_DIR })) {
      const m = /^preview-(.+)\.json$/.exec(f);
      if (m) ids.push(m[1] as string);
    }
  } catch {
    // no store dir yet
  }
  ids.sort();
  console.log(
    JSON.stringify({ action: "preview", dry: true, previews: ids, store: STORE_DIR }),
  );
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
