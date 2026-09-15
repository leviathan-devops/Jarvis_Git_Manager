// Jarvis Git Manager — CLI router. Dynamic import only, so W3/W4 modules
// can land later without editing this file. Exit 0 pass, 1 fail, 2 refuse.
interface GitModule { run(args: string[]): unknown; }
const MODULES: Record<string, string> = {
  "status": "./status.ts",
  "health": "./health.ts",
  "plan-clean": "./plan-clean.ts",
  "relocate": "./relocate.ts",
  "drop-wrapper": "./drop-wrapper.ts",
  "ignore-shell": "./ignore-shell.ts",
  "spawn-worker": "./spawn-worker.ts",
  "bind": "./bind.ts",
  "provision": "./provision.ts",
  "test-known-bad": "./test-known-bad.ts",
};

function usage(): string {
  return (
    `usage: bun git-manager.ts <action> [args]\n` +
    `actions: ${Object.keys(MODULES).join(" | ")}\n` +
    `stdout: one JSON object. stderr: human. exit 0 pass, 1 fail, 2 refuse.\n`
  );
}

const action = process.argv[2];
const args = process.argv.slice(3);

if (!action || action === "--help" || action === "-h") {
  process.stderr.write(usage());
  process.exit(0);
}

const spec = MODULES[action];
if (!spec) {
  process.stderr.write(`unknown action: ${action}\n${usage()}`);
  process.exit(2);
}

try {
  const mod: GitModule = await import(spec);
  if (typeof mod.run !== "function") {
    process.stderr.write(`${action}: module ${spec} exports no run(args)\n`);
    process.exit(1);
  }
  await mod.run(args);
} catch (e) {
  process.stderr.write(`${action}: cannot run ${spec}: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
