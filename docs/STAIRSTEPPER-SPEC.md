# Stairstepper L1–L3

Campaign GK-3 / GK-5, wave W6. This document defines three checkable levels. L1 runs locally. L2 is the W6 ruleset files under `rulesets/`. L3 is a pure predicate over a pull-request snapshot. Nothing in this change calls the GitHub ruleset API or edits org or repository settings.

Base used for this work: GitHub `main` at `b08f8b310bbc710ea0134ca48db165faedbbbef5`. No Stairstepper checker existed on that tree.

## L1 — local commit hygiene

Command: `bash scripts/stairstepper-l1.sh [--repo DIR] [--rev REV]`

`REV` defaults to `HEAD`. The command checks that one commit plus the worktree. It does not walk ancestor commits. Exit 0 prints `L1 PASS`. Exit 1 prints `L1 FAIL` after every failed rule.

| Rule | Pass | Fail |
|---|---|---|
| `L1-CLEAN` | `git status --porcelain=v1` is empty | Any porcelain line. The proof plants an untracked file named `DIRTY_MARKER`. |
| `L1-MESSAGE` | Subject matches `^(feat\|fix\|docs\|style\|refactor\|perf\|test\|build\|ci\|chore\|revert)(\([a-z0-9._/-]+\))?!?: ` and then a non-space subject | Any other subject, including `wip stuff` and the historical `jgm:` subjects on `main` |
| `L1-TRAILER` | Any line of the commit message is `Signed-off-by: Name <email>` or `Agent: <non-empty>` | Neither line is present |
| `L1-SECRET` | No added line in `git show --format= --unified=0 REV` matches a credential assignment, an AWS access-key-id shape, or a PEM private-key banner | Match. Output is only `file:commit:L1-SECRET` plus `FAIL L1-SECRET`. The matching line is not printed. |

`L1-TRAILER` reads the whole message. A trailer appended after a blank line does not hide an earlier `Signed-off-by` or `Agent` line.

`L1-SECRET` assignment keys are `api_key`, `aws_secret`, `secret_key`, `private_key`, `password`, and `auth_token`, with an optional hyphen or underscore and a value of at least 8 non-space characters. The AWS shape is `AKIA` plus 16 uppercase letters or digits. The PEM banner is a `BEGIN` line for a `PRIVATE KEY`.

The known-bad proof is `bash scripts/stairstepper-l1-proof.sh`. It rejects a commit that has a planted assignment, no trailer, a non-conventional subject, and a dirty `DIRTY_MARKER` file, and only then accepts a clean conventional commit. Later good commits show that an `Agent` trailer alone, and a `Signed-off-by` trailer alone, each satisfy `L1-TRAILER`. The proof also commits the checker sources and requires `L1-SECRET` to stay quiet. A separate red commit adds only a PEM private-key banner and must fail `L1-SECRET` while the other L1 rules pass.

## L2 — branch and pull-request rules

L2 is the ruleset body a human could later POST to `/repos/{owner}/{repo}/rulesets`. These files are not posted by CI.

Each factory file is named `rulesets/<repo>.json` and is produced by `python3 scripts/generate_rulesets.py`. `python3 scripts/validate_rulesets.py` checks two layers:

1. Schema shape in `rulesets/schema/repository-ruleset-create.schema.json`. This is the create-ruleset request body for the four rule types below. Required fields match the GitHub REST docs for "Create a repository ruleset" as read on 2026-10-17, including `conditions.ref_name.exclude` (the API rejects a missing `exclude`). It is a W6 profile, not a vendored copy of the full GitHub OpenAPI document.
2. W6 policy, which is stricter than the schema.

| Rule | Pass |
|---|---|
| `L2-DEFAULT-REF` | `conditions.ref_name.include` is the measured default branch for that repo, or `~DEFAULT_BRANCH` when the default branch could not be read. `exclude` is `[]`. |
| `L2-NO-DELETE` | Exactly one `deletion` rule. |
| `L2-NO-FORCE` | Exactly one `non_fast_forward` rule. Force-push to the targeted ref is denied. |
| `L2-PR` | Exactly one `pull_request` rule. `required_approving_review_count` is `0`: a pull request is required, and review count is not part of W6. The other required pull-request booleans are present and false. |
| `L2-REQUIRED-CHECKS` | Exactly one `required_status_checks` rule. Contexts are `CI / CI` and `CI / L1`, in that order. `strict_required_status_checks_policy` is true. `do_not_enforce_on_create` is false. |
| `L2-NAME` | `name` is `w6-default-branch`, `target` is `branch`, `enforcement` is `active`, `bypass_actors` is `[]`. |

`enforcement: active` is the intended value in the file. It does not activate anything until a person applies the file outside this change.

Check contexts come from direct jobs in `.github/workflows/ci.yml`, whose workflow name is `CI`:

- `CI / CI` runs the L1 proof, the L3 self-test, generator drift, and ruleset validation.
- `CI / L1` runs `scripts/stairstepper-l1.sh` on the pull-request head SHA (not the synthetic merge commit).

Other repositories call the reusable workflow:

```yaml
name: CI
on: [pull_request]
permissions:
  contents: read
jobs:
  L1:
    uses: leviathan-devops/Jarvis_Git_Manager/.github/workflows/stairstepper-l1.yml@<ref>
    with:
      rev: ${{ github.event.pull_request.head.sha }}
```

If the caller uses `workflow_call`, GitHub may prefix the called job name. The context string in that repository's ruleset has to be the name GitHub reports. This repository's required contexts stay `CI / CI` and `CI / L1` because those jobs run the steps directly.

### Default-branch names

Read on 2026-10-17 with `gh api repos/leviathan-devops/<repo> --jq .default_branch`. Search listings agreed for the readable repos. No ruleset was created or updated.

| Repository | Default branch | Ruleset include | Result |
|---|---|---|---|
| `jarvis-upper` | `main` | `refs/heads/main` | measured |
| `Jarvis_Git_Manager` | `main` | `refs/heads/main` | measured |
| `jev-manager-tool` | `feat/jev-fact-kernel` | `refs/heads/feat/jev-fact-kernel` | measured |
| `omp-code-intel` | `master` | `refs/heads/master` | measured. This repo has no `main`. |
| `JARVIS` | not readable | `~DEFAULT_BRANCH` | BLOCKED. HTTP 404 |
| `Jev_Gates` | not readable | `~DEFAULT_BRANCH` | BLOCKED. HTTP 404 |
| `thanatos-engine` | not readable | `~DEFAULT_BRANCH` | BLOCKED. HTTP 404 |

Case variants of the three blocked names (`jarvis`, `Jarvis`, `jev-gates`, `Jev-Gates`, `jev_gates`, `thanatos`, `Thanatos-Engine`, `thanatos_engine`) also returned HTTP 404. `~DEFAULT_BRANCH` is the ruleset include token GitHub documents for "the repository's default branch". It does not assert that the branch is named `main`.

`jev-manager-tool` is a second inconsistency: its default branch is a feature ref, not `main` or `master`.

The validator's watched-red cases reject a missing `exclude`, an unknown rule type, an `omp-code-intel` file pointed at `refs/heads/main`, and a file with no `non_fast_forward` rule. Those rejections are required before the seven factory files can pass.

## L3 — merge gate

L3 allows a merge only when CI is green and Thanatos has approved. The predicate is `python3 scripts/stairstepper_l3_eval.py`. It reads a JSON snapshot. It does not talk to GitHub.

```json
{
  "checks": {"CI / CI": "success", "CI / L1": "success"},
  "labels": ["Thanatos APPROVE"]
}
```

| Rule | Pass |
|---|---|
| `L3-CI` | `checks["CI / CI"]` and `checks["CI / L1"]` are both `success` |
| `L3-THANATOS` | `labels` contains `Thanatos APPROVE`, or `checks["Thanatos APPROVE"]` is `success` |

Either the label or the status satisfies `L3-THANATOS`. Both CI checks are still required. `--self-test` denies a snapshot that is CI-green with no Thanatos verdict, then denies a snapshot that has the label while `CI / CI` is `failure`, and only then allows a label pass and a status pass.

L3 is not a ruleset rule. GitHub rulesets in this wave require the CI contexts. The Thanatos verdict stays this predicate until a later change maps it to a check context that is actually reported.

## What this change does not do

- It does not POST rulesets, open settings, or change branch protection.
- It does not merge, force-push, or push the default branch.
- It does not scan ancestor history, and it does not retitle existing `jgm:` commits.
- It does not connect to Leviathan or bind a local service.
