# DEBUG_LOG — W4 verify (2026-09-15, ST run bracket)

## Host-live proof: mimo MEMORY-journal* sha256 before AND after the ST run

Final bracketed run: `bun src/st-jgm.ts` exit 0, 19/19 PASS, preview `preview-20260915T162936`.
Gate re-runs (acceptance): exit 0, 19/19 PASS each; final `preview-20260915T163203` (reports/verify-run.json copy); mimo global re-diffed EQUAL every run, combined `689043e4...` unchanged; product SHAs unchanged.

BEFORE (global, 17 files, sorted):
```
0a797c3cf1d6d5fd87113162f1d3690c410db5027a42945752b1ccf0f7e347b2  .../global/MEMORY-journal-thread-system-changelog.md
284c9629896d819d3ea4c8d14fdaf5e0416ffbb3f5cced6bcd94d14649d95ca4  .../global/MEMORY-journal.md
2ca4f7ea0b8cf2a3cc37a3445e427329ba862189321638878a9c38f03bf5abcd  .../global/MEMORY-journal-thread-goalmode-cards.md
367baf6128bbc38747529c712fa3897d457f49dd372ffd13edff8cfe19a9387c  .../global/MEMORY-journal-thread-super-omp-serena.md
3f91041fbe337c752a9bf41a0e7544ef7af5558df672be5d7295c824cca6eec4  .../global/MEMORY-journal-thread-omni-vision.md
445adc8d8fe04699d06d112c08dc9f8b905c20b66e43f368e0f55c08e7afdc2c  .../global/MEMORY-journal-thread-code-review.md
57f6d5dfbd394b10040d8ce2f1ec5581d373250d571f75fc9b870862907d94f4  .../global/MEMORY-journal-thread-skill-library.md
6419ca8e54fe67a6337aa3c7682650aff14e57b82b36efeca038028e3652810d  .../global/MEMORY-journal-thread-superpowers.md
6ab381137db5db89de40b1850918b572d2217fb715a6c66d39de62c6c64e3b13  .../global/MEMORY-journal-thread-super-goal-engine.md
89afe2112291cf6b2f37109e5781ad59ce3d2493b49a6aab1655178a5db82f94  .../global/MEMORY-journal-thread-super-omp-context7.md
8a9566ebab2c9188ed75cd73c28c397f8507ca2b459d2fba08093eae85ae701f  .../global/MEMORY-journal-threads.md
9fab167608769d5a52afb4e712710b4926761f2408ff8e7be38ea926e98bedcf  .../global/MEMORY-journal-thread-super-omp-skill-packs.md
c3639151650220a758fa667dc564d04c6d061f86567be1f636eff66e364f0d31  .../global/MEMORY-journal-thread-container-testing.md
d0ddf3fc2c02ffa38cdb8a3f24b48cbc223ab1dea69e83cae4dc688af993655a  .../global/MEMORY-journal-thread-super-omp-pr-review-toolkit.md
d1862913ea409220995a037c060d2e4d0c2d45e86866d3cbfd72ca6422f5775c  .../global/MEMORY-journal-thread-super-omp.md
e1a83bf9d488cec4c8997169050bb1a3383185d9d78c8cc6a7b9353fc913114c  .../global/MEMORY-journal-thread-super-omp-security-guidance.md
ed20a4f0a6f55cf802fd55bed7501acee6ee514622eba36b89dc1ae93e2cb732  .../global/MEMORY-journal-thread-super-omp-frontend-design.md
combined: 689043e425dd1438476b96a41271ef06028b008911808694f0d3e85d886a4628
```
BEFORE (project c507206c, 5 files):
```
057dcff8d844f5ce43ec0980fc9a8c7e1f6a4051af107b44c403d1f52f7b36bc  .../MEMORY-journal-thread-architecture-set.md
34f919a45ec8fc5fb829086b5fa0e5d1418f97c5d5bc18fec193a01c10c6d0c3  .../MEMORY-journal-thread-architecture.md
7384df24f32053d3a2106f8187a84d99937852e4c6a11042388674ee0f32e157  .../MEMORY-journal-arc-and-tooling-laws.md
caf9170dc9661269e1969d3a59bdfd49dc92d3b99c34f81f400a50520dce1402  .../MEMORY-journal-rename-arc.md
ed19f194b5c96f2462a22c89d5e4ea73298ba042deefb0b2f334e31053b0293d  .../MEMORY-journal-thread-laws.md
```

AFTER (same commands re-run post-ST):
- global: identical 17 lines, `diff before.list after.list` → `MIMO-GLOBAL-EQUAL`, combined `689043e4...` unchanged.
- project: `diff proj-before.list proj-after.list` → `MIMO-PROJ-EQUAL`.

VERDICT: mimo sha EQUAL across the ST run — zero mimo mutations.

## Health JSON (this run, full)

```json
{"worktrees":[
{"path":"/home/leviathan/.omp/wt/graph-intelligence-66dfa4c","repo":"SHELL","branch":"graph-intelligence","head":"7f04470","class":"leftover"},
{"path":"/home/leviathan/.omp/wt/plutus-main-66dfa4c","repo":"SHELL","branch":"omp-worker-1","head":"7f04470","class":"wrapper"},
{"path":"/home/leviathan/.omp/wt/plutus-main-66dfa4c/PLUTUS/agent","repo":"PLUTUS/agent","branch":"omp-worker-1","head":"ed4533da168162bf13123fa9111c177337067048","class":"keep-live"},
{"path":"/home/leviathan/.omp/wt/wt-20260915-131039-66dfa4c","repo":"SHELL","branch":"wt/20260915-131039","head":"7f04470","class":"leftover"},
{"path":"/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace","repo":"SHELL","branch":"docs/code-review-tools","head":"e0226afd1c1970b03ad86281c523cb1ba0bbc441","class":"product"},
{"path":"/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/Graph_Intelligence","repo":"GI","branch":"jarvis/gi-main","head":"2fd14e8befe6f1899044951040a9f00d05803b0e","class":"keep-live"},
{"path":"/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/Graph_Intelligence-wt-gi-ship","repo":"GI","branch":"detached","head":"c3db9659ccd757cf7338478ed66edbb97d334b7c","class":"keep-live"},
{"path":"/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/PLUTUS/agent","repo":"PLUTUS/agent","branch":"plutus/main","head":"e99377f155c357f87c33082ce4efff6a37d5371a","class":"keep-live"},
{"path":"/home/leviathan/JARVIS_WORKSPACE/Shared_Workspace/PLUTUS/agent/.worktrees/grok-prototype","repo":"PLUTUS/agent","branch":"plutus/grok-prototype","head":"61f9ee323b625ef556ef68c9b1646279b910851d","class":"keep-live"},
{"path":"/home/leviathan/JARVIS_WORKSPACE/worktrees/shared-default","repo":"?","branch":"jarvis/default","head":"d8aaa7d","class":"leftover"}]}
```
Classes: keep-live=5 wrapper=1 leftover=3 product=1 (total 10). Live SHAs: worker ed4533d, grok 61f9ee3.

## Known-bad JSON (this run)

```json
{"results":[{"name":"home-leak","status":"pass"},{"name":"puffer-parent","status":"pass"},{"name":"live-worker","status":"pass"},{"name":"stale-preview","status":"pass"}]}
```
`test-known-bad` e=0, 4/4 pass.

## Preview (this run)

`preview-20260915T163203` (1230 bytes, final gate; reports/verify-run.json copy): 1× relocate (wrapper-hosted keep-live worker → PLUTUS/agent/.worktrees/omp-worker-1) + 2× drop-wrapper (leftover graph-intelligence-66dfa4c, wt-20260915-131039-66dfa4c); keep=5 paths. DRY ONLY (default dry, no JGM_ALLOW_MUTATE). NOTE: earlier ST invocations this session wrote `preview-20260915T162922`, `...162936`, `...163013`, `...163037`, `...163136` (all preview-<new>, no overwrite); ledger-honest, superseded by the gate preview.

## Zero git mutations on product trees (before == after)

- PLUTUS/agent e99377f155c357f87c33082ce4efff6a37d5371a == e99377f...
- grok-prototype 61f9ee323b625ef556ef68c9b1646279b910851d == 61f9ee3...
- nested worker ed4533da168162bf13123fa9111c177337067048 == ed4533d...
- SHELL e0226afd1c1970b03ad86281c523cb1ba0bbc441 == e0226af...
- GI 2fd14e8befe6f1899044951040a9f00d05803b0e == 2fd14e8...
- PLUTUS `worktree list --porcelain`: 3 entries unchanged (plutus/main, omp-worker-1, plutus/grok-prototype).
- SHELL `.gitignore` sha `1db490d2...a3aff66a` unchanged; `ignore-shell` dry-only confirmed.
- `which wt` e=1 (absent, expected). `provision.ts` dotdir/docs refuses e=2, nothing created.
