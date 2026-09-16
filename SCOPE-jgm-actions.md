# SCOPE god-loop-jgm-actions
LOCK: embedded git actions agents call without thinking
FILES (write): src/commit-cone.ts src/spawn-worker.ts src/bind.ts src/wt.ts ~/.omp/agent/skills/jarvis-git-manager/SKILL.md ~/.omp/agent/commands/git-manager.md wave-audit/W*-actions.md
READ-ONLY: src/types.ts src/keep-table.ts src/refuse.ts DPL1 MASTER_PROMPT_DAEMON.md
NEVER: daemon.ts systemd units; never `git add -A`; never commit outside owned cone; never spawn from SHELL/HOME; never mimo files
GATE: commit-cone stages cone only + secret scan + prints sha; outside-cone refuses; secret refuses; spawn SHELL plutus PUFFER-PARENT e=2; ST extended exit 0
