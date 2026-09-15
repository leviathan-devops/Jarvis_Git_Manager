// Jarvis Git Manager — st-jgm.ts (W4 verify, Mode-B bun harness).
//
// Mode-B: imports the REAL product modules (no mocks, no fixtures) and
// exercises the REAL CLI via Exit-captured spawns (child exit codes are
// captured values, never propagated). One runPromise at the bottom.
//
// Scenarios: HOME-LEAK / PUFFER-PARENT / LIVE-WORKER / STALE-PREVIEW (e=2 +
// token); health e=0 classes keep-live>=3 wrapper>=1 + LIVE SHAs worker
// ac32ded + grok 61f9ee3; plan-clean writes preview-<utc>.json bytes on disk
// (preview-<new> only, never overwrite existing); legit status in
// PLUTUS/agent e=0 field "toplevel" (StatusJson.repoRoot IS the toplevel);
// legit bind prints "/move "; legit spawn dry from Jarvis_Git_Manager cwd
// e=0 field "dry":true; provision.ts + ignore-shell dry only; wt binary
// absent (expected); test-known-bad 4/4. Table PASS/FAIL on stderr, JSON
// record on stdout, exit 0 iff all PASS.
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { HOME, SHELL, KEEP_PATHS, isKeepLive } from "../src/keep-table.ts";
import { STORE_DIR, PLUTUS_AGENT, classifyWorktree, collectHealth } from "../src/health.ts";
import { normPath } from "../src/status.ts";
import { SHELL_GITIGNORE, IGNORE_LINES } from "../src/ignore-shell.ts";
import { parseApproved } from "../src/preview.ts";

const JGM_DIR = normPath(join(import.meta.dir, ".."));
const SELF = join(import.meta.dir, "..", "src", "git-manager.ts");
const PROV = join(import.meta.dir, "..", "src", "provision.ts");
const GROK = join(PLUTUS_AGENT, ".worktrees", "grok-prototype");
const WORKER_SHORT = "ac32ded";
const GROK_SHORT = "61f9ee3";

interface Row {
  name: string;
  status: "PASS" | "FAIL";
  exit: number | null;
  detail: string;
}

interface HealthW {
  path: string;
  repo: string;
  branch: string;
  head: string;
  class: string;
}

interface HealthOut {
  worktrees: HealthW[];
}

interface PlanOut {
  previewId: string;
  ops: unknown[];
}

interface StatusOut {
  repoRoot: string;
  branch: string;
}

interface BindOut {
  move: string;
}

interface SpawnOut {
  dry: boolean;
  mutate: boolean;
}

interface IgnoreOut {
  dry: boolean;
  wouldAppend: string[];
}

interface KnownBadOut {
  results: Array<{ name: string; status: string }>;
}

const rows: Row[] = [];

function rec(name: string, ok: boolean, exit: number | null, detail: string): void {
  rows.push({ name, status: ok ? "PASS" : "FAIL", exit, detail });
}

function bufText(b: unknown): string {
  if (typeof b === "string") return b;
  if (b instanceof Uint8Array) return new TextDecoder().decode(b);
  if (typeof b === "object" && b !== null && "toString" in b) return String(b);
  return "";
}

interface Spawned {
  code: number;
  out: string;
  err: string;
}

function spawnSelf(argv: string[]): Spawned {
  const r = Bun.spawnSync(["bun", SELF, ...argv], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: JGM_DIR,
  });
  return {
    code: typeof r.exitCode === "number" ? r.exitCode : -1,
    out: bufText(r.stdout),
    err: bufText(r.stderr),
  };
}

function spawnBin(bin: string, argv: string[]): Spawned {
  const r = Bun.spawnSync([bin, ...argv], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: JGM_DIR,
  });
  return {
    code: typeof r.exitCode === "number" ? r.exitCode : -1,
    out: bufText(r.stdout),
    err: bufText(r.stderr),
  };
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function previewSnapshot(): Map<string, string> {
  const snap = new Map<string, string>();
  let files: string[] = [];
  try {
    files = readdirSync(STORE_DIR);
  } catch {
    return snap;
  }
  for (const f of files) {
    if (!/^preview-.*\.json$/.test(f)) continue;
    try {
      const st = statSync(join(STORE_DIR, f));
      snap.set(f, `${st.size}:${Math.round(st.mtimeMs)}`);
    } catch {
      // raced deletion: treat as absent
    }
  }
  return snap;
}

function readGitignore(): string {
  try {
    return readFileSync(SHELL_GITIGNORE, "utf8");
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  // Real-import pre-checks (values folded into scenario details below).
  const approvedSample = parseApproved(["--approved", "no-such-id"]);
  const grokKeep = isKeepLive(GROK);
  const keepPaths = KEEP_PATHS.length;

  // 1-4. Refuse surface: e=2 + named token on stderr.
  const r1 = spawnSelf(["status", "--cwd", HOME]);
  rec(
    "HOME-LEAK",
    r1.code === 2 && r1.err.includes("HOME-LEAK"),
    r1.code,
    `e=${r1.code} token=HOME-LEAK present=${r1.err.includes("HOME-LEAK")} stderr=${r1.err.trim().slice(0, 120)}`,
  );

  const r2 = spawnSelf(["spawn-worker", "--cwd", SHELL, "--product", "plutus"]);
  rec(
    "PUFFER-PARENT",
    r2.code === 2 && r2.err.includes("PUFFER-PARENT"),
    r2.code,
    `e=${r2.code} token=PUFFER-PARENT present=${r2.err.includes("PUFFER-PARENT")} stderr=${r2.err.trim().slice(0, 120)}`,
  );

  const r3 = spawnSelf(["drop-wrapper", "--target", GROK]);
  rec(
    "LIVE-WORKER",
    r3.code === 2 && r3.err.includes("LIVE-WORKER") && grokKeep === true,
    r3.code,
    `e=${r3.code} token=LIVE-WORKER present=${r3.err.includes("LIVE-WORKER")} isKeepLive(grok)=${grokKeep} keepPaths=${keepPaths}`,
  );

  const r4 = spawnSelf(["execute", "--approved", "no-such-id"]);
  rec(
    "STALE-PREVIEW",
    r4.code === 2 && r4.err.includes("STALE-PREVIEW") && approvedSample === "no-such-id",
    r4.code,
    `e=${r4.code} token=STALE-PREVIEW present=${r4.err.includes("STALE-PREVIEW")} gateParser=${approvedSample}`,
  );

  // 5-10. Health: exit 0, classes, LIVE SHAs, direct-import cross-check.
  const h = spawnSelf(["health"]);
  const hj = tryJson(h.out) as HealthOut | null;
  const wlist = hj !== null && Array.isArray(hj.worktrees) ? hj.worktrees : null;
  let keepLive = 0;
  let wrapper = 0;
  let leftover = 0;
  let product = 0;
  if (wlist !== null) {
    for (const w of wlist) {
      if (typeof w.class !== "string") continue;
      if (w.class === "keep-live") keepLive++;
      else if (w.class === "wrapper") wrapper++;
      else if (w.class === "leftover") leftover++;
      else if (w.class === "product") product++;
    }
  }
  rec(
    "HEALTH-EXIT0",
    h.code === 0 && wlist !== null,
    h.code,
    `e=${h.code} worktrees=${wlist !== null ? wlist.length : "unparseable"}`,
  );
  rec(
    "HEALTH-KEEP3",
    wlist !== null && keepLive >= 3,
    h.code,
    `keep-live=${keepLive} (bar >=3)`,
  );
  rec(
    "HEALTH-WRAP1",
    wlist !== null && wrapper >= 1,
    h.code,
    `wrapper=${wrapper} (bar >=1) leftover=${leftover} product=${product}`,
  );
  rec(
    "HEALTH-SHA-WORKER",
    h.code === 0 && h.out.includes(WORKER_SHORT),
    h.code,
    `live worker sha ${WORKER_SHORT} present=${h.out.includes(WORKER_SHORT)}`,
  );
  rec(
    "HEALTH-SHA-GROK",
    h.code === 0 && h.out.includes(GROK_SHORT),
    h.code,
    `live grok sha ${GROK_SHORT} present=${h.out.includes(GROK_SHORT)}`,
  );
  let directKeep = -1;
  let directTotal = -1;
  let directClassify = "";
  try {
    const direct = await collectHealth();
    directKeep = direct.worktrees.filter((w) => w.class === "keep-live").length;
    directTotal = direct.worktrees.length;
    directClassify = classifyWorktree(GROK, new Set<string>());
  } catch (e) {
    directClassify = `error: ${e instanceof Error ? e.message : String(e)}`;
  }
  rec(
    "HEALTH-DIRECT",
    wlist !== null && directKeep === keepLive && directTotal === wlist.length && directClassify === "keep-live",
    null,
    `direct keep-live=${directKeep} cli keep-live=${keepLive} direct total=${directTotal} classify(grok)=${directClassify}`,
  );

  // 11. plan-clean writes preview-<utc>.json: exactly one new file, bytes>0,
  // id matches, pre-existing previews untouched (never overwrite existing).
  const before = previewSnapshot();
  const p = spawnSelf(["plan-clean"]);
  const pj = tryJson(p.out) as PlanOut | null;
  const pid = pj !== null && typeof pj.previewId === "string" ? pj.previewId : "";
  const after = previewSnapshot();
  const added: string[] = [];
  for (const k of after.keys()) {
    if (!before.has(k)) added.push(k);
  }
  let overwritten = false;
  for (const k of before.keys()) {
    if (after.get(k) !== before.get(k)) overwritten = true;
  }
  const newFile: string | null = added.length === 1 && typeof added[0] === "string" ? added[0] : null;
  let bytes = 0;
  if (newFile !== null) {
    try {
      bytes = statSync(join(STORE_DIR, newFile)).size;
    } catch {
      bytes = 0;
    }
  }
  const idMatch = newFile !== null && pid !== "" && newFile === `${pid}.json`;
  rec(
    "PLAN-CLEAN-NEW",
    p.code === 0 && pj !== null && pid !== "" && added.length === 1 && !overwritten && bytes > 0 && idMatch,
    p.code,
    `e=${p.code} previewId=${pid} file=${newFile ?? "none"} bytes=${bytes} added=${added.length} overwrittenExisting=${overwritten}`,
  );

  // 12. Legit status in PLUTUS/agent: e=0, repoRoot IS the toplevel.
  const s = spawnSelf(["status", "--cwd", PLUTUS_AGENT]);
  const sj = tryJson(s.out) as StatusOut | null;
  const toplevel = sj !== null && typeof sj.repoRoot === "string" ? sj.repoRoot : "";
  const sbranch = sj !== null && typeof sj.branch === "string" ? sj.branch : "?";
  rec(
    "STATUS-TOPLEVEL",
    s.code === 0 && sj !== null && normPath(toplevel) === normPath(PLUTUS_AGENT) && s.out.includes("PLUTUS/agent"),
    s.code,
    `e=${s.code} toplevel=${toplevel} branch=${sbranch}`,
  );

  // 13. Legit bind prints "/move " (trailing space: "/move <toplevel>").
  const b = spawnSelf(["bind", "--dir", PLUTUS_AGENT]);
  const bj = tryJson(b.out) as BindOut | null;
  const move = bj !== null && typeof bj.move === "string" ? bj.move : "";
  rec(
    "BIND-MOVE",
    b.code === 0 && b.out.includes("/move ") && move.startsWith("/move "),
    b.code,
    `e=${b.code} move=${move.slice(0, 100)} contains-/move-space=${b.out.includes("/move ")}`,
  );

  // 14. Legit spawn dry from Jarvis_Git_Manager cwd: e=0, "dry":true.
  const d = spawnSelf(["spawn-worker", "--cwd", JGM_DIR, "--product", "plutus"]);
  const dj = tryJson(d.out) as SpawnOut | null;
  rec(
    "SPAWN-DRY",
    d.code === 0 && dj !== null && dj.dry === true && d.out.includes('"dry":true'),
    d.code,
    `e=${d.code} dry=${dj !== null ? String(dj.dry) : "?"} mutate=${dj !== null ? String(dj.mutate) : "?"} cwd=${JGM_DIR}`,
  );

  // 15. ignore-shell dry only: e=0, dry:true, .gitignore bytes identical.
  const giBefore = readGitignore();
  const g = spawnSelf(["ignore-shell"]);
  const gj = tryJson(g.out) as IgnoreOut | null;
  const giAfter = readGitignore();
  let subset = false;
  if (gj !== null && Array.isArray(gj.wouldAppend)) {
    subset = true;
    for (const el of gj.wouldAppend) {
      if (typeof el !== "string" || !IGNORE_LINES.includes(el)) subset = false;
    }
  }
  rec(
    "IGNORE-DRY",
    g.code === 0 && gj !== null && gj.dry === true && giBefore === giAfter && subset,
    g.code,
    `e=${g.code} dry=${gj !== null ? String(gj.dry) : "?"} gitignoreUnchanged=${giBefore === giAfter} wouldAppendSubsetOfIGNORE_LINES=${subset}`,
  );

  // 16-17. provision.ts dry only: dotdir + reserved name refuse e=2, nothing created.
  const dot = join("/tmp", `.jgm-st-dotdir-${process.pid}`);
  const pd = spawnBin("bun", [PROV, "--dir", dot]);
  rec(
    "PROVISION-DOTDIR",
    pd.code === 2 && pd.err.includes("UNOWNED-PATH") && !existsSync(dot),
    pd.code,
    `e=${pd.code} token=UNOWNED-PATH present=${pd.err.includes("UNOWNED-PATH")} created=${existsSync(dot)}`,
  );
  const docsDir = join("/tmp", `jgm-st-probe-${process.pid}`, "docs");
  const pr = spawnBin("bun", [PROV, "--dir", docsDir]);
  rec(
    "PROVISION-DOCS",
    pr.code === 2 && pr.err.includes("UNOWNED-PATH") && !existsSync(docsDir),
    pr.code,
    `e=${pr.code} token=UNOWNED-PATH present=${pr.err.includes("UNOWNED-PATH")} created=${existsSync(docsDir)}`,
  );

  // 18. wt binary absent (expected: delegation code only, no live wt).
  const w = spawnBin("which", ["wt"]);
  rec(
    "WT-ABSENT",
    w.code !== 0,
    w.code,
    w.code !== 0
      ? `which wt e=${w.code}: binary absent (expected; delegation code only)`
      : `which wt e=0: unexpectedly present at ${w.out.trim().slice(0, 120)}`,
  );

  // 19. test-known-bad 4/4.
  const k = spawnSelf(["test-known-bad"]);
  const kj = tryJson(k.out) as KnownBadOut | null;
  const klist = kj !== null && Array.isArray(kj.results) ? kj.results : null;
  let kpass = 0;
  let kfail = 0;
  const kcases: string[] = [];
  if (klist !== null) {
    for (const r of klist) {
      if (r.status === "pass") kpass++;
      else if (r.status === "fail") kfail++;
      kcases.push(`${r.name}:${r.status}`);
    }
  }
  rec(
    "KNOWN-BAD",
    k.code === 0 && kfail === 0 && kpass === 4,
    k.code,
    `e=${k.code} pass=${kpass}/4 fail=${kfail} cases=${kcases.join(",").slice(0, 160)}`,
  );

  const pass = rows.filter((r) => r.status === "PASS").length;
  const fail = rows.length - pass;
  const record = {
    harness: "st-jgm",
    mode: "B",
    generatedAt: new Date().toISOString(),
    jgmDir: JGM_DIR,
    total: rows.length,
    pass,
    fail,
    exit: fail === 0 ? 0 : 1,
    rows,
    health: {
      keepLive,
      wrapper,
      leftover,
      product,
      total: wlist !== null ? wlist.length : 0,
    },
    liveShas: { worker: WORKER_SHORT, grok: GROK_SHORT },
    preview:
      newFile && pid
        ? { id: pid, file: join(STORE_DIR, newFile), bytes }
        : null,
    wt: { present: w.code === 0 },
  };

  process.stderr.write("ST-JGM verify (Mode-B, real imports, exit-captured)\n");
  process.stderr.write("RESULT NAME e=EXIT DETAIL\n");
  for (const r of rows) {
    process.stderr.write(`${r.status} ${r.name} e=${r.exit} ${r.detail}\n`);
  }
  process.stderr.write(`${pass}/${rows.length} ${fail === 0 ? "PASS" : "FAIL"}\n`);
  process.stdout.write(JSON.stringify(record) + "\n");
  process.exit(fail === 0 ? 0 : 1);
}

async function guarded(): Promise<void> {
  try {
    await main();
  } catch (e) {
    rows.push({
      name: "RUNNER",
      status: "FAIL",
      exit: null,
      detail: `harness exception: ${e instanceof Error ? e.message : String(e)}`,
    });
    const pass = rows.filter((r) => r.status === "PASS").length;
    process.stderr.write("ST-JGM verify (Mode-B, real imports, exit-captured)\n");
    for (const r of rows) {
      process.stderr.write(`${r.status} ${r.name} e=${r.exit} ${r.detail}\n`);
    }
    process.stderr.write(`${pass}/${rows.length} FAIL\n`);
    process.stdout.write(
      JSON.stringify({ harness: "st-jgm", mode: "B", total: rows.length, pass, fail: rows.length - pass, exit: 1, rows }) + "\n",
    );
    process.exit(1);
  }
}

await guarded();
