// Jarvis Git Manager — spawn-worker (W4 layout).
// Dry-only this wave: NEVER runs `git worktree add`. Prints a dry plan as JSON.
// Refuses when cwd toplevel == SHELL for product plutus|gi|graph-intelligence.
import { spawnSync } from "node:child_process";
import { HOME, SHELL } from "./keep-table.ts";
import { refuse } from "./refuse.ts";

const PUFFER_PRODUCTS: Record<string, true> = { plutus: true, gi: true, "graph-intelligence": true };

function argVal(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const n of names) {
      if (a === n) return args[i + 1];
      if (a.startsWith(n + "=")) return a.slice(n.length + 1);
    }
  }
  return undefined;
}

function norm(p: string): string {
  const t = p.trim();
  return t.length > 1 && t.endsWith("/") ? t.slice(0, -1) : t;
}

function toplevelOf(cwd: string): string | null {
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const out = typeof r.stdout === "string" ? r.stdout.trim() : "";
  return out ? norm(out) : null;
}

export async function run(args: string[]): Promise<void> {
  // Canonical: --cwd. Alias --repo (MASTER §14 gate) and --dir.
  const cwdRaw = argVal(args, "--cwd", "--repo", "--dir") ?? process.cwd();
  const productRaw = argVal(args, "--product");
  if (!productRaw) {
    process.stderr.write(
      "spawn-worker: --product required (plutus|gi|graph-intelligence)\n",
    );
    process.exit(1);
  }
  const product = productRaw.toLowerCase();
  const cwd = norm(cwdRaw);
  const toplevel = toplevelOf(cwdRaw);

  if (toplevel !== null && norm(toplevel) === norm(HOME)) {
    refuse("HOME-LEAK", `cwd toplevel is HOME (${toplevel}); refusing spawn`);
  }
  const cwdIsShell = toplevel !== null ? norm(toplevel) === norm(SHELL) : cwd === norm(SHELL);
  if (cwdIsShell && PUFFER_PRODUCTS[product] === true) {
    refuse(
      "PUFFER-PARENT",
      `cwd toplevel is SHELL (${SHELL}) for product=${product}; spawn from a product repo cwd instead`,
    );
  }

  // Dry-only: never `git worktree add` in this wave.
  const plan = {
    action: "spawn-worker",
    cwd,
    toplevel,
    product,
    dry: true,
    mutate: false,
    message:
      "dry-run only: git worktree add disabled in this wave; re-run from a product repo cwd",
  };
  process.stdout.write(JSON.stringify(plan) + "\n");
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
