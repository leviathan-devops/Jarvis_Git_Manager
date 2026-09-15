// Jarvis Git Manager — shell .gitignore plan (W3 cleanup owns this file).
// ALWAYS dry: prints the would-append lines, never writes .gitignore,
// even with --approved. Read-only (may read the existing file to diff).

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
  console.log(
    JSON.stringify({
      action: "ignore-shell",
      dry: true,
      file: SHELL_GITIGNORE,
      wouldAppend,
      alreadyPresent,
    }),
  );
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
