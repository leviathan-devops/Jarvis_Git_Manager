// TMPDIR must not exempt a path from commit-cone ownership.
// Imports and runs the shipped run(). Oracles are exit status, the
// UNOWNED-PATH token, and whether git created a commit.
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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

function inside(root: string, p: string): boolean {
  return p === root || p.startsWith(root + "/");
}

function fsCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

// Real path of a system temp root. ENOENT/ENOTDIR means that root is not
// present, so a fixture cannot sit inside it. Any other error fails the test.
function realTemp(root: string): string | undefined {
  try {
    return realpathSync(root);
  } catch (err) {
    const code = fsCode(err);
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw new Error(`precondition: cannot resolve ${root}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Parent for the attacker repo. os.homedir() differs per host; a hardcoded
// home does not. Fail if it is missing, inside a system temp, or keep-live.
function attackerParent(): string {
  const home = homedir();
  if (typeof home !== "string" || !home.startsWith("/")) {
    throw new Error(`precondition: os.homedir() is not an absolute path (${String(home)})`);
  }
  if (!existsSync(home)) {
    throw new Error(`precondition: os.homedir() does not exist: ${home}`);
  }
  const realHome = realpathSync(home);
  const temps = ["/tmp", "/var/tmp"].map(realTemp).filter((p): p is string => p !== undefined);
  if (temps.length === 0) {
    throw new Error("precondition: neither /tmp nor /var/tmp exists; cannot place an outside-temp fixture");
  }
  for (const root of temps) {
    if (inside(root, realHome)) {
      throw new Error(`precondition: os.homedir() ${realHome} resolves inside ${root}; no non-temp attacker dir`);
    }
  }
  if (isKeepLive(realHome)) {
    throw new Error(`precondition: os.homedir() ${realHome} is keep-live; no non-temp attacker dir`);
  }
  return realHome;
}

function assertUnowned(realRepo: string): void {
  const temps = ["/tmp", "/var/tmp"].map(realTemp).filter((p): p is string => p !== undefined);
  if (temps.length === 0) {
    throw new Error(`precondition: neither /tmp nor /var/tmp exists; cannot prove ${realRepo} is outside them`);
  }
  for (const root of temps) {
    if (inside(root, realRepo)) {
      throw new Error(`precondition: fixture ${realRepo} resolves inside system temp ${root}`);
    }
  }
  if (isKeepLive(realRepo)) {
    throw new Error(`precondition: fixture ${realRepo} is keep-live`);
  }
}

function initRepo(repo: string, body: string): void {
  mkdirSync(repo, { recursive: true });
  gitOk(repo, ["init", "-q", "-b", "main"]);
  gitOk(repo, ["config", "user.email", "audit@example.com"]);
  gitOk(repo, ["config", "user.name", "audit"]);
  gitOk(repo, ["config", "commit.gpgsign", "false"]);
  writeFileSync(join(repo, "note.txt"), body);
}

interface Obs {
  exitCode: number | null;
  stderr: string;
  stdout: string;
  thrown: string | null;
}

async function observeRun(args: string[]): Promise<Obs> {
  const origExit = process.exit;
  const origErr = process.stderr.write.bind(process.stderr);
  const origOut = process.stdout.write.bind(process.stdout);
  let stderr = "";
  let stdout = "";
  let exitCode: number | null = null;
  let thrown: string | null = null;
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
    await run(args);
  } catch (e) {
    if (e instanceof ExitCaptured) exitCode = e.code;
    else thrown = e instanceof Error ? e.message : String(e);
  } finally {
    process.exit = origExit;
    process.stderr.write = origErr;
    process.stdout.write = origOut;
  }
  return { exitCode, stderr, stdout, thrown };
}

function linesOf(obs: Obs, extra: string[]): string {
  const head = [
    ...extra,
    `exit=${obs.exitCode === null ? "returned" : String(obs.exitCode)}`,
    `thrown=${obs.thrown ?? "<none>"}`,
    `stderr=${obs.stderr.trim() || "<empty>"}`,
    `stdout=${obs.stdout.trim() || "<empty>"}`,
  ];
  return head.join("\n");
}

async function main(): Promise<boolean> {
  const parent = attackerParent();
  const savedTmp = process.env.TMPDIR;
  let attacker: string | undefined;
  let legitRepo: string | undefined;
  let unownedOk = false;
  let legitOk = false;

  try {
    attacker = mkdtempSync(join(parent, "jgm-unowned-XXXXXX"));
    const unownedRepo = join(attacker, "repo");
    const tmpRoot = realTemp("/tmp");
    if (tmpRoot === undefined) {
      throw new Error("precondition: /tmp does not exist; cannot run the legitimate probe");
    }
    legitRepo = mkdtempSync(join(tmpRoot, "jgm-legit-XXXXXX"));
    initRepo(unownedRepo, "caller-does-not-own-this\n");
    const realUnowned = realpathSync(unownedRepo);
    assertUnowned(realUnowned);

    initRepo(legitRepo, "legit probe\n");
    const realLegit = realpathSync(legitRepo);
    if (!inside(tmpRoot, realLegit)) {
      throw new Error(`precondition: legit repo ${realLegit} is not under ${tmpRoot}`);
    }

    process.env.TMPDIR = attacker;
    const envTemp = realpathSync(tmpdir());
    const realAttacker = realpathSync(attacker);
    if (envTemp !== realAttacker) {
      throw new Error(`precondition: os.tmpdir() ${envTemp} did not follow TMPDIR ${realAttacker}`);
    }
    if (inside(realAttacker, realLegit) || inside(envTemp, realLegit)) {
      throw new Error(`precondition: legit repo ${realLegit} resolves under TMPDIR ${realAttacker}`);
    }

    const unowned = await observeRun(["--cwd", unownedRepo, "--paths", "note.txt", "--message", "unowned"]);
    const unownedHead = git(unownedRepo, ["rev-parse", "HEAD"]);
    const unownedCommitted = unownedHead.code === 0 && unownedHead.out.trim().length > 0;
    unownedOk = unowned.thrown === null && unowned.exitCode === 2 && unowned.stderr.includes("UNOWNED-PATH") && !unownedCommitted;
    const unownedReport = linesOf(unowned, [
      `home=${parent}`,
      `TMPDIR=${process.env.TMPDIR}`,
      `os.tmpdir()=${envTemp}`,
      `repo=${realUnowned}`,
      `committed=${unownedCommitted}${unownedCommitted ? " sha=" + unownedHead.out.trim() : ""}`,
    ]);
    process.stderr.write(
      `${unownedOk ? "PASS" : "FAIL"} unowned path rejected with TMPDIR set\n${unownedReport}\n`,
    );

    const legit = await observeRun(["--cwd", legitRepo, "--paths", "note.txt", "--message", "legit-probe"]);
    const legitHead = git(legitRepo, ["rev-parse", "HEAD"]);
    const sha = legitHead.out.trim();
    const legitCommitted = legitHead.code === 0 && sha.length > 0;
    legitOk =
      legit.thrown === null &&
      legit.exitCode === null &&
      legitCommitted &&
      legit.stdout.includes(sha) &&
      !legit.stderr.includes("UNOWNED-PATH");
    const legitReport = linesOf(legit, [
      `TMPDIR=${process.env.TMPDIR}`,
      `os.tmpdir()=${envTemp}`,
      `repo=${realLegit}`,
      `committed=${legitCommitted}${legitCommitted ? " sha=" + sha : ""}`,
    ]);
    process.stderr.write(
      `${legitOk ? "PASS" : "FAIL"} legit /tmp probe commits with TMPDIR pointed elsewhere\n${legitReport}\n`,
    );

    return unownedOk && legitOk;
  } finally {
    if (savedTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmp;
    if (attacker !== undefined) rmSync(attacker, { recursive: true, force: true });
    if (legitRepo !== undefined) rmSync(legitRepo, { recursive: true, force: true });
  }
}

const ok = await main();
process.exit(ok ? 0 : 1);
