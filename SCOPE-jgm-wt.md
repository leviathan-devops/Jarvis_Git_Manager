# SCOPE god-loop-jgm-wt
LOCK: worktrunk install + delegate + provisioner + shell buffer + skill
FILES (write): src/spawn-worker.ts src/bind.ts src/ignore-shell.ts src/provision.ts src/wt.ts ~/.omp/agent/skills/jarvis-git-manager/SKILL.md ~/.omp/agent/commands/git-manager.md
READ-ONLY: src/types.ts src/keep-table.ts DPL1
NEVER: fix files; never /worktree from SHELL; never delete keep-live; never mimo files
GATE: which wt exit 0; spawn SHELL plutus PUFFER-PARENT e=2; provision throwaway roundtrip; shell ignore lists product folders
