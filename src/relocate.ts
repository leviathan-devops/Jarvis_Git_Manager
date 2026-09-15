// Jarvis Git Manager — relocate omp-worker-1 (W3 cleanup owns this file).
// A MOVE, never a delete: the nested keep-live worker is preserved, only re-homed.
//   source      /home/leviathan/.omp/wt/plutus-main-66dfa4c/PLUTUS/agent (wrapper-side)
//   destination /home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/PLUTUS/agent/.worktrees/omp-worker-1
// Default dry. Mutate requires --approved <fresh-preview-id> AND JGM_ALLOW_MUTATE=1.
// Operator approval is NOT present this wave, so every path below stays dry.
// Safety: refuse LIVE-WORKER if the move would overwrite existing keep-live data.

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

export const PLUTUS_AGENT = "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/PLUTUS/agent";
export const RELOCATE_SOURCE = "/home/leviathan/.omp/wt/plutus-main-66dfa4c/PLUTUS/agent";
export const RELOCATE_DEST = `${PLUTUS_AGENT}/.worktrees/omp-worker-1`;

export async function run(args: string[]): Promise<void> {
  const a = stripAction(args, ["relocate"]);
  const src = flagValue(a, "--source") ?? RELOCATE_SOURCE;
  const dest = flagValue(a, "--dest") ?? RELOCATE_DEST;
  const approved = parseApproved(a);

  // Relocate preserves the worker; refuse only if dest already holds keep-live
  // data the move would destroy. The keep-live SOURCE itself never refuses:
  // moving it is the job, deleting it is not on the table.
  if (existsSync(dest) && isKeepLive(dest)) {
    refuse(
      "LIVE-WORKER",
      `relocate dest ${dest} exists and is keep-live; refusing to overwrite`,
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
    const why = a.includes("--dry")
      ? "explicit --dry"
      : !approved
        ? "no --approved <preview-id>; default dry"
        : "JGM_ALLOW_MUTATE!=1; operator approval not present this wave";
    process.stderr.write(`relocate (dry): ${src} -> ${dest} (${why})\n`);
    console.log(
      JSON.stringify({
        action: "relocate",
        dry: true,
        source: src,
        dest,
        destination: dest,
        sourceExists: existsSync(src),
        destExists: existsSync(dest),
        previewId: approved ?? null,
        reason: why,
      }),
    );
    return;
  }

  // Armed mutate path (unreachable this wave: needs approved fresh id + env).
  // The source must still be a registered worktree of PLUTUS/agent; anything
  // else means the world moved under the preview -> stale, do not touch git.
  const list = Bun.spawnSync(["git", "-C", PLUTUS_AGENT, "worktree", "list", "--porcelain"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const registered =
    list.exitCode === 0 &&
    list.stdout
      .toString()
      .split("\n")
      .some((l) => l === `worktree ${src}`);
  if (!registered) {
    refuse(
      "STALE-PREVIEW",
      `relocate src ${src} is no longer a registered worktree of ${PLUTUS_AGENT}; re-run plan-clean`,
    );
  }
  const mv = Bun.spawnSync(["git", "-C", PLUTUS_AGENT, "worktree", "move", src, dest], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (mv.exitCode !== 0) {
    process.stderr.write(`relocate failed: ${mv.stderr.toString().trim()}\n`);
    process.exit(1);
  }
  console.log(
    JSON.stringify({ action: "relocate", dry: false, source: src, dest, previewId: approved }),
  );
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
