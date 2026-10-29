#!/usr/bin/env python3
"""generate-pipeline-personas.py — single source of truth for the pipeline persona files.

Ship pipe-port-m1 (2026-10-21). The macro-methodology pipeline's personas move
from dormant omo routing to fleet-owned generated files under agents/. This
script owns the port map (categories, pins, injection modes, delegation DAG)
extracted by the pipe-port-m0 manifest
(/home/vladi/firstmate/data/pipe-port-m0/report.md) and renders every
generated persona file from it. Edit the map here, never the emitted files.

oc-v2-fixbundle (2026-10-21, PR-8 decisions 1+2), re-pointed by omo-retire
(2026-10-22): the PIN-AUTHORING surface is the per-desk REPO VARIANT at the
repo root (omo.ddd.jsonc / omo.tnt.jsonc). This generator LIVE-READS the
resolved variant (never a snapshot - manifest lesson WARNING-5) and derives
every model pin from it. The source is resolved exactly like
scripts/deploy-omo.sh: hostname tnt -> omo.tnt.jsonc, hostname
dropdeaddev -> omo.ddd.jsonc. Resolution order: the --omo-source flag or
OMO_JSONC_PATH env override the default, and the generator fail-closes when
the RESOLVED source is absent (or the hostname has no variant case) - never
a silent fallback, never the retired live ~/.omo path (the plugin and its
central config are retired; the desk-side ~/.omo file is move-aside'd by
firstmate). The hostname default means every desk resolves its own tracked
variant with no flags, while CI points OMO_JSONC_PATH at the committed
repo-root variant (omo.ddd.jsonc), so the committed surfaces must reproduce
from a committed source on every push:
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
                    `agent` map) against the RESOLVED per-desk repo variant
  --check-tokens    every routing token in skills/ resolves to a category
                    stanza (port map) or a file agent (agents/*.md) or a skill
  --check-dag       DAG edge-vs-permission assertion (§9 edges == task allows)
  --check-pins      pin-resolution table against the live `opencode models`
                   roster (read-only CLI call; environment-dependent, manual)
  --check-variants  variant-validity leg: every emitted model#variant against
                    the live catalog (roster via `opencode models` + reasoning
                    efforts from the models-dev catalog KV); the #max-class
                    error (R4) is caught here (environment-dependent, manual)
  --check-variant-parity
                    pin->execution parity leg (P1-a, 2026-10-22): every recent
                    session row that ran an emitted agent must carry that
                    agent's pinned model+variant (rows read read-only from the
                    opencode session store - the sweep's evidence method).
                    Catches both the variant-drift class and the
                    pin-not-applied class (rows that ran the agent label on
                    default resolution). Environment-dependent, manual.
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
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = REPO_ROOT / "skills"
AGENTS_DIR = REPO_ROOT / "agents"
OPENCODE_JSON = REPO_ROOT / "opencode.json"


# Hostname -> per-desk repo variant (mirror of scripts/deploy-omo.sh's case
# table; omo-query.js carries the same mapping for the guard readers). Add a
# case here AND in deploy-omo.sh when a new desk joins.
OMO_VARIANTS = {
    "tnt": "omo.tnt.jsonc",
    "dropdeaddev": "omo.ddd.jsonc",
}


def resolve_omo_path() -> tuple[Path, str]:
    """The configured pin source: --omo-source flag > OMO_JSONC_PATH env >
    the hostname-resolved per-desk REPO VARIANT at the repo root (mirror of
    deploy-omo.sh). Returns (path, how_configured) — the caller fail-closes
    when the RESOLVED source is absent and this fail-closes on an unknown
    hostname; no silent fallback, never the retired live ~/.omo path.
    """
    for i, arg in enumerate(sys.argv[1:], start=1):
        if arg == "--omo-source" and i + 1 < len(sys.argv):
            return Path(sys.argv[i + 1]).expanduser(), "--omo-source flag"
        if arg.startswith("--omo-source="):
            return Path(arg.split("=", 1)[1]).expanduser(), "--omo-source flag"
    env = os.environ.get("OMO_JSONC_PATH")
    if env:
        return Path(env).expanduser(), "OMO_JSONC_PATH env"
    host = socket.gethostname().strip().lower()
    variant = OMO_VARIANTS.get(host)
    if variant is None:
        raise SystemExit(
            f"FAIL: unknown hostname '{host}' — no per-desk omo variant case "
            "(mirror scripts/deploy-omo.sh's table in OMO_VARIANTS, or pass "
            "--omo-source / set OMO_JSONC_PATH explicitly)."
        )
    return REPO_ROOT / variant, f"repo variant (host {host})"


OMO_PATH, OMO_SOURCE_CONFIG = resolve_omo_path()
MANIFEST = "pipe-port-m0 manifest (/home/vladi/firstmate/data/pipe-port-m0/report.md)"
GENERATOR = "scripts/generate-pipeline-personas.py"


# ---------------------------------------------------------------------------
# Live pin source — the per-desk REPO VARIANT (omo-retire, 2026-10-22; was
# ~/.omo/omo.jsonc under oc-v2-fixbundle, PR-8 decision 1).
# The file is READ LIVE at every invocation (never snapshotted into the repo —
# manifest lesson WARNING-5). After the captain edits the resolved repo
# variant, --check fails until the generator is re-run and the output
# committed: that drift IS the wire from the authoring surface to the emitted
# pins.
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
            f"FAIL: pin source {OMO_PATH} not found (resolved via "
            f"{OMO_SOURCE_CONFIG}) — the generator derives every pin from "
            "the resolved omo source and will not fall back silently. "
            "Pass --omo-source / set OMO_JSONC_PATH to point at a committed "
            "source (the repo-root omo.<desk>.jsonc variants are the "
            "intended fixture)."
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


# Ladder rung renames (P2-b, documented deviations like VARIANT_ALIASES):
# omo-authored fallback models that are DEAD on the live roster, remapped
# to the live successor seat so the emitted chain never carries a broken
# rung (verified against the live roster + catalog efforts; the
# --check-variants leg re-proves every emitted rung on demand).
RUNG_RENAMES = {
    # grok-4.6 retired upstream; grok-4.7 carries the same seat (efforts
    # [low, medium, high, xhigh] include the authored "high").
    ("opencode-go/grok-4.6", "high"): ("opencode-go/grok-4.7", "high"),
    ("opencode-go/grok-4.6", "max"): ("opencode-go/grok-4.7", "xhigh"),
    ("opencode-go/grok-4.6", None): ("opencode-go/grok-4.7", None),
}

# Authored rung variants the live catalog cannot serve (2026-10-22
# --check-variants evidence): remapped to the nearest runnable top effort
# where one exists.
RUNG_VARIANT_ALIASES = {
    ("opencode-go/qwen3.8-max", "high"): "xhigh",
}

# Authored rung variants with NO runnable equivalent on that model: drop
# the variant (the rung serves the model default) — a rung carrying an
# un-runnable variant would fail VariantUnavailable at switch time and
# break the chain.
RUNG_VARIANT_DROPS = {
    ("opencode-go/kimi-k2.7-code", "high"),
    ("opencode-go/kimi-k2.7-code", "medium"),
    ("opencode/glm-5.3", "medium"),
}

# Rung models DEAD on the live roster (2026-10-22): dropped from the
# emission so chains never carry a rung the resolver cannot serve.
RUNG_MODEL_DROPS = {
    "opencode-go/deepseek-v4-flash-vision-exp",
    "opencode/ling-3.0-flash-fin-free",
}


def _rung_pin(entry: dict) -> str | None:
    """One omo fallback entry -> an emitted rung pin ("p/m" or "p/m#v")."""
    model = entry.get("model")
    if not isinstance(model, str) or "/" not in model:
        return None
    if model in RUNG_MODEL_DROPS:
        return None
    variant = resolve_variant(model, entry.get("reasoning"))
    model, variant = RUNG_RENAMES.get((model, variant), (model, variant))
    if variant is not None:
        variant = RUNG_VARIANT_ALIASES.get((model, variant), variant)
        if (model, variant) in RUNG_VARIANT_DROPS:
            variant = None
    return f"{model}#{variant}" if variant else model


def render_model_fallback() -> dict[str, list[str]]:
    """The `model_fallback` ladder map (P2-b): primary base -> ordered rungs.

    Derived live from the resolved variant's fallback_models stanzas (the
    omo-era inert records made live through the V2-native model-fallback
    plugin): every stanza sharing a primary contributes its rungs (deduped,
    first-seen wins), then the union is ordered by the captain's ladder
    classes — opencode-go (paid-cheap) first, other providers next,
    opencode PAYG (`opencode/…`) LAST — so no seat's authored ordering can
    strand a pay-as-you-go rung mid-chain. The key is the BARE primary
    (runtime matches providerID/id only)."""
    out: dict[str, list[str]] = {}
    stanzas = list(OMO_AGENTS.values()) + list(OMO_CATEGORIES.values())
    for stanza in stanzas:
        primary = stanza.get("model")
        entries = stanza.get("fallback_models")
        if not isinstance(primary, str) or "/" not in primary:
            continue
        if not isinstance(entries, list):
            continue
        rungs = out.setdefault(primary, [])
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            pin = _rung_pin(entry)
            if pin and pin not in rungs:
                rungs.append(pin)

    def ladder_class(rung: str) -> int:
        if rung.startswith("opencode-go/"):
            return 0
        if rung.startswith("opencode/"):
            return 2
        return 1

    return {
        primary: sorted(rungs, key=ladder_class)
        for primary, rungs in out.items()
        if rungs
    }


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
# the resolved per-desk repo variant (the pin-authoring surface). The dict
# below fixes only which categories the pipeline personas route through; a
# category missing from the resolved omo source fails the generator closed.
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
        f"FAIL: resolved source {OMO_PATH} is missing pipeline categories: {_missing}"
    )

CATEGORIES = {name: _pin_fields(OMO_CATEGORIES[name]) for name in sorted(PIPELINE_CATEGORIES)}

# Permission profiles (conservative; sisyphus-gates stays the real enforcement
# layer, these are defense-in-depth per-seat postures matching the existing
# agents/*.md house style).
#
# P2-a (fm/backlog-impl, captain ruling 2026-10-22: follow V2): the profiles
# are V2-NATIVE rules — {action, resource, effect} objects in an ORDERED
# array (last-match-wins, author order is policy) using V2 action names
# (shell, not bash; subagent, not task; edit, not write/patch). Tuning
# (temperature/top_p) rides the native `request.body` form so generated
# files decode on the NATIVE path — a file mixing V1 keys (temperature)
# with the native `permissions` array decodes through the legacy migrator,
# which knows `permission:` (singular map) only and silently drops the
# native array (source: config/plugin/agent.ts decode() + v1 migrate).
PROFILES = {
    "readonly": [
        {"action": "read", "resource": "*", "effect": "allow"},
        {"action": "edit", "resource": "*", "effect": "deny"},
        {"action": "shell", "resource": "*", "effect": "deny"},
        {"action": "websearch", "resource": "*", "effect": "allow"},
        {"action": "webfetch", "resource": "*", "effect": "allow"},
    ],
    "gate-runner": [
        {"action": "read", "resource": "*", "effect": "allow"},
        {"action": "edit", "resource": "*", "effect": "deny"},
        {"action": "shell", "resource": "*", "effect": "ask"},
        {"action": "shell", "resource": "npm test*", "effect": "allow"},
        {"action": "shell", "resource": "npm run *", "effect": "allow"},
        {"action": "shell", "resource": "node *", "effect": "allow"},
        {"action": "shell", "resource": "python3 *", "effect": "allow"},
        {"action": "shell", "resource": "bash *", "effect": "allow"},
        {"action": "shell", "resource": "git status*", "effect": "allow"},
        {"action": "shell", "resource": "git log*", "effect": "allow"},
        {"action": "shell", "resource": "git diff*", "effect": "allow"},
        {"action": "shell", "resource": "ls *", "effect": "allow"},
        {"action": "shell", "resource": "grep *", "effect": "allow"},
        {"action": "shell", "resource": "find *", "effect": "allow"},
        {"action": "shell", "resource": "cat *", "effect": "allow"},
        {"action": "shell", "resource": "wc *", "effect": "allow"},
        {"action": "shell", "resource": "rm *", "effect": "deny"},
        {"action": "shell", "resource": "sudo *", "effect": "deny"},
        {"action": "websearch", "resource": "*", "effect": "allow"},
        {"action": "webfetch", "resource": "*", "effect": "allow"},
    ],
    "writer": [
        {"action": "read", "resource": "*", "effect": "allow"},
        {"action": "edit", "resource": "*", "effect": "ask"},
        {"action": "shell", "resource": "*", "effect": "ask"},
        {"action": "shell", "resource": "ls *", "effect": "allow"},
        {"action": "shell", "resource": "grep *", "effect": "allow"},
        {"action": "shell", "resource": "find *", "effect": "allow"},
        {"action": "shell", "resource": "cat *", "effect": "allow"},
        {"action": "shell", "resource": "wc *", "effect": "allow"},
        {"action": "shell", "resource": "git status*", "effect": "allow"},
        {"action": "shell", "resource": "git log*", "effect": "allow"},
        {"action": "shell", "resource": "git diff*", "effect": "allow"},
        {"action": "shell", "resource": "rm *", "effect": "deny"},
        {"action": "shell", "resource": "sudo *", "effect": "deny"},
        {"action": "websearch", "resource": "*", "effect": "allow"},
        {"action": "webfetch", "resource": "*", "effect": "allow"},
    ],
    # writer + bd: issue filing is the seat's whole job; bd's append-only
    # subcommands are phase-agnostic and the destructive ones stay gated by
    # the sisyphus-gates plugin.
    "writer-bd": [
        {"action": "read", "resource": "*", "effect": "allow"},
        {"action": "edit", "resource": "*", "effect": "ask"},
        {"action": "shell", "resource": "*", "effect": "ask"},
        {"action": "shell", "resource": "bd *", "effect": "allow"},
        {"action": "shell", "resource": "ls *", "effect": "allow"},
        {"action": "shell", "resource": "grep *", "effect": "allow"},
        {"action": "shell", "resource": "find *", "effect": "allow"},
        {"action": "shell", "resource": "cat *", "effect": "allow"},
        {"action": "shell", "resource": "wc *", "effect": "allow"},
        {"action": "shell", "resource": "git status*", "effect": "allow"},
        {"action": "shell", "resource": "git log*", "effect": "allow"},
        {"action": "shell", "resource": "git diff*", "effect": "allow"},
        {"action": "shell", "resource": "rm *", "effect": "deny"},
        {"action": "shell", "resource": "sudo *", "effect": "deny"},
        {"action": "websearch", "resource": "*", "effect": "allow"},
        {"action": "webfetch", "resource": "*", "effect": "allow"},
    ],
    "executor": [
        {"action": "read", "resource": "*", "effect": "allow"},
        {"action": "edit", "resource": "*", "effect": "ask"},
        {"action": "shell", "resource": "*", "effect": "ask"},
        {"action": "shell", "resource": "npm test*", "effect": "allow"},
        {"action": "shell", "resource": "npm run *", "effect": "allow"},
        {"action": "shell", "resource": "node *", "effect": "allow"},
        {"action": "shell", "resource": "python3 *", "effect": "allow"},
        {"action": "shell", "resource": "bash *", "effect": "allow"},
        {"action": "shell", "resource": "tsc --noEmit", "effect": "allow"},
        {"action": "shell", "resource": "git status*", "effect": "allow"},
        {"action": "shell", "resource": "git log*", "effect": "allow"},
        {"action": "shell", "resource": "git diff*", "effect": "allow"},
        {"action": "shell", "resource": "ls *", "effect": "allow"},
        {"action": "shell", "resource": "grep *", "effect": "allow"},
        {"action": "shell", "resource": "find *", "effect": "allow"},
        {"action": "shell", "resource": "cat *", "effect": "allow"},
        {"action": "shell", "resource": "wc *", "effect": "allow"},
        {"action": "shell", "resource": "rm *", "effect": "ask"},
        {"action": "shell", "resource": "sudo *", "effect": "deny"},
        {"action": "websearch", "resource": "*", "effect": "allow"},
        {"action": "webfetch", "resource": "*", "effect": "allow"},
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
    """V2-native permissions rules array (P2-a): {action, resource, effect}
    objects, ordered (last-match-wins). The subagent DAG rules append after
    the profile: deny-all first, then one allow per callee, so callees win.
    """
    rules = list(PROFILES[profile])
    rules.append({"action": "subagent", "resource": "*", "effect": "deny"})
    for callee in allows:
        rules.append({"action": "subagent", "resource": callee, "effect": "allow"})
    lines = ["permissions:"]
    for rule in rules:
        lines.append(f"  - action: {rule['action']}")
        lines.append(f"    resource: {yaml_quote(rule['resource'])}")
        lines.append(f"    effect: {rule['effect']}")
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
        f"name: {name}",
        f"# Generated by {GENERATOR} (pipe-port-m1) - DO NOT EDIT by hand.",
        f"# Port map source: {MANIFEST}, sections 1/4/9 - mode {mode_word}.",
        f"# Pin (model+variant) derives live from the per-desk repo omo",
        f"# variant (omo.<desk>.jsonc) category",
        f"# {p['category']} (variant aliases applied) and is applied by the",
        f"# emitted opencode.json agent map - the SOLE pin authority. This file",
        f"# deliberately carries NO model line: a valid model pin here would",
        f"# override the map (files apply after JSON and win fields they define",
        f"# under opencode 2.1.0; sis lane answer 2026-10-21).",
        f"# Permissions are V2-NATIVE (P2-a, captain ruling 2026-10-22): an",
        f"# ordered action/resource/effect rules array; tuning rides",
        f"# request.body so the file decodes on the NATIVE path (a V1 key like",
        f"# bare temperature would reroute the file through the legacy",
        f"# migrator and silently drop the native permissions array).",
        f"description: {yaml_quote(p['description'])}",
        "mode: subagent",
    ]
    if cat["temperature"] is not None or cat.get("top_p") is not None:
        fm.append("request:")
        fm.append("  body:")
        if cat["temperature"] is not None:
            fm.append(f"    temperature: {cat['temperature']}")
        if cat.get("top_p") is not None:
            fm.append(f"    top_p: {cat['top_p']}")
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
    written.extend(sync_preexisting_native_permissions(agents_dir))
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


# P2-a: V1 permission-map keys -> V2 action names (the same renames the
# upstream migrator applies, normalizeAction in v1/config/migrate.ts).
ACTION_RENAMES = {"bash": "shell", "task": "subagent", "write": "edit", "patch": "edit"}


def _port_permission_block(fm_lines: list[str]) -> tuple[list[str], list[str]]:
    """Split a frontmatter's V1 `permission:` block into (remaining, rules).

    Parses the hand-authored dialect actually present in agents/*.md:
      permission:
        read:
          "*": allow
        edit: deny
        bash:
          "*": ask
          "grep *": allow
    Rules preserve written order (last-match-wins is the policy in BOTH
    dialects). Returns the lines with the block removed and the V2-native
    rule tuples.
    """
    rules: list[tuple[str, str, str]] = []
    out: list[str] = []
    i = 0
    in_block = False
    tool_re = re.compile(r'^  ([\w"*.-]+):(.*)$')
    pattern_re = re.compile(r'^    (["\'][^"\']*["\']|\S+):\s*(\w+)\s*$')
    while i < len(fm_lines):
        line = fm_lines[i]
        if not in_block:
            if re.match(r'^permission:\s*$', line):
                in_block = True
                i += 1
                continue
            out.append(line)
            i += 1
            continue
        # inside the permission block: tool / pattern lines, until the next
        # top-level key (indent 0) or end of frontmatter.
        if line.strip() and not line.startswith(" "):
            in_block = False
            out.append(line)
            i += 1
            continue
        tm = tool_re.match(line)
        if tm:
            tool = tm.group(1).strip('"\'')
            action = ACTION_RENAMES.get(tool, tool)
            rest = tm.group(2).strip()
            if rest:
                effect = rest.strip('"\'')
                rules.append((action, "*", effect))
            i += 1
            continue
        pm = pattern_re.match(line)
        if pm:
            resource = pm.group(1).strip('"\'')
            rules.append((action, resource, pm.group(2)))
            i += 1
            continue
        i += 1  # blank/other line inside block: drop with the block
    return out, rules


def _render_native_rules(rules: list[tuple[str, str, str]]) -> list[str]:
    lines = ["permissions:"]
    for action, resource, effect in rules:
        lines.append(f"  - action: {action}")
        lines.append(f"    resource: {yaml_quote(resource)}")
        lines.append(f"    effect: {effect}")
    return lines


def sync_preexisting_native_permissions(agents_dir: Path) -> list[str]:
    """P2-a port of the hand-authored files: V1 `permission:` maps (plus bare
    temperature/top_p keys) become V2-native `permissions:` arrays and
    `request.body` tuning, so every pre-existing file decodes on the NATIVE
    path (V1 keys in the same frontmatter would reroute the file through
    the legacy migrator, which drops native arrays). Mechanical, idempotent;
    every other byte preserved.
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
        fm = lines[:close]
        rest = lines[close:]
        fm, rules = _port_permission_block(fm)
        # bare V1 tuning keys -> native request.body
        temperature = next((l.split(":", 1)[1].strip() for l in fm if l.startswith("temperature:")), None)
        top_p = next((l.split(":", 1)[1].strip() for l in fm if l.startswith("top_p:")), None)
        fm = [l for l in fm if not l.startswith(("temperature:", "top_p:"))]
        # `load_skills:` is not a native key: left in place it reroutes the
        # file onto the legacy decode path (which then drops the native
        # permissions array — worse than inert). The load instruction moves
        # into the body (the mode-B pattern the generated on-demand seats
        # use); the named skills are real repo skills.
        load_names: list[str] = []
        kept: list[str] = []
        in_ls = False
        for l in fm:
            if re.match(r"^load_skills:\s*$", l):
                in_ls = True
                continue
            if in_ls:
                lm = re.match(r"^\s+-\s+(\S+)\s*$", l)
                if lm:
                    load_names.append(lm.group(1))
                    continue
                in_ls = False
            kept.append(l)
        fm = kept
        if rules:
            fm.extend(_render_native_rules(rules))
        if temperature is not None or top_p is not None:
            fm.append("request:")
            fm.append("  body:")
            if temperature is not None:
                fm.append(f"    temperature: {temperature}")
            if top_p is not None:
                fm.append(f"    top_p: {top_p}")
        new_lines = fm + rest
        if load_names:
            body_line = "On every task, first load " + " and ".join(
                f"skills/{name}/SKILL.md" for name in load_names
            ) + " and follow it as your binding contract - never act from memory of it."
            # rest[0] is the closing ---; the instruction becomes the first
            # body line (mode-B pattern).
            new_lines = fm + [rest[0], "", body_line, ""] + rest[1:]
        new_text = "\n".join(new_lines)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            changed.append(f"{name}.md")
    return changed


# ---------------------------------------------------------------------------
# opencode.json emission (pin authority; oc-v2-fixbundle)
# ---------------------------------------------------------------------------


def write_opencode_agent_map(repo_root: Path = REPO_ROOT) -> bool:
    """Set the `agent` map + `model_fallback` ladder map in opencode.json.

    Every other key in the file is preserved byte-for-value; `agent` is
    placed right after `default_agent` (or appended) and `model_fallback`
    right after `agent`, for a deterministic, diff-stable layout.
    """
    path = repo_root / "opencode.json"
    cfg = json.loads(path.read_text(encoding="utf-8"))
    rendered = render_agent_config()
    ladders = render_model_fallback()
    if cfg.get("agent") == rendered and cfg.get("model_fallback") == ladders:
        return False
    # Drop the stale ladder map up front: re-copying the pre-existing key
    # after inserting the fresh one would clobber the new emission.
    cfg.pop("model_fallback", None)
    new_cfg: dict = {}
    inserted_agent = False
    inserted_ladder = False
    for key, value in cfg.items():
        if key == "agent":
            # Pre-existing agent map: overwrite with the fresh emission -
            # copying `value` here would resurrect the stale map AFTER the
            # default_agent insertion above (the update case never shipped).
            new_cfg["agent"] = rendered
            inserted_agent = True
            if not inserted_ladder:
                new_cfg["model_fallback"] = ladders
                inserted_ladder = True
            continue
        new_cfg[key] = value
        if key == "default_agent" and not inserted_agent:
            new_cfg["agent"] = rendered
            inserted_agent = True
    if not inserted_agent:
        new_cfg["agent"] = rendered
    if not inserted_ladder:
        new_cfg["model_fallback"] = ladders
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

PERMITTED_FM_KEYS = {"description", "mode", "request", "permissions", "name"}
MODES = {"primary", "subagent", "all"}
ACTIONS = {"allow", "deny", "ask"}


def _parse_rules_array(block: list[str]) -> list[tuple[str, str, str]] | None:
    """Parse the rendered `permissions:` array form; None when not array-shaped."""
    rules: list[tuple[str, str, str]] = []
    action = resource = effect = None
    entries = 0
    for line in block:
        em = re.match(r"^  - action: (\S+)$", line)
        if em:
            if action is not None and (resource is None or effect is None):
                return None
            if action is not None:
                rules.append((action, resource, effect))
            action, resource, effect = em.group(1), None, None
            entries += 1
            continue
        rm = re.match(r'^    resource: ("(?:[^"\\]|\\.)*"|\S+)$', line)
        if rm:
            resource = rm.group(1)
            continue
        fm_ = re.match(r"^    effect: (\w+)$", line)
        if fm_:
            effect = fm_.group(1)
            continue
        return None
    if action is not None:
        if resource is None or effect is None:
            return None
        rules.append((action, resource, effect))
    return rules if entries else None


def check_agent_md_schema(path: Path) -> list[str]:
    """Structural schema check of one agent file's frontmatter (P2-a: the
    V2-native contract — description, mode, request, permissions array)."""
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
        if re.match(r"^(permission|temperature|top_p):", l):
            errors.append(
                f"{where}: frontmatter carries the V1 key {l.split(':')[0]!r} — P2-a "
                "port: use the native `permissions:` rules array (and request.body for "
                "tuning); a V1 key reroutes the file through the legacy migrator, which "
                "silently drops native arrays"
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
    name_m = re.search(r"^name: (\S+)$", text, re.M)
    if not name_m:
        errors.append(f"{where}: missing name")
    else:
        value = name_m.group(1)
        if not re.fullmatch(r"[a-z0-9-]+", value):
            errors.append(
                f"{where}: frontmatter name {value!r} does not match ^[a-z0-9-]+$"
            )
        if value != path.stem:
            errors.append(
                f"{where}: frontmatter name {value!r} does not match filename stem {path.stem!r}"
            )
    if not re.search(r"^description: ", text, re.M):
        errors.append(f"{where}: missing description")
    mode = re.search(r"^mode: (\S+)", text, re.M)
    if not mode:
        errors.append(f"{where}: missing mode")
    elif mode.group(1) not in MODES:
        errors.append(f"{where}: mode {mode.group(1)!r} not in {sorted(MODES)}")
    for num in ("temperature", "top_p"):
        m = re.search(rf"^    {num}: (\S+)$", text, re.M)
        if m and not re.fullmatch(r"-?\d+(?:\.\d+)?", m.group(1)):
            errors.append(f"{where}: request.body.{num} {m.group(1)!r} is not a number")
    perm_idx = next((i for i, l in enumerate(fm) if re.match(r"^permissions:", l)), None)
    if perm_idx is None:
        errors.append(f"{where}: missing permissions block")
    else:
        inline = re.match(r"^permissions:\s*(.*)$", fm[perm_idx]).group(1).strip()
        if inline:
            errors.append(
                f"{where}: permissions {inline[:40]!r} is inline — the native form is an "
                "array of {action, resource, effect} rules"
            )
        else:
            block: list[str] = []
            for l in fm[perm_idx + 1 :]:
                if re.match(r"^[a-z_]+:", l):
                    break
                block.append(l)
            rules = _parse_rules_array(block)
            if rules is None:
                if block:
                    errors.append(
                        f"{where}: permissions block is not the native rules-array shape "
                        "(silently dropped by the loader on decode failure)"
                    )
                else:
                    errors.append(f"{where}: empty permissions block")
            else:
                for action, resource, effect in rules:
                    if not re.fullmatch(r"\*|[a-z_]+", action):
                        errors.append(f"{where}: permissions action {action!r} is not an action name")
                    if not resource.strip('"'):
                        errors.append(f"{where}: permissions resource {resource!r} is empty")
                    if effect not in ACTIONS:
                        errors.append(f"{where}: permissions effect {effect!r} not in {sorted(ACTIONS)}")
    return errors


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
    # that fail decode; P2-a: every file (generated AND pre-existing, all
    # native since the port) must be schema-valid.
    for name in rendered:
        errors.extend(check_agent_md_schema(agents_dir / f"{name}.md"))
    for name in sorted(PREEXISTING_AGENTS):
        errors.extend(check_agent_md_schema(agents_dir / f"{name}.md"))
    # oc-v2-fixbundle: the opencode.json `agent` map is the emitted pin
    # authority — it must equal the live-derived emission.
    oc_path = repo_root / "opencode.json"
    try:
        cfg = json.loads(oc_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append("drift: opencode.json missing")
        cfg = None
    if cfg is not None:
        if cfg.get("agent") != render_agent_config():
            errors.append(
                "drift: opencode.json `agent` map differs from the omo-derived emission"
            )
        if cfg.get("model_fallback") != render_model_fallback():
            errors.append(
                "drift: opencode.json `model_fallback` ladder map differs from the "
                "omo-derived emission (the P2-b fallback chain source)"
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


def _subagent_rules_of(text: str) -> list[tuple[str, str, str]] | None:
    """The permissions rules array of an agent file (P2-a native form)."""
    m = re.search(r"^permissions:\n((?:  - .*\n(?:    .*\n)*)+)", text, re.MULTILINE)
    if not m:
        return None
    return _parse_rules_array(m.group(1).splitlines()) or []


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
        rules = _subagent_rules_of(text)
        if rules is None:
            errors.append(f"DAG: {name}.md has no native permissions rules array")
            continue
        allows = [resource.strip('"') for action, resource, effect in rules
                  if action == "subagent" and effect == "allow" and resource.strip('"') != "*"]
        if allows != expected:
            errors.append(
                f"DAG: {name}.md subagent allows {allows} != manifest §9 edges {expected}"
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
MODELS_KV_KEY_V2 = "models-dev:v2:catalog"


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


def _load_catalog_kv(db: Path, key: str) -> str | None:
    import sqlite3

    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        try:
            row = con.execute(
                "select value from kv where key=?", (key,)
            ).fetchone()
        finally:
            con.close()
    except sqlite3.Error as e:
        print(f"FAIL: catalog KV unreadable: {e}")
        return None
    return row[0] if row else None


def _live_efforts() -> dict[str, list[str]] | None:
    """{provider/model: [effort values]} from the models-dev catalog KV.

    Primary source is the v2 catalog KV (`models-dev:v2:catalog`, efforts
    under capabilities.reasoning.effort); falls back to the retired v1 key
    (`models-dev:catalog`, reasoning_options[]) for opencode builds whose
    local cache has not migrated yet.
    """
    db = Path.home() / ".local" / "share" / "opencode" / "opencode.db"
    if not db.is_file():
        print(f"FAIL: catalog KV source {db} not found")
        return None
    v2 = _load_catalog_kv(db, MODELS_KV_KEY_V2)
    efforts: dict[str, list[str]] = {}
    if v2:
        try:
            body = json.loads(json.loads(v2)["body"])
        except (ValueError, KeyError, TypeError) as e:
            print(f"FAIL: catalog KV parse error: {e}")
            return None
        for pid, prov in body.items():
            for mid, model in (prov.get("models") or {}).items():
                reasoning = (model.get("capabilities") or {}).get("reasoning") or {}
                vals = reasoning.get("effort") or []
                if vals:
                    efforts[f"{pid}/{mid}"] = list(vals)
        if efforts:
            return efforts
    v1 = _load_catalog_kv(db, MODELS_KV_KEY)
    if not v1:
        print(
            f"FAIL: kv {MODELS_KV_KEY_V2!r}/{MODELS_KV_KEY!r} empty — "
            "run opencode once to hydrate the catalog"
        )
        return None
    try:
        body = json.loads(json.loads(v1)["body"])
    except (ValueError, KeyError, TypeError) as e:
        print(f"FAIL: catalog KV parse error: {e}")
        return None
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
    ladders: dict[str, list[str]] | None = None,
) -> int:
    """Every emitted model#variant must resolve on the live catalog.

    The #max-class error (PR-8 R4: qwen3.8-max has no #max effort) is caught
    here — never shipped — and since P2-b every emitted model_fallback rung
    is held to the same bar (a dead rung breaks the chain). `roster`/
    `efforts`/`ladders` injection is for the self-test.
    """
    if pins is None:
        pins = agent_pin_map()
    if ladders is None and roster is None and efforts is None:
        ladders = render_model_fallback()
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
    # P2-b: every emitted ladder rung must also resolve (a dead rung breaks
    # the chain exactly like a dead pin breaks a seat).
    ladder_pins: dict[str, str] = {}
    for head, rungs in (ladders or {}).items():
        for i, rung in enumerate(rungs):
            ladder_pins[f"ladder:{head}[{i}]"] = rung
    for name, pin in ladder_pins.items():
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
            f"{name:<38} {pin:<38} {'yes' if base in roster else 'NO':<7} "
            f"{variant or '-':<7} {'PASS' if ok else 'FAIL: ' + '; '.join(notes)}"
        )
    print("check-variants: PASS" if failures == 0 else f"check-variants: FAIL ({failures} invalid)")
    return 1 if failures else 0


# ---------------------------------------------------------------------------
# Check 6: pin->execution variant parity from live session rows (P1-a,
# 2026-10-22). The sweep's evidence method: a pin is only TRUE if the session
# row that ran the agent carries the pinned model+variant. Probe-proven that
# day: zai-coding-plan/glm-5.3#max SERVES as max end-to-end on the explicit
# model path (row ses_e9c48021bffe..., variant "max"), while a row created
# with agent=<name> but no explicit model carries NO committed model and
# serves default resolution - the "aspirational report line" class. Both
# truths are exactly what this leg reports; it fails loudly on any row whose
# served model+variant != the emitted pin for its agent label.
# ---------------------------------------------------------------------------

SESSION_DB = Path.home() / ".local" / "share" / "opencode" / "opencode.db"
PARITY_DEFAULT_DAYS = 14


def _session_rows(db_path: Path = SESSION_DB, days: int = PARITY_DEFAULT_DAYS):
    """Recent session rows ({id, agent, model, created}) from the session store."""
    import sqlite3

    if not db_path.is_file():
        print(f"FAIL: session store {db_path} not found")
        return None
    cutoff_ms = (time.time() - days * 86400) * 1000
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            raw = con.execute(
                "select id, agent, model, time_created from session_v2 "
                "where time_created >= ? order by time_created desc",
                (cutoff_ms,),
            ).fetchall()
        finally:
            con.close()
    except sqlite3.Error as e:
        print(f"FAIL: session store unreadable: {e}")
        return None
    rows = []
    for sid, agent, model_json, created in raw:
        try:
            model = json.loads(model_json) if model_json else None
        except ValueError:
            model = None
        rows.append({"id": sid, "agent": agent, "model": model, "created": created})
    return rows


def _parity_row_verdict(pin: dict, row: dict) -> str | None:
    """None when the row served exactly the pin; else the divergence class."""
    model = row.get("model")
    if not isinstance(model, dict) or not model.get("id"):
        return "no model committed (default-resolution class - pin not applied)"
    served_base = f"{model.get('providerID')}/{model.get('id')}"
    pin_base = pin["model"]
    if served_base != pin_base:
        return f"served {served_base}"
    served_variant = model.get("variant") or "default"
    pin_variant = pin.get("variant") or "default"
    if served_variant != pin_variant:
        return f"variant {served_variant} != pin {pin_variant}"
    return None


def check_variant_parity(rows=None, pins=None, verbose=True) -> int:
    """Every recent row that ran an emitted agent must carry that agent's pin.

    Divergence classes (both fail loudly - an aspirational report line is
    exactly what this leg exists to kill):
      pin-not-applied  the row ran the agent label but committed no model
                       (default-resolution class) or a different base model
      variant-drift    the row served the pinned base under a different
                       variant than the emitted pin
    `rows`/`pins` injection is for the self-test.
    """
    if pins is None:
        pins = render_agent_config()
    if rows is None:
        rows = _session_rows()
        if rows is None:
            return 1
    by_agent: dict[str, list[dict]] = {}
    for row in rows:
        name = row.get("agent")
        if name in pins:
            by_agent.setdefault(name, []).append(row)
    if not by_agent:
        print("check-variant-parity: no recent rows carry an emitted agent label")
        return 0
    failures = 0
    if verbose:
        print(f"{'agent':<22} {'rows':>4}  {'pin':<38} verdict")
    for name in sorted(by_agent):
        pin = pins[name]
        pin_disp = pin["model"] + (f"#{pin['variant']}" if pin.get("variant") else "")
        bad = []
        for row in by_agent[name]:
            verdict = _parity_row_verdict(pin, row)
            if verdict is not None:
                bad.append((row["id"], verdict))
        failures += len(bad)
        if verbose:
            status = "PARITY" if not bad else f"DIVERGENT ({len(bad)}/{len(by_agent[name])})"
            print(f"{name:<22} {len(by_agent[name]):>4}  {pin_disp:<38} {status}")
            for sid, why in bad:
                print(f"    {sid}: {why}")
    print(
        "check-variant-parity: PASS"
        if failures == 0
        else f"check-variant-parity: FAIL ({failures} divergent row(s) - served model != pin; report lines must quote the row, not the pin)"
    )
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

        # Deliberate DAG violation (extra subagent allow) must be caught.
        dag_victim = agents_copy / "tdd-executor.md"
        if dag_victim.is_file():
            dag_victim.write_text(
                dag_victim.read_text(encoding="utf-8").replace(
                    '  - action: subagent\n    resource: "*"\n    effect: deny\n',
                    '  - action: subagent\n    resource: "*"\n    effect: deny\n'
                    '  - action: subagent\n    resource: "brief-loader"\n    effect: allow\n',
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

        # Schema violations must be caught: a V1 dialect key (the legacy
        # migrator path that silently drops native arrays) and a non-array
        # permissions value (the loader's silent-drop class).
        schema_victim = agents_copy / "reference-checker.md"
        schema_victim.write_text(
            schema_victim.read_text(encoding="utf-8").replace(
                "permissions:\n", "permissions: {read: allow}\n", 1
            )
        )
        err = check_agent_md_schema(schema_victim)
        if not any("not the native rules-array shape" in e or "inline" in e for e in err):
            failures.append(f"schema violation (non-array permissions) not caught: {err[:3]}")

        v1_victim = agents_copy / "archivist.md"
        v1_victim.write_text(
            v1_victim.read_text(encoding="utf-8").replace(
                "permissions:\n", "temperature: 0.1\npermissions:\n", 1
            )
        )
        err = check_agent_md_schema(v1_victim)
        if not any("V1 key" in e for e in err):
            failures.append(f"schema violation (V1 key beside native array) not caught: {err[:3]}")

        # Drifted opencode.json agent map must be caught.
        oc = json.loads((root / "opencode.json").read_text(encoding="utf-8"))
        oc["agent"]["brief-loader"]["variant"] = "max"
        (root / "opencode.json").write_text(json.dumps(oc, indent=2) + "\n")
        err, _ = check_drift(agents_copy, skills_copy, repo_root=root)
        if not any("opencode.json `agent` map" in e for e in err):
            failures.append(f"opencode.json agent-map drift not caught: {err[:3]}")

        # Drifted model_fallback ladder map must be caught (P2-b).
        oc = json.loads((root / "opencode.json").read_text(encoding="utf-8"))
        oc["model_fallback"] = {"stub/fail": ["stub/ok"]}
        (root / "opencode.json").write_text(json.dumps(oc, indent=2) + "\n")
        err, _ = check_drift(agents_copy, skills_copy, repo_root=root)
        if not any("model_fallback" in e for e in err):
            failures.append(f"opencode.json model_fallback drift not caught: {err[:3]}")
        # restore for the clean-copy invariant of later legs
        oc["model_fallback"] = render_model_fallback()
        (root / "opencode.json").write_text(json.dumps(oc, indent=2) + "\n")

    # The #max-class variant error (R4) must be caught, never shipped:
    # qwen3.8-max has no #max effort on the (seeded) live catalog.
    seeded_roster = {
        "zai-coding-plan/glm-5.3", "zai-coding-plan/glm-5.3-flash",
        "opencode-go/qwen3.8-max", "opencode-go/gpt-5.6-luna",
        "opencode-go/kimi-k3", "opencode-go/glm-5.3",
    }
    seeded_efforts = {
        "zai-coding-plan/glm-5.3": ["low", "high", "max"],
        "zai-coding-plan/glm-5.3-flash": ["low", "high", "max"],
        "opencode-go/qwen3.8-max": ["low", "medium", "xhigh"],
        "opencode-go/gpt-5.6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
        "opencode-go/kimi-k3": ["max"],
        "opencode-go/glm-5.3": ["low", "high", "max"],
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

    # P2-b ladder legs: a dead rung must be caught; a valid rung passes.
    if check_variants(
        pins={}, roster=seeded_roster, efforts=seeded_efforts,
        ladders={"zai-coding-plan/glm-5.3": ["opencode-go/grok-4.6#high"]},
    ) == 0:
        failures.append("rung check passed a dead ladder rung (grok-4.6 class)")
    if check_variants(
        pins={}, roster=seeded_roster, efforts=seeded_efforts,
        ladders={"zai-coding-plan/glm-5.3": ["opencode-go/glm-5.3#max"]},
    ) != 0:
        failures.append("rung check rejected a valid ladder rung")

    # Pin->execution parity (P1-a): the two divergence classes must be
    # caught, and a clean row set must pass. Seeded against the REAL
    # emission so the verdicts reflect live pins.
    live_pins = render_agent_config()
    parity_clean = [
        {"id": "ses_seed_ok1", "agent": "oracle",
         "model": {"id": "kimi-k3.1-pro", "providerID": "opencode-go", "variant": "max"}, "created": 1},
        {"id": "ses_seed_ok2", "agent": "archivist",
         "model": {"id": "glm-5.3-flash", "providerID": "zai-coding-plan"}, "created": 2},
    ]
    if check_variant_parity(rows=parity_clean, pins=live_pins, verbose=False) != 0:
        failures.append("parity check failed a clean row set")
    parity_bad = parity_clean + [
        {"id": "ses_seed_nomodel", "agent": "sisyphus", "model": None, "created": 3},
        {"id": "ses_seed_drift", "agent": "sisyphus",
         "model": {"id": "glm-5.3", "providerID": "zai-coding-plan", "variant": "high"}, "created": 4},
    ]
    if check_variant_parity(rows=parity_bad, pins=live_pins, verbose=False) == 0:
        failures.append("parity check passed divergent rows (no-model + variant-drift classes)")

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

    # c. absent CONFIGURED source refuses (no silent fallback to any other
    # source - the hostname default resolves the same repo variant, so the
    # refusal path is proven with an explicit bogus override).
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
    print("self-test: PASS (clean pass + broken token + drift + DAG + file-pin hazard + schema catch + json map + variant catch + ladder catch + parity catch + source-override/refusal legs all proven)")
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
            "pin source override (default: the hostname-resolved per-desk "
            "repo variant omo.<desk>.jsonc, mirroring deploy-omo.sh; env "
            "OMO_JSONC_PATH also overrides). CI uses the committed repo-root "
            "variant (omo.ddd.jsonc). Applied at import time - the flag is "
            "accepted here for --help visibility. Fail-closed when the "
            "resolved source is absent."
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
    mutex.add_argument(
        "--check-variant-parity",
        action="store_true",
        help=(
            "pin->execution parity from live session rows (the sweep's "
            "evidence method); fails on variant drift and on rows that ran "
            "an agent label without the pin applying"
        ),
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
    if args.check_variant_parity:
        return check_variant_parity()
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
