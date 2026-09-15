// Jarvis Git Manager — bind (W4 layout).
// Read-only: resolves --dir to its git toplevel + branch and prints the
// `/move <toplevel>` string the TUI/operator must run. NEVER invokes /move.
import { spawnSync } from "node:child_process";

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

function gitOut(dir: string, gitArgs: string[]): string | null {
  const r = spawnSync("git", ["-C", dir, ...gitArgs], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const out = typeof r.stdout === "string" ? r.stdout.trim() : "";
  return out ? out : null;
}

export async function run(args: string[]): Promise<void> {
  const dir = argVal(args, "--dir");
  if (!dir) {
    process.stderr.write("bind: --dir <abs-path> is required\n");
    process.exit(1);
  }
  if (!dir.startsWith("/")) {
    process.stderr.write(`bind: --dir must be absolute, got: ${dir}\n`);
    process.exit(1);
  }
  const toplevel = gitOut(dir, ["rev-parse", "--show-toplevel"]);
  if (toplevel === null) {
    process.stderr.write(`bind: not inside a git repo: ${dir}\n`);
    process.exit(1);
  }
  const branch = gitOut(dir, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? "unknown";
  const out = {
    action: "bind",
    dir,
    toplevel,
    branch,
    move: `/move ${toplevel}`,
  };
  process.stdout.write(JSON.stringify(out) + "\n");
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}
