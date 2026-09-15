// Jarvis Git Manager — shell .gitignore plan (W4 shell buffer).
// ALWAYS dry: prints the would-append lines, never writes .gitignore,
// even with --approved. Read-only (may read the existing file to diff).
// Stdout: one JSON object with dry:true + sha256 of the existing file.
// Stderr: human. Exit 0 pass.

import { createHash } from "node:crypto";
import { SHELL } from "./keep-table.ts";

export const SHELL_GITIGNORE = `${SHELL}/.gitignore`;

/** Lines the shell root .gitignore should carry for the unowned heavy dirs. */
export const IGNORE_LINES = [
  "PLUTUS/",
  "JARVIS/",
  "Graph_Intelligence/",
  "Dragon_Shell/",
  "circuit/",
  "GM_Cards/",
  "Jarvis_Git_Manager/",
];

export async function run(args: string[]): Promise<void> {
  void args;
  let existing = "";
  try {
    existing = await Bun.file(SHELL_GITIGNORE).text();
  } catch {
    existing = "";
  }
  const present = new Set(
    existing
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0),
  );
  const wouldAppend = IGNORE_LINES.filter((l) => !present.has(l));
  const alreadyPresent = IGNORE_LINES.filter((l) => present.has(l));
  for (const l of wouldAppend) {
    process.stderr.write(`would append to ${SHELL_GITIGNORE}: ${l}\n`);
  }
  process.stderr.write(`ignore-shell: dry run, ${SHELL_GITIGNORE} not written\n`);
  const sha = createHash("sha256").update(existing, "utf8").digest("hex");
  console.log(
    JSON.stringify({
      action: "ignore-shell",
      dry: true,
      file: SHELL_GITIGNORE,
      wouldAppend,
      alreadyPresent,
      sha,
    }),
  );
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
