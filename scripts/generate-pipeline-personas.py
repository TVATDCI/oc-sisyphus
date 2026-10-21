#!/usr/bin/env python3
"""generate-pipeline-personas.py — single source of truth for the pipeline persona files.

Ship pipe-port-m1 (2026-10-21). The macro-methodology pipeline's personas move
from dormant omo routing to fleet-owned generated files under agents/. This
script owns the port map (categories, pins, injection modes, delegation DAG)
extracted by the pipe-port-m0 manifest
(/home/vladi/firstmate/data/pipe-port-m0/report.md) and renders every
generated persona file from it. Edit the map here, never the emitted files.

oc-v2-fixbundle (2026-10-21, PR-8 decisions 1+2): ~/.omo/omo.jsonc is the
PIN-AUTHORING surface. This generator LIVE-READS it (never a snapshot -
manifest lesson WARNING-5) and derives every model pin from it. The source
is configurable for non-desk environments (CI has no ~/.omo): the
--omo-source flag or OMO_JSONC_PATH env override the default, and the
generator fail-closes when the CONFIGURED source is absent - never a silent
fallback. CI points it at the committed repo-root per-desk variant
(omo.ddd.jsonc), so the committed surfaces must reproduce from a committed
source on every push:
  - the opencode.json `agent` map (the V1-object config form PR-8 D3 proved
    pins under opencode 2.1.0) is EMITTED as the runtime pin authority:
    bare `provider/model` + separate `variant` field per agent entry -
    source-verified against opencode v2.1.0 (sis lane answer 2026-10-21:
    a `#variant` suffix inside the V1 map's model string drops the entire
    model selection);
  - agents/*.md carry NO model/variant line at all (captain ruling on the
    sis lane answer 2026-10-21): under 2.1.0 the markdown documents apply
    AFTER the JSON map and win every field they define, so any valid file
    pin would silently override the map — the config map is therefore the
    SOLE pin authority and the drift gate fails on any file that grows a
    model/variant line; the drift gate also schema-checks every generated
    .md frontmatter (the 2.1.0 loader silently drops files that fail
    schema decode — bare-array permissions are the observed killer);

Variant aliases (PR-8 decision 2 / R4): omo reasoning values that the live
catalog does not offer for a model are mapped by VARIANT_ALIASES below
(qwen3.8-max has no #max effort; the catalog offers xhigh). Every emitted
model#variant is checked against the live catalog by --check-variants; the
#max-class error must be caught before it ships.

Modes (manifest §4):
  A — skill-body-as-system: the SKILL.md body is embedded verbatim as the
      agent's system prompt (gates and chain-spine seats; a gate that might
      not load is not a gate).
  B — on-demand: the agent file carries a lean prompt that instructs the
      spawned agent to load its skill on every task (mechanical, low-stakes
      seats where the manifest accepts probabilistic load).

Delegation DAG (manifest §9) is encoded as `task` subagent-allow permissions
on generated caller files (V2 `task` permission matches the subagent type):
deny "*", allow exactly the caller's manifest §9 persona callees. Callers
without generated files (sisyphus primary — V1-dialect frozen — and the
main-thread skills) are recorded in the DAG table only; their spawns run
from the primary's session.

Checks (wired into validate-agents.py / validate-skills.sh / pre-push):
  --check           drift gate: regenerated output must equal committed files
                    (agents/*.md, their model lines, and the opencode.json
                    `agent` map) against the LIVE ~/.omo/omo.jsonc
  --check-tokens    every routing token in skills/ resolves to a category
                    stanza (port map) or a file agent (agents/*.md) or a skill
  --check-dag       DAG edge-vs-permission assertion (§9 edges == task allows)
  --check-pins      pin-resolution table against the live `opencode models`
                   roster (read-only CLI call; environment-dependent, manual)
  --check-variants  variant-validity leg: every emitted model#variant against
                    the live catalog (roster via `opencode models` + reasoning
                    efforts from the models-dev catalog KV); the #max-class
                    error (R4) is caught here (environment-dependent, manual)
  --self-test       proves the gates catch a deliberately-broken token, a
                    deliberately-drifted file, a drifted opencode.json map, a
                    drifted pre-existing model line, and an invalid variant
                    (temp copies; live tree untouched)

Usage:  python3 scripts/generate-pipeline-personas.py [--write|--check|
           --check-tokens|--check-dag|--check-pins|--check-variants|
           --self-test|--list]
Exit:   0 = PASS, 1 = FAIL/drift.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = REPO_ROOT / "skills"
AGENTS_DIR = REPO_ROOT / "agents"
OPENCODE_JSON = REPO_ROOT / "opencode.json"


def resolve_omo_path() -> tuple[Path, str]:
    """The configured pin source: --omo-source flag > OMO_JSONC_PATH env >
    the live ~/.omo/omo.jsonc. Returns (path, how_configured) — the caller
    fail-closes when the CONFIGURED source is absent; no silent fallback.
    """
    for i, arg in enumerate(sys.argv[1:], start=1):
        if arg == "--omo-source" and i + 1 < len(sys.argv):
            return Path(sys.argv[i + 1]).expanduser(), "--omo-source flag"
        if arg.startswith("--omo-source="):
            return Path(arg.split("=", 1)[1]).expanduser(), "--omo-source flag"
    env = os.environ.get("OMO_JSONC_PATH")
    if env:
        return Path(env).expanduser(), "OMO_JSONC_PATH env"
    return Path.home() / ".omo" / "omo.jsonc", "default (live ~/.omo/omo.jsonc)"


OMO_PATH, OMO_SOURCE_CONFIG = resolve_omo_path()
MANIFEST = "pipe-port-m0 manifest (/home/vladi/firstmate/data/pipe-port-m0/report.md)"
GENERATOR = "scripts/generate-pipeline-personas.py"


# ---------------------------------------------------------------------------
# Live pin source — ~/.omo/omo.jsonc (oc-v2-fixbundle, PR-8 decision 1).
# The file is READ LIVE at every invocation (never snapshotted into the repo —
# manifest lesson WARNING-5). After the captain edits omo.jsonc, --check fails
# until the generator is re-run and the output committed: that drift IS the
# wire from the authoring surface to the emitted pins.
# ---------------------------------------------------------------------------


def _strip_jsonc_comments(text: str) -> str:
    """String-aware // and /* */ comment stripper (mirrors scripts/omo-query.js)."""
    out = []
    i = 0
    in_string = False
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == "\\" and i + 1 < len(text):
                out.append(ch + text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_string = False
            out.append(ch)
            i += 1
        else:
            if ch == '"':
                in_string = True
                out.append(ch)
                i += 1
            elif ch == "/" and i + 1 < len(text) and text[i + 1] == "/":
                while i < len(text) and text[i] != "\n":
                    i += 1
            elif ch == "/" and i + 1 < len(text) and text[i + 1] == "*":
                i += 2
                while i + 1 < len(text) and not (text[i] == "*" and text[i + 1] == "/"):
                    i += 1
                i += 2
            else:
                out.append(ch)
                i += 1
    return "".join(out)


def read_omo() -> dict:
    """Parse the configured pin source and return its `[opencode]` block."""
    if not OMO_PATH.is_file():
        raise SystemExit(
            f"FAIL: pin source {OMO_PATH} not found (configured via "
            f"{OMO_SOURCE_CONFIG}) — the generator derives every pin from "
            "the configured omo source and will not fall back silently. On "
            "CI, point --omo-source / OMO_JSONC_PATH at a committed source "
            "(the repo-root omo.<desk>.jsonc variants are the intended "
            "fixture)."
        )
    raw = OMO_PATH.read_text(encoding="utf-8")
    clean = re.sub(r",(?=\s*[}\]])", "", _strip_jsonc_comments(raw))
    cfg = json.loads(clean)
    oc = cfg.get("[opencode]")
    if not isinstance(oc, dict):
        raise SystemExit(f"FAIL: {OMO_PATH} has no [opencode] block")
    return oc


# Variant aliases (PR-8 decision 2 / R4): omo reasoning values the live
# catalog does not offer for a model, mapped to the nearest runnable effort.
# Keep this table minimal — every entry is a documented deviation.
VARIANT_ALIASES = {
    # qwen3.8-max offers [low, medium, xhigh]; omo's "max" reasoning maps to
    # the top effort the catalog actually has (R4: #max is un-runnable).
    ("opencode-go/qwen3.8-max", "max"): "xhigh",
}


def resolve_variant(model: str, reasoning) -> str | None:
    """omo reasoning value -> opencode variant, alias table applied."""
    if not reasoning:
        return None
    variant = str(reasoning).strip().lower()
    if not variant:
        return None
    return VARIANT_ALIASES.get((model, variant), variant)


def _pin_fields(stanza: dict) -> dict:
    model = stanza.get("model")
    if not model or "/" not in model:
        raise SystemExit(f"FAIL: omo stanza without a provider/model pin: {stanza!r}")
    return {
        "model": model,
        "variant": resolve_variant(model, stanza.get("reasoning")),
        "temperature": stanza.get("temperature"),
        "top_p": stanza.get("top_p"),
    }


OMO = read_omo()
OMO_CATEGORIES = OMO.get("categories", {})
OMO_AGENTS = OMO.get("agents", {})

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
# Port map — manifest §1 (live category table + tuning), §4 (injection
# modes), §9 (delegation DAG). NOT re-derived here.
#
# oc-v2-fixbundle: the model/variant/tuning fields are DERIVED LIVE from
# ~/.omo/omo.jsonc (the pin-authoring surface). The dict below fixes only
# which categories the pipeline personas route through; a category missing
# from the live omo.jsonc fails the generator closed.
#
# Provider-id fidelity note (PR-documented): the manifest tables abbreviate
# the coding-plan provider as "zai/..." — the live roster and the live
# omo.jsonc itself carry exactly one zai provider, "zai-coding-plan/".
# ---------------------------------------------------------------------------

PIPELINE_CATEGORIES = {
    "deep",
    "ultrabrain",
    "visual-engineering",
    "artistry",
    "quick",
    "unspecified-low",
    "unspecified-high",
    "writing",
    "git-commit-message",
}

_missing = sorted(PIPELINE_CATEGORIES - set(OMO_CATEGORIES))
if _missing:
    raise SystemExit(
        f"FAIL: live {OMO_PATH} is missing pipeline categories: {_missing}"
    )

CATEGORIES = {name: _pin_fields(OMO_CATEGORIES[name]) for name in sorted(PIPELINE_CATEGORIES)}

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
# untouched by this generator except their frontmatter `model:` lines,
# which are omo-derived documentation (oc-v2-fixbundle; their runtime pins
# come from the emitted opencode.json `agent` map, same source).
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

_missing_agents = sorted(PREEXISTING_AGENTS - set(OMO_AGENTS))
if _missing_agents:
    raise SystemExit(
        f"FAIL: live {OMO_PATH} has no agent stanza for repo agents: {_missing_agents}"
    )

# name -> omo-derived pin fields for the pre-existing (hand-authored) agents.
PREEXISTING_PINS = {name: _pin_fields(OMO_AGENTS[name]) for name in sorted(PREEXISTING_AGENTS)}


def preexisting_pin(name: str) -> str:
    """Frontmatter-documentation pin for a pre-existing agent (omo-derived)."""
    stanza = PREEXISTING_PINS[name]
    pin = stanza["model"]
    if stanza["variant"]:
        pin += f"#{stanza['variant']}"
    return pin


# ---------------------------------------------------------------------------
# opencode.json `agent` map emission (oc-v2-fixbundle, PR-8 decision 1).
# The V1-object config form D3 proved pins under opencode 2.1.0. Entries
# carry ONLY the pin — bare `provider/model` + separate `variant` field
# (source-verified: a `#variant` suffix inside the V1 map's model string
# drops the entire model selection under 2.1.0). Everything else (prompt,
# permissions, temperature) stays owned by the agents/*.md files; the
# loader merges per field and never replaces wholesale.
# ---------------------------------------------------------------------------


def _agent_block(stanza: dict) -> dict:
    block = {"model": stanza["model"]}
    if stanza["variant"]:
        block["variant"] = stanza["variant"]
    return block


def render_agent_config() -> dict:
    """The full emitted `agent` map: pipeline personas + pre-existing agents."""
    out: dict[str, dict] = {}
    for p in PERSONAS:
        out[p["name"]] = _agent_block(CATEGORIES[p["category"]])
    for name in sorted(PREEXISTING_AGENTS):
        out[name] = _agent_block(PREEXISTING_PINS[name])
    return out


def agent_pin_map() -> dict[str, str]:
    """name -> display pin (base or base#variant) for every emitted agent."""
    out: dict[str, str] = {}
    for name, block in render_agent_config().items():
        pin = block["model"]
        if block.get("variant"):
            pin += f"#{block['variant']}"
        out[name] = pin
    return out

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
        f"# Port map source: {MANIFEST}, sections 1/4/9 - mode {mode_word}.",
        f"# Pin (model+variant) derives live from ~/.omo/omo.jsonc category",
        f"# {p['category']} (variant aliases applied) and is applied by the",
        f"# emitted opencode.json agent map - the SOLE pin authority. This file",
        f"# deliberately carries NO model line: a valid model pin here would",
        f"# override the map (files apply after JSON and win fields they define",
        f"# under opencode 2.1.0; sis lane answer 2026-10-21).",
        f"description: {yaml_quote(p['description'])}",
        "mode: subagent",
    ]
    if cat["temperature"] is not None:
        fm.append(f"temperature: {cat['temperature']}")
    if cat.get("top_p") is not None:
        fm.append(f"top_p: {cat['top_p']}")
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
    written.extend(sync_preexisting_model_lines(agents_dir))
    return written


def sync_preexisting_model_lines(agents_dir: Path) -> list[str]:
    """Ensure pre-existing agents carry NO frontmatter model line.

    The opencode.json `agent` map is the sole pin authority; a valid legacy
    model pin in a file overrides the map's model selection for that agent
    (files apply after the JSON doc and win every field they define under
    opencode 2.1.0). Any existing model line is therefore REMOVED; every
    other byte of these hand-authored files is preserved.
    """
    changed = []
    for name in sorted(PREEXISTING_AGENTS):
        path = agents_dir / f"{name}.md"
        text = path.read_text(encoding="utf-8")
        lines = text.split("\n")
        close = next(
            (i for i, l in enumerate(lines[1:], start=1) if l.strip() == "---"), None
        )
        if close is None:
            raise ValueError(f"{path}: no YAML frontmatter")
        kept = [l for l in lines[:close] if not l.startswith("model:")]
        if len(kept) == len(lines[:close]):
            continue
        path.write_text("\n".join(kept + lines[close:]), encoding="utf-8")
        changed.append(f"{name}.md")
    return changed


# ---------------------------------------------------------------------------
# opencode.json emission (pin authority; oc-v2-fixbundle)
# ---------------------------------------------------------------------------


def write_opencode_agent_map(repo_root: Path = REPO_ROOT) -> bool:
    """Set the `agent` map in opencode.json to the omo-derived emission.

    Every other key in the file is preserved byte-for-value; `agent` is
    placed right after `default_agent` (or appended) for a deterministic,
    diff-stable layout.
    """
    path = repo_root / "opencode.json"
    cfg = json.loads(path.read_text(encoding="utf-8"))
    rendered = render_agent_config()
    if cfg.get("agent") == rendered:
        return False
    new_cfg: dict = {}
    inserted = False
    for key, value in cfg.items():
        new_cfg[key] = value
        if key == "default_agent":
            new_cfg["agent"] = rendered
            inserted = True
    if not inserted:
        new_cfg["agent"] = rendered
    path.write_text(json.dumps(new_cfg, indent=2) + "\n", encoding="utf-8")
    return True


# ---------------------------------------------------------------------------
# Check 1: drift gate
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Schema gate: the 2.1.0 loader SILENTLY DROPS agent .md files that fail
# schema decode (sis lane answer 2026-10-21 — the false "loads nothing"
# diagnostic had exactly this cause: a bare-array permissions value). A
# dropped file loses its system prompt AND permissions with zero diagnostics,
# so the drift gate schema-checks every generated file's frontmatter shape
# against the structural contract both decoders accept.
# ---------------------------------------------------------------------------

PERMITTED_FM_KEYS = {"description", "mode", "temperature", "top_p", "permission"}
MODES = {"primary", "subagent", "all"}
ACTIONS = {"allow", "deny", "ask"}


def _check_permission_value(tool: str, value, where: str, errors: list[str]) -> None:
    if isinstance(value, str):
        if value not in ACTIONS:
            errors.append(f"{where}: permission.{tool} action {value!r} not in {sorted(ACTIONS)}")
        return
    if not isinstance(value, dict):
        errors.append(
            f"{where}: permission.{tool} must be an action string or a pattern map "
            f"(bare array/other shapes are silently dropped by the 2.1.0 loader)"
        )
        return
    for pattern, action in value.items():
        if not isinstance(pattern, str) or not pattern:
            errors.append(f"{where}: permission.{tool} pattern {pattern!r} is not a non-empty string")
        if action not in ACTIONS:
            errors.append(
                f"{where}: permission.{tool}[{pattern!r}] action {action!r} not in {sorted(ACTIONS)}"
            )


def check_agent_md_schema(path: Path) -> list[str]:
    """Structural schema check of one generated agent file's frontmatter."""
    errors: list[str] = []
    where = path.name
    lines = path.read_text(encoding="utf-8").split("\n")
    if not lines or lines[0].strip() != "---":
        return [f"{where}: no YAML frontmatter opener"]
    try:
        close = next(i for i, l in enumerate(lines[1:], start=1) if l.strip() == "---")
    except StopIteration:
        return [f"{where}: unterminated frontmatter"]
    fm = lines[:close]
    for l in fm:
        if l.startswith("model:") or l.startswith("variant:"):
            errors.append(
                f"{where}: frontmatter carries {l.split(':')[0]!r} — model pins live ONLY "
                "in the opencode.json agent map (a valid file pin overrides the map)"
            )
    keys = []
    for l in fm:
        m = re.match(r"^([a-z_]+):", l)
        if m:
            keys.append(m.group(1))
    for key in keys:
        if key not in PERMITTED_FM_KEYS:
            errors.append(f"{where}: unexpected frontmatter key {key!r}")
    text = "\n".join(fm)
    if not re.search(r"^description: ", text, re.M):
        errors.append(f"{where}: missing description")
    mode = re.search(r"^mode: (\S+)", text, re.M)
    if not mode:
        errors.append(f"{where}: missing mode")
    elif mode.group(1) not in MODES:
        errors.append(f"{where}: mode {mode.group(1)!r} not in {sorted(MODES)}")
    for num in ("temperature", "top_p"):
        m = re.search(rf"^{num}: (\S+)", text, re.M)
        if m and not re.fullmatch(r"-?\d+(?:\.\d+)?", m.group(1)):
            errors.append(f"{where}: {num} {m.group(1)!r} is not a number")
    perm_idx = next((i for i, l in enumerate(fm) if re.match(r"^permission:", l)), None)
    if perm_idx is None:
        errors.append(f"{where}: missing permission block")
    else:
        inline = re.match(r"^permission:\s*(.*)$", fm[perm_idx]).group(1).strip()
        if inline:
            if inline.startswith("["):
                errors.append(
                    f"{where}: permission {inline!r} is a bare array — must be an action "
                    "string or a pattern map (silently dropped by the 2.1.0 loader)"
                )
            elif inline not in ACTIONS:
                errors.append(f"{where}: permission {inline!r} not in {sorted(ACTIONS)}")
        else:
            block: list[str] = []
            for l in fm[perm_idx + 1 :]:
                if re.match(r"^[a-z_]+:", l):
                    break
                block.append(l)
            if not block:
                errors.append(f"{where}: empty permission block")
            else:
                tool = None
                value_lines: list[str] = []
                for l in block:
                    tm = re.match(r"^  ([a-z_]+):(.*)$", l)
                    if tm:
                        if tool is not None:
                            _check_permission_value(tool, _parse_perm_value(value_lines), where, errors)
                        tool = tm.group(1)
                        value_lines = [tm.group(2)] if tm.group(2).strip() else []
                    else:
                        value_lines.append(l.strip())
                if tool is not None:
                    _check_permission_value(tool, _parse_perm_value(value_lines), where, errors)
    return errors


def _parse_perm_value(value_lines: list[str]):
    """Rebuild a permission value from rendered lines: string or pattern map."""
    first = value_lines[0].strip() if value_lines else ""
    if len(value_lines) <= 1 and first and not first.startswith('"'):
        return first  # bare action string
    out = {}
    for l in value_lines:
        pm = re.match(r'^"([^"]*)": (\w+)$', l.strip())
        if pm:
            out[pm.group(1)] = pm.group(2)
        elif re.match(r"^'[^']*': \w+$", l.strip()):
            pm2 = re.match(r"^'([^']*)': (\w+)$", l.strip())
            out[pm2.group(1)] = pm2.group(2)
    return out


def check_drift(
    agents_dir: Path, skills_dir: Path, repo_root: Path = REPO_ROOT
) -> tuple[list[str], int]:
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
    # oc-v2-fixbundle: NO agents/*.md may carry a model/variant line — the
    # opencode.json agent map is the sole pin authority and a valid file pin
    # overrides it (files win fields they define under 2.1.0).
    for path in sorted(agents_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        lines = text.split("\n")
        try:
            close = next(i for i, l in enumerate(lines[1:], start=1) if l.strip() == "---")
        except StopIteration:
            errors.append(f"drift: agents/{path.stem}.md has no frontmatter")
            continue
        for l in lines[:close]:
            if l.startswith(("model:", "variant:")):
                errors.append(
                    f"drift: agents/{path.stem}.md carries {l.split(':')[0]} pin "
                    "{l!r} — pins live only in the opencode.json agent map (run the generator)"
                )
                break
    # oc-v2-fixbundle: schema gate — the 2.1.0 loader silently drops files
    # that fail decode; every generated file must be schema-valid.
    for name in rendered:
        errors.extend(check_agent_md_schema(agents_dir / f"{name}.md"))
    # oc-v2-fixbundle: the opencode.json `agent` map is the emitted pin
    # authority — it must equal the live-derived emission.
    oc_path = repo_root / "opencode.json"
    try:
        cfg = json.loads(oc_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append("drift: opencode.json missing")
        cfg = None
    if cfg is not None and cfg.get("agent") != render_agent_config():
        errors.append(
            "drift: opencode.json `agent` map differs from the omo-derived emission"
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
# Check 5: variant validity against the live catalog (oc-v2-fixbundle)
# ---------------------------------------------------------------------------


MODELS_KV_KEY = "models-dev:catalog"


def _live_roster() -> set[str] | None:
    try:
        proc = subprocess.run(
            ["opencode", "models"], capture_output=True, text=True, timeout=60
        )
    except FileNotFoundError:
        print("FAIL: `opencode` binary not found on PATH")
        return None
    if proc.returncode != 0:
        print(f"FAIL: `opencode models` exited {proc.returncode}: {proc.stderr.strip()}")
        return None
    return set(proc.stdout.split())


def _live_efforts() -> dict[str, list[str]] | None:
    """{provider/model: [effort values]} from the models-dev catalog KV."""
    import sqlite3

    db = Path.home() / ".local" / "share" / "opencode" / "opencode.db"
    if not db.is_file():
        print(f"FAIL: catalog KV source {db} not found")
        return None
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        try:
            row = con.execute(
                "select value from kv where key=?", (MODELS_KV_KEY,)
            ).fetchone()
        finally:
            con.close()
    except sqlite3.Error as e:
        print(f"FAIL: catalog KV unreadable: {e}")
        return None
    if not row:
        print(f"FAIL: kv {MODELS_KV_KEY!r} empty — run opencode once to hydrate the catalog")
        return None
    try:
        body = json.loads(json.loads(row[0])["body"])
    except (ValueError, KeyError, TypeError) as e:
        print(f"FAIL: catalog KV parse error: {e}")
        return None
    efforts: dict[str, list[str]] = {}
    for pid, prov in body.items():
        for mid, model in (prov.get("models") or {}).items():
            for opt in model.get("reasoning_options") or []:
                if opt.get("type") == "effort":
                    efforts[f"{pid}/{mid}"] = list(opt.get("values") or [])
    return efforts


def check_variants(
    pins: dict[str, str] | None = None,
    roster: set[str] | None = None,
    efforts: dict[str, list[str]] | None = None,
) -> int:
    """Every emitted model#variant must resolve on the live catalog.

    The #max-class error (PR-8 R4: qwen3.8-max has no #max effort) is caught
    here — never shipped. `roster`/`efforts` injection is for the self-test.
    """
    if pins is None:
        pins = agent_pin_map()
    if roster is None:
        roster = _live_roster()
        if roster is None:
            return 1
    if efforts is None:
        efforts = _live_efforts()
        if efforts is None:
            return 1
    failures = 0
    print(f"{'agent':<22} {'pin':<38} roster efforts verdict")
    for name, pin in pins.items():
        base, _, variant = pin.partition("#")
        ok = True
        notes = []
        if base not in roster:
            ok = False
            notes.append("not on live roster")
        if variant:
            model_efforts = efforts.get(base)
            if model_efforts is None:
                ok = False
                notes.append("no effort options in catalog")
            elif variant not in model_efforts:
                ok = False
                notes.append(f"variant not in {model_efforts}")
        failures += 0 if ok else 1
        print(
            f"{name:<22} {pin:<38} {'yes' if base in roster else 'NO':<7} "
            f"{variant or '-':<7} {'PASS' if ok else 'FAIL: ' + '; '.join(notes)}"
        )
    print("check-variants: PASS" if failures == 0 else f"check-variants: FAIL ({failures} invalid)")
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
        (root / "opencode.json").write_text(OPENCODE_JSON.read_text(encoding="utf-8"))

        # Clean tree passes both gates (incl. the new opencode.json leg).
        err, _ = check_tokens(skills_copy, agents_copy)
        if err:
            failures.append(f"clean tree: token check reported {err[:3]}")
        err, _ = check_drift(agents_copy, skills_copy, repo_root=root)
        if err:
            failures.append(f"clean tree: drift check reported {err[:3]}")

        # Deliberately-broken routing token must be caught, with file:line.
        # (pipe-port-m2: the omo category=/load_skills= grammars are retired
        # from skills/; seed from the native subagent_type grammar instead.)
        victim = skills_copy / "sisyphus-plan" / "SKILL.md"
        text = victim.read_text(encoding="utf-8")
        victim.write_text(
            text.replace('subagent_type="brief-loader"', 'subagent_type="brief-lodr"', 1)
        )
        err, _ = check_tokens(skills_copy, agents_copy)
        if not any("brief-lodr" in e and "sisyphus-plan/SKILL.md:" in e for e in err):
            failures.append(f"broken token not caught: {err[:3]}")

        # Deliberate drift must be caught.
        drifted = agents_copy / "brief-loader.md"
        if drifted.is_file():
            drifted.write_text(drifted.read_text(encoding="utf-8") + "\nhand edit\n")
        else:
            failures.append("self-test setup: brief-loader.md not generated")
        err, _ = check_drift(agents_copy, skills_copy, repo_root=root)
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

        # A model/variant line in ANY agents/*.md must be caught (the map is
        # the sole pin authority; a valid file pin overrides it).
        pre = agents_copy / "sisyphus.md"
        pre_lines = pre.read_text(encoding="utf-8").split("\n")
        close = next(i for i, l in enumerate(pre_lines[1:], start=1) if l.strip() == "---")
        pre_lines.insert(close, "model: zai-coding-plan/glm-5.3")
        pre.write_text("\n".join(pre_lines), encoding="utf-8")
        err, _ = check_drift(agents_copy, skills_copy, repo_root=root)
        if not any("sisyphus.md carries model pin" in e for e in err):
            failures.append(f"file model-pin override hazard not caught: {err[:3]}")

        # Schema violation (bare-array permission — the exact shape the 2.1.0
        # loader silently drops) must be caught.
        schema_victim = agents_copy / "reference-checker.md"
        schema_victim.write_text(
            schema_victim.read_text(encoding="utf-8").replace(
                "permission:\n", "permission: [read, grep]\n", 1
            )
        )
        err = check_agent_md_schema(schema_victim)
        if not any("bare array" in e for e in err):
            failures.append(f"schema violation (bare array) not caught: {err[:3]}")

        # Drifted opencode.json agent map must be caught.
        oc = json.loads((root / "opencode.json").read_text(encoding="utf-8"))
        oc["agent"]["brief-loader"]["variant"] = "max"
        (root / "opencode.json").write_text(json.dumps(oc, indent=2) + "\n")
        err, _ = check_drift(agents_copy, skills_copy, repo_root=root)
        if not any("opencode.json `agent` map" in e for e in err):
            failures.append(f"opencode.json agent-map drift not caught: {err[:3]}")

    # The #max-class variant error (R4) must be caught, never shipped:
    # qwen3.8-max has no #max effort on the (seeded) live catalog.
    seeded_roster = {
        "zai-coding-plan/glm-5.3", "zai-coding-plan/glm-5.3-flash",
        "opencode-go/qwen3.8-max", "opencode-go/gpt-5.6-luna",
        "opencode-go/kimi-k3",
    }
    seeded_efforts = {
        "zai-coding-plan/glm-5.3": ["low", "high", "max"],
        "zai-coding-plan/glm-5.3-flash": ["low", "high", "max"],
        "opencode-go/qwen3.8-max": ["low", "medium", "xhigh"],
        "opencode-go/gpt-5.6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
        "opencode-go/kimi-k3": ["max"],
    }
    if check_variants(
        pins={"ultrabrain-lane": "opencode-go/qwen3.8-max#max"},
        roster=seeded_roster, efforts=seeded_efforts,
    ) == 0:
        failures.append("variant check passed an invalid #max pin (R4 class)")
    if check_variants(
        pins={"ultrabrain-lane": "opencode-go/qwen3.8-max#xhigh"},
        roster=seeded_roster, efforts=seeded_efforts,
    ) != 0:
        failures.append("variant check rejected a valid #xhigh pin")

    # Source-override legs (subprocess: the override applies at import).
    gen = [sys.executable, str(REPO_ROOT / "scripts" / "generate-pipeline-personas.py")]
    fixture = str(REPO_ROOT / "omo.ddd.jsonc")

    # a. the committed variant reproduces the committed surfaces (--check).
    proc = subprocess.run(gen + ["--omo-source", fixture, "--check"],
                          capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        failures.append(
            f"override --check against {fixture} failed: {(proc.stdout + proc.stderr).strip()[:200]}"
        )

    # b. env override accepted.
    env = dict(os.environ, OMO_JSONC_PATH=fixture)
    proc = subprocess.run(gen + ["--list"], capture_output=True, text=True,
                          timeout=120, env=env)
    if proc.returncode != 0 or "brief-loader" not in proc.stdout:
        failures.append(f"OMO_JSONC_PATH override failed: {(proc.stdout + proc.stderr).strip()[:200]}")

    # c. absent CONFIGURED source refuses (no silent fallback to the live file).
    proc = subprocess.run(gen + ["--omo-source", "/nonexistent/omo-fixture.jsonc", "--list"],
                          capture_output=True, text=True, timeout=120)
    out = proc.stdout + proc.stderr
    if proc.returncode == 0 or "nonexistent/omo-fixture" not in out or "fail" not in out.lower():
        failures.append(f"absent configured source did not refuse: rc={proc.returncode} {out[:200]}")

    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        print("self-test: FAIL")
        return 1
    print("self-test: PASS (clean pass + broken token + drift + DAG + file-pin hazard + schema catch + json map + variant catch + source-override/refusal legs all proven)")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--omo-source",
        metavar="PATH",
        default=None,
        help=(
            "pin source override (default: live ~/.omo/omo.jsonc; env "
            "OMO_JSONC_PATH). CI uses the committed repo-root variant "
            "(omo.ddd.jsonc). Applied at import time - the flag is accepted "
            "here for --help visibility. Fail-closed when absent."
        ),
    )
    mutex = parser.add_mutually_exclusive_group()
    mutex.add_argument("--write", action="store_true", help="(default) regenerate agents/*.md")
    mutex.add_argument("--check", action="store_true", help="drift gate; exit 1 on drift")
    mutex.add_argument("--check-tokens", action="store_true", help="routing-token resolution")
    mutex.add_argument("--check-dag", action="store_true", help="DAG edge-vs-permission assertion")
    mutex.add_argument("--check-pins", action="store_true", help="live-roster pin resolution")
    mutex.add_argument(
        "--check-variants",
        action="store_true",
        help="variant validity against the live catalog (R4 catch)",
    )
    mutex.add_argument("--self-test", action="store_true", help="gate self-test")
    mutex.add_argument("--list", action="store_true", help="print generated file names")
    args = parser.parse_args()

    if args.list:
        for name in persona_names():
            print(name)
        return 0
    if args.check_pins:
        return check_pins()
    if args.check_variants:
        return check_variants()
    if args.self_test:
        return self_test()
    if args.check:
        errors, count = check_drift(AGENTS_DIR, SKILLS_DIR)
        for e in errors:
            print(f"FAIL: {e}")
        if errors:
            print(f"drift gate: FAIL ({len(errors)} error(s))")
            return 1
        print(f"drift gate: PASS ({count} generated files schema-clean + no file pins + opencode.json map match)")
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
    if write_opencode_agent_map():
        print("wrote opencode.json agent map (pin authority)")
    else:
        print("opencode.json agent map already current")
    print(f"generate: {len(written)} persona files written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
