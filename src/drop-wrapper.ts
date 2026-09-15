// Jarvis Git Manager — drop the outer puffer wrapper (W3 cleanup owns this file).
// The droppable wrapper is the OUTER dir (e.g. ~/.omp/wt/plutus-main-66dfa4c),
// never anything keep-live inside it.
// LIVE-WORKER refusals fire FIRST, before any dry handling (even with --dry):
//   - isKeepLive(target)
//   - target mentions grok-prototype (the live grok worker)
//   - target mentions Graph_Intelligence (keep-live product tree)
// Default dry. Mutate requires --approved <fresh-preview-id> AND JGM_ALLOW_MUTATE=1.
// Operator approval is NOT present this wave, so every path below stays dry.

import { existsSync } from "node:fs";
import { refuse } from "./refuse.ts";
import { isKeepLive } from "./keep-table.ts";
import {
  stripAction,
  flagValue,
  parseApproved,
  loadPreview,
  verifyShas,
  STORE_DIR,
} from "./preview.ts";

function firstPositional(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const t = args[i] as string;
    if (
      t === "--approved" ||
      t === "--target" ||
      t === "--source" ||
      t === "--dest" ||
      t === "--id"
    ) {
      i++;
      continue;
    }
    if (t.startsWith("--")) continue;
    return t;
  }
  return null;
}

function resolveTarget(raw: string): string {
  let abs = raw.trim();
  if (!abs.startsWith("/")) abs = `${process.cwd()}/${abs}`;
  if (abs.length > 1 && abs.endsWith("/")) abs = abs.slice(0, -1);
  return abs;
}

export async function run(args: string[]): Promise<void> {
  const a = stripAction(args, ["drop-wrapper", "drop"]);
  const approved = parseApproved(a);
  const targetRaw = flagValue(a, "--target") ?? firstPositional(a);

  if (!targetRaw) {
    process.stderr.write("drop-wrapper: missing --target <path>; nothing to do\n");
    console.log(
      JSON.stringify({
        action: "drop-wrapper",
        dry: true,
        target: null,
        reason: "no target given",
      }),
    );
    return;
  }

  const abs = resolveTarget(targetRaw);

  // Refusals before everything else: grok-prototype and Graph_Intelligence are
  // live workers even when addressed by a bare name from another cwd.
  if (isKeepLive(abs)) {
    refuse("LIVE-WORKER", `target ${abs} is keep-live; refusing drop`);
  }
  if (targetRaw.includes("grok-prototype") || abs.includes("grok-prototype")) {
    refuse(
      "LIVE-WORKER",
      `target ${abs} is the live grok-prototype worker; refusing drop`,
    );
  }
  if (targetRaw.includes("Graph_Intelligence") || abs.includes("Graph_Intelligence")) {
    refuse(
      "LIVE-WORKER",
      `target ${abs} is Graph_Intelligence keep-live; refusing drop`,
    );
  }

  // Fail-closed on the approval id even for dry runs: unknown id is stale.
  if (approved) {
    const pv = await loadPreview(approved);
    if (!pv) {
      refuse(
        "STALE-PREVIEW",
        `preview ${approved} not found under ${STORE_DIR}/preview-*.json or store.sqlite`,
      );
    }
    const check = verifyShas(pv);
    if (!check.ok) {
      refuse("STALE-PREVIEW", `preview ${approved} is stale: ${check.detail}`);
    }
  }

  if (a.includes("--dry") || !approved || process.env.JGM_ALLOW_MUTATE !== "1") {
    let why: string;
    if (a.includes("--dry")) {
      why = "explicit --dry";
    } else if (!approved) {
      why = "no --approved <preview-id>; default dry";
    } else {
      why = "JGM_ALLOW_MUTATE!=1; operator approval not present this wave";
    }
    process.stderr.write(`drop-wrapper (dry): would drop ${abs} (${why})\n`);
    console.log(
      JSON.stringify({
        action: "drop-wrapper",
        dry: true,
        target: abs,
        targetExists: existsSync(abs),
        previewId: approved ?? null,
        reason: why,
      }),
    );
    return;
  }

  // Armed mutate path (unreachable this wave: needs approved fresh id + env).
  if (existsSync(`${abs}/.git/index.lock`)) {
    refuse("WORKTREE-BOUND", `target ${abs} is busy (index.lock present); refusing drop`);
  }
  const rm = Bun.spawnSync(["rm", "-rf", "--", abs], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (rm.exitCode !== 0) {
    process.stderr.write(`drop-wrapper failed: ${rm.stderr.toString().trim()}\n`);
    process.exit(1);
  }
  console.log(
    JSON.stringify({ action: "drop-wrapper", dry: false, target: abs, previewId: approved }),
  );
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
