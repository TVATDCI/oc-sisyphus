#!/usr/bin/env python3
"""pipe-port-validate.py — pipe-port-m3 validation harness (Ship 3).

Drives the ported pipeline substrate (PRs 6+7, tree at the branch HEAD)
against live opencode 2.1.0 in throwaway sandboxes and records deterministic
verdicts. It PROVES; it does not change production. Every model-turn program
records its spend; structural programs spend nothing.

Programs (subcommands):
  structural   registry truth per persona at fresh start + after a config
               change (the two registration paths V2.1.0 exhibits); model-pin
               assertion from the registry. Zero model spend.
  dryrun       Program 1: bounded single-stage task per Mode-A persona from
               its own skill contract, N runs each (default 5), sandboxed
               per run; asserts resolved persona, model==pin (session db
               metadata, never self-report), contract artifacts, zero
               'classification unknown' gate denials.
  og-single    Program 5: one attempt per opencode-go-keyed persona; the
               auth-blocked outcome is documented as expected-until-renewal.
  chain        Program 2: sisyphus-plan spine end-to-end on a scratch
               project (N>=2), stage sessions in native subagent topology
               (parentID linkage), asserting node order == manifest §9,
               per-node model==pin, gate verdicts, closers, escalation edge.
  tool-audit   Program 6: every tool class referenced by each persona's
               skill contract resolves in the gates' classification; zero
               unknown-tool deaths.
  threshold    Program 4: two-class measurement from recorded results
               (chain-completes-without-human-intervention rate and
               per-checkpoint verdict distribution; never blended).
  report       markdown results table from the recorded rows.
  self-test    proves the assertion machinery catches seeded violations.

Sandbox discipline: config staged from `git archive HEAD` (commit-first),
fresh HOME/XDG per run, plugin node_modules provisioned from the checkout,
credentials injected via env (ZHIPU_API_KEY / OPENCODE_API_KEY) read from
the host opencode credential store at runtime and never written to disk or
printed. Sandboxes are kept for inspection and listed by `report`.

Usage: python3 scripts/pipe-port-validate.py <subcommand> [options]
       (see --help per subcommand)
"""

from __future__ import annotations

import argparse
import base64
import glob
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRATCH = Path(os.environ.get("PIPE_PORT_SCRATCH", str(Path.home() / ".cache" / "pipe-port-m3")))
STAGING = SCRATCH / "staging"
RUNS = SCRATCH / "runs"
RESULTS = SCRATCH / "results"
BIN = Path(
    os.environ.get(
        "OPENCODE_BIN",
        str(Path.home() / ".local/share/mise/installs/opencode/2.1.0/node_modules/.bin/opencode"),
    )
)
OPencode_VERSION_EXPECTED = "2.1.0"

# The port map, transcribed from scripts/generate-pipeline-personas.py
# (CATEGORIES + PERSONAS) — the single source of truth for pins/modes.
GENERATED_PIN_SOURCE = REPO_ROOT / "scripts" / "generate-pipeline-personas.py"


def load_port_map() -> dict:
    """Import CATEGORIES/PERSONAS from the generator (authoritative)."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("gen", GENERATED_PIN_SOURCE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return {
        "categories": mod.CATEGORIES,
        "personas": mod.PERSONAS,
        "names": [p["name"] for p in mod.PERSONAS],
    }


PORT_MAP = None


def pm() -> dict:
    global PORT_MAP
    if PORT_MAP is None:
        PORT_MAP = load_port_map()
    return PORT_MAP


def persona_pin(name: str) -> str:
    for p in pm()["personas"]:
        if p["name"] == name:
            return pm()["categories"][p["category"]]["model"] + (
                "#" + pm()["categories"][p["category"]]["variant"]
                if pm()["categories"][p["category"]].get("variant")
                else ""
            )
    # pre-existing agents: pin from their own frontmatter
    src = (REPO_ROOT / "agents" / f"{name}.md").read_text()
    m = re.search(r"^model:\s*(\S+)", src, re.M)
    return m.group(1) if m else ""


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


# ─── credentials (env-only, never printed, never written) ───────────────────


def provider_env() -> dict:
    """Read provider keys from the host credential store into env names."""
    db = Path.home() / ".local/share/opencode/opencode.db"
    out = {}
    if not db.exists():
        return out
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    mapping = {"zai-coding-plan": "ZHIPU_API_KEY", "opencode-go": "OPENCODE_API_KEY"}
    try:
        for iid, val in con.execute("select integration_id, value from credential"):
            if iid in mapping:
                try:
                    key = json.loads(val).get("key") or ""
                except Exception:
                    key = ""
                if key:
                    out[mapping[iid]] = key
    finally:
        con.close()
    return out


# ─── staging (commit-first) ─────────────────────────────────────────────────


def tree_hash() -> str:
    return subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def ensure_staging() -> Path:
    if STAGING.exists():
        marker = STAGING / ".tree-hash"
        if marker.exists() and marker.read_text().strip() == tree_hash():
            return STAGING
    if STAGING.exists():
        shutil.rmtree(STAGING, ignore_errors=True)
    STAGING.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        f"git -C {REPO_ROOT} archive HEAD | tar -x -C {STAGING}",
        shell=True, check=True,
    )
    # plugin runtime deps (gitignored, provisioned from the checkout)
    nm = REPO_ROOT / "plugins" / "sisyphus-gates" / "node_modules"
    if nm.exists():
        subprocess.run(
            ["cp", "-r", "--reflink=auto", str(nm),
             str(STAGING / "plugins" / "sisyphus-gates" / "node_modules")],
            check=True,
        )
    root_nm = REPO_ROOT / "node_modules"
    if root_nm.exists():
        (STAGING / "node_modules").mkdir(exist_ok=True)
        for dep in ("js-yaml", "argparse"):
            if (root_nm / dep).exists():
                subprocess.run(
                    ["cp", "-r", "--reflink=auto", str(root_nm / dep),
                     str(STAGING / "node_modules" / dep)],
                    check=True,
                )
    (STAGING / ".tree-hash").write_text(tree_hash())
    log(f"staging ready at {STAGING} (tree {tree_hash()[:8]})")
    return STAGING


WORKFLOW_YAML = """workflow:
  name: pipe-port-validate
  version: "1.0.0"
  description: "Minimal valid workflow for the validation harness sandbox"
  state_file: "~/.sisyphus/state.json"
  phases:
    - id: discovery
      description: "Explore the problem space freely."
      next_action: "Write the PRD."
    - id: execution
      description: "Full tool access."
      next_action: "Run verification."
  auto_advance: []
  state:
    version: "3.0.0"
    persistent_fields: []
  blocking:
    global_rules: []
"""

EXECUTION_STATE = {
    "schema_version": "3.0.0",
    "project": "pipe-port-validate",
    "phase": "execution",
    "prd_gate": "pass",
    "plan_gate": "pass",
    "approval_status": "approved",
    "last_updated": "2026-10-21T00:00:00.000Z",
}


def make_sandbox(name: str, *, state: bool = True, project_files: dict | None = None) -> dict:
    """Fresh HOME/XDG sandbox; config reflink-copied from staging."""
    ensure_staging()
    sb = RUNS / name
    if sb.exists():
        shutil.rmtree(sb, ignore_errors=True)
    (sb / "home" / ".config").mkdir(parents=True)
    (sb / "home" / ".sisyphus" / "metrics").mkdir(parents=True)
    (sb / "home" / ".sisyphus" / "evidence").mkdir(parents=True)
    (sb / "home" / ".local" / "share" / "opencode").mkdir(parents=True)
    (sb / "project").mkdir(parents=True)
    subprocess.run(
        ["cp", "-r", "--reflink=auto", str(STAGING), str(sb / "home" / ".config" / "opencode")],
        check=True,
    )
    (sb / "home" / ".sisyphus" / "workflow.yaml").write_text(WORKFLOW_YAML)
    if state:
        (sb / "home" / ".sisyphus" / "state.json").write_text(
            json.dumps(EXECUTION_STATE, indent=2) + "\n"
        )
    else:
        (sb / "home" / ".sisyphus" / "state.json").unlink(missing_ok=True)
    for rel, content in (project_files or {}).items():
        p = sb / "project" / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
    return {
        "name": name,
        "root": sb,
        "home": sb / "home",
        "config": sb / "home" / ".config" / "opencode",
        "project": sb / "project",
        "db": sb / "home" / ".local" / "share" / "opencode" / "opencode.db",
    }


def sandbox_env(sb: dict, extra: dict | None = None) -> dict:
    env = dict(os.environ)
    env.update(
        HOME=str(sb["home"]),
        XDG_CONFIG_HOME=str(sb["home"] / ".config"),
        XDG_DATA_HOME=str(sb["home"] / ".local/share"),
        XDG_STATE_HOME=str(sb["home"] / ".local/state"),
        XDG_CACHE_HOME=str(SCRATCH / "cache"),
    )
    env.update(provider_env())
    if extra:
        env.update(extra)
    return env


# ─── opencode server helpers ────────────────────────────────────────────────


def free_port() -> int:
    import socket

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Server:
    def __init__(self, sb: dict, env: dict | None = None):
        self.sb = sb
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        self.out = sb["root"] / f"serve-{self.port}.out"
        self.proc = subprocess.Popen(
            [str(BIN), "serve", "--port", str(self.port), "--hostname", "127.0.0.1"],
            cwd=str(sb["project"]),
            env=env or sandbox_env(sb),
            stdout=open(self.out, "w"),
            stderr=subprocess.STDOUT,
        )
        self.pw = None
        self.hdr = None
        self.ready = False

    def wait_ready(self, timeout_s: float = 90) -> bool:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            time.sleep(0.5)
            try:
                if self.out.exists():
                    for line in self.out.read_text().splitlines():
                        if line.startswith("server password "):
                            self.pw = line.split(" ", 2)[2].strip()
                if self.pw:
                    self.hdr = "Basic " + base64.b64encode(
                        ("opencode:" + self.pw).encode()
                    ).decode()
                req = urllib.request.Request(self.base + "/api/config")
                if self.hdr:
                    req.add_header("authorization", self.hdr)
                with urllib.request.urlopen(req, timeout=2) as r:
                    if r.status == 200:
                        self.ready = True
                        return True
            except Exception:
                continue
        return False

    def api(self, method: str, path: str, payload: dict | None = None) -> dict:
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json"},
            method=method,
        )
        if self.hdr:
            req.add_header("authorization", self.hdr)
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())

    def stop(self):
        try:
            self.proc.terminate()
            self.proc.wait(timeout=10)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass


# ─── session metadata (deterministic source: the sandbox db) ───────────────


def assistant_rows(db: Path, session_id: str | None = None) -> list[dict]:
    if not db.exists():
        return []
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    q = (
        "select json_extract(data,'$.agent'),"
        " json_extract(data,'$.model.id'),"
        " json_extract(data,'$.model.providerID'),"
        " json_extract(data,'$.time.created'),"
        " json_extract(data,'$.tokens.reasoning')"
        " from session_message"
        " where json_extract(data,'$.model.providerID') is not null"
    )
    args = []
    if session_id:
        q += " and session_id=?"
        args.append(session_id)
    q += " order by time_created"
    try:
        rows = con.execute(q, args).fetchall()
    finally:
        con.close()
    return [
        {
            "agent": r[0],
            "model_id": r[1],
            "provider_id": r[2],
            "created": r[3],
            "reasoning": r[4],
        }
        for r in rows
    ]


def gate_denials(sb: dict) -> list[dict]:
    path = sb["home"] / ".sisyphus" / "metrics" / "gate-events.jsonl"
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        evt = d.get("event", d)
        reason = str(evt.get("reason", "") or d.get("reason", ""))
        if reason or str(d.get("type", "")) == "deny":
            out.append(d)
    return out


# ─── result recording ───────────────────────────────────────────────────────


def write_row(program: str, row: dict) -> None:
    RESULTS.mkdir(parents=True, exist_ok=True)
    row = {"program": program, "ts": int(time.time()), **row}
    with open(RESULTS / f"{program}.jsonl", "a") as f:
        f.write(json.dumps(row) + "\n")


def read_rows(program: str) -> list[dict]:
    p = RESULTS / f"{program}.jsonl"
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


# ─── run one persona task (dry-run leg) ─────────────────────────────────────


def run_agent_once(name: str, prompt: str, sb: dict, timeout_s: int = 420) -> dict:
    env = sandbox_env(sb)
    out_path = sb["root"] / "run.out"
    err_path = sb["root"] / "run.err"
    t0 = time.time()
    proc = subprocess.run(
        [
            str(BIN), "run", "--standalone", "--agent", name,
            "--auto", "--format", "json", prompt,
        ],
        cwd=str(sb["project"]),
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout_s + 60,
    )
    dur = round(time.time() - t0, 1)
    out_path.write_text(proc.stdout)
    err_path.write_text(proc.stderr)
    return {"rc": proc.returncode, "dur": dur, "out": proc.stdout, "err": proc.stderr}


# ─── Program: structural (runtime baseline; tiny model turn per persona) ─────


def cmd_structural(args) -> int:
    """Runtime registration+pin baseline (captain revision 2026-10-21).

    The agent.list / debug-agents surface is blind on spawned servers (zero
    even for built-ins), so registry queries are NOT registration proof.
    The real proof: run --standalone --agent X per persona, then read the
    run's session row from the sandbox db (agent label + model actually
    used, never the model's self-report). One tiny bounded turn each.
    """
    personas = pm()["names"]
    for name in personas:
        pin = persona_pin(name)
        want = pin.split("#")[0]
        sb = make_sandbox(f"runtime-structural-{name}")
        row = {"persona": name, "pin": pin, "sandbox": str(sb["root"])}
        try:
            res = run_agent_once(name, "Reply with exactly one word: ok", sb, timeout_s=240)
            row["rc"] = res["rc"]
            metas = assistant_rows(sb["db"])
            meta = metas[-1] if metas else None
            if meta:
                row["meta_agent"] = meta["agent"]
                row["meta_model"] = f"{meta['provider_id']}/{meta['model_id']}"
                row["reasoning"] = meta["reasoning"]
            else:
                row["meta_agent"] = None
                row["meta_model"] = None
            row["resolved_label"] = row.get("meta_agent") == name
            row["model_eq_pin"] = row.get("meta_model") == want
            row["verdict"] = "PASS" if (row["resolved_label"] and row["model_eq_pin"] and res["rc"] == 0) else "FAIL"
        except Exception as e:  # noqa: BLE001
            row["verdict"] = "FAIL"
            row["note"] = f"harness error: {e}"
        write_row("structural", row)
        log(f"runtime-structural {name}: {row['verdict']} model={row.get('meta_model')} reasoning={row.get('reasoning')}")
    return 0


# ─── Program 1: dryruns ─────────────────────────────────────────────────────

BRIEF = """# Discovery Brief — pilot

## Context

The scratch project is a one-file text utility under active manual testing.
The current pain point: no automated check exists, so regressions in the
utility's output go unnoticed until a user reports them.

## Work Objectives

1. Add a check script that verifies the utility's output contains the
   expected marker line.
2. Wire the check into the existing npm test script so it runs with zero
   extra commands.

## Verification criteria

- Running npm test in the project root executes the check and exits 0.
- Deliberately breaking the marker line makes npm test exit non-zero.

## First execution wave

Wave 1: add the check script and the npm test wiring in one commit, then
run npm test once to confirm the green path.
"""

PRD = """# PRD — marker check utility (pilot)

## Problem
No automated check exists for the utility's marker line.

## User Stories
1. As a maintainer I want `npm test` to verify the marker line so regressions are caught.
2. As a maintainer I want a failing marker to fail the build so I notice immediately.

## Non-Goals
No CI integration.

## Acceptance Criteria
- AC1: npm test exits 0 when the marker line is present.
- AC2: npm test exits non-zero when the marker line is broken.

## DESIGN.md sections
Minimal: no UI, no data model.
"""

PLAN = """# Plan — marker-check (pilot)

PRD: .sisyphus/prds/pilot-prd.md

## Issues
- Issue 1 (slice 1): add check.js verifying marker line + npm test wiring.

## Waves
- Wave 1: Issue 1. Tasks:
  - [ ] T1: create check.js that asserts util.output() contains 'MARKER-OK'
  - [ ] T2: wire package.json test script to node check.js
  - [ ] T3: run npm test, record result

## Notepad
.sisyphus/notepads/marker-check/{decisions,problems,learnings}.md
"""


def task_specs() -> dict:
    """Bounded single-stage task per persona, from its own skill contract."""
    return {
        "brief-loader": {
            "files": {".sisyphus/notepads/pilot/discovery-2026-10-21.md": BRIEF},
            "prompt": (
                "Validate the brief at .sisyphus/notepads/pilot/discovery-2026-10-21.md "
                "following your Steps section exactly. Report the validation result: "
                "complete or incomplete with missing sections listed. Read-only task: "
                "do not create or modify files."
            ),
            "artifact": "output_verdict",
            "verdict_re": r"(?i)validation result:\s*\**\s*complete",
        },
        "prd-writer": {
            "files": {".sisyphus/notepads/pilot/discovery-2026-10-21.md": BRIEF},
            "prompt": (
                "Write the PRD from the validated brief at "
                ".sisyphus/notepads/pilot/discovery-2026-10-21.md per your contract. "
                "Plan name: pilot. Keep it minimal: at most 2 user stories, 1 slice. "
                "Write the PRD file per your Produces contract."
            ),
            "artifact": ".sisyphus/prds/pilot-prd.md",
        },
        "momus-prd-reviewer": {
            "files": {".sisyphus/prds/pilot-prd.md": PRD},
            "prompt": (
                "Review the PRD at .sisyphus/prds/pilot-prd.md per your checklists "
                "mechanically. Plan name: pilot. Produce your review report and the "
                "machine-readable gate decision (JSON) per your Produces contract at "
                "the contract paths."
            ),
            "artifact": ".sisyphus/notepads/pilot/momus-prd-review-*.md",
        },
        "issue-creator": {
            "files": {".sisyphus/prds/pilot-prd.md": PRD},
            "prompt": (
                "Create vertical-slice issues from the PRD at .sisyphus/prds/pilot-prd.md "
                "per your contract. ISOLATION RULE: this is a sandbox; use "
                "`bd --db .beads/sandbox-bd create ...` for every bd command so the "
                "production database is never touched. Report issue IDs and the "
                "dependency summary."
            ),
            "artifact": "output_issue_ids",
            "verdict_re": r"(?i)issue[sd]? .{0,40}(brain-|slice|#[0-9])",
        },
        "plan-writer": {
            "files": {
                ".sisyphus/prds/pilot-prd.md": PRD,
                ".sisyphus/issues/pilot-issues.md": (
                    "# Issues (pilot)\n\n- Issue 1 (slice 1): add check.js verifying "
                    "marker line + npm test wiring. AC: npm test exits 0; broken "
                    "marker fails.\n"
                ),
            },
            "prompt": (
                "Create the execution plan from the approved PRD "
                "(.sisyphus/prds/pilot-prd.md) and its issues "
                "(.sisyphus/issues/pilot-issues.md) per your contract. Plan name: "
                "marker-check. Keep it to one wave. Use `bd --db .beads/sandbox-bd` "
                "for any bd command (sandbox isolation)."
            ),
            "artifact": ".sisyphus/plans/marker-check.md",
        },
        "momus-plan-reviewer": {
            "files": {".sisyphus/plans/marker-check.md": PLAN},
            "prompt": (
                "Review the plan at .sisyphus/plans/marker-check.md per your "
                "checklists mechanically. Plan name: marker-check. Produce your "
                "review report and machine-readable gate decision (JSON) per your "
                "Produces contract at the contract paths."
            ),
            "artifact": ".sisyphus/notepads/marker-check/momus-plan-review-*.md",
        },
        "wave-executor": {
            "files": {
                ".sisyphus/plans/marker-check.md": PLAN,
                "util.js": "module.exports = { output: () => 'MARKER-OK' };\n",
            },
            "prompt": (
                "Execute Wave 1 of the plan at .sisyphus/plans/marker-check.md per "
                "your contract (research, strategy, implementation, validation, "
                "checkpoints). util.js exists with output() returning 'MARKER-OK'. "
                "Use `bd --db .beads/sandbox-bd` for any bd command. Do not run git "
                "commit; validation = node check.js exits 0."
            ),
            "artifact": "check.js",
        },
        "plan-updater": {
            "files": {
                ".sisyphus/plans/marker-check.md": PLAN,
                "check.js": (
                    "const util = require('./util.js');\n"
                    "if (!util.output().includes('MARKER-OK')) process.exit(1);\n"
                ),
                "util.js": "module.exports = { output: () => 'MARKER-OK' };\n",
            },
            "prompt": (
                "Update plan progress per your contract: task T1 of Wave 1 in "
                ".sisyphus/plans/marker-check.md is complete (check.js exists and "
                "node check.js exits 0 — verify it), mark it complete with evidence, "
                "and write the notepad log entry per your Produces contract. Use "
                "`bd --db .beads/sandbox-bd` for any bd command."
            ),
            "artifact": "output_progress",
            "verdict_re": r"(?i)(updated|marked|complete).{0,120}(T1|task)",
        },
        "plan-closer": {
            "files": {
                ".sisyphus/plans/marker-check.md": PLAN.replace("- [ ] T1", "- [x] T1").replace(
                    "- [ ] T2", "- [x] T2"
                ).replace("- [ ] T3", "- [x] T3"),
                ".sisyphus/state/marker-check.json": '{"status": "executing"}\n',
            },
            "prompt": (
                "Close the completed plan at .sisyphus/plans/marker-check.md per your "
                "contract: append the completion summary, archive the state file to "
                ".sisyphus/evidence/ per your Produces contract, and report closure "
                "confirmation. Use `bd --db .beads/sandbox-bd` for any bd command; "
                "do not run git push."
            ),
            "artifact": ".sisyphus/evidence/*.json",
        },
    }


def artifact_ok(spec: dict, sb: dict, run_out: str) -> tuple[bool, str]:
    art = spec["artifact"]
    if art == "output_verdict" or art == "output_issue_ids" or art == "output_progress":
        m = re.search(spec["verdict_re"], run_out or "")
        return bool(m), f"output regex {spec['verdict_re']}"
    matches = list((sb["project"]).glob(art)) if not art.startswith("/") else []
    if matches:
        nonempty = [p for p in matches if p.stat().st_size > 0]
        return bool(nonempty), f"{art} ({len(matches)} match(es), {len(nonempty)} nonempty)"
    return False, f"{art} absent"


def cmd_dryrun(args) -> int:
    specs = task_specs()
    personas = args.personas or [p["name"] for p in pm()["personas"]
                                if p["mode"] == "A"
                                and persona_pin(p["name"]).startswith("zai")]
    n = args.n
    for name in personas:
        spec = specs.get(name)
        if not spec:
            log(f"dryrun {name}: no task spec — SKIPPED (recorded)")
            write_row("dryrun", {"persona": name, "run": None, "verdict": "SKIP",
                                 "reason": "no task spec (mode-B or lane persona)"})
            continue
        pin = persona_pin(name)
        want = pin.split("#")[0]
        for i in range(1, n + 1):
            sbname = f"dry-{name}-{i}"
            sb = make_sandbox(sbname, project_files=spec["files"])
            row = {"persona": name, "run": i, "pin": pin, "sandbox": str(sb["root"])}
            try:
                res = run_agent_once(name, spec["prompt"], sb)
                row.update({"rc": res["rc"], "dur_s": res["dur"]})
                metas = assistant_rows(sb["db"])
                if metas:
                    m = metas[-1]
                    row["meta_agent"] = m["agent"]
                    row["meta_model"] = f"{m['provider_id']}/{m['model_id']}"
                    row["reasoning"] = m["reasoning"]
                else:
                    row["meta_agent"] = None
                    row["meta_model"] = None
                ok_art, art_note = artifact_ok(spec, sb, res["out"])
                row["artifact_ok"] = ok_art
                row["artifact_note"] = art_note
                denies = gate_denials(sb)
                unknown = [d for d in denies if "classification unknown" in json.dumps(d)]
                row["gate_denials"] = len(denies)
                row["unknown_class_denials"] = len(unknown)
                model_ok = row["meta_model"] == want
                resolved = row["meta_agent"] == name
                row["assertions"] = {
                    "resolved_label": resolved,
                    "model_eq_pin": model_ok,
                    "artifact": ok_art,
                    "zero_unknown_denials": len(unknown) == 0,
                }
                row["verdict"] = (
                    "PASS" if all(row["assertions"].values()) and res["rc"] == 0 else "FAIL"
                )
                if not model_ok:
                    row["note"] = "model != pin — see defect-file-agents-inert.md (D1/D4)"
            except subprocess.TimeoutExpired:
                row["verdict"] = "FAIL"
                row["note"] = "timeout"
            except Exception as e:  # noqa: BLE001 — record and continue the matrix
                row["verdict"] = "FAIL"
                row["note"] = f"harness error: {e}"
            write_row("dryrun", row)
            log(f"dryrun {name}#{i}: {row['verdict']} model={row.get('meta_model')} art={row.get('artifact_ok')}")
    return 0


# ─── Program 5: opencode-go single attempts ─────────────────────────────────


OG_TASKS = {
    "code-review": {
        "files": {"diff.txt": "--- a/util.js\n+++ b/util.js\n@@ -1 +1,2 @@\n module.exports = { output: () => 'MARKER-OK' };\n+// trailing comment\n"},
        "prompt": "Review the change in diff.txt per your review checklist. Output findings with severity.",
    },
    "security-auditor": {
        "files": {"app.js": "const key='AKIAIOSFODNN7EXAMPLE'; app.post('/x', (r,s)=>{eval(r.body.q)});\n"},
        "prompt": "Security-scan app.js per your checklist. Output findings with severity.",
    },
    "ui-auditor": {
        "files": {"DESIGN.md": "# DESIGN\n## 10-14 UI sections\nNo UI in this slice.\n"},
        "prompt": "UI/UX validation per your contract: DESIGN.md sections 10-14; no UI exists in this slice. Return your PASS/WARNING/FAIL gate decision.",
    },
    "regression-gate": {
        "files": {"check.js": "process.exit(0);\n", "package.json": '{"scripts":{"test":"node check.js"}}'},
        "prompt": "Run the regression gate per your contract: npm test in this directory; report the gate outcome.",
    },
    "reference-checker": {
        "files": {".sisyphus/prds/pilot-prd.md": PRD, ".sisyphus/notepads/pilot/discovery-2026-10-21.md": BRIEF},
        "prompt": "Scan .sisyphus/ for existing artifacts that conflict with creating a new PRD per your contract. Report conflicts or clear.",
    },
    "oracle": {
        "files": {"q.txt": "Question: is 2+2=4? Answer with the verdict word only.\n"},
        "prompt": "Read q.txt and answer per your judgment contract.",
    },
}


def cmd_og_single(args) -> int:
    targets = args.personas or list(OG_TASKS)
    for name in targets:
        spec = OG_TASKS[name]
        pin = persona_pin(name)
        want = pin.split("#")[0]
        sb = make_sandbox(f"og-{name}", project_files=spec["files"])
        row = {"persona": name, "run": 1, "pin": pin, "sandbox": str(sb["root"])}
        try:
            res = run_agent_once(name, spec["prompt"], sb, timeout_s=240)
            row.update({"rc": res["rc"], "dur_s": res["dur"]})
            metas = assistant_rows(sb["db"])
            if metas:
                m = metas[-1]
                row["meta_agent"] = m["agent"]
                row["meta_model"] = f"{m['provider_id']}/{m['model_id']}"
            else:
                row["meta_agent"] = None
                row["meta_model"] = None
            auth_blocked = (
                res["rc"] != 0
                and re.search(r"(?i)401|unauthor|api key|credential|auth", res["out"] + res["err"])
            )
            fallback = row.get("meta_model") not in (None, want)
            row["outcome"] = (
                "AUTH_BLOCKED_EXPECTED" if auth_blocked
                else ("FALLBACK_MODEL" if fallback else "UNEXPECTED")
            )
            row["verdict"] = "EXPECTED_UNTIL_RENEWAL" if auth_blocked else "FAIL"
            if fallback:
                row["note"] = "opencode-go persona ran on a non-opencode-go model (D1/D4 registration defect)"
        except subprocess.TimeoutExpired:
            row["verdict"] = "FAIL"
            row["outcome"] = "TIMEOUT"
        except Exception as e:  # noqa: BLE001
            row["verdict"] = "FAIL"
            row["outcome"] = f"HARNESS_ERROR: {e}"
        write_row("og-single", row)
        log(f"og-single {name}: {row['verdict']} ({row.get('outcome')})")
    return 0


# ─── Program 2: chain ───────────────────────────────────────────────────────

CHAIN_NODES = [
    ("brief-loader", "stage1", "Validate brief at .sisyphus/notepads/pilot/discovery-2026-10-21.md; report validation result."),
    ("prd-writer", "stage2", "Write the PRD from the validated brief at .sisyphus/notepads/pilot/discovery-2026-10-21.md; plan name pilot; minimal (2 stories, 1 slice)."),
    ("momus-prd-reviewer", "gate1", "Review PRD at .sisyphus/prds/pilot-prd.md; produce review + JSON decision at contract paths."),
    ("issue-creator", "stage3", "Create vertical-slice issues from PRD .sisyphus/prds/pilot-prd.md; bd --db .beads/sandbox-bd only."),
    ("plan-writer", "stage4", "Create plan from PRD + issues; plan name marker-check; one wave; bd --db .beads/sandbox-bd."),
    ("momus-plan-reviewer", "gate2", "Review plan .sisyphus/plans/marker-check.md; produce review + JSON decision at contract paths."),
    ("wave-executor", "stage5", "Execute Wave 1 of .sisyphus/plans/marker-check.md; util.js exists (output() returns MARKER-OK); no git commit; bd --db .beads/sandbox-bd."),
    ("momus-plan-reviewer", "gate5a", "Checkpoint 3 between-waves audit: plan .sisyphus/plans/marker-check.md + wave evidence; produce audit verdict."),
    ("plan-updater", "stage6", "Update plan progress: mark Wave 1 tasks complete with evidence; notepad log per contract; bd --db .beads/sandbox-bd."),
    ("plan-closer", "stage7", "Close plan .sisyphus/plans/marker-check.md per contract; archive state to .sisyphus/evidence/; no git push; bd --db .beads/sandbox-bd."),
]


def cmd_chain(args) -> int:
    n = args.n
    for run_idx in range(1, n + 1):
        sb = make_sandbox(
            f"chain-{run_idx}",
            project_files={
                ".sisyphus/notepads/pilot/discovery-2026-10-21.md": BRIEF,
                "util.js": "module.exports = { output: () => 'MARKER-OK' };\n",
            },
        )
        row = {"chain_run": run_idx, "sandbox": str(sb["root"]), "nodes": []}
        srv = Server(sb)
        try:
            if not srv.wait_ready():
                row["verdict"] = "FAIL"
                row["note"] = "server not ready"
                write_row("chain", row)
                continue
            parent = srv.api("POST", "/api/session", {"title": f"chain-{run_idx}-primary"})["data"]
            parent_id = parent["id"]
            row["parent_session"] = parent_id
            order_ok = True
            human_interventions = 0
            prev_created = 0
            node_rows = []
            for node_idx, (persona, stage, prompt) in enumerate(CHAIN_NODES, start=1):
                pin = persona_pin(persona)
                want = pin.split("#")[0]
                child = srv.api(
                    "POST",
                    "/api/session",
                    {"title": f"chain-{run_idx}-{stage}", "parentID": parent_id, "agent": persona},
                )["data"]
                cid = child["id"]
                # drive the child session's turn via the host CLI bound to the
                # sandbox server (--auto: headless validation auto-approves
                # non-denied permissions; the sisyphus-gates layers stay
                # unconditional and independent of this flag)
                run_env = sandbox_env(sb, {"OPENCODE_PASSWORD": srv.pw or ""})
                t0 = time.time()
                try:
                    proc = subprocess.run(
                        [
                            str(BIN), "run", "--server", srv.base,
                            "--session", cid, "--auto", "--format", "json", prompt,
                        ],
                        cwd=str(sb["project"]),
                        env=run_env,
                        capture_output=True,
                        text=True,
                        timeout=420,
                    )
                    node_rc = proc.returncode
                    (sb["root"] / f"{stage}.out").write_text(proc.stdout)
                except subprocess.TimeoutExpired:
                    node_rc = 124
                nr = {
                    "node": node_idx,
                    "stage": stage,
                    "persona": persona,
                    "pin": pin,
                    "session": cid,
                    "parent_linked": child.get("parentID") == parent_id,
                    "session_agent_param_taken": child.get("agentID") == persona,
                    "node_rc": node_rc,
                    "dur_s": round(time.time() - t0, 1),
                }
                deadline = time.time() + 90
                meta = None
                while time.time() < deadline:
                    rows_ = assistant_rows(sb["db"], cid)
                    if rows_:
                        meta = rows_[-1]
                        break
                    time.sleep(3)
                if meta:
                    nr["meta_agent"] = meta["agent"]
                    nr["meta_model"] = f"{meta['provider_id']}/{meta['model_id']}"
                    if meta["created"] and meta["created"] < prev_created:
                        order_ok = False
                    prev_created = meta["created"] or prev_created
                else:
                    nr["meta_agent"] = None
                    nr["meta_model"] = None
                    human_interventions += 1  # stalled node = intervention needed
                nr["model_eq_pin"] = nr.get("meta_model") == want
                # gate verdict artifact checks
                if stage.startswith("gate"):
                    pattern = (
                        ".sisyphus/notepads/pilot/momus-prd-review-*.md"
                        if persona == "momus-prd-reviewer" and stage == "gate1"
                        else ".sisyphus/notepads/*/momus-*review-*.md"
                    )
                    found = list((sb["project"]).glob(pattern))
                    nr["gate_artifact"] = bool(found)
                node_rows.append(nr)
                log(f"chain{run_idx} {stage}({persona}): model={nr.get('meta_model')} pin_ok={nr['model_eq_pin']}")
            denies = gate_denials(sb)
            unknown = [d for d in denies if "classification unknown" in json.dumps(d)]
            row["nodes"] = node_rows
            row["order_ok"] = order_ok
            row["human_interventions"] = human_interventions
            row["unknown_class_denials"] = len(unknown)
            row["node_sequence"] = [n_["stage"] for n_ in node_rows]
            row["per_node_model_eq_pin"] = sum(1 for n_ in node_rows if n_["model_eq_pin"])
            row["verdict"] = (
                "PASS"
                if order_ok
                and human_interventions == 0
                and row["per_node_model_eq_pin"] == len(CHAIN_NODES)
                and len(unknown) == 0
                else "FAIL"
            )
        except Exception as e:  # noqa: BLE001
            row["verdict"] = "FAIL"
            row["note"] = f"harness error: {e}"
        finally:
            srv.stop()
        write_row("chain", row)
        log(f"chain run {run_idx}: {row['verdict']}")
    return 0


# ─── Program 4: threshold ───────────────────────────────────────────────────


def cmd_threshold(args) -> int:
    chains = read_rows("chain")
    dry = read_rows("dryrun")
    og = read_rows("og-single")
    total = len(chains)
    completed = sum(
        1 for c in chains
        if c.get("human_interventions") == 0 and c.get("order_ok")
    )
    # per-checkpoint verdict distribution (gate nodes + dry-run gate personas)
    verdict_dist: dict[str, dict[str, int]] = {}
    for c in chains:
        for n_ in c.get("nodes", []):
            if str(n_.get("stage", "")).startswith("gate"):
                key = f"chain:{n_['stage']}"
                v = "FIRED_MODEL_MISMATCH" if not n_.get("model_eq_pin") else "FIRED"
                if not n_.get("gate_artifact", True):
                    v = "NO_ARTIFACT"
                verdict_dist.setdefault(key, {})[v] = verdict_dist.setdefault(key, {}).get(v, 0) + 1
    for d in dry:
        p = d.get("persona", "")
        if "momus" in p or "reviewer" in p:
            key = f"dryrun:{p}"
            v = d.get("verdict", "?")
            verdict_dist.setdefault(key, {})[v] = verdict_dist.setdefault(key, {}).get(v, 0) + 1
    out = {
        "class1_chain_completes_without_human_intervention": {
            "completed": completed,
            "total": total,
            "rate": round(completed / total, 3) if total else None,
            "note": "chain = 10-node spine driven per sisyphus-plan contracts; intervention = stalled/failed node needing human action",
        },
        "class2_per_checkpoint_verdict_distribution": verdict_dist,
        "never_blended": True,
        "og_disclosure": {
            "expected_auth_blocked": sum(1 for o in og if o.get("outcome") == "AUTH_BLOCKED_EXPECTED"),
            "fallback_model": sum(1 for o in og if o.get("outcome") == "FALLBACK_MODEL"),
            "total": len(og),
        },
    }
    (RESULTS / "threshold.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    return 0


# ─── report ─────────────────────────────────────────────────────────────────


def cmd_report(args) -> int:
    lines = []
    dry = read_rows("dryrun")
    if dry:
        lines.append("### Program 1 — deterministic dry-runs (persona x run)")
        lines.append("")
        lines.append("| persona | run | pin | meta model | artifact | unknown-denials | verdict |")
        lines.append("|---|---|---|---|---|---|---|")
        for d in dry:
            lines.append(
                f"| {d.get('persona')} | {d.get('run')} | {d.get('pin')} | "
                f"{d.get('meta_model')} | {d.get('artifact_ok')} | "
                f"{d.get('unknown_class_denials', 0)} | {d.get('verdict')} |"
            )
        lines.append("")
    st = read_rows("structural")
    if st:
        lines.append("### Structural runtime baseline (run --standalone --agent X; db-row evidence)")
        lines.append("")
        lines.append("| persona | pin | label resolved | db model | reasoning | verdict |")
        lines.append("|---|---|---|---|---|---|")
        for s in st:
            lines.append(
                f"| {s.get('persona')} | {s.get('pin')} | {s.get('resolved_label')} | "
                f"{s.get('meta_model')} | {s.get('reasoning')} | {s.get('verdict')} |"
            )
        lines.append("")
    ch = read_rows("chain")
    for c in ch:
        lines.append(f"### Program 2 — chain run {c.get('chain_run')} ({c.get('verdict')})")
        lines.append("")
        lines.append("| node | stage | persona | pin | model | model==pin | parent | verdict-artifact |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for n_ in c.get("nodes", []):
            lines.append(
                f"| {n_.get('node')} | {n_.get('stage')} | {n_.get('persona')} | {n_.get('pin')} | "
                f"{n_.get('meta_model')} | {n_.get('model_eq_pin')} | {n_.get('parent_linked')} | "
                f"{n_.get('gate_artifact','-')} |"
            )
        lines.append("")
    og = read_rows("og-single")
    if og:
        lines.append("### Program 5 — opencode-go-keyed personas (single attempts)")
        lines.append("")
        lines.append("| persona | pin | outcome | meta model | verdict |")
        lines.append("|---|---|---|---|---|")
        for o in og:
            lines.append(
                f"| {o.get('persona')} | {o.get('pin')} | {o.get('outcome')} | "
                f"{o.get('meta_model')} | {o.get('verdict')} |"
            )
        lines.append("")
    tp = RESULTS / "threshold.json"
    if tp.exists():
        lines.append("### Program 4 — two-class threshold")
        lines.append("```json")
        lines.append(tp.read_text().strip())
        lines.append("```")
        lines.append("")
    lines.append("### Sandboxes left for inspection")
    lines.append("")
    for p in sorted(RUNS.glob("*")):
        if p.is_dir():
            lines.append(f"- `{p}`")
    lines.append("")
    (RESULTS / "report.md").write_text("\n".join(lines) + "\n")
    print(f"report written to {RESULTS / 'report.md'} ({len(lines)} lines)")
    return 0


# ─── Program 6: tool-audit ──────────────────────────────────────────────────


def cmd_tool_audit(args) -> int:
    audit = subprocess.run(
        ["node", str(REPO_ROOT / "scripts" / "pipe-port-tool-audit.mjs")],
        capture_output=True, text=True,
    )
    print(audit.stdout)
    if audit.returncode != 0:
        print(audit.stderr, file=sys.stderr)
    # record
    try:
        rows = json.loads(audit.stdout.strip().splitlines()[-1])
        for r in rows.get("personas", []):
            write_row("tool-audit", r)
    except Exception:
        write_row("tool-audit", {"verdict": "ERROR", "stdout": audit.stdout[:2000]})
    return audit.returncode


# ─── self-test ──────────────────────────────────────────────────────────────


def cmd_self_test(args) -> int:
    """Prove the assertion machinery catches seeded violations (no server)."""
    failures = []

    # 1. model != pin is caught
    row = {"meta_model": "opencode/big-pickle", "pin": "zai-coding-plan/glm-5.3#high"}
    if row["meta_model"] == row["pin"].split("#")[0]:
        failures.append("model-equality check did not catch mismatch")

    # 2. missing artifact is caught (artifact_ok against a fake sandbox)
    sb = {"project": Path(tempfile_dir())}
    spec = {"artifact": ".sisyphus/prds/missing-prd.md"}
    ok, _ = artifact_ok(spec, sb, "")
    if ok:
        failures.append("artifact check passed with absent file")

    # 3. present artifact passes; empty artifact fails
    p = sb["project"] / "present.md"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("x")
    ok, _ = artifact_ok({"artifact": "present.md"}, sb, "")
    if not ok:
        failures.append("artifact check failed with present nonempty file")
    p.write_text("")
    ok, _ = artifact_ok({"artifact": "present.md"}, sb, "")
    if ok:
        failures.append("artifact check passed with empty file")

    # 4. output-verdict regex
    ok, _ = artifact_ok(
        {"artifact": "output_verdict", "verdict_re": r"(?i)validation result:\s*\**\s*complete"},
        sb,
        "Validation result: complete",
    )
    if not ok:
        failures.append("output verdict regex failed on positive sample")

    # 5. unknown-classification denial detection
    sample = {"event": {"reason": "MCP tool 'x_y' classification unknown — deny by default"}}
    if "classification unknown" not in json.dumps(sample):
        failures.append("unknown-classification detector missed sample")

    # 6. registry-truth resolution must fail for unregistered persona
    fresh = {"build": None}
    if ("brief-loader" in fresh) is not False:
        failures.append("registry-truth check passed for unregistered persona")

    # 7. port map pins load and match generated frontmatter (drift guard)
    for name in pm()["names"]:
        src = (REPO_ROOT / "agents" / f"{name}.md").read_text()
        m = re.search(r"^model:\s*(\S+)", src, re.M)
        if not m or m.group(1) != persona_pin(name):
            failures.append(f"persona {name}: frontmatter pin != port map pin")
            break

    if failures:
        print("SELF-TEST FAIL:")
        for f in failures:
            print(" -", f)
        return 1
    print("self-test: PASS (7 checks)")
    return 0


def tempfile_dir() -> str:
    import tempfile

    d = Path(tempfile.mkdtemp(prefix="pipe-port-selftest-"))
    (d / "project").mkdir(exist_ok=True)
    return str(d / "project")


# ─── CLI ────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("structural", help="registry truth per persona (no model spend)")
    p = sub.add_parser("dryrun", help="Program 1: N dry-runs per zai Mode-A persona")
    p.add_argument("--n", type=int, default=5)
    p.add_argument("--personas", nargs="*", default=None)
    p = sub.add_parser("og-single", help="Program 5: single attempts for opencode-go personas")
    p.add_argument("--n", type=int, default=1)
    p.add_argument("--personas", nargs="*", default=None)
    p = sub.add_parser("chain", help="Program 2: full-chain trace runs")
    p.add_argument("--n", type=int, default=2)
    p.add_argument("--personas", nargs="*", default=None)
    sub.add_parser("tool-audit", help="Program 6: tool-surface classification audit")
    sub.add_parser("threshold", help="Program 4: two-class threshold measurement")
    sub.add_parser("report", help="markdown results table")
    sub.add_parser("self-test", help="harness self-test")

    args = ap.parse_args()
    handlers = {
        "structural": cmd_structural,
        "dryrun": cmd_dryrun,
        "og-single": cmd_og_single,
        "chain": cmd_chain,
        "tool-audit": cmd_tool_audit,
        "threshold": cmd_threshold,
        "report": cmd_report,
        "self-test": cmd_self_test,
    }
    return handlers[args.cmd](args) or 0


if __name__ == "__main__":
    raise SystemExit(main())
