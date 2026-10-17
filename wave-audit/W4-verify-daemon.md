# W4-verify-daemon audit — 2026-09-16

VERDICT: CORRECT (26/26 PASS, exit 0)

Runner: `bun src/st-jgm.ts` (Mode-B: real imports from ../src/*.ts, Exit-captured, one runPromise at bottom).
JSON copy: `reports/verify-daemon.json` (same numbers: total=26 pass=26 fail=0 exit=0).
Gate run: exit 0, 26/26 PASS; preview `preview-20260916T125118` (1230 bytes on disk, preview-<new> only; reports/verify-daemon.json copy).
Probe runs this session wrote `preview-20260916T123929`, `...124900`, `...124937` (all preview-<new>, no overwrite).

## Per-row verdicts (19 kept + 7 new)

| # | Row | Verdict | Evidence |
|---|---|---|---|
| 1 | HOME-LEAK e=2 token | PASS | `status --cwd /home/leviathan` e=2, stderr `HOME-LEAK: cwd /home/leviathan resolves to HOME repo /home/leviathan` |
| 2 | PUFFER-PARENT e=2 | PASS | `spawn-worker --cwd SHELL --product plutus` e=2, stderr `PUFFER-PARENT: cwd toplevel is SHELL ...` |
| 3 | LIVE-WORKER grok e=2 | PASS | `drop-wrapper --target .../grok-prototype` e=2, stderr `LIVE-WORKER: target ... is keep-live; refusing drop`; `isKeepLive(grok)=true`, keepPaths=5 |
| 4 | STALE-PREVIEW e=2 | PASS | `execute --approved no-such-id` e=2, stderr `STALE-PREVIEW: preview no-such-id not found ...`; `parseApproved` direct import returns `no-such-id` |
| 5 | HEALTH-EXIT0 | PASS | `health` e=0, 14 worktrees parseable |
| 6 | HEALTH-KEEP3 | PASS | keep-live=5 (bar >=3) |
| 7 | HEALTH-WRAP1 | PASS | wrapper=1 (bar >=1), leftover=7, product=1 |
| 8 | HEALTH-SHA-WORKER | PASS | live worker sha `8f4ac74` present in health stdout |
| 9 | HEALTH-SHA-GROK | PASS | live grok sha `61f9ee3` present in health stdout |
| 10 | HEALTH-DIRECT | PASS | direct `collectHealth()` import: keep-live=5 = CLI 5, total 14 = 14, `classifyWorktree(grok)=keep-live` |
| 11 | PLAN-CLEAN-NEW | PASS | `plan-clean` e=0, `preview-20260916T125118.json` 1230 bytes, added=1, overwrittenExisting=false, id matches filename |
| 12 | STATUS-TOPLEVEL | PASS | `status --cwd PLUTUS/agent` e=0, toplevel=`.../PLUTUS/agent`, branch=`plutus/main`, field `repoRoot` IS the toplevel |
| 13 | BIND-MOVE | PASS | `bind --dir PLUTUS/agent` e=0, `move=/move .../PLUTUS/agent`, stdout contains `/move ` (trailing space) |
| 14 | SPAWN-DRY | PASS | `spawn-worker --cwd Jarvis_Git_Manager --product plutus` e=0, `"dry":true`, mutate=false |
| 15 | IGNORE-DRY | PASS | `ignore-shell` e=0, dry=true, `.gitignore` bytes identical before/after, wouldAppend subset of IGNORE_LINES |
| 16 | PROVISION-DOTDIR | PASS | `provision.ts --dir /tmp/.jgm-st-dotdir-<pid>` e=2 `UNOWNED-PATH`, nothing created |
| 17 | PROVISION-DOCS | PASS | `provision.ts --dir /tmp/jgm-st-probe-<pid>/docs` e=2 `UNOWNED-PATH`, nothing created |
| 18 | WT-PRESENT | PASS | `which wt` e=0 at `/home/leviathan/.cargo/bin/wt`; `wt list` e=0 shows-main=true |
| 19 | KNOWN-BAD | PASS | `test-known-bad` e=0, 4/4 pass (home-leak, puffer-parent, live-worker, stale-preview) |
| 20 | DAEMON-TICK | PASS | `bun src/daemon.ts` e=0, tick `2026-09-16T12:51:19.001Z`, upserts=14 (>=3), keep-live=5 (>=3), wrapper=1 (>=1) |
| 21 | DAEMON-NO-WRITE | PASS | `readFileSync(daemon.ts)` contains none of `worktree add|move|remove`, `git commit`, `branch -D` — grep empty |
| 22 | COMMIT-CONE-LEGIT | PASS | /tmp throwaway: `git init` + local identity + baseline outside cone; `bun commit-cone.ts --paths cone-file.txt` e=0, sha `9b9546ba307f`, `git show HEAD --name-only` = exactly `cone-file.txt`, `ls-files -m` still lists dirty `keep-out.txt` (cone-only); throwaway `rm -rf` after |
| 23 | COMMIT-CONE-OUTSIDE | PASS | same throwaway, `--paths /etc/hostname` e=2, stderr `UNOWNED-PATH: cone path /etc/hostname sits outside repo toplevel ...` |
| 24 | COMMIT-CONE-SECRET | PASS | same throwaway, `secret-file.txt` with `api_key = ...` e=2, stderr `SECRET-HIT: refusing commit; secret pattern in 1 file(s): .../secret-file.txt` (names only, never values) |
| 25 | COMMIT-CONE-SHELL | PASS | `--cwd SHELL --paths dummy.txt` e=2, stderr `PUFFER-PARENT: cwd toplevel is SHELL ...` |
| 26 | SPAWN-LIVE-DRY | PASS | `spawn-worker --cwd PLUTUS/agent --product plutus` e=0, `dry=true`, `mutate=false` (product-cwd dry; NO live-spawn — W3 already proved `--live` on a /tmp throwaway) |

## Coverage (DPL1 §D §E §6 S1-S12)

- S1 health keep-live>=3 wrapper>=1: rows 5-7 + row 10 direct-import cross-check + full health counts in DEBUG_LOG.
- S2 plan-clean writes preview zero mutations: row 11 (added=1, overwritten=false, bytes>0) + product SHAs identical before/after in DEBUG_LOG.
- S3 HOME-LEAK exit 2: row 1.
- S4 PUFFER-PARENT exit 2: row 2.
- S5 LIVE-WORKER exit 2 on grok: row 3 + row 19 sub-case.
- S6 STALE-PREVIEW exit 2: row 4.
- S7 test-known-bad 4/4: row 19.
- S8 mimo byte-identical: DEBUG_LOG bracket (global 17 MEMORY-journal* sha before/after EQUAL, combined `689043e4...`; project c507206c 5 files EQUAL) + diff lines `MIMO-GLOBAL-EQUAL` / `MIMO-PROJ-EQUAL`.
- S9 wt present + JGM delegates spawn/list/remove: row 18 (`which wt` e=0, `wt list` e=0 shows-main) + delegation strings in spawn-worker.ts (`wt switch -c -x omp <branch>`) and wt.ts bridge.
- S10 provisioner inits depth-1 throwaway + deletes it: rows 16-17 refuses (dotdir/docs, nothing created) + W3 throwaway roundtrip residual (e=0 bare .git + main/ worktree, cleaned) — this gate probes refuse-only on /tmp; no live provision.
- S11 OCR 0 critical/high: NOT covered by this harness — no `ocr scan` run here; stands BLOCKED per DPL1 §8 P1 (named blocker, not claimed).
- S12 thread appended on omp slug: NOT covered by this harness — no `omp-threads.ts discover git-manager` run here; owed follow-up, not claimed.
- Legit halves (adversarial-both-halves law): rows 12-14 + 26 (`"toplevel"`=repoRoot, `"/move "`, `"dry":true` from JGM cwd AND from product cwd).
- Dry-only halves: rows 15-17 (ignore-shell + provision.ts UNOWNED-PATH refuses, no creates).
- Daemon additions (§D observe+store, §E host-live): rows 20-21 — tick JSON shape `{tick,upserts,adopts,gone,classes}` observed live (`upserts=14 adopts=0 gone=0`), store has 14 `git_worktree` rows, keep flags match `isKeepLive` (5 keep-live rows `keep=1`); no-write grep empty (never `worktree add|move|remove`, `git commit`, `branch -D`).
- Commit additions (cone-only staging): rows 22-25 — legit prints `{"action":"commit-cone", sha, files, dry:false}` + wave trailer; staging is explicit pathspecs only (`git add -- <rels>`); secret scan before staging (working-tree bodies + staged `cat-file :<path>` + cone diff), hits report file names only; refusals `UNOWNED-PATH` / `SECRET-HIT` / `PUFFER-PARENT` all e=2.
- Zero git mutations on product trees: PLUTUS e99377f / grok 61f9ee3 / nested worker 8f4ac74 / SHELL abfa184 / GI c903827 identical before/after; PLUTUS worktree list unchanged (3 entries); SHELL `.gitignore` sha `1db490d2...a3aff66a` unchanged; commit-cone probes confined to `mkdtemp /tmp/jgm-st-cone-*` with `rm -rf` cleanup.
- Real-import proof: st-jgm.ts statically imports `keep-table.ts` (HOME/SHELL/KEEP_PATHS/isKeepLive), `health.ts` (STORE_DIR/PLUTUS_AGENT/classifyWorktree/collectHealth), `status.ts` (normPath), `ignore-shell.ts` (SHELL_GITIGNORE/IGNORE_LINES), `preview.ts` (parseApproved). No mocks, no fixtures; only sandbox repos are /tmp throwaways for commit-cone.

## Residuals / owed

- S11 OCR scan + S12 thread append remain out-of-harness follow-ups (named, not claimed).
- ST runs are preview-generating by design: this gate wrote `preview-20260916T124937` (reports/verify-daemon.json copy); probes wrote `...123929`, `...124900`. All preview-<new>, no existing preview overwritten.
- T1 known-live restated: worker `8f4ac74`, grok `61f9ee3`, GI `jarvis/gi-main`; store has `git_worktree` rows (14).
