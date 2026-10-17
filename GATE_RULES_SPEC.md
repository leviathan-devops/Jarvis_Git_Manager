# GATE_RULES_SPEC — Jarvis Git Manager gate rules

- **Status:** SPEC (implementable, not yet built)
- **Date:** 2026-09-16
- **Owner tree:** `Shared_Workspace/Jarvis_Git_Manager/`
- **Law above this file:** `specs/JARVIS_GIT_MANAGER_DPL1_SPEC.md` (S1–S12), `MASTER_PROMPT.md`, `MASTER_PROMPT_DAEMON.md`, `Bibles/STAIRSTEPPER_GIT_BIBLE.md` (§3 pyramid, §7 experimental sandbox)
- **Rule for reading this file:** every subsection is labeled `VERIFIED` (seen in source on disk this turn) or `PROPOSED` (new code/config to write). Nothing labeled VERIFIED may be re-described as stronger than its source. Nothing labeled PROPOSED may be cited as existing.

---

## §0 — Current JGM capabilities (VERIFIED from source)

Surveyed this turn: all `SCOPE-*.md`, `PATHS.md`, `PATHS_DAEMON.md`, `MASTER_PROMPT.md`, `MASTER_PROMPT_DAEMON.md`, `BUILD_REPORT.md`, `src/` (20 files), 4 systemd units, skill `~/.omp/agent/skills/jarvis-git-manager/SKILL.md`, `Bibles/STAIRSTEPPER_GIT_BIBLE.md` §§3–7, 9–10.

### §0.1 What `jgm-daemon` DOES today (VERIFIED: `src/daemon.ts`)

- One-shot tick, not a long-lived process. `main()` runs once per invocation: `collectHealth()` → upsert loop → adopt/gone notes → print one JSON object `{tick, upserts, adopts, gone, classes}` on stdout.
- `WATCHED_ROOTS` is a literal (`daemon.ts:17`): `[PLUTUS_AGENT, GI_DIR, JGM_ROOT]` = `Shared_Workspace/PLUTUS/agent`, `Shared_Workspace/Graph_Intelligence`, `Shared_Workspace/Jarvis_Git_Manager`.
- Store writes per tick: `INSERT OR REPLACE INTO git_worktree(path,repo,branch,class,keep,head)` for every health row; `INSERT INTO git_op(preview_id,action,result,ts)` with `('daemon-adopt','adopt-note',<path>,<now>)` for `product|leftover` rows under a watched root, and `('daemon-sweep','mark-gone',<path>,<now>)` for stored paths missing from health.
- Hard negative (VERIFIED by read + ST row `DAEMON-NO-WRITE`): `daemon.ts` contains none of `worktree add|move|remove`, `git commit`, `branch -D`. It never changes git state and never deletes store rows. `SCOPE-jgm-daemon.md` line 5 makes this a lock: daemon files may not commit/spawn/bind.
- ST evidence (`BUILD_REPORT.md` W4 verify-daemon): `bun src/daemon.ts` exit 0, `upserts>=3, keep-live>=3, wrapper>=1`; full `st-jgm.ts` 26/26 exit 0.

### §0.2 Enforcement hooks that exist today (VERIFIED per module)

CLI contract (VERIFIED: `src/git-manager.ts`, both MASTER §11/§51, `SKILL.md`): `bun git-manager.ts <action> [args]` → stdout exactly one JSON object, stderr human text, exit `0` pass / `1` fail / `2` refuse with a named token. Router is dynamic-import only (`MODULES` map); `commit-cone` is NOT in the router map (invoked as `bun src/commit-cone.ts …` directly) — implementers must not assume `git-manager.ts commit-cone` resolves.

| Module | VERIFIED behavior | Refuse tokens emitted (VERIFIED by grep) |
|---|---|---|
| `src/refuse.ts` | `refuse(token, message)`: writes `<TOKEN>: <message>` on stderr, `process.exit(2)`. No git commands, ever. | — (primitive) |
| `src/types.ts` | Frozen `Token` union (9): `HOME-LEAK PUFFER-PARENT LIVE-WORKER STALE-PREVIEW WORKTREE-BOUND ADD-A-FORBIDDEN AMEND-FORBIDDEN FORCE-MAIN UNOWNED-PATH`. `WorktreeClass`: `product wrapper leftover keep-live`. JSON shapes: `StatusJson`, `HealthJson`, `PlanCleanJson`, `PreviewOp`. | declaration only |
| `src/status.ts` | Read-only probe: `rev-parse` (toplevel, common-dir, branch, head) + `worktree list --porcelain`. Refuses when repoRoot == HOME. Never mutates. | `HOME-LEAK` |
| `src/health.ts` | `collectHealth()`: read-only `rev-parse` + `worktree list` on SHELL, PLUTUS/agent, GI (+ `extraSources`). `classifyWorktree()`: wrapper = under `~/.omp/wt` AND common-dir is SHELL `.git` AND nested product `.git` inside; keep-live = keep-table hit (LIVE WINS over static table). `ensureStore()`: mkdir + WAL open + apply `schema.sql`; returns null when unavailable, callers must not fail. | — (classify only) |
| `src/keep-table.ts` | Literals `HOME`, `SHELL`, 5-entry `KEEP_PATHS` (PLUTUS/agent, grok-prototype worktree, nested omp-worker-1, GI, GI-wt-gi-ship). `isKeepLive()`: exact-or-under prefix match. | — |
| `src/commit-cone.ts` | Cone-only committer. `--cwd` (default `process.cwd()`), required `--paths a,b,c`, required `--message`. Resolves cones against cwd; finds toplevel; refuses (exit 2) per table below; secret-scans working-tree bodies + staged `cat-file :<path>` bodies + cone `diff HEAD` (or `--cached` when HEAD unborn) BEFORE staging, file-names-only on hits; stages explicit pathspec only (`git add -- <rels>`); commits with `wave: commit-cone` trailer; prints `{action:"commit-cone", sha, files, dry:false}`; best-effort `git_op('commit-cone','commit-cone',<sha>,<now>)`. NEVER `git add -A`. | `HOME-LEAK` (toplevel==HOME), `PUFFER-PARENT` (toplevel==SHELL), `UNOWNED-PATH` (cone outside toplevel; or keep-live toplevel but cone outside keep-live; or toplevel neither keep-live nor `/tmp` probe root), `SECRET-HIT` (cast `as Token` — NOT in the frozen 9-union, `SKILL.md` documents it; see §0.5) |
| `src/spawn-worker.ts` | Default dry plan `{dry:true, mutate:false, spawn:"wt switch -c -x omp <branch>"}`. Live only with `--branch <name> --live` from a product toplevel cwd (`cwd == toplevel`, valid branch name, never SHELL/HOME): runs `wt switch --format json --no-cd --no-hooks -c -x <ABS OMP_BIN> -- -p …` via `Bun.spawnSync`, 120s timeout, then prints `{branch, cwd, path, bind:"/move <new-path>", move, dry:false, mutate:true}`. `--product` required (`plutus\|gi\|graph-intelligence`). | `HOME-LEAK`, `PUFFER-PARENT` (SHELL toplevel for product, incl. belt-and-braces on live path) |
| `src/bind.ts` | Read-only: resolves `--dir` → toplevel + branch, prints `{action:"bind", dir, toplevel, branch, move:"/move <toplevel>"}`. NEVER invokes `/move`. | — (exit 1 on bad `--dir` / non-repo) |
| `src/preview.ts` + `src/plan-clean.ts` | `plan-clean`: ZERO mutations; reads health, proposes `relocate` (wrapper-hosted keep-live → `PLUTUS/agent/.worktrees/<branch>`) + `drop-wrapper` (leftover wrappers) ops, writes `~/.omp/git-manager/preview-<utc>.json` + best-effort `git_preview` row, prints `PlanCleanJson`. `preview execute --approved <id>`: unknown id / SHA drift / unreadable path → `STALE-PREVIEW` exit 2; valid id without `JGM_ALLOW_MUTATE=1` stays dry exit 0; armed mutate path is fail-closed code. Helpers `stripAction/flagValue/parseApproved/loadPreview/collectExpectedShas/measureHead/verifyShas` are importable (relocate/drop-wrapper reuse them). | `STALE-PREVIEW` |
| `src/relocate.ts` | MOVE of the nested keep-live worker (source `~/.omp/wt/plutus-main-66dfa4c/PLUTUS/agent` → `PLUTUS/agent/.worktrees/omp-worker-1`), default dry, armed only with `--approved <fresh-id>` + `JGM_ALLOW_MUTATE=1`. Refuses only if dest already holds keep-live data. | `LIVE-WORKER` (dest-side only), `STALE-PREVIEW` |
| `src/drop-wrapper.ts` | Drops the OUTER wrapper dir only, default dry, armed only with `--approved` + env. LIVE-WORKER refusals fire FIRST, before dry handling: `isKeepLive(abs)`, or target mentions `grok-prototype`, or mentions `Graph_Intelligence`. Armed path refuses on `index.lock`. | `LIVE-WORKER`, `STALE-PREVIEW`, `WORKTREE-BOUND` |
| `src/provision.ts` | Depth-1 only: `git init --bare <dir>/.git` + empty-tree `main` commit + `worktree add <dir>/main main`. Read-only pre-check `find <dir> -maxdepth 3 -name .git`. | `UNOWNED-PATH` (dotdir, reserved names docs/reports/etc, SHELL itself, existing `.git`), `HOME-LEAK` (HOME itself), `LIVE-WORKER` (keep-live target) |
| `src/ignore-shell.ts` | ALWAYS dry: diffs shell `.gitignore` vs `IGNORE_LINES` (`PLUTUS/ JARVIS/ Graph_Intelligence/ Dragon_Shell/ circuit/ GM_Cards/ Jarvis_Git_Manager/`), prints `{action:"ignore-shell", dry:true, wouldAppend, alreadyPresent, sha}`. Never writes even with `--approved`. | — |
| `src/wt.ts` | `wt` bridge: read-only `wt --version` / `wt list` probes + dry-by-default `switch-create` (mutates only with `--live`). Implements NO delete/remove/prune path by construction; delete verbs rejected before any spawn. NOTE (honest conflict): header comment records `cargo install worktrunk` failing (rustc 1.94 < required 1.97, `which wt` exit 1 at W2 time); later `MASTER_PROMPT_DAEMON.md` §0 and ST row 18 assert wt present/smoke-green 2026-09-15. Implementer MUST re-run `which wt && wt --version` before relying on live `wt`. | `LIVE-WORKER` (keep-live targets) |
| `src/test-known-bad.ts` + `src/st-jgm.ts` | Fixture runner (4 known-bad, exit-2+token asserts) + Mode-B harness (real imports, exit-captured spawns, single `await guarded()` entry). Current bar VERIFIED: 26/26 exit 0 (`reports/verify-daemon.json`). | asserts all of the above |

### §0.3 What `store.sqlite` tracks (VERIFIED: `src/schema.sql`, `src/health.ts:107-121`)

- Path: `~/.omp/git-manager/store.sqlite` (`STORE_DIR` in `health.ts` via `join(HOME,".omp/git-manager")`; `preview.ts` via `$HOME`). WAL + `busy_timeout=5000`. All writes best-effort (persist optional, classification never depends on it).
- `git_worktree(path PK, repo, branch, class, keep INTEGER, head)` — written by `health.ts ensureStore()` callers and by `daemon.ts` tick upserts (`keep` = `isKeepLive()` at tick time).
- `git_preview(id PK, json, status DEFAULT 'pending', created)` — written by `plan-clean.ts` (status `pending`).
- `git_op(preview_id, action, result, ts)` + index on `preview_id` — append-only ledger. VERIFIED writers: daemon adopt/mark-gone notes (`daemon-adopt/adopt-note`, `daemon-sweep/mark-gone`), commit-cone sha rows (`commit-cone/commit-cone`), relocate/drop-wrapper dry+armed rows. No other table exists. There is NO gate table, NO agent-scope table, NO branch-policy table today (all PROPOSED in §1–§3).

### §0.4 What the skill exposes (VERIFIED: `SKILL.md` + `PATHS.md`)

- Skill `jarvis-git-manager` + command `/git-manager`: documents the CLI surface above (status/health/plan-clean/spawn-worker/bind/provision/ignore-shell/relocate/drop-wrapper/commit-cone/daemon tick), the JSON/exit/token contract, the keep table, the never-shell-worktree laws, and the `plan-clean → --approved <id> → JGM_ALLOW_MUTATE=1` mutate gate.
- Skill is documentation + retargeted paths (`Jarvis_Git_Manager/src`), not an enforcement point itself — agents can ignore prose. Hard gates MUST live in code/hook exit codes, never in the skill text alone.

### §0.5 What the systemd units do (VERIFIED: 4 unit files)

- `jgm-daemon@.service`: `Type=oneshot`, `WorkingDirectory=…/Jarvis_Git_Manager`, `ExecStart=bun …/src/daemon.ts`. One tick per start. Comments restate observe-only.
- `jgm-daemon@.path`: template watch on `…/Jarvis_Git_Manager/.git/refs/heads` (`PathModified`), triggers the service. Header warns path units MUST be concrete per product (template `%i` form is service-only).
- `jgm-daemon-Jarvis_Git_Manager.path`: the concrete per-product instance (same `PathModified` + `Unit=jgm-daemon@Jarvis_Git_Manager.service`).
- `jgm-daemon@.timer`: fallback `OnBootSec=30s`, `OnUnitActiveSec=60s`. Kill path: `systemctl --user disable --now "jgm-daemon@<root>"`.
- No unit performs git writes, merges, commits, or agent gating today.

### §0.6 Explicitly NOT present (anti-fabrication list, VERIFIED by grep)

- No `jc/*` branch logic, no `experimental/*` logic, no agent→branch mapping, no per-agent write scopes anywhere in `src/` (grep `experimental|branch-scope|jc/` hits only bible prose + one `wt.ts` comment about `-x omp`; zero gate code).
- No `pre-commit` / `pre-merge` / `update` git hooks in the tree (grep `hook` hits only `wt.ts --no-hooks` spawn flag + DPL1 §5 line about `wt.toml` templates, which are wt-side and uninstalled here).
- No CAO `allowedTools` wiring in JGM (CAO profiles live outside this tree; `STAIRSTEPPER §10` lists senior/junior profiles as Small/PROPOSED).
- No OMP TTSR rules in this tree (TTSR machinery is OMP-runtime-side; `Orca_Corp_Git_Phalanx_ShowMe_v1.md:200` already adjudicated the enforcement-point choice toward jgm-daemon, CAO advisory only).
- Tokens `ADD-A-FORBIDDEN`, `AMEND-FORBIDDEN`, `FORCE-MAIN` are DECLARED in `types.ts:10-12` but EMITTED nowhere in `src/` (grep: zero call sites). `SECRET-HIT` is EMITTED (`commit-cone.ts:250`) but NOT in the frozen union (cast `as Token`). Any spec text claiming these three refuse paths work today is fabrication — §5 proposes wiring them.

---

## §1 — GATE-1: branch-scope enforcement (PROPOSED)

**Statement.** An agent may create commits (and worktree-level mutations) only on its own assigned `jc/<…>` branch subtree. Any commit/merge attempt from a HEAD outside the agent's assigned prefix refuses before staging.

**Example.** Agent `junior-lq3` assigned `jc/math-kernels/liquidity/kernel-lq-3` may commit on exactly that branch, or — under `subtree:true` — on descendants `jc/math-kernels/liquidity/kernel-lq-3/*` (micro-fix branches it created via `wt switch -c`). It may NOT commit on `jc/math-kernels/liquidity` (category), `jc/math-kernels` (domain), `main`, a sibling micro, or any `experimental/*` branch.

### §1.1 Enforcement point (PROPOSED, with rationale)

- **PRIMARY (hard gate): `commit-cone.ts` + new `src/gate-scope.ts`.** Every agent commit already must flow through `commit-cone` (cone-only staging + secret scan). Add a scope check as the FIRST gate in `run()`, before the secret scan: resolve HEAD branch → compare against the agent's assigned prefix → refuse on mismatch. Exit-2 refusal means nothing is staged, nothing is committed — identical strength to today's `UNOWNED-PATH` gate. This is also the natural home because `commit-cone` already resolves toplevel/keep/probe and already refuses `PUFFER-PARENT/HOME-LEAK`.
- **SECONDARY (defense in depth, advisory only):**
  - CAO profile `allowedTools`: juniors keep code-write tools but lose direct `git`/`exec` merge tools; seniors keep review tools, lose commit tools (mirrors `STAIRSTEPPER §6` table + `§10` "senior/junior profile pair"). CAO restrictions are ADVISORY on the omp provider (`CAO_MEMORY_AGENTS_WORKFLOWS_BIBLE.md:131-136`) — never the sole gate.
  - OMP TTSR stream rule matching `^commit-cone.*branch-scope.*DENY` output → inject reminder. Detector only (mid-token abort+inject+retry has false-positive retry cost per `OMP_ARCHITECTURE_BIBLE.md` FM-TTSR-1); never load-bearing.
  - Optional git `pre-commit` hook (thin client, §1.5) for agents that bypass the CLI and type raw `git commit`. The hook shells out to the same `gate-scope` check binary so there is exactly one decision implementation.
- **Explicitly NOT the enforcement point:** `jgm-daemon`. The daemon stays observe-only per its lock (`SCOPE-jgm-daemon.md:5`). It may REPORT scope violations it observes (new read-only `scope-violation` note rows, §1.4) but MUST NOT block, kill, or revert anything.

### §1.2 Config format (PROPOSED: `~/.omp/git-manager/gate-rules.json`)

Single file, versioned, read by `gate-scope.ts` on every check (no caching across processes; file read is cheap next to two `git` spawns). Missing file = fail-closed (deny with `GATE-CONFIG-MISSING` — new token, §1.3).

```jsonc
{
  "version": 1,
  // Repo roots this gate governs. Cwd toplevels outside these roots are not
  // scope-checked (existing HOME-LEAK / PUFFER-PARENT / UNOWNED-PATH gates
  // still apply). Keep this list to product repos + /tmp probe roots.
  "governedRoots": [
    "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/PLUTUS/agent",
    "/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/Graph_Intelligence"
  ],
  // One entry per live agent seat. `agent` is the seat name the orchestrator
  // passes as --as <seat> (falls back to $JGM_SEAT, then deny).
  "scopes": [
    {
      "agent": "junior-lq3",
      "allowBranches": ["jc/math-kernels/liquidity/kernel-lq-3"],
      "subtree": true,          // allow descendants of each allowBranch
      "allowPaths": ["."],      // relative to repo toplevel; "." = whole tree
      "role": "junior"          // junior | senior | copilot | worker (advisory label)
    },
    {
      "agent": "copilot-liquidity",
      "allowBranches": ["jc/math-kernels/liquidity"],
      "subtree": false,         // copilot merges onto the category branch only
      "allowPaths": ["."],
      "role": "copilot"
    }
  ],
  // Branches no agent entry may ever write (checked before scopes).
  "denyBranches": ["main", "master"],
  "denyPrefixes": ["experimental/"]
}
```

Matching semantics (exact, implementable): normalize HEAD by stripping a leading `refs/heads/`. `allow` iff (a) HEAD not in `denyBranches` and under no `denyPrefixes` (unless the agent's own allowBranch is itself under a deny prefix — only legal for the experimental role, see §2), and (b) some scope entry with `entry.agent == asSeat` satisfies `HEAD == allowBranch || (subtree && HEAD startsWith allowBranch + "/")`, and (c) every `--paths` cone entry is under `toplevel/allowPaths` (reuse `underLive()` from `commit-cone.ts`). Detached HEAD = deny. Unknown `--as` seat = deny.

### §1.3 Block/allow verdict format (PROPOSED, follows the CLI contract)

New module `src/gate-scope.ts` exports `checkScope({cwd, conePaths, asSeat})` → `{ok:true, branch}` or throws `RefuseError`. New token (PROPOSED — requires adding to the `Token` union in `types.ts`, W1-owned file, needs /goal approval):

- `BRANCH-SCOPE` — HEAD outside the seat's assigned prefix (or unknown seat, detached HEAD, deny-branch hit).

Stdout is one JSON object; stderr is human; exit `0` allow / `2` deny / `1` usage-or-git-failure:

```jsonc
// ALLOW (exit 0) — printed by commit-cone before proceeding to secret scan
{"action":"gate-check","rule":"branch-scope","verdict":"allow","agent":"junior-lq3","branch":"jc/math-kernels/liquidity/kernel-lq-3","toplevel":"/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/PLUTUS/agent"}
// DENY (exit 2, stderr: "BRANCH-SCOPE: seat junior-lq3 on branch main may only write jc/math-kernels/liquidity/kernel-lq-3/*; refusing commit\n")
{"action":"gate-check","rule":"branch-scope","verdict":"deny","token":"BRANCH-SCOPE","agent":"junior-lq3","branch":"main","allowed":["jc/math-kernels/liquidity/kernel-lq-3/*"]}
```

`commit-cone` surfaces the same denial inline (no new CLI verb needed for the hot path): `commit-cone --cwd … --paths … --message … --as junior-lq3` either commits (scope+secret gates passed) or exits 2 with `BRANCH-SCOPE` before staging. A standalone probe `bun src/gate-scope.ts --cwd <repo> --as <seat>` (exit 0/2, same JSON) exists for hooks and tests.

### §1.4 Log format (PROPOSED, reuses `git_op`)

Every check appends one best-effort row (same pattern as commit-cone's sha row — store failure never fails the gate):

```sql
INSERT INTO git_op(preview_id, action, result, ts)
VALUES ('gate-branch-scope', 'gate-check:branch-scope',
        '{"verdict":"deny","token":"BRANCH-SCOPE","agent":"junior-lq3","branch":"main"}',
        '2026-09-16T12:00:00.000Z');
```

`preview_id` is the literal rule id (`gate-branch-scope`), NOT a preview UUID — it partitions the ledger by rule (`idx_git_op_preview` already indexes this). `result` is the verdict JSON (fingerprints only, never diffs or secrets). Daemon (read-only reporting): when a tick observes a HEAD whose branch has no covering scope entry, it may append `('daemon-sweep','scope-violation-note',<path>,<now>)` — a NOTE, never a block.

### §1.5 Implementation notes — what exists vs what is new

- EXTEND `src/commit-cone.ts` `run()`: insert scope gate between toplevel resolution (`tl`, today line ~124) and the secret scan (~line 150). New flag `--as <seat>` (fallback `$JGM_SEAT`); plumbing only, decision lives in the new module. Cone-path containment (`underLive`, keep/probe checks) already implements half of clause (c) — keep it, add the `allowPaths` intersection.
- NEW `src/gate-scope.ts` (~120 lines): config load + `resolveHeadBranch()` (`git rev-parse --abbrev-ref HEAD` via the existing `git()` helper shape) + prefix matcher + `checkScope()`. Pure decision function, importable by commit-cone, hooks, and ST.
- EXTEND `src/types.ts` `Token` union: add `BRANCH-SCOPE`, `EXPERIMENTAL-BREACH` (§2), `OFF-BRANCH`, `DIRTY-TREE` (§3), `GATE-CONFIG-MISSING`. W1-owned file — needs orchestrator approval per `SCOPE-jgm-fix.md`.
- NEW git hook (thin client, ~20 lines sh): `<repo>/.git/hooks/pre-commit` → `bun <JGM>/src/gate-scope.ts --cwd $toplevel --as $JGM_SEAT` (non-zero exit blocks the raw-`git` bypass path). Installed by hand per product repo, never by the daemon.
- EXTEND `src/st-jgm.ts`: new rows `SCOPE-ALLOW` (throwaway repo, branch under prefix, exit 0), `SCOPE-DENY` (main/sibling branch, exit 2 + `BRANCH-SCOPE`), `SCOPE-UNKNOWN-SEAT` (exit 2), `SCOPE-DETACHED` (exit 2). Follow the existing throwaway-`mkdtemp` + `git init` pattern (no product trees).

---

## §2 — GATE-2: experimental sandbox (PROPOSED)

**Statement** (verbatim law: `STAIRSTEPPER §7.2` rules 4/6/7, §10 laws 3–5). Experimental branches MUST be prefixed `experimental/`; MUST fork from a reviewed main-work commit; max 2 per task lifecycle; are NEVER merged to main/category/domain by an agent — only the orchestrator (JC/JO) judges merge-or-discard. They cannot affect the main work's branch, the category branch, or the domain branch.

### §2.1 Enforcement point (PROPOSED, with rationale)

- **PRIMARY (hard gate): new `src/gate-merge.ts`, called from every merge path.** JGM has NO merge gate today (VERIFIED §0.6 — `wt.ts` delegates to `wt merge`, JGM watches). The gate must therefore be new code guarding two call sites: (a) a `git-manager.ts merge` action (new router entry, dry-by-default like relocate/drop-wrapper, armed only with `--approved <preview-id>` + `JGM_ALLOW_MUTATE=1`), and (b) a git `pre-merge-commit` / server-side `update` hook thin client for the raw-`git` bypass path. Decision rule: if source branch is under `experimental/` and target is `main|master`, `jc/*` non-experimental, or any keep-live product branch — deny unless `--approved` carries an orchestrator-issued experimental-merge preview id AND env `JGM_EXPERIMENTAL_MERGE=1` (two-key arming, mirroring the existing `--approved` + `JGM_ALLOW_MUTATE=1` pattern).
- **SECONDARY:** CAO `allowedTools` (juniors/seniors lose merge tools entirely; only copilot profiles may even print a merge plan — advisory), TTSR detector on `EXPERIMENTAL-BREACH` output, daemon read-only `experimental-note` rows when a tick observes an `experimental/*` HEAD (report, never block).

### §2.2 Config format (PROPOSED — same file, new stanza)

```jsonc
{
  "version": 1,
  "experimental": {
    "prefix": "experimental/",
    "maxPerLifecycle": 2,
    // Targets an experimental source may NEVER merge into without
    // orchestrator arming (exact names + prefixes).
    "protectedTargets": ["main", "master"],
    "protectedPrefixes": ["jc/"],
    // Branches whose merge INTO experimental/* is allowed (fork-from-reviewed
    // rule: experimental work forks from a reviewed commit, §7.2 rule 3).
    "allowedForkFrom": ["jc/", "main"],
    "armingEnv": "JGM_EXPERIMENTAL_MERGE"
  },
  "lifecycles": [
    // Written by the orchestrator at dispatch time; gate enforces the cap.
    {"lifecycle": "task-2026-09-16-lq", "branches": ["experimental/idea-a"]}
  ]
}
```

Decision semantics: `deny` iff `source startsWith experimental.prefix` AND (`target in protectedTargets` OR `target under protectedPrefixes`) AND NOT (`--approved` id loads via existing `loadPreview()` AND `verifyShas().ok` AND `JGM_EXPERIMENTAL_MERGE=1`). Separately, creating a 3rd `experimental/*` branch under one `lifecycle` denies with the same token (cap rule). Fork-from rule is a warn-note (recorded, not blocking — review provenance is not machine-checkable from branch names alone).

### §2.3 Block/allow verdict format (PROPOSED)

New token `EXPERIMENTAL-BREACH` (add to `Token` union):

```jsonc
// ALLOW — orchestrator-armed merge of judged-useful experimental work (exit 0, then wt merge runs)
{"action":"gate-check","rule":"experimental-sandbox","verdict":"allow","source":"experimental/idea-a","target":"jc/math-kernels/liquidity","approved":"preview-20260916T130000","armed":true}
// DENY (exit 2, stderr: "EXPERIMENTAL-BREACH: experimental/idea-a may not merge into jc/math-kernels/liquidity without orchestrator approval (JGM_EXPERIMENTAL_MERGE=1 + --approved <id>)\n")
{"action":"gate-check","rule":"experimental-sandbox","verdict":"deny","token":"EXPERIMENTAL-BREACH","source":"experimental/idea-a","target":"jc/math-kernels/liquidity"}
```

Merge-path CLI shape (PROPOSED, mirrors relocate/drop-wrapper): `git-manager.ts merge --source <branch> --target <branch> [--approved <id>]` → dry plan JSON by default (`{dry:true, mutate:false}`), armed merge only with both keys. Raw-`git` bypass hook: `pre-merge-commit`/`update` → `bun src/gate-merge.ts --source … --target …` (non-zero blocks).

### §2.4 Log format (PROPOSED, reuses `git_op`)

```sql
INSERT INTO git_op(preview_id, action, result, ts)
VALUES ('gate-experimental', 'gate-check:experimental-sandbox',
        '{"verdict":"deny","token":"EXPERIMENTAL-BREACH","source":"experimental/idea-a","target":"jc/math-kernels/liquidity"}',
        '2026-09-16T12:00:00.000Z');
```

Cap denials log `{"verdict":"deny","reason":"lifecycle-cap","lifecycle":"…","count":2}` under the same `preview_id`. Daemon experimental sightings log `('daemon-sweep','experimental-note',<path:branch>,<now>)`.

### §2.5 Implementation notes — what exists vs what is new

- REUSE `src/preview.ts` wholesale: `loadPreview/collectExpectedShas/verifyShas/parseApproved` already implement preview-load + SHA-drift (`STALE-PREVIEW`) semantics — the experimental arming rides the identical `plan-clean → approved → re-measure → execute` shape, with the second env key as the only delta.
- REUSE `src/drop-wrapper.ts`/`relocate.ts` dry-by-default + two-key arming skeleton for the new `merge` action.
- NEW `src/gate-merge.ts` (~150 lines): source/target branch resolution (`git rev-parse --abbrev-ref HEAD` + `git merge-base --is-ancestor` read-only checks for fork provenance notes), protected-target matcher, lifecycle-cap counter (reads `gate-rules.json` lifecycles + live `git branch --list 'experimental/*'`), verdict printer.
- NEW router entry in `src/git-manager.ts` `MODULES` (`"merge": "./merge.ts"` thin wrapper delegating to `gate-merge.ts` armed path). Router needs no other edits (dynamic import).
- EXTEND `src/st-jgm.ts`: `EXP-DENY-JC` (experimental→jc/… exit 2), `EXP-DENY-MAIN` (experimental→main exit 2), `EXP-CAP` (3rd branch exit 2), `EXP-ARMED` (both keys + fresh preview → exit 0 dry/arm plan on throwaway only).
- Non-goal (matches DPL1 §18): no GitHub PR automation; the JC/JO judgment step stays human/operator-side, the gate only enforces that it happened (approval id + env).

---

## §3 — GATE-3: pre-commit gate (PROPOSED)

**Statement.** Before any commit executes: (a) the agent is on its assigned branch (HEAD == expected, no detached HEAD, no wrong-branch commit); (b) the tree state permits the commit (no `index.lock` → `WORKTREE-BOUND`; push-gates may additionally require clean `git status --porcelain` outside the cone); (c) every staged path is in scope (cone containment, today's `UNOWNED-PATH` rule, plus the §1 seat scopes). Three sub-checks, one verdict, evaluated in order a→b→c so the stderr token names the FIRST failure.

### §3.1 Enforcement point (PROPOSED, with rationale)

- **PRIMARY (hard gate): `commit-cone.ts` pre-stage sequence.** The tool-execute-before-hook lives INSIDE `commit-cone` `run()`: after toplevel resolution, before secret scan: `branchCheck()` → `treeCheck()` → `scopeCheck()` → secret scan → `git add --` → `git commit`. A single binary means CLI users, hook callers, and CAO tool-call wrappers all hit the same three checks; there is no second implementation to drift. New flags: `--as <seat>` (required when governed root; §1.2 fallback chain), `--expect-branch <name>` (optional override the orchestrator passes when the seat legitimately works a descendant micro-branch; must still satisfy §1 matching), `--require-clean` (opt-in strict mode for category/domain merges: any `git status --porcelain` entry outside the cone denies).
- **SECONDARY:** git `pre-commit` hook thin client (same binary, blocks raw-`git` bypass); CAO launch wrapper that exports `JGM_SEAT` + `--expect-branch` per seat (advisory convenience, not enforcement); TTSR detector on the new tokens.
- **NOT a new daemon duty:** daemon may log `dirty-note`/`off-branch-note` rows on observation; it never blocks commits (cannot — it runs on a 60s tick, not in the commit path).

### §3.2 Config format (PROPOSED — same file, new stanza)

```jsonc
{
  "version": 1,
  "preCommit": {
    // Sub-check (b): lock file relative to $GIT_DIR that always denies.
    "boundLock": ".git/index.lock",
    // Sub-check (b) strict mode: when true for a branch prefix, commits
    // require ZERO porcelain entries outside the cone (--require-clean
    // overrides per-invocation; config sets the default per prefix).
    "requireCleanPrefixes": ["jc/math-kernels", "jc/math-kernels/liquidity"],
    // Sub-check (a): exact-match seats (copilot merge branches) vs subtree
    // seats. Reuses §1 scopes — no second seat table. This stanza only adds
    // tree-state policy, never identity policy.
    "allowDetached": false
  }
}
```

Check algorithms (exact):
- (a) `HEAD = git rev-parse --abbrev-ref HEAD` (strip `refs/heads/`); deny `OFF-BRANCH` when `HEAD == "HEAD"` (detached), when `HEAD != expectBranch` (if `--expect-branch` given), else fall through to §1 `checkScope()` (deny `BRANCH-SCOPE` on mismatch).
- (b) `stat $GIT_DIR/index.lock` exists → deny `WORKTREE-BOUND` (reuse today's token + message shape from `drop-wrapper.ts:126-127`). When strict (`--require-clean` or HEAD under `requireCleanPrefixes`): `git status --porcelain -- <toplevel>` entries outside the cone rels → deny `DIRTY-TREE` listing the first 5 paths (fingerprints = paths only).
- (c) §1 clause (c) + today's keep/probe containment (existing `UNOWNED-PATH` refuses unchanged).

### §3.3 Block/allow verdict format (PROPOSED)

Two new tokens (`OFF-BRANCH`, `DIRTY-TREE`; `WORKTREE-BOUND` and `UNOWNED-PATH`/`BRANCH-SCOPE` reused):

```jsonc
// ALLOW (exit 0, commit proceeds)
{"action":"gate-check","rule":"pre-commit","verdict":"allow","agent":"junior-lq3","branch":"jc/math-kernels/liquidity/kernel-lq-3","clean":true,"cone":["kernels/lq3.ts"]}
// DENY examples (exit 2; stderr names the first failed sub-check)
{"action":"gate-check","rule":"pre-commit","verdict":"deny","token":"OFF-BRANCH","agent":"junior-lq3","branch":"jc/math-kernels/liquidity","expected":"jc/math-kernels/liquidity/kernel-lq-3"}
{"action":"gate-check","rule":"pre-commit","verdict":"deny","token":"DIRTY-TREE","branch":"jc/math-kernels","outsideCone":["notes/scratch.md","+2 more"]}
{"action":"gate-check","rule":"pre-commit","verdict":"deny","token":"WORKTREE-BOUND","detail":"index.lock present; worktree busy"}
```

Ordering guarantee: exactly one token per denial, first failure wins (a→b→c), so callers can switch on `token` without parsing message text.

### §3.4 Log format (PROPOSED, reuses `git_op`)

```sql
INSERT INTO git_op(preview_id, action, result, ts)
VALUES ('gate-pre-commit', 'gate-check:pre-commit',
        '{"verdict":"deny","token":"OFF-BRANCH","agent":"junior-lq3","branch":"jc/math-kernels/liquidity"}',
        '2026-09-16T12:00:00.000Z');
```

Allow-rows log `{"verdict":"allow",…}` too (audit trail of who committed where — cheap, one row per commit, same cost class as today's commit-cone sha row). Secret-scan hits keep today's `SECRET-HIT` shape (file names only, never values).

### §3.5 Implementation notes — what exists vs what is new

- EXTEND `src/commit-cone.ts`: the three checks slot into the existing pre-stage block (toplevel refuses → NEW a/b/c → EXISTING secret scan → `add --` → `commit`). `index.lock` probe already exists in `drop-wrapper.ts:126` — factor a shared `isWorktreeBound(abs)` into the new module rather than copying.
- NEW `src/gate-precommit.ts` (~100 lines): `checkBranch/checkTree/checkCone` pure functions + `run()` CLI (`--cwd/--as/--expect-branch/--require-clean`, exit 0/2/1, same JSON). `commit-cone.ts` imports the three functions; the hook CLI calls `run()`. One implementation, two entry points.
- EXTEND `src/types.ts` union (same approval as §1.5) + `SKILL.md` gate table (docs-only, non-blocking).
- EXTEND `src/st-jgm.ts`: `PRE-ALLOW` (on-branch + clean cone, exit 0), `PRE-OFF-BRANCH` (wrong branch, `OFF-BRANCH`), `PRE-DETACHED` (`OFF-BRANCH`), `PRE-DIRTY` (strict + outside-cone edit, `DIRTY-TREE`), `PRE-BOUND` (lock present, `WORKTREE-BOUND`), `PRE-OUTSIDE-CONE` (`UNOWNED-PATH`, already covered by `COMMIT-CONE-OUTSIDE` — keep both, they pin different layers).
- Performance note: the gate adds 2–4 `git` spawns (`rev-parse`, `status --porcelain`, existing `diff` set) per commit — negligible against commit cost; config file read is uncached by design (operator edits take effect on the next commit, no daemon restart).

---

## §4 — Stairstepper integration (how each rule maps to the 3-layer pyramid)

Pyramid reference (`STAIRSTEPPER §3`): L1 MICRO kernel (`jc/<domain>/<category>/<micro>`, review qwen-code-audit, authority builder→copilot) → PR → L2 CATEGORY (`jc/<domain>/<category>`, review `/review-pr` 6-agent, authority copilot) → PR → L3 DOMAIN (`jc/<domain>`, review `/code-review` 5-agent Sonnet, authority supervisor/JO) → PR → `main` (orchestrator JC). Rejections flow DOWN to the lowest owning level, never sideways (§3.2).

| Gate | L1 micro | L2 category | L3 domain → main | Experimental (§7) |
|---|---|---|---|---|
| GATE-1 branch-scope | PRIMARY home. Junior seats hold `allowBranches=[…/<micro>]` (+ optional subtree). A junior committing on the category branch is the exact failure this gate kills (prevents skipping GATE-1 review). | Copilot seats hold `allowBranches=[…/<category>]` (`subtree:false`). Only copilot identities can land the accepted-micro→category merge commit. | Supervisor/worker seats hold `allowBranches=[…/<domain>]`; `main` is in `denyBranches` for every agent seat — no agent commits to `main` ever. | `denyPrefixes=["experimental/"]` applies to all non-experimental seats; experimental seats are separate scoped entries (§2). |
| GATE-2 experimental sandbox | Experimental micros fork FROM a reviewed L1 commit (§7.2 rule 3) but merge to NOTHING without arming — the gate encodes "rejected work flows back down" by forcing experimental output through worker→JC judgment instead of the L1→L2 ladder. | Category/prod branches are `protectedPrefixes` targets: an experimental→category merge is `EXPERIMENTAL-BREACH` without orchestrator arming. | Domain + `main` are protected targets. The L3 `/code-review` gate and this merge gate are ANDed: both must pass. | The full §7 law lives here: `experimental/` prefix (§7.2.4), fork-from-reviewed (allowedForkFrom + provenance note), max-2 cap (§7.2.1 / §10.5), never-touch-main/category/domain (§10.3), agent-never-merges (§7.2.6, two-key arming). |
| GATE-3 pre-commit | (a) pins the builder to its micro branch (kills wrong-branch commits that would smuggle unreviewed code up the ladder); (b) strict-clean is OFF at L1 by default (micros are work-in-progress); (c) cone scope = the kernel's file set. | (b) `requireCleanPrefixes` defaults ON for category branches (a category merge commit must contain exactly the accepted micros, no scratch files); (a) only copilot seats satisfy the branch check here. | (b) strict ON for domain branches; (a) only supervisor seats; the `main` PR is assembled by the orchestrator, never by an agent commit. | Pre-commit applies unchanged on `experimental/*` (an experimental commit still needs on-branch + in-scope + secret-clean) — sandboxing restricts WHERE experimental code can GO (§2), never the hygiene of writing it. |

Copilot authority mapping (`STAIRSTEPPER §4.3.2/§6`): the copilot is the L1→L2 gate authority backed by qwen-code-audit. In JGM terms: copilot seats are the only identities whose §1 scope covers category branches AND whose §2 arming requests the orchestrator honors for experimental judgment. The gate does not implement review tools (qwen/`/review-pr`/`/code-review` stay where they are); it implements the BRANCH DISCIPLINE those reviews assume — unreviewed code cannot change branches except through the gated merge path.

---

## §5 — Build plan: extend vs new (no fabricated base)

### §5.1 File-by-file work list

| # | File | VERIFIED base | Change | Size |
|---|---|---|---|---|
| 1 | `src/types.ts` | 9-token union, frozen W1 | ADD `BRANCH-SCOPE EXPERIMENTAL-BREACH OFF-BRANCH DIRTY-TREE GATE-CONFIG-MISSING` | +1 line |
| 2 | `src/gate-scope.ts` | — (NEW) | Config load, HEAD resolve, prefix matcher, `checkScope()`, `run()` probe CLI | ~120 lines |
| 3 | `src/gate-merge.ts` | — (NEW) | Source/target matcher, protected-target check, lifecycle cap, `loadPreview/verifyShas` arming, `run()` | ~150 lines |
| 4 | `src/gate-precommit.ts` | — (NEW) | `checkBranch/checkTree/checkCone` + `isWorktreeBound()` factored here, `run()` CLI | ~100 lines |
| 5 | `src/commit-cone.ts` | Cone + secret gates | Insert a→b→c pre-stage sequence; add `--as/--expect-branch/--require-clean` flags; import the three check fns | +~40 lines |
| 6 | `src/merge.ts` | — (NEW, thin) | Dry-by-default merge action delegating to `gate-merge.ts` armed path (relocate/drop-wrapper skeleton copy) | ~80 lines |
| 7 | `src/git-manager.ts` | Dynamic router | Add `"merge"`, `"gate-scope"`, `"gate-merge"`, `"gate-precommit"` entries to `MODULES` (probe verbs; hot path stays inside commit-cone) | +4 lines |
| 8 | `~/.omp/git-manager/gate-rules.json` | — (NEW, runtime data not repo) | Initial scopes for live seats + experimental stanza + preCommit stanza (operator-authored) | ~60 lines |
| 9 | `<repo>/.git/hooks/pre-commit`, `pre-merge-commit`/`update` | — (NEW, per product repo) | Thin clients shelling to `gate-precommit.ts` / `gate-merge.ts` (same decision code, bypass coverage) | ~20 lines sh each |
| 10 | `src/st-jgm.ts` | 26/26 harness | +13 rows (§1.5: 4, §2.5: 4, §3.5: 5+1 shared) | +~150 lines |
| 11 | `SKILL.md` + `SCOPE-*` | Skill + locks | Docs-only: gate table, new tokens, `--as`/`$JGM_SEAT` convention, scope-file ownership (new lock `god-loop-jgm-gates` or extend actions-scope — orchestrator decides) | docs |
| 12 | Store migration | 3 tables | NO schema change required: all gate rows fit `git_op`. OPTIONAL later: `CREATE INDEX idx_git_op_action ON git_op(action)` when gate rows outnumber cleanup rows. `gate-rules.json` lifecycles are file state, not sqlite. | 0–1 lines SQL |

### §5.2 Token ledger (honest)

- REUSED unchanged: `HOME-LEAK, PUFFER-PARENT, LIVE-WORKER, STALE-PREVIEW, WORKTREE-BOUND, UNOWNED-PATH, SECRET-HIT`.
- NEW (all PROPOSED, all require the §5.1 row-1 union edit): `BRANCH-SCOPE` (§1), `EXPERIMENTAL-BREACH` (§2), `OFF-BRANCH` + `DIRTY-TREE` (§3), `GATE-CONFIG-MISSING` (missing/unparseable `gate-rules.json` → fail-closed deny on every governed-root commit).
- STILL DECLARED-BUT-UNWIRED after this spec (out of scope, listed so nobody claims them): `ADD-A-FORBIDDEN` (no `git add -A` tripwire exists — cone-only staging makes it unreachable via CLI but raw-`git` `add -A` is unwatched), `AMEND-FORBIDDEN`, `FORCE-MAIN` (no amend/force-push interceptors; a future `gate-merge.ts` extension or `pre-push` hook would own them).

### §5.3 Test + rollout order (mirrors the daemon W1→W4 shape)

1. W1: rows 1–4 (scope lib + commit-cone wiring + probe verbs), ST scope rows green on throwaways, zero product mutations.
2. W2: rows 5–6 + hooks on ONE product repo (GI first — smaller keep surface), ST merge rows green, bypass probes (`git commit` direct on wrong branch → hook blocks).
3. W3: row 8 live scopes for current seats, daemon read-only note rows, `test-known-bad` extended with the 3 new deny fixtures, full ST green same run + `mimo sha equal` + thread append (standard ship bar).
4. Non-goals: GitHub PR automation, `wt` kernel changes, HOME rewrite, force-main, relocating live desks without `approved <id>` (all inherit DPL1 §18).

---

## §6 — Open decisions

- O1. Seat identity source: `--as` flag vs `$JGM_SEAT` env vs CAO seat injection. Default in this spec: flag > env > deny. Needs operator ruling before W1.
- O2. `subtree:true` default for juniors: allows self-created micro-fix branches without re-scoping, but widens the blast radius to unreviewed branch creation. Alternative: `subtree:false` + orchestrator-issued scope updates per new branch. Default in this spec: `true` (creation is cheap, MERGE is gated — defense in depth holds at §2).
- O3. `wt` presence conflict (§0.2 `wt.ts` note): re-verify `which wt && wt --version` at build start; if absent, live-spawn/merge smoke stays on throwaways and the merge gate ships dry-gate-only.
- O4. `SECRET-HIT` union membership: either add it to `types.ts` properly (recommended, one line) or keep the cast with a comment. Same edit window as row 1.
