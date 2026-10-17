#!/usr/bin/env python3
"""Write W6 repository ruleset JSON. Does not call the GitHub API."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "rulesets"

# Measured 2026-10-17 with `gh api repos/leviathan-devops/<repo> --jq .default_branch`.
# BLOCKED repos returned HTTP 404 for the listed name and the case variants tried.
# Their include uses ~DEFAULT_BRANCH so the file does not invent refs/heads/main.
MEASURED = {
    "jarvis-upper": "refs/heads/main",
    "Jarvis_Git_Manager": "refs/heads/main",
    "jev-manager-tool": "refs/heads/feat/jev-fact-kernel",
    "omp-code-intel": "refs/heads/master",
}
BLOCKED = {
    "JARVIS": "~DEFAULT_BRANCH",
    "Jev_Gates": "~DEFAULT_BRANCH",
    "thanatos-engine": "~DEFAULT_BRANCH",
}

RULESET_NAME = "w6-default-branch"
CHECK_CONTEXTS = ("CI / CI", "CI / L1")


def build_ruleset(include: str) -> dict:
    return {
        "name": RULESET_NAME,
        "target": "branch",
        "enforcement": "active",
        "bypass_actors": [],
        "conditions": {
            "ref_name": {
                "include": [include],
                "exclude": [],
            }
        },
        "rules": [
            {"type": "deletion"},
            {"type": "non_fast_forward"},
            {
                "type": "pull_request",
                "parameters": {
                    "dismiss_stale_reviews_on_push": False,
                    "require_code_owner_review": False,
                    "require_last_push_approval": False,
                    "required_approving_review_count": 0,
                    "required_review_thread_resolution": False,
                },
            },
            {
                "type": "required_status_checks",
                "parameters": {
                    "do_not_enforce_on_create": False,
                    "strict_required_status_checks_policy": True,
                    "required_status_checks": [
                        {"context": context} for context in CHECK_CONTEXTS
                    ],
                },
            },
        ],
    }


def render(doc: dict) -> str:
    return json.dumps(doc, indent=2) + "\n"


def expected_files() -> dict[str, str]:
    files: dict[str, str] = {}
    for repo, include in {**MEASURED, **BLOCKED}.items():
        files[f"{repo}.json"] = render(build_ruleset(include))
    return files


def main(argv: list[str]) -> int:
    check = "--check" in argv
    files = expected_files()
    if check:
        drifted = []
        for name, text in sorted(files.items()):
            path = OUT_DIR / name
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                drifted.append(name)
        extras = sorted(
            p.name
            for p in OUT_DIR.glob("*.json")
            if p.name not in files
        )
        if drifted or extras:
            for name in drifted:
                print(f"DRIFT {name}")
            for name in extras:
                print(f"EXTRA {name}")
            return 1
        print("RULESET GENERATOR OK")
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, text in sorted(files.items()):
        (OUT_DIR / name).write_text(text, encoding="utf-8")
        print(f"WROTE {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
