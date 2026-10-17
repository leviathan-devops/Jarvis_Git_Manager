# BUILD_REPORT — W4 verify (2026-09-15)

Built: `src/st-jgm.ts` — Mode-B bun harness.
- Real imports from `../src/*.ts`: `keep-table.ts` (HOME/SHELL/KEEP_PATHS/isKeepLive), `health.ts` (STORE_DIR/PLUTUS_AGENT/classifyWorktree/collectHealth), `status.ts` (normPath), `ignore-shell.ts` (SHELL_GITIGNORE/IGNORE_LINES), `preview.ts` (parseApproved).
- Exit-captured: every child spawn via `Bun.spawnSync`, exit code captured to a value, never propagated. One `runPromise` equivalent at bottom (`await guarded()` single entry).
- 19 scenarios covering DPL1 S1-S8 + legit halves + dry-only halves + wt-absent + known-bad.

Run: `bun src/st-jgm.ts` → exit 0, PASS table 19/19 on stderr, JSON record on stdout.
Artifacts:
- `reports/verify-run.json` — same numbers (total=19 pass=19 fail=0 exit=0).
- `wave-audit/W4-verify.md` — per-scenario verdicts + coverage.
- `DEBUG_LOG.md` — mimo sha before/after EQUAL + health JSON + known-bad JSON + zero-mutation SHAs.
- New preview `preview-20260915T163203.json` (1230 bytes, final gate; preview-<new> only, never overwrite existing).

Acceptance: exit 0 PASS table 19 rows (≥10) ✓; verify-run.json same counts ✓; DEBUG_LOG mimo sha before/after equal ✓; zero git mutations on product trees ✓. Prettier skipped per assignment.

---

# BUILD_REPORT — W4 verify-daemon (2026-09-16)

Extended: `src/st-jgm.ts` ONLY (kept all 19 existing rows, added 7 — no other src touched).
- New imports: `mkdtempSync/writeFileSync/rmSync` (node:fs), `tmpdir` (node:os); new path consts `DAEMON` (src/daemon.ts), `CONE` (src/commit-cone.ts); new JSON shapes `TickOut {tick,upserts,adopts,gone,classes}`, `ConeOut {action,sha,files,dry}`.
- New rows: DAEMON-TICK (`bun src/daemon.ts` exit 0, JSON `{tick,upserts,adopts,gone,classes}`, upserts>=3, keep-live>=3, wrapper>=1); DAEMON-NO-WRITE (`readFileSync(daemon.ts)` contains none of `worktree add|move|remove`, `git commit`, `branch -D`); COMMIT-CONE-LEGIT (/tmp `mkdtemp` throwaway: `git init` + local identity + tracked baseline outside cone, cone commit e=0 sha printed, `git show HEAD --name-only` exactly the cone file + dirty baseline still modified, `rm -rf` cleanup); COMMIT-CONE-OUTSIDE (`/etc/hostname` e=2 `UNOWNED-PATH`); COMMIT-CONE-SECRET (`api_key = ...` e=2 `SECRET-HIT`); COMMIT-CONE-SHELL (`--cwd SHELL` e=2 `PUFFER-PARENT`); SPAWN-LIVE-DRY (`spawn-worker --cwd PLUTUS/agent --product plutus` e=0 `dry:true mutate:false`, no live-spawn — W3 already proved `--live` on throwaway).
- Still Mode-B (real imports, exit-captured spawns, one `await guarded()` entry). Still 1 file changed.

Run: `bun src/st-jgm.ts` → exit 0, PASS table 26/26 on stderr, JSON record on stdout.
Artifacts:
- `reports/verify-daemon.json` — same numbers (total=26 pass=26 fail=0 exit=0).
- `wave-audit/W4-verify-daemon.md` — per-row verdicts + S1-S12 coverage + daemon/commit additions.
- `DEBUG_LOG.md` — W4 verify-daemon gate section: mimo global+proj sha EQUAL + daemon tick JSON + cone JSON + known-bad JSON + zero-mutation SHAs.
- New preview `preview-20260916T125118.json` (1230 bytes, gate; preview-<new> only, never overwrite existing).

Acceptance: exit 0 PASS table 26 rows (19+N, N=7) ✓; verify-daemon.json same counts ✓; DEBUG_LOG mimo sha before/after equal + live SHAs ✓; zero product mutations ✓. Prettier skipped per assignment.
