# W4-verify audit — 2026-09-15

VERDICT: CORRECT (19/19 PASS, exit 0)

Runner: `bun src/st-jgm.ts` (Mode-B: real imports from ../src/*.ts, Exit-captured, one runPromise at bottom).
JSON copy: `reports/verify-run.json` (same numbers: total=19 pass=19 fail=0 exit=0).
New preview this run: `preview-20260915T163203` (1230 bytes on disk, preview-<new> only).

## Per-scenario verdicts

| # | Scenario | Verdict | Evidence |
|---|---|---|---|
| 1 | HOME-LEAK e=2 token | PASS | `status --cwd /home/leviathan` e=2, stderr `HOME-LEAK: cwd /home/leviathan resolves to HOME repo /home/leviathan` |
| 2 | PUFFER-PARENT e=2 | PASS | `spawn-worker --cwd SHELL --product plutus` e=2, stderr `PUFFER-PARENT: cwd toplevel is SHELL ...` |
| 3 | LIVE-WORKER grok e=2 | PASS | `drop-wrapper --target .../grok-prototype` e=2, stderr `LIVE-WORKER: target ... is keep-live; refusing drop`; `isKeepLive(grok)=true`, keepPaths=5 |
| 4 | STALE-PREVIEW e=2 | PASS | `execute --approved no-such-id` e=2, stderr `STALE-PREVIEW: preview no-such-id not found ...`; `parseApproved` direct import returns `no-such-id` |
| 5 | HEALTH-EXIT0 | PASS | `health` e=0, 10 worktrees parseable |
| 6 | HEALTH-KEEP3 | PASS | keep-live=5 (bar >=3) |
| 7 | HEALTH-WRAP1 | PASS | wrapper=1 (bar >=1), leftover=3, product=1 |
| 8 | HEALTH-SHA-WORKER | PASS | live worker sha `ed4533d` present in health stdout |
| 9 | HEALTH-SHA-GROK | PASS | live grok sha `61f9ee3` present in health stdout |
| 10 | HEALTH-DIRECT | PASS | direct `collectHealth()` import: keep-live=5 = CLI 5, total 10 = 10, `classifyWorktree(grok)=keep-live` |
| 11 | PLAN-CLEAN-NEW | PASS | `plan-clean` e=0, `preview-20260915T162936.json` 1230 bytes, added=1, overwrittenExisting=false, id matches filename |
| 12 | STATUS-TOPLEVEL | PASS | `status --cwd PLUTUS/agent` e=0, toplevel=`.../PLUTUS/agent`, branch=`plutus/main`, field `repoRoot` IS the toplevel |
| 13 | BIND-MOVE | PASS | `bind --dir PLUTUS/agent` e=0, `move=/move .../PLUTUS/agent`, stdout contains `/move ` (trailing space) |
| 14 | SPAWN-DRY | PASS | `spawn-worker --cwd Jarvis_Git_Manager --product plutus` e=0, `"dry":true`, mutate=false |
| 15 | IGNORE-DRY | PASS | `ignore-shell` e=0, dry=true, `.gitignore` bytes identical before/after, wouldAppend subset of IGNORE_LINES |
| 16 | PROVISION-DOTDIR | PASS | `provision.ts --dir /tmp/.jgm-st-dotdir-<pid>` e=2 `UNOWNED-PATH`, nothing created |
| 17 | PROVISION-DOCS | PASS | `provision.ts --dir /tmp/jgm-st-probe-<pid>/docs` e=2 `UNOWNED-PATH`, nothing created |
| 18 | WT-ABSENT | PASS | `which wt` e=1: binary absent (expected; delegation code only, no live wt) |
| 19 | KNOWN-BAD | PASS | `test-known-bad` e=0, 4/4 pass (home-leak, puffer-parent, live-worker, stale-preview) |

## Coverage (DPL1 §D §E §6 S1-S8)

- S1 health keep-live>=3 wrapper>=1: rows 5-7 + row 10 direct-import cross-check + full health JSON in DEBUG_LOG.
- S2 plan-clean writes preview zero mutations: row 11 (added=1, overwritten=false, bytes>0) + product SHAs identical before/after in DEBUG_LOG.
- S3 HOME-LEAK exit 2: row 1.
- S4 PUFFER-PARENT exit 2: row 2.
- S5 LIVE-WORKER exit 2 on grok: row 3 + row 19 sub-case.
- S6 STALE-PREVIEW exit 2: row 4.
- S7 test-known-bad 4/4: row 19.
- S8 mimo byte-identical: DEBUG_LOG bracket (17 global MEMORY-journal* sha before/after, diff EQUAL; project MEMORY-journal* 5 files EQUAL) + combined sha `689043e4...`.
- Legit halves (adversarial-both-halves law): rows 12-14 (`"toplevel"`=repoRoot, `"/move "`, `"dry":true`).
- Dry-only halves: rows 15-17 (ignore-shell + provision.ts UNOWNED-PATH refuses, no creates).
- wt: row 18 absent-expected (delegation code in wt.ts/spawn-worker.ts, no live binary; W2-W3 residual stands).
- Zero git mutations on product trees: PLUTUS e99377f / grok 61f9ee3 / nested worker ed4533d / SHELL e0226af / GI 2fd14e8 identical before/after; PLUTUS worktree list unchanged (3 entries).
- Real-import proof: st-jgm.ts statically imports `keep-table.ts` (HOME/SHELL/KEEP_PATHS/isKeepLive), `health.ts` (STORE_DIR/PLUTUS_AGENT/classifyWorktree/collectHealth), `status.ts` (normPath), `ignore-shell.ts` (SHELL_GITIGNORE/IGNORE_LINES), `preview.ts` (parseApproved). No mocks, no fixtures, no sandbox repos.

## Residuals / owed

- ST runs are preview-generating by design: this session created `preview-20260915T162922`, `...162936`, `...163013`, `...163037`, `...163136`, `...163203` (final gate = 163203, reports/verify-run.json copy). All are preview-<new> files; no existing preview overwritten.
