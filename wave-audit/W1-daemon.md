# W1 daemon — wave audit

## What ran
- Created `src/daemon.ts`: one tick — `collectHealth()` from `./health.ts`,
  upsert each worktree into `git_worktree(path,repo,branch,class,keep,head)`
  with `keep=isKeepLive(path)?1:0`; adopt-note rows
  (`preview_id='daemon-adopt'`, `action='adopt-note'`) for
  `product|leftover` rows under `PLUTUS_AGENT`, `GI_DIR`, or the
  Jarvis_Git_Manager dir; mark-gone rows (`preview_id='daemon-sweep'`,
  `action='mark-gone'`) for stored paths missing from health. Never deletes
  store rows, never runs git mutations. Prints
  `{tick, upserts, adopts, gone, classes}`. Exit 0.
- Created `jgm-daemon@.service`: `Type=oneshot`,
  `ExecStart=/home/leviathan/.bun/bin/bun src/daemon.ts`,
  `WorkingDirectory=.../Jarvis_Git_Manager`, `WantedBy=default.target`,
  plus comment that a `jgm-daemon@.timer` sibling (60s) may trigger it.
- Created `jgm-daemon@.path`: `PathModified=%i/.git/refs/heads`,
  `Unit=jgm-daemon@%i.service`, `WantedBy=default.target`, same timer note.
- Read-only: `SCOPE-jgm-daemon.md`, `src/health.ts` (collectHealth +
  classifyWorktree + ensureStore), `src/keep-table.ts`, `src/types.ts`
  HealthJson, `src/status.ts` (parser), `src/schema.sql`, `PATHS_DAEMON.md`,
  `MASTER_PROMPT_DAEMON.md`.

## Live state at tick time
- PLUTUS/agent worktree list: `plutus/main` + nested
  `~/.omp/wt/plutus-main-66dfa4c/PLUTUS/agent` (`omp-worker-1`) +
  `.worktrees/grok-prototype` (`plutus/grok-prototype`). LIVE WINS holds.
- GI branch: `jarvis/gi-main`.
- Store after tick: `git_worktree` = 14 rows; `git_op` = 0 rows (nothing to
  adopt: the single `product` row is the SHELL root itself, not under a
  watched product root; nothing vanished).

## Tick proof
```
$ bun src/daemon.ts
{"tick":"2026-09-16T12:14:11.406Z","upserts":14,"adopts":0,"gone":0,"classes":{"leftover":7,"wrapper":1,"keep-live":5,"product":1}}
EXIT:0
```
- `upserts=14 >= 3`: PASS.
- Keep flags verified against `isKeepLive`: 5 keep-live rows have `keep=1`,
  all others `keep=0`.
- No mimo writes. No `git worktree add|move|remove`, no `git commit`, no
  `git branch -D` executed. Skipped prettier/tests per contract.

## Forbidden-verb grep proof (must be empty)
```
$ grep -cE 'worktree add|worktree move|worktree remove|git commit|branch -D' src/daemon.ts
0
$ grep -nE 'worktree add|worktree move|worktree remove|git commit|branch -D' src/daemon.ts
(no output, exit 1)
```
- Result: empty. daemon.ts contains no git-mutating verbs. PASS.
