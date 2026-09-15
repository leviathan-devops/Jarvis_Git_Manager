# SCOPE god-loop-jgm-fix
LOCK: OCR medium fixes + gate wires
FILES (write): src/git-manager.ts src/keep-table.ts src/relocate.ts src/test-known-bad.ts src/types.ts
READ-ONLY: specs/DPL1 PATHS MASTER keep-live list
NEVER: spawn-worker.ts bind.ts provision.ts wt.ts test suites skill files; never git worktree remove
GATE: unknown-action exit 2; --help exit 0; typed module interface; no nested ternary; single dest alias; spawn try/catch; mimo sha equal
