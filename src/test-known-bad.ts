// Jarvis Git Manager — test-known-bad: fixture runner for refuse paths.
// Spawns this CLI (bun git-manager.ts) per fixture, expects exit 2 plus the
// named token on stderr. Fixtures for W3/W4 modules run only when those
// files exist ("other fixtures that exist"); otherwise they skip.
// Stdout: one JSON object. Exit 0 when every executed fixture passes.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { HOME, SHELL } from "./keep-table.ts";

const SELF = join(import.meta.dir, "git-manager.ts");
const CODE = import.meta.dir;

interface CaseResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail?: string;
}

async function spawnSelf(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bun", SELF, ...argv], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err };
}

export async function run(_args: string[]): Promise<void> {
  const results: CaseResult[] = [];

  async function expectRefuse(name: string, argv: string[], token: string): Promise<void> {
    const r = await spawnSelf(argv);
    if (r.code === 2 && r.err.includes(token)) {
      results.push({ name, status: "pass" });
    } else {
      results.push({
        name,
        status: "fail",
        detail: `argv=${argv.join(" ")} exit=${r.code} stderr=${r.err.trim().slice(0, 200)}`,
      });
    }
  }

  // HOME-LEAK: status on the HOME repo must refuse.
  await expectRefuse("home-leak", ["status", "--cwd", HOME], "HOME-LEAK");

  // PUFFER-PARENT: spawn-worker from SHELL for plutus must refuse (W4).
  if (existsSync(join(CODE, "spawn-worker.ts"))) {
    await expectRefuse(
      "puffer-parent",
      ["spawn-worker", "--cwd", SHELL, "--product", "plutus"],
      "PUFFER-PARENT",
    );
  } else {
    results.push({ name: "puffer-parent", status: "skip", detail: "spawn-worker.ts not landed (W4)" });
  }

  // LIVE-WORKER: drop-wrapper on the live grok worktree must refuse (W3).
  const grok = join(SHELL, "PLUTUS/agent/.worktrees/grok-prototype");
  if (existsSync(join(CODE, "drop-wrapper.ts")) && existsSync(grok)) {
    await expectRefuse("live-worker", ["drop-wrapper", "--target", grok], "LIVE-WORKER");
  } else {
    results.push({ name: "live-worker", status: "skip", detail: "drop-wrapper.ts or grok path absent" });
  }

  // STALE-PREVIEW: execute with an unknown preview id must refuse (W3).
  if (existsSync(join(CODE, "preview.ts"))) {
    await expectRefuse("stale-preview", ["execute", "--approved", "no-such-id"], "STALE-PREVIEW");
  } else {
    results.push({ name: "stale-preview", status: "skip", detail: "preview.ts not landed (W3)" });
  }

  const fail = results.filter((r) => r.status === "fail");
  process.stdout.write(JSON.stringify({ results }) + "\n");
  process.exit(fail.length === 0 ? 0 : 1);
}
