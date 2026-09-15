# W1-fix audit
VERDICT: CORRECT (orchestrator re-ran)
- test-known-bad 4/4 e=0
- --help e=0, unknown-action e=2, HOME-LEAK e=2
- health inner keep-live ed4533d outer wrapper (LIVE WINS moved from af74afc)
- types bun-import ok
- relocate: no nested ternary in dry block; single dest kept (preview.ts:226 reads op.dest)
- refuse.ts comment NOT added (desk constraint excluded it) — owed in verify or follow-up
coverage: git-manager.ts keep-table.ts relocate.ts test-known-bad.ts types.ts
