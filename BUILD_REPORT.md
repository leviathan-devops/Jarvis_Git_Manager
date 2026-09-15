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
