#!/usr/bin/env python3
"""Validate ruleset JSON against the create-ruleset schema and W6 policy.

The schema file is the shape this checker enforces. Watched-red cases run
before the factory files are accepted.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_rulesets import BLOCKED, CHECK_CONTEXTS, MEASURED, RULESET_NAME, build_ruleset

SCHEMA_PATH = ROOT / "rulesets" / "schema" / "repository-ruleset-create.schema.json"
OUT_DIR = ROOT / "rulesets"

SCHEMA_KEYWORDS = {
    "$comment",
    "$defs",
    "$id",
    "$ref",
    "$schema",
    "additionalProperties",
    "const",
    "description",
    "enum",
    "items",
    "minItems",
    "minLength",
    "minimum",
    "oneOf",
    "properties",
    "required",
    "title",
    "type",
}


def _type_ok(instance: object, expected: str) -> bool:
    if expected == "object":
        return isinstance(instance, dict)
    if expected == "array":
        return isinstance(instance, list)
    if expected == "string":
        return isinstance(instance, str)
    if expected == "boolean":
        return isinstance(instance, bool)
    if expected == "integer":
        return isinstance(instance, int) and not isinstance(instance, bool)
    if expected == "null":
        return instance is None
    return False


def _walk_schema(schema: object, path: str) -> None:
    if not isinstance(schema, dict):
        return
    unknown = sorted(set(schema) - SCHEMA_KEYWORDS)
    if unknown:
        raise SystemExit(f"schema {path} uses unsupported keywords: {unknown}")
    if "$ref" in schema:
        return
    for index, sub in enumerate(schema.get("oneOf", [])):
        _walk_schema(sub, f"{path}/oneOf/{index}")
    for key, sub in schema.get("properties", {}).items():
        _walk_schema(sub, f"{path}/properties/{key}")
    if "items" in schema:
        _walk_schema(schema["items"], f"{path}/items")
    for key, sub in schema.get("$defs", {}).items():
        _walk_schema(sub, f"{path}/$defs/{key}")


def _resolve_ref(root: dict, ref: str) -> dict:
    if not ref.startswith("#/"):
        raise SystemExit(f"unsupported schema ref {ref}")
    target: object = root
    for part in ref[2:].split("/"):
        if not isinstance(target, dict) or part not in target:
            raise SystemExit(f"schema ref not found: {ref}")
        target = target[part]
    if not isinstance(target, dict):
        raise SystemExit(f"schema ref is not an object: {ref}")
    return target


def schema_errors(instance: object, schema: dict, root: dict, path: str = "$") -> list[str]:
    if "$ref" in schema:
        return schema_errors(instance, _resolve_ref(root, schema["$ref"]), root, path)

    if "oneOf" in schema:
        matches = 0
        for sub in schema["oneOf"]:
            if not schema_errors(instance, sub, root, path):
                matches += 1
        if matches != 1:
            return [f"{path}: oneOf matched {matches} schemas"]
        return []

    errors: list[str] = []
    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: const {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: not in enum")

    expected = schema.get("type")
    if expected is not None:
        types = expected if isinstance(expected, list) else [expected]
        if not any(_type_ok(instance, item) for item in types):
            errors.append(f"{path}: type {expected}")
            return errors

    if isinstance(instance, str) and "minLength" in schema and len(instance) < schema["minLength"]:
        errors.append(f"{path}: minLength")
    if isinstance(instance, int) and not isinstance(instance, bool) and "minimum" in schema:
        if instance < schema["minimum"]:
            errors.append(f"{path}: minimum")

    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errors.append(f"{path}: minItems")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(instance):
                errors.extend(schema_errors(item, item_schema, root, f"{path}[{index}]"))

    if isinstance(instance, dict) and (
        schema.get("type") == "object" or "properties" in schema or "required" in schema
    ):
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in instance:
                if key not in props:
                    errors.append(f"{path}: additional property {key}")
        for key in schema.get("required", []):
            if key not in instance:
                errors.append(f"{path}: missing {key}")
        for key, sub in props.items():
            if key in instance:
                errors.extend(schema_errors(instance[key], sub, root, f"{path}.{key}"))
    return errors


def policy_errors(filename: str, doc: dict) -> list[str]:
    errors: list[str] = []
    repo = filename[: -len(".json")] if filename.endswith(".json") else filename
    if doc.get("name") != RULESET_NAME:
        errors.append("L2-NAME")
    if doc.get("target") != "branch":
        errors.append("L2-TARGET")
    if doc.get("enforcement") != "active":
        errors.append("L2-ENFORCEMENT")
    if doc.get("bypass_actors") != []:
        errors.append("L2-BYPASS")

    include = doc.get("conditions", {}).get("ref_name", {}).get("include")
    if repo in MEASURED and include != [MEASURED[repo]]:
        errors.append(f"L2-DEFAULT-REF expected {MEASURED[repo]}")
    elif repo in BLOCKED and include != [BLOCKED[repo]]:
        errors.append("L2-DEFAULT-REF expected ~DEFAULT_BRANCH")
    elif repo not in MEASURED and repo not in BLOCKED:
        errors.append("L2-DEFAULT-REF unknown repo")
    if repo == "omp-code-intel" and include == ["refs/heads/main"]:
        errors.append("L2-DEFAULT-REF omp-code-intel has no main")

    rules = doc.get("rules")
    if not isinstance(rules, list):
        return errors + ["L2-RULES"]
    types = [rule.get("type") for rule in rules if isinstance(rule, dict)]
    for required in ("deletion", "non_fast_forward", "pull_request", "required_status_checks"):
        if types.count(required) != 1:
            label = {
                "deletion": "L2-NO-DELETE",
                "non_fast_forward": "L2-NO-FORCE",
                "pull_request": "L2-PR",
                "required_status_checks": "L2-REQUIRED-CHECKS",
            }[required]
            errors.append(label)

    pull = next((rule for rule in rules if isinstance(rule, dict) and rule.get("type") == "pull_request"), None)
    if isinstance(pull, dict):
        params = pull.get("parameters", {})
        if params.get("required_approving_review_count") != 0:
            errors.append("L2-PR-COUNT")

    checks = next(
        (rule for rule in rules if isinstance(rule, dict) and rule.get("type") == "required_status_checks"),
        None,
    )
    if isinstance(checks, dict):
        params = checks.get("parameters", {})
        if params.get("strict_required_status_checks_policy") is not True:
            errors.append("L2-STRICT")
        if params.get("do_not_enforce_on_create") is not False:
            errors.append("L2-CREATE")
        contexts = [
            item.get("context")
            for item in params.get("required_status_checks", [])
            if isinstance(item, dict)
        ]
        if contexts != list(CHECK_CONTEXTS):
            errors.append("L2-REQUIRED-CHECKS")
    return errors


def _expect_errors(label: str, errors: list[str], needle: str) -> None:
    if not any(needle in item for item in errors):
        raise SystemExit(f"WATCHED-RED FAILED: {label} was not rejected ({errors})")
    print(f"WATCHED-RED {label} rejected")


def watched_red(root_schema: dict) -> None:
    golden = build_ruleset(MEASURED["omp-code-intel"])
    golden_errors = schema_errors(golden, root_schema, root_schema)
    if golden_errors:
        raise SystemExit(f"golden schema failed: {golden_errors}")
    if policy_errors("omp-code-intel.json", golden):
        raise SystemExit(f"golden policy failed: {policy_errors('omp-code-intel.json', golden)}")

    missing_exclude = copy.deepcopy(golden)
    del missing_exclude["conditions"]["ref_name"]["exclude"]
    _expect_errors(
        "schema missing ref_name.exclude",
        schema_errors(missing_exclude, root_schema, root_schema),
        "missing exclude",
    )

    unknown_rule = copy.deepcopy(golden)
    unknown_rule["rules"].append({"type": "made_up"})
    _expect_errors(
        "schema unknown rule type",
        schema_errors(unknown_rule, root_schema, root_schema),
        "oneOf",
    )

    invented_main = copy.deepcopy(golden)
    invented_main["conditions"]["ref_name"]["include"] = ["refs/heads/main"]
    _expect_errors(
        "policy omp-code-intel refs/heads/main",
        policy_errors("omp-code-intel.json", invented_main),
        "omp-code-intel has no main",
    )

    no_force = copy.deepcopy(golden)
    no_force["rules"] = [rule for rule in no_force["rules"] if rule["type"] != "non_fast_forward"]
    _expect_errors(
        "policy missing non_fast_forward",
        policy_errors("omp-code-intel.json", no_force),
        "L2-NO-FORCE",
    )


def main() -> int:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    _walk_schema(schema, "#")
    watched_red(schema)

    expected = {f"{name}.json" for name in (*MEASURED, *BLOCKED)}
    found = {path.name for path in OUT_DIR.glob("*.json")}
    if found != expected:
        missing = sorted(expected - found)
        extra = sorted(found - expected)
        print(f"FILE SET missing={missing} extra={extra}")
        return 1

    failed = False
    for name in sorted(expected):
        doc = json.loads((OUT_DIR / name).read_text(encoding="utf-8"))
        errors = schema_errors(doc, schema, schema)
        errors.extend(policy_errors(name, doc))
        if errors:
            failed = True
            print(f"FAIL {name}")
            for error in errors:
                print(f"  {error}")
        else:
            print(f"PASS {name}")
    if failed:
        return 1
    print("RULESET VALIDATE PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
