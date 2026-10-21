#!/usr/bin/env python3
"""generate-pipeline-personas.py — single source of truth for the pipeline persona files.

Ship pipe-port-m1 (2026-10-21). The macro-methodology pipeline's personas move
from dormant omo routing to fleet-owned generated files under agents/. This
script owns the port map (categories, pins, injection modes, delegation DAG)
extracted by the pipe-port-m0 manifest
(/home/vladi/firstmate/data/pipe-port-m0/report.md) and renders every
generated persona file from it. Edit the map here, never the emitted files.

Modes (manifest §4):
  A — skill-body-as-system: the SKILL.md body is embedded verbatim as the
      agent's system prompt (gates and chain-spine seats; a gate that might
      not load is not a gate).
  B — on-demand: the agent file carries a lean prompt that instructs the
      spawned agent to load its skill on every task (mechanical, low-stakes
      seats where the manifest accepts probabilistic load).

Pins (manifest §3, live-verified against `opencode models` 2026-10-21):
  model ids carry #variant on every judgment seat (schema-official syntax,
  https://opencode.ai/config.json $defs.Config.AgentEncoded.model).

Delegation DAG (manifest §9) is encoded as `task` subagent-allow permissions
on generated caller files (V2 `task` permission matches the subagent type):
deny "*", allow exactly the caller's manifest §9 persona callees. Callers
without generated files (sisyphus primary — V1-dialect frozen — and the
main-thread skills) are recorded in the DAG table only; their spawns run
from the primary's session.

Checks (wired into validate-agents.py / validate-skills.sh / pre-push):
  --check        drift gate: regenerated output must equal committed files
  --check-tokens every routing token in skills/ resolves to a category
                 stanza (port map) or a file agent (agents/*.md) or a skill
  --check-dag    DAG edge-vs-permission assertion (§9 edges == task allows)
  --check-pins   pin-resolution table against the live `opencode models`
                 roster (read-only CLI call; environment-dependent, manual)
  --self-test    proves the gates catch a deliberately-broken token and a
                 deliberately-drifted file (temp copies; live tree untouched)

Usage:  python3 scripts/generate-pipeline-personas.py [--write|--check|
           --check-tokens|--check-dag|--check-pins|--self-test|--list]
Exit:   0 = PASS, 1 = FAIL/drift.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = REPO_ROOT / "skills"
AGENTS_DIR = REPO_ROOT / "agents"
MANIFEST = "pipe-port-m0 manifest (/home/vladi/firstmate/data/pipe-port-m0/report.md)"
GENERATOR = "scripts/generate-pipeline-personas.py"

# Routing-token grammars present in skills/ (manifest §2: A=category="X",
# B=load_skills=[...], C=**Category:** `X`, D=subagent_type="X").
TOKEN_RES = {
    "category": re.compile(r'category=["\']([a-z][a-z0-9-]*)["\']'),
    "category_line": re.compile(r"\*\*Category:\*\* `([a-z][a-z0-9-]*)`"),
    "subagent_type": re.compile(r'subagent_type=["\']([a-z][a-z0-9-]*)["\']'),
    "load_skills": re.compile(r"load_skills=\[([^\]]*)\]"),
}
LOAD_NAME_RES = [
    re.compile(r'["\']([^"\']+)["\']'),
]

# load_skills names that are NOT repo skills (external/browser tooling).
# manifest finding 4: keep-as-external decided at port scope; Ship 2 owns the
# invocation text, so the reference itself stays untouched.
EXTERNAL_SKILLS = {"playwright"}

# ---------------------------------------------------------------------------
# Port map — manifest §1 (live category table + tuning), §3 (live-verified
# pins), §4 (injection modes), §9 (delegation DAG). NOT re-derived here.
#
# Provider-id fidelity note (PR-documented): the manifest tables abbreviate
# the coding-plan provider as "zai/..." — the live roster and the live
# omo.jsonc itself carry exactly one zai provider, "zai-coding-plan/", and
# the brief's pin-resolution gate (opencode models) only passes with the
# full id, so the port map pins zai-coding-plan/... verbatim.
# ---------------------------------------------------------------------------

CATEGORIES = {
    # name: model pin (§3 live-verified), variant, tuning fields (§1)
    "deep": {
        "model": "zai-coding-plan/glm-5.3",
        "variant": "high",
        "temperature": 0.1,
    },
    "ultrabrain": {
        "model": "opencode-go/qwen3.8-max",
        "variant": "max",
        "temperature": 0.0,
    },
    "visual-engineering": {
        "model": "zai-coding-plan/glm-5.3-flash",
        "variant": "high",
        "temperature": 1.0,
        "top_p": 0.95,
    },
    "artistry": {
        "model": "opencode-go/minimax-m3",
        "variant": "high",
        "temperature": 0.7,
        "top_p": 0.9,
    },
    "quick": {
        "model": "zai-coding-plan/glm-5.3-flash",
        "variant": None,
        "temperature": 1.0,
        "top_p": 0.95,
    },
    "unspecified-low": {
        "model": "opencode-go/gpt-5.6-luna",
        "variant": "low",
        "temperature": 0.2,
    },
    "unspecified-high": {
        "model": "zai-coding-plan/glm-5.3",
        "variant": "high",
        "temperature": 0.1,
    },
    "writing": {
        "model": "zai-coding-plan/glm-5.3-flash",
        "variant": None,
        "temperature": None,
    },
    "git-commit-message": {
        "model": "zai-coding-plan/glm-5.3-flash",
        "variant": None,
        "temperature": 1.0,
        "top_p": 0.95,
    },
}

# Permission profiles (conservative; sisyphus-gates stays the real enforcement
# layer, these are defense-in-depth per-seat postures matching the existing
# agents/*.md house style).
PROFILES = {
    "readonly": [
        ("read", {"*": "allow"}),
        ("edit", "deny"),
        ("bash", "deny"),
        ("websearch", "allow"),
        ("webfetch", "allow"),
    ],
    "gate-runner": [
        ("read", {"*": "allow"}),
        ("edit", "deny"),
        (
            "bash",
            {
                "*": "ask",
                "npm test*": "allow",
                "npm run *": "allow",
                "node *": "allow",
                "python3 *": "allow",
                "bash *": "allow",
                "git status*": "allow",
                "git log*": "allow",
                "git diff*": "allow",
                "ls *": "allow",
                "grep *": "allow",
                "find *": "allow",
                "cat *": "allow",
                "wc *": "allow",
                "rm *": "deny",
                "sudo *": "deny",
            },
        ),
        ("websearch", "allow"),
        ("webfetch", "allow"),
    ],
    "writer": [
        ("read", {"*": "allow"}),
        ("edit", {"*": "ask"}),
        (
            "bash",
            {
                "*": "ask",
                "ls *": "allow",
                "grep *": "allow",
                "find *": "allow",
                "cat *": "allow",
                "wc *": "allow",
                "git status*": "allow",
                "git log*": "allow",
                "git diff*": "allow",
                "rm *": "deny",
                "sudo *": "deny",
            },
        ),
        ("websearch", "allow"),
        ("webfetch", "allow"),
    ],
    # writer + bd: issue filing is the seat's whole job; bd's append-only
    # subcommands are phase-agnostic and the destructive ones stay gated by
    # the sisyphus-gates plugin.
    "writer-bd": [
        ("read", {"*": "allow"}),
        ("edit", {"*": "ask"}),
        (
            "bash",
            {
                "*": "ask",
                "bd *": "allow",
                "ls *": "allow",
                "grep *": "allow",
                "find *": "allow",
                "cat *": "allow",
                "wc *": "allow",
                "git status*": "allow",
                "git log*": "allow",
                "git diff*": "allow",
                "rm *": "deny",
                "sudo *": "deny",
            },
        ),
        ("websearch", "allow"),
        ("webfetch", "allow"),
    ],
    "executor": [
        ("read", {"*": "allow"}),
        ("edit", {"*": "ask"}),
        (
            "bash",
            {
                "*": "ask",
                "npm test*": "allow",
                "npm run *": "allow",
                "node *": "allow",
                "python3 *": "allow",
                "bash *": "allow",
                "tsc --noEmit": "allow",
                "git status*": "allow",
                "git log*": "allow",
                "git diff*": "allow",
                "ls *": "allow",
                "grep *": "allow",
                "find *": "allow",
                "cat *": "allow",
                "wc *": "allow",
                "rm *": "ask",
                "sudo *": "deny",
            },
        ),
        ("websearch", "allow"),
        ("webfetch", "allow"),
    ],
}

# The persona cast (manifest §1 live map as routed by §4 modes + §9 DAG).
# task_allows is DERIVED from DAG below at render time (never set by hand).
# mode: "A" body-as-system, "B" on-demand.
# stack: extra reference bodies appended verbatim (manifest §4 wave-executor).
PERSONAS = [
    {
        "name": "brief-loader",
        "category": "unspecified-high",
        "mode": "A",
        "profile": "writer",
        "role": "brief loading and validation stage",
        "description": (
            "Pipeline stage agent: loads and validates an approved planning brief from "
            "discovery-orchestrator before PRD creation. Spawned by the sisyphus-plan spine "
            "(stage 1) and reached via the brief-approved flow. Skill body injected as system prompt."
        ),
    },
    {
        "name": "prd-writer",
        "category": "deep",
        "mode": "A",
        "profile": "writer",
        "role": "PRD writing stage",
        "description": (
            "Pipeline stage agent: writes the Product Requirements Document from an approved brief. "
            "Spawned by the sisyphus-plan spine (stage 2, category deep). Produces PRD plus DESIGN.md "
            "sections and the hardening checklist. Skill body injected as system prompt."
        ),
    },
    {
        "name": "momus-prd-reviewer",
        "category": "deep",
        "mode": "A",
        "profile": "readonly",
        "role": "PRD gate review seat",
        "description": (
            "Pipeline gate agent: ruthless deep review of Product Requirements Documents - logical "
            "contradictions, scope creep, verifiable acceptance criteria. Gate 1 of the sisyphus-plan "
            "spine and Checkpoint 1 of discovery-orchestrator. Routes by category deep (glm-5.3), NOT "
            "the momus agent persona. Skill body injected as system prompt."
        ),
    },
    {
        "name": "issue-creator",
        "category": "unspecified-high",
        "mode": "A",
        "profile": "writer-bd",
        "role": "vertical-slice issue creation stage",
        "description": (
            "Pipeline stage agent: breaks an approved PRD into vertical-slice issues tracked in bd "
            "(beads). Spawned by the sisyphus-plan spine (stage 4). Skill body injected as system prompt."
        ),
    },
    {
        "name": "plan-writer",
        "category": "unspecified-high",
        "mode": "A",
        "profile": "writer",
        "role": "execution plan writing stage",
        "description": (
            "Pipeline stage agent: creates the structured execution plan from an approved PRD and its "
            "issues. Spawned by the sisyphus-plan spine (stage 5). Skill body injected as system prompt."
        ),
    },
    {
        "name": "momus-plan-reviewer",
        "category": "deep",
        "mode": "A",
        "profile": "readonly",
        "role": "plan gate review seat",
        "description": (
            "Pipeline gate agent: ruthless deep review of execution plans - dependency gaps, integration "
            "risks, slice architecture. Gate 2 of the sisyphus-plan spine and the between-waves "
            "Checkpoint 3. Routes by category deep (glm-5.3), NOT the momus agent persona. Skill body "
            "injected as system prompt."
        ),
    },
    {
        "name": "wave-executor",
        "category": "unspecified-high",
        "mode": "A",
        "profile": "executor",
        "stack": ["wave-executor/references/checkpoint-protocol.md"],
        "role": "wave execution stage",
        "description": (
            "Pipeline stage agent: executes one wave of an approved plan - research, strategy, "
            "implementation, validation per slice. Spawned by the sisyphus-plan spine (stage 7). Carries "
            "the checkpoint-protocol reference stacked into the system prompt. Escalates to category "
            "deep after two test failures; may delegate slices to tdd-executor."
        ),
    },
    {
        "name": "plan-updater",
        "category": "unspecified-high",
        "mode": "A",
        "profile": "writer",
        "role": "plan progress update stage",
        "description": (
            "Pipeline stage agent: updates plan progress - marks tasks complete and logs evidence to the "
            "notepad. Spawned by the sisyphus-plan spine (stage 9). Skill body injected as system prompt."
        ),
    },
    {
        "name": "plan-closer",
        "category": "unspecified-high",
        "mode": "A",
        "profile": "writer",
        "role": "plan closure stage",
        "description": (
            "Pipeline stage agent: closes the completed plan, archives state, and closes the bd issues. "
            "Spawned by the sisyphus-plan spine (stage 10). Skill body injected as system prompt."
        ),
    },
    {
        "name": "code-review",
        "category": "ultrabrain",
        "mode": "A",
        "profile": "readonly",
        "role": "code review lane",
        "description": (
            "Orchestrator-review Lane 2 agent: structured code review of a change or PR - correctness, "
            "security, performance, maintainability, architecture, error handling, testing. Read-only; "
            "routes by category ultrabrain. Skill body injected as system prompt."
        ),
    },
    {
        "name": "security-auditor",
        "category": "ultrabrain",
        "mode": "A",
        "profile": "readonly",
        "role": "security audit lane",
        "description": (
            "Orchestrator-review Lane 3 agent: pre-deployment security scan - secrets, injection, auth, "
            "crypto, CORS, rate limiting. Read-only; routes by category ultrabrain. Skill body injected "
            "as system prompt."
        ),
    },
    {
        "name": "ui-auditor",
        "category": "ultrabrain",
        "mode": "A",
        "profile": "readonly",
        "role": "UI/UX validation lane",
        "description": (
            "Orchestrator-review Lane 4 agent (conditional): post-execution UI/UX validation against "
            "DESIGN.md sections 10-14; returns a PASS/WARNING/FAIL gate decision. Read-only; routes by "
            "category ultrabrain. Skill body injected as system prompt."
        ),
    },
    {
        "name": "regression-gate",
        "category": "unspecified-low",
        "mode": "A",
        "profile": "gate-runner",
        "role": "regression gate lane",
        "description": (
            "Orchestrator-review Lane 5 agent (conditional) and standalone gate: runs regression tests "
            "from prior waves before advancing or closing. Routes by category unspecified-low. Skill "
            "body injected as system prompt."
        ),
    },
    {
        "name": "reference-checker",
        "category": "unspecified-low",
        "mode": "B",
        "profile": "readonly",
        "role": "artifact conflict check stage",
        "description": (
            "Pipeline stage agent: mechanical verification gate that scans .sisyphus/ directories for "
            "existing artifacts before creating new ones (discovery-orchestrator Checkpoint 2). "
            "On-demand mode: loads skills/reference-checker/SKILL.md on every task."
        ),
    },
    {
        "name": "tdd-executor",
        "category": "unspecified-high",
        "mode": "B",
        "profile": "executor",
        "role": "TDD slice execution stage",
        "description": (
            "Pipeline stage agent: executes one feature test-first (red-green-refactor) when a plan task "
            "specifies tdd=true; delegated to by wave-executor per wave composition. On-demand mode: "
            "loads skills/tdd-executor/SKILL.md on every task."
        ),
    },
]

# Delegation DAG — manifest §9 edge list verbatim (convention:
# caller -> callee (category|type, skill injected)).
# kinds: stage (spine spawn), lane (orchestrator-review barrier lane),
#        subagent_type (subagent_type= token), execution-leg (persona edge),
#        escalation (category route, callee IS a category name).
# Excluded pseudo-edges (recorded in the manifest, not spawns):
#   discovery-orchestrator -> self (the primary running the skill),
#   discovery-orchestrator -handoff-> sisyphus-plan (main-thread skill handoff).
DAG = [
    ("sisyphus", "brief-loader", "stage", "unspecified-high"),
    ("sisyphus", "prd-writer", "stage", "deep"),
    ("sisyphus", "momus-prd-reviewer", "stage", "deep"),  # Gate 1
    ("sisyphus", "issue-creator", "stage", "unspecified-high"),
    ("sisyphus", "plan-writer", "stage", "unspecified-high"),
    ("sisyphus", "momus-plan-reviewer", "stage", "deep"),  # Gate 2
    ("sisyphus", "wave-executor", "stage", "unspecified-high"),
    ("sisyphus", "momus-plan-reviewer", "stage", "deep"),  # Checkpoint 3
    ("sisyphus", "plan-updater", "stage", "unspecified-high"),
    ("sisyphus", "plan-closer", "stage", "unspecified-high"),
    ("discovery-orchestrator", "momus-prd-reviewer", "lane", "deep"),  # Checkpoint 1
    ("discovery-orchestrator", "reference-checker", "lane", "unspecified-low"),  # Checkpoint 2
    ("orchestrator-review", "oracle", "subagent_type", None),  # Lane 1 + Phase 2.5
    ("orchestrator-review", "code-review", "lane", "ultrabrain"),  # Lane 2
    ("orchestrator-review", "security-auditor", "lane", "ultrabrain"),  # Lane 3
    ("orchestrator-review", "ui-auditor", "lane", "ultrabrain"),  # Lane 4 (conditional)
    ("orchestrator-review", "regression-gate", "lane", "unspecified-low"),  # Lane 5 (conditional)
    ("vault-ops", "archivist", "subagent_type", None),  # Gate-3 write (doctrine-locked)
    ("wave-executor", "tdd-executor", "execution-leg", None),  # per-wave composition
    ("wave-executor", "deep", "escalation", "deep"),  # retry after 2 test failures
    ("tdd-executor", "deep", "escalation", "deep"),  # same rule
    ("website-analyzer", "deep", "escalation", "deep"),  # dispatch example (main-thread skill)
]

# Callers that have NO generated file: the frozen V1-dialect primary plus the
# main-thread skills whose spawns run from the primary's session. Their edges
# live in DAG as data; no task-permission encoding exists for them by design.
KNOWN_CALLERS = {
    "sisyphus": "agents/sisyphus.md",
    "discovery-orchestrator": "skills/discovery-orchestrator/",
    "orchestrator-review": "skills/orchestrator-review/",
    "vault-ops": "skills/vault-ops/",
    "website-analyzer": "skills/website-analyzer/",
}

# The 9 pre-existing agent files are V1-dialect, hand-authored, and stay
# untouched by this generator (manifest §8: V2 honors that form).
PREEXISTING_AGENTS = {
    "sisyphus",
    "archivist",
    "athena",
    "auditor",
    "explorer",
    "fullstack-dev-tester",
    "oracle",
    "post-reviewer",
    "reviewer",
}

PERSONA_KINDS = {"stage", "lane", "subagent_type", "execution-leg"}


def persona_names() -> list[str]:
    return [p["name"] for p in PERSONAS]


def pin_for(category: str) -> str:
    cat = CATEGORIES[category]
    pin = cat["model"]
    if cat["variant"]:
        pin += f"#{cat['variant']}"
    return pin


def task_allows_for(name: str) -> list[str]:
    """Persona callees of `name`'s outgoing DAG edges, in edge order."""
    allows: list[str] = []
    for caller, callee, kind, _annotation in DAG:
        if caller == name and kind in PERSONA_KINDS and callee not in allows:
            allows.append(callee)
    return allows


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def yaml_quote(value: str) -> str:
    return json.dumps(value)  # JSON string escaping is valid YAML double-quote style


def render_permission(profile: str, allows: list[str]) -> list[str]:
    lines = ["permission:"]
    for tool, rule in PROFILES[profile]:
        if isinstance(rule, str):
            lines.append(f"  {tool}: {rule}")
        else:
            lines.append(f"  {tool}:")
            for pattern, action in rule.items():
                lines.append(f'    {yaml_quote(pattern)}: {action}')
    lines.append("  task:")
    lines.append('    "*": deny')
    for callee in allows:
        lines.append(f'    {yaml_quote(callee)}: allow')
    return lines


def skill_body(skills_dir: Path, name: str) -> str:
    path = skills_dir / name / "SKILL.md"
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: no YAML frontmatter")
    close = next(i for i, l in enumerate(lines[1:], start=1) if l.strip() == "---")
    body = "\n".join(lines[close + 1 :]).strip("\n")
    if not body:
        raise ValueError(f"{path}: empty body")
    return body


def render_persona(p: dict, skills_dir: Path) -> str:
    name = p["name"]
    cat = CATEGORIES[p["category"]]
    allows = task_allows_for(name)
    mode_word = "A (skill-body-as-system)" if p["mode"] == "A" else "B (on-demand body)"

    fm = [
        "---",
        f"# Generated by {GENERATOR} (pipe-port-m1) - DO NOT EDIT by hand.",
        f"# Port map source: {MANIFEST}, sections 1/3/4/9 - mode {mode_word},",
        f"# pin from category {p['category']} (manifest §3 live-verified table).",
        f"description: {yaml_quote(p['description'])}",
        "mode: subagent",
    ]
    if cat["temperature"] is not None:
        fm.append(f"temperature: {cat['temperature']}")
    if cat.get("top_p") is not None:
        fm.append(f"top_p: {cat['top_p']}")
    fm.append(f"model: {pin_for(p['category'])}")
    fm.extend(render_permission(p["profile"], allows))
    fm.append("---")

    head = [
        f"You are {name}, the fleet's {p['role']} agent for the macro methodology pipeline.",
        f"This file is generated (single source of truth: {GENERATOR}); change the port map there and regenerate, never hand-edit this file.",
    ]
    if p["mode"] == "A":
        line = (
            f"Mode A contract: the skill body below is injected verbatim as your system prompt - "
            "treat it as binding instructions for every task you receive."
        )
        if p.get("stack"):
            stacked = ", ".join(p["stack"])
            line = (
                f"Mode A contract (stacked): the skill body below plus the stacked reference "
                f"({stacked}) are injected verbatim as your system prompt - treat them as binding "
                "instructions for every task you receive."
            )
        head.append(line)
    else:
        head.append(
            f"Mode B contract: on every task, first load skills/{name}/SKILL.md and follow it as "
            "your binding contract - never act from memory of it."
        )

    parts = ["\n".join(fm), "\n".join(head), skill_body(skills_dir, name)]
    for ref in p.get("stack", []):
        ref_path = skills_dir / ref
        ref_text = ref_path.read_text(encoding="utf-8").strip("\n")
        parts.append(
            "## Stacked reference (injected verbatim): "
            + ref
            + "\n\n"
            + ref_text
        )
    return "\n\n".join(parts) + "\n"


def render_all(skills_dir: Path) -> dict[str, str]:
    return {p["name"]: render_persona(p, skills_dir) for p in PERSONAS}


def write_agents(agents_dir: Path, skills_dir: Path) -> list[str]:
    written = []
    for name, text in render_all(skills_dir).items():
        target = agents_dir / f"{name}.md"
        target.write_text(text, encoding="utf-8")
        written.append(target.name)
    return written


# ---------------------------------------------------------------------------
# Check 1: drift gate
# ---------------------------------------------------------------------------


def check_drift(agents_dir: Path, skills_dir: Path) -> tuple[list[str], int]:
    errors: list[str] = []
    rendered = render_all(skills_dir)
    for name, text in rendered.items():
        path = agents_dir / f"{name}.md"
        if not path.is_file():
            errors.append(f"drift: agents/{name}.md missing (run the generator)")
            continue
        committed = path.read_text(encoding="utf-8")
        if committed != text:
            errors.append(f"drift: agents/{name}.md differs from generated output")
    for path in sorted(agents_dir.glob("*.md")):
        stem = path.stem
        if stem in rendered or stem in PREEXISTING_AGENTS:
            continue
        errors.append(
            f"drift: agents/{stem}.md is neither generated nor a known pre-existing agent"
        )
    return errors, len(rendered)


# ---------------------------------------------------------------------------
# Check 2: routing-token resolution (manifest finding 3)
# ---------------------------------------------------------------------------


def iter_skill_files(skills_dir: Path):
    for path in sorted(skills_dir.glob("*/SKILL.md")):
        yield path


def check_tokens(skills_dir: Path, agents_dir: Path) -> tuple[list[str], int]:
    errors: list[str] = []
    checked = 0
    for path in iter_skill_files(skills_dir):
        for lineno, line in enumerate(
            path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            where = f"{path.parent.name}/SKILL.md:{lineno}"
            for token in TOKEN_RES["category"].findall(line):
                checked += 1
                if token not in CATEGORIES:
                    errors.append(f"{where}: category={token!r} resolves to no stanza")
            for token in TOKEN_RES["category_line"].findall(line):
                checked += 1
                if token not in CATEGORIES:
                    errors.append(f"{where}: **Category:** {token!r} resolves to no stanza")
            for token in TOKEN_RES["subagent_type"].findall(line):
                checked += 1
                if not (agents_dir / f"{token}.md").is_file():
                    errors.append(f"{where}: subagent_type={token!r} resolves to no file agent")
            for payload in TOKEN_RES["load_skills"].findall(line):
                for regex in LOAD_NAME_RES:
                    for name in regex.findall(payload):
                        checked += 1
                        if name in EXTERNAL_SKILLS:
                            continue
                        if not (skills_dir / name).is_dir():
                            errors.append(f"{where}: load_skills={name!r} resolves to no skill")
    return errors, checked


# ---------------------------------------------------------------------------
# Check 3: DAG edge-vs-permission assertion
# ---------------------------------------------------------------------------


def check_dag(agents_dir: Path, skills_dir: Path) -> tuple[list[str], int]:
    errors: list[str] = []
    generated = set(persona_names())
    checks = 0

    # Edge targets resolve.
    for caller, callee, kind, annotation in DAG:
        checks += 1
        if annotation is not None and annotation not in CATEGORIES:
            errors.append(f"DAG: edge {caller}->{callee} annotates unknown category {annotation!r}")
        if kind == "escalation":
            if callee not in CATEGORIES:
                errors.append(f"DAG: escalation edge {caller}->{callee} targets a non-category")
            continue
        if not (agents_dir / f"{callee}.md").is_file():
            errors.append(f"DAG: edge {caller}->{callee} targets a persona with no agents/ file")

    # Callers resolve (generated file, pre-existing agent, or main-thread skill).
    for caller, where in KNOWN_CALLERS.items():
        checks += 1
        if not (REPO_ROOT / where).exists():
            errors.append(f"DAG: known caller {caller} does not resolve at {where}")

    # Generated persona files carry exactly their outgoing persona edges.
    for name in generated:
        checks += 1
        expected = task_allows_for(name)
        path = agents_dir / f"{name}.md"
        if not path.is_file():
            continue  # drift check owns missing files
        text = path.read_text(encoding="utf-8")
        m = re.search(r"^  task:\n((?:    .*\n?)+)", text, re.MULTILINE)
        if not m:
            errors.append(f"DAG: {name}.md has no task permission block")
            continue
        allows: list[str] = []
        for entry in m.group(1).splitlines():
            em = re.match(r'    "([^"]+)": (allow|deny|ask)', entry)
            if em and em.group(2) == "allow" and em.group(1) != "*":
                allows.append(em.group(1))
        if allows != expected:
            errors.append(
                f"DAG: {name}.md task allows {allows} != manifest §9 edges {expected}"
            )

    # No persona edge points at a name that is neither generated nor pre-existing.
    for _caller, callee, kind, _annotation in DAG:
        if kind in PERSONA_KINDS and callee not in generated | PREEXISTING_AGENTS:
            errors.append(f"DAG: callee {callee} is neither generated nor a pre-existing agent")
    return errors, checks


# ---------------------------------------------------------------------------
# Check 4: live-roster pin resolution (manual leg; read-only CLI)
# ---------------------------------------------------------------------------


def check_pins() -> int:
    try:
        proc = subprocess.run(
            ["opencode", "models"], capture_output=True, text=True, timeout=60
        )
    except FileNotFoundError:
        print("FAIL: `opencode` binary not found on PATH")
        return 1
    if proc.returncode != 0:
        print(f"FAIL: `opencode models` exited {proc.returncode}: {proc.stderr.strip()}")
        return 1
    roster = set(proc.stdout.split())
    failures = 0
    print(f"{'persona':<22} {'pin':<34} live-roster")
    for p in PERSONAS:
        pin = pin_for(p["category"])
        base = pin.split("#", 1)[0]
        ok = base in roster
        failures += 0 if ok else 1
        print(f"{p['name']:<22} {pin:<34} {'RESOLVES' if ok else 'DEAD'}")
    print("check-pins: PASS" if failures == 0 else f"check-pins: FAIL ({failures} dead)")
    return 1 if failures else 0


# ---------------------------------------------------------------------------
# Self-test: prove the gates catch what they must catch
# ---------------------------------------------------------------------------


def self_test() -> int:
    failures: list[str] = []

    with tempfile.TemporaryDirectory(prefix="pipe-port-m1-selftest-") as tmp:
        root = Path(tmp)
        skills_copy = root / "skills"
        agents_copy = root / "agents"
        shutil.copytree(SKILLS_DIR, skills_copy, symlinks=True)
        shutil.copytree(AGENTS_DIR, agents_copy)

        # Clean tree passes both gates.
        err, _ = check_tokens(skills_copy, agents_copy)
        if err:
            failures.append(f"clean tree: token check reported {err[:3]}")
        err, _ = check_drift(agents_copy, skills_copy)
        if err:
            failures.append(f"clean tree: drift check reported {err[:3]}")

        # Deliberately-broken routing token must be caught, with file:line.
        victim = skills_copy / "sisyphus-plan" / "SKILL.md"
        text = victim.read_text(encoding="utf-8")
        victim.write_text(text.replace('category="deep"', 'category="dept"', 1))
        err, _ = check_tokens(skills_copy, agents_copy)
        if not any("dept" in e and "sisyphus-plan/SKILL.md:" in e for e in err):
            failures.append(f"broken token not caught: {err[:3]}")

        # Deliberate drift must be caught.
        drifted = agents_copy / "brief-loader.md"
        if drifted.is_file():
            drifted.write_text(drifted.read_text(encoding="utf-8") + "\nhand edit\n")
        else:
            failures.append("self-test setup: brief-loader.md not generated")
        err, _ = check_drift(agents_copy, skills_copy)
        if not any("brief-loader" in e for e in err):
            failures.append(f"drift not caught: {err[:3]}")

        # Deliberate DAG violation (extra task allow) must be caught.
        dag_victim = agents_copy / "tdd-executor.md"
        if dag_victim.is_file():
            dag_victim.write_text(
                dag_victim.read_text(encoding="utf-8").replace(
                    '  task:\n    "*": deny\n',
                    '  task:\n    "*": deny\n    "brief-loader": allow\n',
                    1,
                )
            )
            err, _ = check_dag(agents_copy, skills_copy)
            if not any("tdd-executor" in e for e in err):
                failures.append(f"DAG violation not caught: {err[:3]}")
        else:
            failures.append("self-test setup: tdd-executor.md not generated")

    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        print("self-test: FAIL")
        return 1
    print("self-test: PASS (clean pass + broken token + drift + DAG violation all caught)")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mutex = parser.add_mutually_exclusive_group()
    mutex.add_argument("--write", action="store_true", help="(default) regenerate agents/*.md")
    mutex.add_argument("--check", action="store_true", help="drift gate; exit 1 on drift")
    mutex.add_argument("--check-tokens", action="store_true", help="routing-token resolution")
    mutex.add_argument("--check-dag", action="store_true", help="DAG edge-vs-permission assertion")
    mutex.add_argument("--check-pins", action="store_true", help="live-roster pin resolution")
    mutex.add_argument("--self-test", action="store_true", help="gate self-test")
    mutex.add_argument("--list", action="store_true", help="print generated file names")
    args = parser.parse_args()

    if args.list:
        for name in persona_names():
            print(name)
        return 0
    if args.check_pins:
        return check_pins()
    if args.self_test:
        return self_test()
    if args.check:
        errors, count = check_drift(AGENTS_DIR, SKILLS_DIR)
        for e in errors:
            print(f"FAIL: {e}")
        if errors:
            print(f"drift gate: FAIL ({len(errors)} error(s))")
            return 1
        print(f"drift gate: PASS ({count} generated files match)")
        return 0
    if args.check_tokens:
        errors, checked = check_tokens(SKILLS_DIR, AGENTS_DIR)
        for e in errors:
            print(f"FAIL: {e}")
        if errors:
            print(f"token check: FAIL ({len(errors)} dangling of {checked} checked)")
            return 1
        print(f"token check: PASS ({checked} routing tokens resolve)")
        return 0
    if args.check_dag:
        errors, checks = check_dag(AGENTS_DIR, SKILLS_DIR)
        for e in errors:
            print(f"FAIL: {e}")
        if errors:
            print(f"DAG check: FAIL ({len(errors)} error(s))")
            return 1
        print(f"DAG check: PASS ({checks} assertions)")
        return 0

    written = write_agents(AGENTS_DIR, SKILLS_DIR)
    for name in written:
        print(f"wrote agents/{name}")
    print(f"generate: {len(written)} persona files written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
