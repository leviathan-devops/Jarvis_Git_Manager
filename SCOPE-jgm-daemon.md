# SCOPE god-loop-jgm-daemon
LOCK: project-scoped auto-track daemon
FILES (write): src/daemon.ts systemd units jgm-daemon@.service jgm-daemon@.path wave-audit/W*-daemon.md
READ-ONLY: src/types.ts src/keep-table.ts src/health.ts src/status.ts DPL1 MASTER_PROMPT_DAEMON.md
NEVER: commit-cone.ts spawn-worker.ts bind.ts wt.ts skill files; never `git worktree add|move|remove`, never `git commit`, never `git branch -D`; never mimo files
GATE: unit active; tick writes health rows ≤120s; new watched branch adopted, nothing deleted; grep daemon.ts for worktree add|move|remove|commit returns empty
