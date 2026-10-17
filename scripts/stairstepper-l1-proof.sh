#!/usr/bin/env bash
# Watched-red-first proof for Stairstepper L1.
# The known-bad commit is rejected before any good commit is accepted.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
L1="$ROOT/scripts/stairstepper-l1.sh"
tmps=()

cleanup() {
  local dir
  for dir in "${tmps[@]}"; do
    rm -rf "$dir"
  done
}
trap cleanup EXIT

init_repo() {
  local dir
  dir=$(mktemp -d)
  tmps+=("$dir")
  git -C "$dir" init -b main >/dev/null
  git -C "$dir" config user.name "Stairstepper Fixture"
  git -C "$dir" config user.email "fixture@example.com"
  printf '%s\n' "$dir"
}

run_l1() {
  local dir=$1
  set +e
  l1_output=$(bash "$L1" --repo "$dir" --rev HEAD 2>&1)
  l1_code=$?
  set -e
}

assert_absent() {
  local needle=$1
  local label=$2
  if [[ "$l1_output" == *"$needle"* ]]; then
    echo "LEAK $label" >&2
    exit 1
  fi
}

echo "WATCHED-RED begin bad fixture"
bad=$(init_repo)
printf 'notes\n' >"$bad/README.txt"
plant_key='api_key'
plant_val='plantedfixturevalue'
printf '%s=%s\n' "$plant_key" "$plant_val" >"$bad/planted.env"
git -C "$bad" add README.txt planted.env
git -C "$bad" commit -q -m "wip stuff"
printf 'dirty\n' >"$bad/DIRTY_MARKER"
run_l1 "$bad"
assert_absent "$plant_val" "L1-SECRET"
assert_absent "${plant_key}=" "L1-SECRET"
printf '%s\n' "$l1_output"
if [[ "$l1_code" -eq 0 ]]; then
  echo "WATCHED-RED FAILED: bad fixture was accepted" >&2
  exit 1
fi
for rule in "FAIL L1-CLEAN" "FAIL L1-MESSAGE" "FAIL L1-TRAILER" "FAIL L1-SECRET" "DIRTY_MARKER" ":L1-SECRET"; do
  if [[ "$l1_output" != *"$rule"* ]]; then
    echo "WATCHED-RED FAILED: bad fixture missing $rule" >&2
    exit 1
  fi
done
echo "WATCHED-RED bad fixture rejected"
if [[ "$l1_output" == *"unrecognized option"* ]]; then
  echo "WATCHED-RED FAILED: secret scan printed a grep error" >&2
  exit 1
fi

echo "WATCHED-RED begin private-key banner fixture"
banner=$(init_repo)
banner_begin='-----BEGIN'
banner_kind='PRIVATE KEY'
printf '%s %s-----\n' "$banner_begin" "$banner_kind" >"$banner/key.txt"
printf 'notes\n' >"$banner/README.txt"
cat >"$banner/COMMIT_MSG" <<'EOF'
test: planted private-key banner

Signed-off-by: Stairstepper Fixture <fixture@example.com>
Agent: stairstepper-proof
EOF
git -C "$banner" add key.txt README.txt
git -C "$banner" commit -q -F "$banner/COMMIT_MSG"
rm -f "$banner/COMMIT_MSG"
run_l1 "$banner"
assert_absent "PRIVATE KEY" "L1-SECRET"
assert_absent "unrecognized option" "L1-SECRET"
printf '%s\n' "$l1_output"
if [[ "$l1_code" -eq 0 || "$l1_output" != *"FAIL L1-SECRET"* || "$l1_output" != *":L1-SECRET"* ]]; then
  echo "WATCHED-RED FAILED: private-key banner was not rejected" >&2
  exit 1
fi
if [[ "$l1_output" != *"PASS L1-CLEAN"* || "$l1_output" != *"PASS L1-MESSAGE"* || "$l1_output" != *"PASS L1-TRAILER"* ]]; then
  echo "WATCHED-RED FAILED: private-key banner failed a rule other than L1-SECRET" >&2
  exit 1
fi
echo "WATCHED-RED private-key banner rejected"

echo "GOOD begin clean fixture"
good=$(init_repo)
printf 'stairstepper l1 good fixture\n' >"$good/README.txt"
cat >"$good/COMMIT_MSG" <<'EOF'
test: stairstepper l1 good fixture

Signed-off-by: Stairstepper Fixture <fixture@example.com>
Agent: stairstepper-proof
EOF
git -C "$good" add README.txt
git -C "$good" commit -q -F "$good/COMMIT_MSG"
rm -f "$good/COMMIT_MSG"
run_l1 "$good"
printf '%s\n' "$l1_output"
if [[ "$l1_code" -ne 0 ]]; then
  echo "GOOD fixture was rejected" >&2
  exit 1
fi
for rule in "PASS L1-CLEAN" "PASS L1-MESSAGE" "PASS L1-TRAILER" "PASS L1-SECRET" "L1 PASS"; do
  if [[ "$l1_output" != *"$rule"* ]]; then
    echo "GOOD fixture missing $rule" >&2
    exit 1
  fi
done
echo "GOOD fixture accepted"

echo "GOOD begin agent-trailer-only fixture"
agent_only=$(init_repo)
printf 'agent trailer only\n' >"$agent_only/README.txt"
cat >"$agent_only/COMMIT_MSG" <<'EOF'
test: agent trailer satisfies L1-TRAILER

Agent: stairstepper-proof
EOF
git -C "$agent_only" add README.txt
git -C "$agent_only" commit -q -F "$agent_only/COMMIT_MSG"
rm -f "$agent_only/COMMIT_MSG"
run_l1 "$agent_only"
printf '%s\n' "$l1_output"
if [[ "$l1_code" -ne 0 || "$l1_output" != *"PASS L1-TRAILER"* ]]; then
  echo "agent-trailer-only fixture was rejected" >&2
  exit 1
fi
echo "GOOD agent-trailer-only fixture accepted"

echo "GOOD begin signed-off-only fixture"
signed_only=$(init_repo)
printf 'signed-off trailer only\n' >"$signed_only/README.txt"
cat >"$signed_only/COMMIT_MSG" <<'EOF'
test: signed-off trailer satisfies L1-TRAILER

Signed-off-by: Stairstepper Fixture <fixture@example.com>
EOF
git -C "$signed_only" add README.txt
git -C "$signed_only" commit -q -F "$signed_only/COMMIT_MSG"
rm -f "$signed_only/COMMIT_MSG"
run_l1 "$signed_only"
printf '%s\n' "$l1_output"
if [[ "$l1_code" -ne 0 || "$l1_output" != *"PASS L1-TRAILER"* ]]; then
  echo "signed-off-only fixture was rejected" >&2
  exit 1
fi
echo "GOOD signed-off-only fixture accepted"

echo "SOURCE begin false-positive guard"
guard=$(init_repo)
mkdir -p "$guard/scripts" "$guard/docs" "$guard/.github/workflows" "$guard/rulesets/schema"
cp "$ROOT/scripts/"*.sh "$ROOT/scripts/"*.py "$guard/scripts/"
cp "$ROOT/docs/STAIRSTEPPER-SPEC.md" "$guard/docs/"
cp "$ROOT/.github/workflows/"*.yml "$guard/.github/workflows/"
cp "$ROOT/rulesets/"*.json "$guard/rulesets/"
cp "$ROOT/rulesets/schema/"*.json "$guard/rulesets/schema/"
cat >"$guard/COMMIT_MSG" <<'EOF'
test: stairstepper source does not trip L1

Signed-off-by: Stairstepper Fixture <fixture@example.com>
Agent: stairstepper-proof
EOF
git -C "$guard" add scripts docs .github rulesets
git -C "$guard" commit -q -F "$guard/COMMIT_MSG"
rm -f "$guard/COMMIT_MSG"
run_l1 "$guard"
assert_absent "$plant_val" "source-guard"
printf '%s\n' "$l1_output"
if [[ "$l1_code" -ne 0 ]]; then
  echo "SOURCE guard rejected checker sources" >&2
  exit 1
fi
echo "SOURCE guard accepted"
echo "L1 PROOF PASS"
