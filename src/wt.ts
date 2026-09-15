// Jarvis Git Manager — wt (worktrunk) bridge.
// Read-only `wt list` / `wt --version` plus a dry-by-default `switch-create`
// plan. NEVER deletes: this module implements no delete/remove/prune path by
// construction, and any delete verb in argv is rejected before any spawn, with
// keep-live targets refusing LIVE-WORKER. Stdout: one JSON object per call.
//
// INSTALL NOTE (2026-09-15, via Bun.spawnSync(["cargo","install","worktrunk"],
// { stdout:"pipe", stderr:"pipe", timeout:600000 })):
//   exitCode=101; stdout="" (empty); stderr verbatim:
//     "    Updating crates.io index\nerror: cannot install package `worktrunk 0.77.0`, it requires rustc 1.97 or newer, while the currently active rustc version is 1.94.0\n`worktrunk 0.57.0` supports rustc 1.94\n"
//   `which wt` exit 1 (binary absent). W2 install gate stays open; code lands anyway.
import { resolve } from "node:path";
import { isKeepLive } from "./keep-table.ts";
import { refuse } from "./refuse.ts";

export interface WtResult {
  code: number;
  stdout: string;
  stderr: string;
}

function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString("utf8");
  return String(v ?? "");
}

function spawnWt(argv: string[], cwd: string): WtResult {
  try {
    const r = Bun.spawnSync(["wt", ...argv], {
      cwd: resolve(cwd),
      stdout: "pipe",
      stderr: "pipe",
    });
    return { code: r.exitCode, stdout: toText(r.stdout), stderr: toText(r.stderr) };
  } catch (e) {
    return { code: 127, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
  }
}

function binaryMissing(r: WtResult): boolean {
  return r.code === 127 || /ENOENT|not found|no such file/i.test(r.stderr);
}

// Read-only: `wt --version` probe. Never mutates.
export function wtVersion(): WtResult {
  return spawnWt(["--version"], process.cwd());
}

// Read-only: `wt list` from cwd's repo. Never mutates.
export function wtList(cwd: string): WtResult {
  return spawnWt(["list"], cwd);
}

// Mutating primitive: `wt switch -c -x omp <branch>` from the PRODUCT repo
// cwd. Dry-only this wave: run() only invokes this with explicit --live, and
// mutating smoke runs only on a THROWAWAY repo — never live trees.
// switch-create deletes nothing by construction, so keep-live is never deleted.
export function wtSwitchCreate(branch: string, cwd: string): WtResult {
  return spawnWt(["switch", "-c", "-x", "omp", branch], cwd);
}

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

function fail(msg: string): never {
  process.stderr.write(`wt: ${msg}\n`);
  process.exit(1);
}

export function run(args: string[]): void {
  // No delete path exists in this module: reject delete verbs before spawning.
  const drop = args.find((a) => ["delete", "remove", "prune", "drop", "destroy"].includes(a));
  if (drop !== undefined) {
    const target = argVal(args, "--target", "--path", "--cwd", "--repo", "--dir");
    if (target !== undefined && isKeepLive(resolve(target))) {
      refuse("LIVE-WORKER", `wt ${drop} on keep-live ${resolve(target)} is never allowed`);
    }
    fail(`${drop} is not implemented: wt.ts never deletes (keep-live is never deleted)`);
  }

  const cwd = resolve(argVal(args, "--cwd", "--repo", "--dir") ?? process.cwd());
  const sub = args.find((a) => !a.startsWith("-")) ?? "list";

  if (args.includes("--version") || sub === "version") {
    const v = spawnWt(["--version"], cwd);
    process.stdout.write(
      JSON.stringify({
        action: "wt-version",
        cwd,
        code: v.code,
        available: !binaryMissing(v),
        stdout: v.stdout.trim(),
        stderr: v.stderr.trim(),
      }) + "\n",
    );
    return;
  }

  if (sub === "list") {
    const v = spawnWt(["--version"], cwd);
    const missing = binaryMissing(v);
    const l = missing ? { code: 127, stdout: "", stderr: v.stderr } : wtList(cwd);
    process.stdout.write(
      JSON.stringify({
        action: "wt-list",
        cwd,
        available: !missing,
        version: v.stdout.trim(),
        code: l.code,
        stdout: l.stdout.trim(),
        stderr: l.stderr.trim(),
      }) + "\n",
    );
    return;
  }

  if (sub === "switch-create") {
    const positional = args[args.indexOf(sub) + 1];
    const branch = argVal(args, "--branch", "--name") ?? positional;
    if (branch === undefined || branch.startsWith("-")) {
      fail("switch-create requires --branch <name>");
    }
    const command = ["wt", "switch", "-c", "-x", "omp", branch];
    if (!args.includes("--live")) {
      process.stdout.write(
        JSON.stringify({
          action: "wt-switch-create",
          cwd,
          branch,
          command,
          dry: true,
          mutate: false,
          message:
            "dry-run only: pass --live from a product repo cwd to run wt switch; mutating smoke only on a THROWAWAY repo",
        }) + "\n",
      );
      return;
    }
    const r = wtSwitchCreate(branch, cwd);
    process.stdout.write(
      JSON.stringify({
        action: "wt-switch-create",
        cwd,
        branch,
        command,
        dry: false,
        code: r.code,
        stdout: r.stdout.trim(),
        stderr: r.stderr.trim(),
      }) + "\n",
    );
    if (r.code !== 0) fail(`wt switch -c -x omp ${branch} failed in ${cwd}`);
    return;
  }

  fail(`unknown subcommand: ${sub} (list | version | switch-create --branch <name> [--live])`);
}

if (import.meta.main) {
  run(process.argv.slice(2));
}
