# BUILD SPEC ARTIFACT — JARVIS GIT MANAGER
- **Target:** `Shared_Workspace/Jarvis_Git_Manager` — Bun CLI porcelain. Agents never type raw git.
- **Generated:** 2026-09-15
- **Trident Version:** omp-native
- **Status:** PLANNING
- **Artifact Type:** BUILD_SPEC (Layer 1 Prompt)
- **Discovery:** ENABLED — 15 files, 1442 lines (1335 src + 107 sql/readme-adjacent) in `OMP/git-manager/`; 2 shells; 717 lines of predecessor specs.
- **PREFLIGHT:** script-test ✓ deep-container-testing ✓

## §A CONTEXT

Current state, measured 2026-09-15. Predecessor tree `OMP/git-manager/`: 14 .ts + schema.sql, 1335 lines, W2-caught bugs 2, test-known-bad 4/4, health keep-live=5 wrapper=1 leftover=3 product=1, plan-clean preview-20260915T125221.json 3 ops dry, zero git mutations. OCR laguna loop running, FULL GATE BLOCKED. Live git: shell puffer 451f66a; PLUTUS/agent `plutus/main` e99377f; grok-prototype 61f9ee3; nested omp-worker-1 481b54e; GI `jarvis/gi-main` c0cd190; OMP `jarvis/omp-main` fe0dae7; HOME `v4.7`. Laws: spawn on shell then /move, never /worktree the puffer shell, never delete live workers, mutate only on `approved <preview-id>`, build around worktrunk `wt`. References: MASTER_PROMPT.md (214 lines), PATHS/SCOPEs, TRIDENT report (411 lines), omp thread git-manager (92 lines).

## SPEC REFERENCE

The 2026-09-06 report is a BUILD SPEC; `createGitManagerTool()` absent on disk. Slice1 implements 2/13 §4.2 actions (status, health). JGM thread is layout law, not substitutive. Hydra paste spec P5-red overlay ignored except keep table.

## §2 Architecture

Verbatim per operator: JGM stays porcelain + keep table + refuses + preview+approved; worktrunk (`wt`) is the worktree KERNEL; wt per-branch vars and hooks carry cwd and post-create setup; JGM binds state and never raw-gits around it. Hydra factory (commits/PRs/QoC) is a LATER product: this DPL1 ships cleanup gate first.

## §3 Discovery Intelligence

Entry: `git-manager.ts:24` argv → `MODULES` (`git-manager.ts:3-14`) → dynamic import `mod.run(args)` (`git-manager.ts:38-44`). Language: Bun TypeScript, `bun:sqlite` WAL (`health.ts:5`), spawnSync rev-parse. Interfaces: `Token` nine names (`types.ts:4-13`); `WorktreeClass` (`types.ts:15`); Status/Health/PlanClean Json (`types.ts:24-60`); `RefuseError` (`types.ts:65-75`). Failures W2: absolute-join misclassify, sqlite import dropout. Keep-live five paths (`keep-table.ts:9-15`); spawn refuse (`spawn-worker.ts:49-58`); drop refusals first (`drop-wrapper.ts:67-85`); wrapper detect (`health.ts:49-65`).

## §1 Problem Statement

Operator verbatim: shell = host shell; one folder = one git repo; branches = subfolders; spawn on shell then /move; never /worktree the puffer shell; never delete live workers; mutate only on `approved <preview-id>`; auto-provision depth-1 folders; build around worktrunk `wt`. Failure: shell /worktree cloned puffer under product names (7f04470 without PLUTUS/agent); dual `plutus/main`; HOME `v4.7` leak; slice1 adoption-blocked (`?? git-manager/`, no wt bind, provisioner uninstalled, mutate dry).
## §4 Core Insight

## §5 Scope

1. Port predecessor into `Jarvis_Git_Manager/src` (cwd-independent CLI, store `~/.omp/git-manager/`)
2. FROZEN interfaces `types.ts` + keep table (dual omp-worker-1 rule stays)
3. `wt` kernel: branch-addressed create/switch/list/remove instead of manual paths
4. JGM owns preview+approved+mutate gate AROUND wt, never inside it
5. Hooks: post-create product setup + post-remove prune as `wt.toml` templates
6. Provisioner depth-1 new folders: bare + `main/` worktree, skip dotdirs/docs/reports/GLOBAL_MASTER_CONTEXT/existing-.git
7. Thin-buffer shell: product folders in shell `.gitignore`
8. Skill `jarvis-git-manager` + `/git-manager` retargeted at new folder
9. Thread `git-manager` stream (omp slug) records landing
10. Script-test ST suites for refuse/classify/preview (6-part, written-before-code)
11. Container/host-live proof for mutate path + refuse probes
12. OCR shop gate on final tree to 0 critical/high or named blockers
13. Wave-audit W-files per wave
14. No GitHub PR automation this loop
15. No auto-commit every turn
## §6 Success Criteria

| # | Criterion (mechanical) | Command / ledger |
|---|---|---|
| S1 | health: nested worker keep-live, outer wrapper | `bun git-manager.ts health` classes |
| S2 | plan-clean writes preview, zero mutations | preview json + worktrees unchanged |
| S3 | HOME-LEAK exit 2 | `status --cwd /home/leviathan` e=2 |
| S4 | PUFFER-PARENT exit 2 | `spawn-worker --cwd SHELL --product plutus` e=2 |
| S5 | LIVE-WORKER exit 2 on grok | `drop-wrapper grok-prototype` e=2 |
| S6 | STALE-PREVIEW exit 2 | `execute --approved no-such-id` e=2 |
| S7 | test-known-bad 4/4 | `test-known-bad` e=0 |
| S8 | mimo files byte-identical across run | sha256 before/after |
| S9 | wt present + JGM delegates spawn/list/remove | `which wt` + delegation code |
| S10 | provisioner inits depth-1 throwaway + deletes it | throwaway folder roundtrip |
| S11 | OCR 0 critical/high | `ocr scan` json counts |
| S12 | thread appended on omp slug | `omp-threads.ts discover git-manager` |
## §7 CONTAINER TEST PLAN (plan-first)

Target: host CLI + host git behavior (PART II host-live: deploy path, real tool calls). Angles ≥5: IDENTITY (git-manager.ts unknown action prints usage e=1, token `unknown action`), TOOLS (health/status/plan-clean all respond e=0, token `"worktrees"` in stdout), FIREWALL (drop grok → LIVE-WORKER on stderr, token `LIVE-WORKER`), AUDIT (`ocr scan` runs and counts findings, token `comments` or fail-loud), LIFECYCLE (previewId created then execute with bad id → STALE-PREVIEW), ERRORS (no-target drop prints usage, token `no target given`), BOUNDARY (HOME cwd → HOME-LEAK), CONCURRENCY (health twice, same classes), INTEGRATION (health→plan-clean→known-bad chain e=0-chain), CONFIG (missing env: no env vars required, token `dry:true` unaffected). Evidence: tool-result JSON + exit codes; pass threshold: S1–S8 all green same run; negative half: legit `status` in PLUTUS/agent e=0, legit `bind` prints /move, legit spawn dry from product cwd e=0.
## §B THE DENSE BUILD PLAN

Module map: `git-manager.ts` router (dynamic import, argv→`run(args)`); `types.ts` Token/Class/Json frozen; `keep-table.ts` KEEP_PATHS+`isKeepLive`+SHELL/HOME; `status.ts` rev-parse trio + worktree porcelain; `health.ts` classify (`health.ts:49-65`) + store WAL; `plan-clean.ts` preview JSON ops relocate+2×drop-wrapper + keep; `preview.ts` load+verifyShas+`--approved` gate; `relocate.ts` dry `worktree move` destination; `drop-wrapper.ts` LIVE-WORKER-first guard; `ignore-shell.ts` dry gitignore; `spawn-worker.ts` PUFFER-PARENT gate; `bind.ts` toplevel+/move; `test-known-bad.ts` e=2 probes. Data flows: argv→module→spawnSync git→JSON; preview→SHAs→execute. File manifest: NEW `src/` 15 files ported from OMP/git-manager; NEW `specs/` this DPL1; NEW `reports/` TBD; EDIT shell `.gitignore` add product folders (after preview); DELETED none (wrappers only via approved). Wave sketch: V1 interfaces (types+keep+schema, disjoint); V2 kernel (status/health/plan); V3 cleanup dry (relocate/drop/preview); V4 wt-bind+skill+provisioner; V5 verify (script-test + host-live + ocr + thread). Gate per wave: V1 enum grep; V2 health classes; V3 4×exit-2; V4 wt smoke; V5 S1–S12.
## §D THE PRE-WRITTEN SCRIPT TESTS

Harness (bun, 6-part): sandbox = mkdtemp TRASH repo roots only (never product); import REAL ported modules; exercise exit-captured; observe JSON+exit codes; adversarial both halves; cleanup rm. ST1 refuse surface: HOME-LEAK e=2/grok LIVE-WORKER e=2/puffer-parent e=2/no-such STALE-PREVIEW e=2, legit status e=0 — tokens are the stderr strings above. ST2 classify: fake WT_ROOT with fabricated common-dirs? Forbidden mock: instead point isKeepLive at real KEEP_PATHS list (pure function, no fs) plus collectHealth against a THROWAWAY git init repo (real `git init` in sandbox, real worktree add): wrapper row absent in sandbox → assert classify returns only product/leftover (no crash). ST3 plan/preview: plan-clean writes preview file (bytes on disk), execute bad-id → STALE-PREVIEW, verifyShas drift → stale. Runner: `bun run st.ts` sequential, PASS/FAIL table, e=0 only all PASS. Anti-cheat: tokens named above are spec-named; bytes read back; written-before-code.
## §E THE PRE-WRITTEN DEEP CONTAINER TESTS

Host-live loop (CLI is host-native; container proves the wt shape only): setup container `mimo-ct:master`? For wt absent + git identity logic, host-live on a GARBAGE sandbox is the rig, container the wt-install artifact. Plan-first 2000+ chars: objective (same S1–S12 on sandbox), tools (git-manager port + wt + live git), scenarios: AUTH-shape (no model gate — CLI local), FIREWALL grok-drop + HOME + shell-spawn (tokens LIVE-WORKER/HOME-LEAK/PUFFER-PARENT in stderr), MUTATE-HOLD (relocate without approved → dry + STALE-PREVIEW), LEGIT (status/bind/spawn-dry pass, tokens `"toplevel"`/`"/move "`/`"dry":true`), INTEGRATION chain e=0. Phase E all 10 with artifact `.mimocode/ct-results.json` OR host record (JSON copies) since CLI has no TUI. Declaration: sha proof + JSON excerpts + per-scenario pass/fail. Negative: legit ops ZERO misfire mandatory. Phase-E blocks mutate: no real `worktree move` in Phase E.
## §8 THE ANTI-PATTERN LEDGER

ARCHITECTURAL. A1 WRAPPER-PARKED WORKER — agent parked inside outer puffer clone (`~/.omp/wt/plutus-main-66dfa4c/PLUTUS/agent`); detection: `health` class wrapper outer + keep-live inner or FAIL. A2 SHELL `/worktree` FOR PRODUCT — buffer HEAD cloned as plutus/GI; detection: spawn-worker PUFFER-PARENT e=2 probes. A3 MONOREPO SHELL TRACKING PRODUCTS — shell git absorbing product trees; detection: shell status porcelain lists PLUTUS/ paths post-ignore. A4 LIVE-DELETE RACE — drop during worker commit; detection: index.lock → WORKTREE-BOUND before any remove.

BEHAVIORAL. B1 SILENT RE-CLAIM — fix then claim without re-run (qwen skill law); detection: every close requires fresh command output this run. B2 AMEND-ON-REJECT — reject loop rewriting commits; detection: reject-loop grep forbids `--amend`/`--force`. B3 `git add -A` FROM SHELL — HOME+EISDIR+sqlite; detection: token ADD-A-FORBIDDEN + cone-only staging. B4 AUTO-COMMIT EVERY TURN — F-13 bomb; detection: default commitOnComplete false, preview-only.

PROCESS. P1 OCR-UNTYPEABLE GATE — ship claim before `ocr scan` 0/0; detection: verdict line required, this spec BLOCKED. P2 MUTATE-WITHOUT-APPROVED — remove without `approved <id>`; detection: execute requires preview id + re-measured SHAs. P3 STALE-IMAGE-STYLE DEPLOY — mutate against drifted SHAs; detection: STALE-PREVIEW on drift. P4 SESSION-CWD DRIFT — cd assumed to move TUI; detection: bind prints `/move` and re-verify toplevel before writes.

A regex-only "detection" (no token, no JSON field, no exit) is a lexicon violation: every detection above names a token or command the gate prints.
## §9 THE OPEN DECISIONS

O1 GI split complete? Evidence: shelf git exists `jarvis/gi-main`; OMP dump shows GI deletes. Default: shelf wins; OMP dump is leftover. O2 Plutus bare vs agent-root? Evidence: today agent/.git is the product root. Default: keep agent-root until relocate; bare later. O3 `wt` install: cargo build from source vs brew. Default: `cargo install worktrunk` (cargo 1.x present, shell integration `wt config shell install`). O4 Provisioner scope: depth-1 only, no recursion. Default approved. O5 When to `approved preview-20260915T125221`: only when worker2+GI idle. Default: keep dry.
## THE SPEC ILLUSTRATED

Master view:

```
┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│ ABSORB │──►│ REFUSE │──►│PREVIEW │──►│APPROVE │──►│MUTATE  │
└────────┘   └────────┘   └────────┘   └────────┘   └────────┘
 live git     tokens       SHAs         operator     wt move
```

Core mechanism (classify → preview → approve → move):

```
┌──────────────┐      ┌──────────────┐      ┌──────────┐
│   health     │      │  plan-clean  │      │ execute  │
└─────┬────────┘      └──────┬───────┘      └────┬─────┘
      │ wrapper vs keep      │ ops + SHAs        │ approved
      ├─────────────────────►│                   │
      │                      ├──────────────────►│
      │                      │                   │ re-measure
```

Overlays (always on):

```
┌────────────┐      ┌──────────────┐      ┌──────────┐
│  keep-live │      │  mimo 1-way  │      │  thread  │
└────────────┘      └──────────────┘      └──────────┘
 never delete       sha equal             omp append
```

Build manifest:

```
┌──────────────────────────────┐
│ src/                         │
├──────────────────────────────┤
│ ├─ git-manager.ts  router    │
│ ├─ types.ts  tokens          │
│ ├─ health.ts  classify       │
│ ├─ preview.ts  gate          │
│ └─ spawn-worker.ts  puffer   │
└──────────────────────────────┘
```

Reject surface:

```
   ┌───────────┐  LIVE       ┌───────────────┐
   │  KEEP     │ ───────────►│   REFUSE e=2  │
   └───────────┘             └───────┬───────┘
                                     │
                      STALE/PREVIEW  │  HOME/SHELL
                                     ▼
                            ┌───────────────┐
                            │ DRY, no move  │
                            └───────────────┘
```
## THE SCRIPT TESTING SUITE

Harness `st-jgm.ts` (Effect-gen optional; plain bun harness acceptable for Mode-B CLI): sandbox mkdtemp TRASHROOT, real `git init` throwaway repos (no product), `Effect`-style declare per scenario (R=fs+git-spawn, E=ExitCode+stderr-token, A=JSON field), Exercise via `Bun.spawnSync`, Observe stdout JSON fields + stderr token + exit, adversarial halves mandatory, cleanup rm -rf sandbox. Scenarios: HOME-LEAK e=2 token; PUFFER-PARENT e=2; LIVE-WORKER grok e=2; STALE-PREVIEW e=2; legit status e=0 field `"toplevel"`; legit bind field `"/move "`; legit spawn-dry field `"dry":true`; plan writes preview bytes; verifyShas drift→stale. Runner: sequential, PASS/FAIL table, exit 0 iff all PASS. Anti-cheat: spec-named tokens only, read-back bytes/preview JSON, written at spec time; agent-typed tokens rejected as circular.
## THE DEEP CONTAINER TESTING SUITE

Host-live (config §II): round-zero = predecessor SHAs; fire REAL `git-manager.ts` on sandbox repos; JSON + git worktree list layers; forensics on any drift; two-sided adjudication (test-vs-code); minimal fix; gate ladder; deploy = copy into `Jarvis_Git_Manager/src`; retest identical; verify store sqlite rows; DEBUG_LOG round record. Container (wt shape): install worktrunk in container, `wt switch -c` throwaway, screenshot wt list frames. Results artifact `.mimocode/ct-results.json` (sandbox) with passToken/failToken per scenario: FIREWALL grok `LIVE-WORKER`/`file written`; HOME `HOME-LEAK`/`spawned`; SHELL `PUFFER-PARENT`/`worktree added`; STALE `STALE-PREVIEW`/`mutated`; LEGIT status `"toplevel"`/blocked; LEGIT bind `"/move "`/no-move; LEGIT spawn `"dry":true`/mutated. Phase E 10 checks named. Threshold: S1–S8 same run + negatives zero-misfire. Threshold blocks mutate.
