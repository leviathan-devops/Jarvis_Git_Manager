#!/usr/bin/env python3
"""Pure L3 merge-gate predicate. No network and no GitHub writes."""

from __future__ import annotations

import json
import sys
from pathlib import Path

CI_CHECKS = ("CI / CI", "CI / L1")
THANATOS = "Thanatos APPROVE"


def evaluate(doc: dict) -> list[str]:
    checks = doc.get("checks")
    labels = doc.get("labels")
    if not isinstance(checks, dict) or not isinstance(labels, list):
        return ["L3-INPUT"]
    failures: list[str] = []
    for name in CI_CHECKS:
        if checks.get(name) != "success":
            failures.append(f"L3-CI {name}")
    label_ok = THANATOS in labels
    status_ok = checks.get(THANATOS) == "success"
    if not (label_ok or status_ok):
        failures.append("L3-THANATOS")
    return failures


def _deny(label: str, doc: dict, needle: str) -> None:
    failures = evaluate(doc)
    if not any(needle in item for item in failures):
        raise SystemExit(f"WATCHED-RED FAILED: {label} was allowed ({failures})")
    print(f"WATCHED-RED {label} denied")
    for item in failures:
        print(f"FAIL {item}")


def self_test() -> int:
    _deny(
        "L3 missing Thanatos APPROVE",
        {
            "checks": {"CI / CI": "success", "CI / L1": "success"},
            "labels": [],
        },
        "L3-THANATOS",
    )
    _deny(
        "L3 red CI with Thanatos APPROVE label",
        {
            "checks": {"CI / CI": "failure", "CI / L1": "success"},
            "labels": [THANATOS],
        },
        "L3-CI",
    )

    good_label = {
        "checks": {"CI / CI": "success", "CI / L1": "success"},
        "labels": [THANATOS],
    }
    good_status = {
        "checks": {
            "CI / CI": "success",
            "CI / L1": "success",
            THANATOS: "success",
        },
        "labels": [],
    }
    for label, doc in (("label", good_label), ("status", good_status)):
        failures = evaluate(doc)
        if failures:
            print(f"GOOD {label} rejected: {failures}")
            return 1
        print(f"PASS L3 {label}")
    print("L3 SELF-TEST PASS")
    return 0


def main(argv: list[str]) -> int:
    if argv == ["--self-test"]:
        return self_test()
    if len(argv) == 2 and argv[0] == "--fixture":
        doc = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        failures = evaluate(doc)
        if failures:
            for item in failures:
                print(f"FAIL {item}")
            return 1
        print("PASS L3")
        return 0
    print("usage: stairstepper_l3_eval.py --self-test | --fixture FILE", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
