// TMPDIR must not exempt a path from commit-cone ownership.
// Runs the shipped run() — the assertion is exit status, the UNOWNED-PATH
// token, and that git created no commit. No reimplementation of the check.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./commit-cone.ts";
import { isKeepLive } from "./keep-table.ts";

class ExitCaptured extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = "ExitCaptured";
    this.code = code;
  }
}

function decode(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return new TextDecoder().decode(v);
  return String(v ?? "");
}

function git(cwd: string, args: string[]): { code: number; out: string; err: string } {
  const r = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: decode(r.stdout), err: decode(r.stderr).trim() };
}

function gitOk(cwd: string, args: string[]): void {
  const r = git(cwd, args);
  if (r.code !== 0) {
    throw new Error(`git ${args.join(" ")} -> ${r.code}: ${r.err || r.out}`);
  }
}

function under(root: string, p: string): boolean {
  return p === root || p.startsWith(root + "/");
}

async function main(): Promise<boolean> {
  // Attacker-chosen directory, outside the real system temp dirs and outside
  // every keep-live root. Point TMPDIR at it so os.tmpdir() follows.
  const attacker = mkdtempSync(join("/home/ubuntu", "jgm-unowned-XXXXXX"));
  const savedTmp = process.env.TMPDIR;
  const repo = join(attacker, "repo");
  const file = join(repo, "note.txt");
  let exitCode: number | null = null;
  let stderr = "";
  let stdout = "";
  const origExit = process.exit;
  const origErr = process.stderr.write.bind(process.stderr);
  const origOut = process.stdout.write.bind(process.stdout);

  try {
    mkdirSync(repo, { recursive: true });
    const realRepo = realpathSync(repo);
    const systemTemps = ["/tmp", "/var/tmp"].map((p) => realpathSync(p));
    for (const root of systemTemps) {
      if (under(root, realRepo)) {
        throw new Error(`precondition: fixture resolved inside system temp ${root}`);
      }
    }
    if (isKeepLive(realRepo)) {
      throw new Error("precondition: fixture is keep-live");
    }

    gitOk(repo, ["init", "-q", "-b", "main"]);
    gitOk(repo, ["config", "user.email", "audit@example.com"]);
    gitOk(repo, ["config", "user.name", "audit"]);
    gitOk(repo, ["config", "commit.gpgsign", "false"]);
    writeFileSync(file, "caller-does-not-own-this\n");

    process.env.TMPDIR = attacker;
    const envTemp = realpathSync(tmpdir());
    if (envTemp !== realpathSync(attacker)) {
      throw new Error(`precondition: os.tmpdir() ${envTemp} did not follow TMPDIR`);
    }

    process.exit = ((code?: number) => {
      throw new ExitCaptured(code ?? 0);
    }) as typeof process.exit;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stderr.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write;

    try {
      await run(["--cwd", repo, "--paths", "note.txt", "--message", "unowned"]);
    } catch (e) {
      if (e instanceof ExitCaptured) {
        exitCode = e.code;
      } else {
        throw e;
      }
    }

    const head = git(repo, ["rev-parse", "HEAD"]);
    const committed = head.code === 0 && head.out.trim().length > 0;
    const rejected = exitCode === 2 && stderr.includes("UNOWNED-PATH") && !committed;
    const report = [
      `TMPDIR=${process.env.TMPDIR}`,
      `os.tmpdir()=${envTemp}`,
      `repo=${realRepo}`,
      `exit=${exitCode === null ? "returned" : String(exitCode)}`,
      `committed=${committed}${committed ? " sha=" + head.out.trim() : ""}`,
      `stderr=${stderr.trim() || "<empty>"}`,
      `stdout=${stdout.trim() || "<empty>"}`,
    ].join("\n");

    process.exit = origExit;
    process.stderr.write = origErr;
    process.stdout.write = origOut;
    if (rejected) {
      process.stderr.write(`PASS unowned path rejected with TMPDIR set\n${report}\n`);
    } else {
      process.stderr.write(`FAIL commit-cone accepted an unowned path via TMPDIR\n${report}\n`);
    }
    return rejected;
  } finally {
    process.exit = origExit;
    process.stderr.write = origErr;
    process.stdout.write = origOut;
    if (savedTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmp;
    rmSync(attacker, { recursive: true, force: true });
  }
}

const rejected = await main();
process.exit(rejected ? 0 : 1);
