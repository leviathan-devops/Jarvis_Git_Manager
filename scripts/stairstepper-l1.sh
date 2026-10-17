#!/usr/bin/env bash
# Stairstepper L1: local commit hygiene for one rev plus the worktree.
# Exit 0 when every L1 rule passes. Exit 1 when any rule fails.
# L1-SECRET reports file:commit:L1-SECRET and nothing else about the match.
set -euo pipefail

repo="."
rev="HEAD"

usage() {
  echo "usage: stairstepper-l1.sh [--repo DIR] [--rev REV]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ $# -ge 2 ]] || usage
      repo="$2"
      shift 2
      ;;
    --rev)
      [[ $# -ge 2 ]] || usage
      rev="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage
      ;;
  esac
done

cd "$repo"

fail=0

porcelain=$(git status --porcelain=v1)
if [[ -n "$porcelain" ]]; then
  echo "FAIL L1-CLEAN"
  printf '%s\n' "$porcelain"
  fail=1
else
  echo "PASS L1-CLEAN"
fi

subject=$(git log -1 --format=%s "$rev")
if [[ "$subject" =~ ^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?:[[:space:]][^[:space:]].*$ ]]; then
  echo "PASS L1-MESSAGE"
else
  echo "FAIL L1-MESSAGE"
  fail=1
fi

body=$(git log -1 --format=%B "$rev")
has_signed_off=0
has_agent=0
signed_off_re='^[Ss]igned-off-by: .+ <[^[:space:]@]+@[^[:space:]>]+>$'
agent_re='^[Aa]gent: [^[:space:]].*$'
while IFS= read -r line; do
  if [[ "$line" =~ $signed_off_re ]]; then
    has_signed_off=1
  fi
  if [[ "$line" =~ $agent_re ]]; then
    has_agent=1
  fi
done <<<"$body"

if [[ "$has_signed_off" -eq 1 || "$has_agent" -eq 1 ]]; then
  echo "PASS L1-TRAILER"
else
  echo "FAIL L1-TRAILER"
  fail=1
fi

sha=$(git rev-parse "$rev")
secret_hit=0
path=""
# Credential assignment, AWS access-key id shape, or PEM private-key banner.
# Patterns stay as regex text so this file's own lines do not satisfy them.
secret_assign='(^|[^A-Za-z0-9_])(api[_-]?key|aws[_-]?secret|secret[_-]?key|private[_-]?key|password|auth[_-]?token)[[:space:]]*[:=][[:space:]]*[^[:space:]]{8,}'
secret_aws='AKIA[0-9A-Z]{16}'
secret_pem='-----BEGIN [A-Z ]*PRIVATE KEY-----'

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == "+++ b/"* ]]; then
    path="${line#+++ b/}"
    continue
  fi
  if [[ "$line" != "+"* || "$line" == "+++"* ]]; then
    continue
  fi
  added="${line:1}"
  if printf '%s\n' "$added" | grep -E -i -q -e "$secret_assign" \
    || printf '%s\n' "$added" | grep -E -q -e "$secret_aws" \
    || printf '%s\n' "$added" | grep -E -q -e "$secret_pem"; then
    echo "${path:-unknown}:${sha}:L1-SECRET"
    secret_hit=1
  fi
done < <(git show --format= --unified=0 "$rev")

if [[ "$secret_hit" -eq 1 ]]; then
  echo "FAIL L1-SECRET"
  fail=1
else
  echo "PASS L1-SECRET"
fi

if [[ "$fail" -eq 0 ]]; then
  echo "L1 PASS"
  exit 0
fi
echo "L1 FAIL"
exit 1
