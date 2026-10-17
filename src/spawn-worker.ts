// Jarvis Git Manager — spawn-worker (W4 layout + live spawn).
// Default dry: prints a dry plan as JSON, NEVER runs `git worktree add`.
// Live (explicit --live only): runs `wt switch -c -x omp <branch>` from the
// PRODUCT repo toplevel cwd via Bun.spawnSync with 120s timeout, then prints
// JSON with branch + cwd + bind (`/move <new-path>`) string.
// Refuses when cwd toplevel == HOME (HOME-LEAK) or == SHELL for product
// plutus|gi|graph-intelligence (PUFFER-PARENT). Never spawns from SHELL/HOME.
import { spawnSync } from "node:child_process";
import { HOME, SHELL } from "./keep-table.ts";
import { refuse } from "./refuse.ts";

const PUFFER_PRODUCTS: Record<string, true> = { plutus: true, gi: true, "graph-intelligence": true };

// Live spawn: `wt switch -c -x omp <branch>` via Bun.spawnSync, 120s timeout.
// --no-cd --no-hooks --format json: the CLI is non-interactive (stdin ignore,
// no shell integration to cd with, no hooks to run under Bun). -x takes an
// ABSOLUTE program path plus `--` args — bare `omp` fails PATH lookup under
// wt direct-exec (os error 2), and bare `omp -p …` needs an interactive TUI
// (exit 129 after creating the tree). Proven on a /tmp throwaway:
// `-x /home/leviathan/.bun/bin/omp -- -p "reply ok"` exits 0 with the tree.
const OMP_BIN = "/home/leviathan/.bun/bin/omp";
const WT_SWITCH_BASE = ["wt", "switch", "--format", "json", "--no-cd", "--no-hooks", "-c", "-x", OMP_BIN] as const;
const WT_TIMEOUT_MS = 120000;

function argVal(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const n of names) {
      if (a === n) {
        const v = args[i + 1];
        if (v === undefined || v.startsWith("--")) return undefined;
        return v;
      }
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
    timeout: 15000,
  });
  if (r.error) {
    process.stderr.write(`spawn-worker: git failed to run: ${String(r.error)}\n`);
    process.exit(1);
  }
  if (r.status !== 0) return null;
  const out = typeof r.stdout === "string" ? r.stdout.trim() : "";
  return out ? norm(out) : null;
}

function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString("utf8");
  return String(v ?? "");
}

function fail(msg: string): never {
  process.stderr.write(`spawn-worker: ${msg}\n`);
  process.exit(1);
}

// Read-only discovery: find the worktree path carrying refs/heads/<branch>
// under <toplevel> via `git worktree list --porcelain`. Never mutates.
function worktreePathForBranch(toplevel: string, branch: string): string | null {
  const r = spawnSync("git", ["-C", toplevel, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
    timeout: 15000,
  });
  if (r.error || r.status !== 0) return null;
  const out = typeof r.stdout === "string" ? r.stdout : "";
  let curPath: string | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      curPath = line.slice("worktree ".length).trim() || null;
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      const m = ref.match(/^refs\/heads\/(.+)$/);
      const b = m ? m[1] : ref;
      if (b === branch && curPath) return curPath;
    } else if (line.trim() === "") {
      curPath = null;
    }
  }
  return null;
}

function validBranch(b: string): boolean {
  if (!b || b.startsWith("-") || b.startsWith(".")) return false;
  if (b.includes("\n") || b.includes("\0")) return false;
  if (b.includes("..")) return false;
  if (/[\s~^:?*\[\\]/.test(b)) return false;
  if (b.endsWith("/") || b.endsWith(".lock")) return false;
  return true;
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

  const live = args.includes("--live");
  const branch = argVal(args, "--branch", "--name");

  // Default stays dry unless --live AND cwd is product toplevel
  // (cwd == its own git toplevel, never SHELL/HOME — refused above).
  if (!live) {
    // Delegation (W2): the real worker spawn is `wt switch -c -x omp <branch>`
    // run from the PRODUCT repo cwd (never from SHELL — see PUFFER-PARENT
    // refuse above). See wt.ts wtSwitchCreate(). Dry-only by default: no
    // `git worktree add`, no `wt switch` mutating live trees — mutating smoke
    // runs only on a THROWAWAY repo (see wave log).
    const plan: Record<string, unknown> = {
      action: "spawn-worker",
      cwd,
      toplevel,
      product,
      dry: true,
      mutate: false,
      spawn: "wt switch -c -x omp <branch>",
      message:
        "dry-run only: pass --branch <name> --live from a product repo toplevel to spawn via wt switch",
    };
    if (branch !== undefined) plan.branch = branch;
    process.stdout.write(JSON.stringify(plan) + "\n");
    return;
  }

  // Live path: --live requires --branch and a product toplevel cwd.
  if (branch === undefined || branch === "") {
    fail("live spawn requires --branch <name> (wt switch -c -x omp <branch>)");
  }
  if (!validBranch(branch)) {
    fail(`live spawn refuses invalid branch name: ${branch}`);
  }
  if (toplevel === null) {
    fail(`live spawn requires a git repo cwd (not a repo: ${cwd}); run from a product repo toplevel`);
  }
  if (norm(cwd) !== norm(toplevel)) {
    fail(`live spawn requires cwd == product toplevel (cwd=${cwd} toplevel=${toplevel}); run from the repo root`);
  }
  // Belt-and-braces: never spawn from SHELL/HOME even if the refuses above
  // are ever reordered — live wt runs only from a product repo cwd.
  if (norm(toplevel) === norm(HOME) || norm(toplevel) === norm(SHELL)) {
    refuse(
      norm(toplevel) === norm(HOME) ? "HOME-LEAK" : "PUFFER-PARENT",
      `live spawn never runs from ${toplevel}; run from a product repo cwd instead`,
    );
  }

  // Live spawn: `wt switch -c -x <omp> <branch> -- <omp args>` from the
  // product cwd, 120s timeout, stdin ignore so wt never inherits the
  // terminal picker. Mutating smoke runs only on a THROWAWAY repo — never
  // live trees. omp runs headless (`-p`) so the TUI never opens under Bun.
  const command = [...WT_SWITCH_BASE, branch, "--", "-p", "reply ok"];
  let code: number | null = null;
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  try {
    const r = Bun.spawnSync(command, {
      cwd: toplevel,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      timeout: WT_TIMEOUT_MS,
    });
    code = r.exitCode;
    stdout = toText(r.stdout);
    stderr = toText(r.stderr);
    timedOut = "exitedDueToTimeout" in r && r.exitedDueToTimeout === true;
  } catch (e) {
    stdout = "";
    stderr = e instanceof Error ? e.message : String(e);
    code = 127;
  }
  if (timedOut) {
    const out = {
      action: "spawn-worker",
      cwd,
      toplevel,
      product,
      branch,
      dry: false,
      mutate: false,
      command,
      code: code ?? 124,
      timedOut: true,
      stdout: stdout.trim(),
      stderr: (stderr.trim() || `wt switch timed out after 120s in ${toplevel}`),
    };
    process.stdout.write(JSON.stringify(out) + "\n");
    fail(`wt switch -c -x omp ${branch} timed out after 120s in ${toplevel}`);
  }
  if (code !== 0) {
    const out = {
      action: "spawn-worker",
      cwd,
      toplevel,
      product,
      branch,
      dry: false,
      mutate: false,
      command,
      code: code ?? 1,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
    process.stdout.write(JSON.stringify(out) + "\n");
    fail(`wt switch -c -x omp ${branch} failed in ${toplevel} (code=${code ?? 1})`);
  }

  const newPath = worktreePathForBranch(toplevel, branch);
  const bind = newPath ? `/move ${newPath}` : "";
  const out = {
    action: "spawn-worker",
    cwd,
    toplevel,
    product,
    branch,
    dry: false,
    mutate: true,
    command,
    code: 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    path: newPath,
    bind,
    move: bind,
  };
  process.stdout.write(JSON.stringify(out) + "\n");
  if (newPath === null) {
    fail(`wt switch succeeded but branch ${branch} has no worktree under ${toplevel}`);
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
