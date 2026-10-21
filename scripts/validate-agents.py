#!/usr/bin/env python3
"""validate-agents.py — agent-definition validation for the fleet-owned agents.

Single owner of the agent-file rules that CI and pre-push both enforce:

  1. agents/sisyphus.md (the fleet-owned ultraworker, ported 2026-10-20 from
     the omo runtime agent) parses, carries the required frontmatter keys,
     pins the deliberate primary model, and keeps the conservative
     permission posture (edit/bash default ask; the sisyphus-gates plugin
     stays the real enforcement layer).
  2. opencode.json keeps default_agent = "sisyphus" so the default resolves
     to the file agent.
  3. Generated pipeline personas (scripts/generate-pipeline-personas.py,
     ship pipe-port-m1): the generator's drift gate (regenerated output must
     equal the committed files), the routing-token resolution gate (every
     category=/subagent_type=/load_skills=/**Category:** token in skills/
     resolves to a port-map stanza, a file agent, or a skill), and the DAG
     edge-vs-permission assertion (manifest §9 edges == task allows) all run
     here. Model pins are allowed ONLY on sisyphus.md and the generated set
     (the port moved routing ownership for the pipeline cast from the dormant
     omo.jsonc stanzas to these fleet-owned files); every other agents/*.md
     stays pin-free (the scoped Wave-2 rule).
  4. --roster (default): the pinned model id exists in the live roster at
     https://models.dev/api.json — the same catalog `opencode models` reads.
     Network failure FAILS (a check that checked nothing must not pass);
     pass --offline (or AGENTS_VALIDATE_OFFLINE=1) to skip the roster leg
     explicitly in airgapped or rollback situations. (Generated-persona pins
     are proven against the live `opencode models` roster by the generator's
     --check-pins leg instead — their providers are fleet-local aliases the
     public catalog does not know.)

Usage:  python3 scripts/validate-agents.py [--offline]
Exit:   0 = PASS, 1 = FAIL, 2 = environment error (e.g. PyYAML missing)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROSTER_URL = "https://models.dev/api.json"
EXPECTED_DEFAULT_AGENT = "sisyphus"
MODEL_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*/[A-Za-z0-9._-]+$")

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENT_FILE = REPO_ROOT / "agents" / "sisyphus.md"
AGENTS_DIR = REPO_ROOT / "agents"
OPENCODE_JSON = REPO_ROOT / "opencode.json"


def split_frontmatter(text: str) -> tuple[str, str]:
    """Return (frontmatter_text, body) for a --- delimited markdown file."""
    if not text.startswith("---"):
        raise ValueError("file does not start with a --- frontmatter delimiter")
    parts = text.split("\n---", 2)
    if len(parts) < 2:
        raise ValueError("frontmatter delimiter not closed")
    return parts[0][3:], text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--offline",
        action="store_true",
        default=os.environ.get("AGENTS_VALIDATE_OFFLINE", "") == "1",
        help="skip the live-roster leg (explicit opt-out)",
    )
    args = parser.parse_args()

    try:
        import yaml
    except ImportError:
        print("FAIL: PyYAML is required (pip install pyyaml)")
        return 2

    errors: list[str] = []
    passes: list[str] = []

    # --- 1. the fleet-owned agent file -----------------------------------
    if not AGENT_FILE.is_file():
        print(f"FAIL: {AGENT_FILE.relative_to(REPO_ROOT)} is missing")
        return 1
    raw = AGENT_FILE.read_text(encoding="utf-8")
    try:
        fm_text, _body = split_frontmatter(raw)
        fm = yaml.safe_load(fm_text)
    except Exception as exc:  # noqa: BLE001 — report, don't traceback
        print(f"FAIL: agents/sisyphus.md frontmatter does not parse: {exc}")
        return 1
    if not isinstance(fm, dict):
        print("FAIL: agents/sisyphus.md frontmatter is not a mapping")
        return 1

    description = fm.get("description")
    if not isinstance(description, str) or not description.strip():
        errors.append("sisyphus.md: description missing or empty")
    else:
        passes.append("sisyphus.md: description present")

    if fm.get("mode") != "primary":
        errors.append(f"sisyphus.md: mode must be 'primary', got {fm.get('mode')!r}")
    else:
        passes.append("sisyphus.md: mode is primary")

    model = fm.get("model")
    if not isinstance(model, str) or not MODEL_ID_RE.match(model):
        errors.append(
            f"sisyphus.md: model must be a provider-qualified id "
            f"(provider/model), got {model!r}"
        )
    else:
        passes.append(f"sisyphus.md: model pinned as {model}")

    permission = fm.get("permission")
    if not isinstance(permission, dict):
        errors.append("sisyphus.md: permission block missing")
    else:
        for tool, expected in (("read", "allow"), ("edit", "ask"), ("bash", "ask")):
            entry = permission.get(tool)
            value = entry.get("*") if isinstance(entry, dict) else entry
            if value != expected:
                errors.append(
                    f"sisyphus.md: permission.{tool} default must be "
                    f"{expected!r}, got {value!r}"
                )
        if not errors or all("permission" not in e for e in errors):
            passes.append("sisyphus.md: conservative permission posture (edit/bash ask)")

    # --- 2. default_agent -------------------------------------------------
    try:
        cfg = json.loads(OPENCODE_JSON.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: opencode.json does not parse: {exc}")
        return 1
    default_agent = cfg.get("default_agent")
    if default_agent != EXPECTED_DEFAULT_AGENT:
        errors.append(
            f"opencode.json: default_agent must be {EXPECTED_DEFAULT_AGENT!r}, "
            f"got {default_agent!r}"
        )
    else:
        passes.append(f"opencode.json: default_agent is {EXPECTED_DEFAULT_AGENT!r}")

    # --- 3. model: pins scoped to sisyphus.md + the generated pipeline set --
    import importlib.util

    _spec = importlib.util.spec_from_file_location(
        "generate_pipeline_personas", REPO_ROOT / "scripts" / "generate-pipeline-personas.py"
    )
    gpp = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(gpp)

    generated = set(gpp.persona_names())
    offenders = []
    for path in sorted(AGENTS_DIR.glob("*.md")):
        if path.name == "sisyphus.md" or path.stem in generated:
            continue
        try:
            other_fm_text, _ = split_frontmatter(path.read_text(encoding="utf-8"))
            other_fm = yaml.safe_load(other_fm_text)
        except Exception:  # noqa: BLE001 — malformed file: other checks own it
            continue
        if isinstance(other_fm, dict) and "model" in other_fm:
            offenders.append(path.name)
    if offenders:
        errors.append(
            "agents/*.md outside sisyphus.md + the generated pipeline set "
            f"carry model: pins (routing-owned): {', '.join(offenders)}"
        )
    else:
        passes.append("no unintended model: pins outside sisyphus.md + generated set")

    # --- 3b. generated-persona drift gate + pin schema + DAG assertion ------
    drift_errors, generated_count = gpp.check_drift(AGENTS_DIR, REPO_ROOT / "skills")
    for de in drift_errors:
        errors.append(de)
    if not drift_errors:
        passes.append(
            f"drift gate: {generated_count} generated persona files match "
            "the port map"
        )

    pin_re = re.compile(r"^[^/#]+/[^#]+(#[^#]+)?$")
    bad_pins = []
    for name in sorted(generated):
        path = AGENTS_DIR / f"{name}.md"
        if not path.is_file():
            continue  # drift leg owns missing files
        try:
            fm_text, _ = split_frontmatter(path.read_text(encoding="utf-8"))
            fm = yaml.safe_load(fm_text)
        except Exception:  # noqa: BLE001
            bad_pins.append(f"{name}.md (unparseable)")
            continue
        model_value = fm.get("model") if isinstance(fm, dict) else None
        if not isinstance(model_value, str) or not pin_re.match(model_value):
            bad_pins.append(f"{name}.md ({model_value!r})")
    if bad_pins:
        errors.append(
            "generated personas with malformed model#variant pins: "
            + ", ".join(bad_pins)
        )
    else:
        passes.append("generated persona pins match the provider/model#variant schema")

    dag_errors, _dag_checks = gpp.check_dag(AGENTS_DIR, REPO_ROOT / "skills")
    errors.extend(dag_errors)
    if not dag_errors:
        passes.append("DAG assertion: manifest §9 edges == task permissions")

    token_errors, _token_count = gpp.check_tokens(REPO_ROOT / "skills", AGENTS_DIR)
    errors.extend(token_errors)
    if not token_errors:
        passes.append("routing tokens: every skills/ token resolves")

    # --- 4. live roster membership ----------------------------------------
    if args.offline:
        print("SKIP: roster leg skipped (--offline / AGENTS_VALIDATE_OFFLINE=1)")
    elif not isinstance(model, str) or not MODEL_ID_RE.match(model):
        errors.append("roster leg not run: model id malformed (see above)")
    else:
        import urllib.error
        import urllib.request

        req = urllib.request.Request(
            ROSTER_URL, headers={"User-Agent": "oc-sisyphus-validate-agents/1"}
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                roster = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"roster fetch failed ({ROSTER_URL}): {exc}")
        else:
            provider_id, _, model_id = model.partition("/")
            provider = roster.get(provider_id, {})
            models = provider.get("models", {}) if isinstance(provider, dict) else {}
            if model_id in models:
                passes.append(f"roster: {model} present at {ROSTER_URL}")
            else:
                errors.append(
                    f"roster: {model} NOT found under provider "
                    f"'{provider_id}' at {ROSTER_URL}"
                )

    for line in passes:
        print(f"OK: {line}")
    for line in errors:
        print(f"FAIL: {line}")
    if errors:
        return 1
    print("validate-agents: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
