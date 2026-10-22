#!/usr/bin/env python3
"""check-agent-registry.py — configured agents vs a live server's registry (P1-b).

Startup-time validation leg for the agent-registry defect (sis 24h sweep
finding 2 / pipe-port-m3 R1-R2): the registry surfaces (agent.list,
agent.get, `opencode debug agents`) are DARK for configured agents on
fresh and long-running servers alike, while runtime spawn resolution
still works - and a session that references an unregistered agent name
silently proceeds on default model resolution with the label stamped
(the silent-default trap; fleet-side guard now lives in
plugins/sisyphus-gates/src/registry-guard.js).

This script enumerates the CONFIGURED agent set of a repo root (the
opencode.json(c) `agent` map keys + the *.md stems under agents/ agent/
modes/ mode/ - the same surfaces the V2 loader scans) and compares it
against a server's registry surface:

  default  a FRESH standalone server (`opencode api --standalone
           agent.list`) - deterministic, matches the brief's fresh-server
           wording
  --live   the resolved background service
  --surface-file PATH
           read the surface JSON from a file instead of shelling out
           (deterministic self-test / offline analysis)

FAILS LOUDLY on divergence (exit 1) - a dark surface IS the divergence -
with the R1 caveat printed: an empty surface is not proof that
registration failed (runtime spawns resolve); it is proof the surface is
broken, which is exactly what must be detected, never silently accepted.

Self-test (--self-test): proves the comparison catches divergence (empty
surface, partial surface) and passes a carrying surface, on seeded data.

Usage:  python3 scripts/check-agent-registry.py [--repo PATH] [--live]
          [--surface-file PATH] [--self-test]
Exit:   0 = PASS (registry carries every configured agent),
        1 = FAIL/divergence or unreadable inputs.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENT_MD_DIRS = ("agents", "agent", "modes", "mode")
CONFIG_FILES = ("opencode.json", "opencode.jsonc")


def strip_jsonc(text: str) -> str:
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


def configured_agents(repo_root: Path) -> set[str]:
    """Configured names: opencode.json(c) `agent` map keys + agent-dir md stems."""
    names: set[str] = set()
    for fname in CONFIG_FILES:
        path = repo_root / fname
        if not path.is_file():
            continue
        try:
            cfg = json.loads(strip_jsonc(path.read_text(encoding="utf-8")))
        except ValueError:
            continue
        agent_map = cfg.get("agent") if isinstance(cfg, dict) else None
        if isinstance(agent_map, dict):
            names.update(str(k) for k in agent_map)
    for dirname in AGENT_MD_DIRS:
        d = repo_root / dirname
        if not d.is_dir():
            continue
        for f in sorted(d.glob("*.md")):
            names.add(f.stem)
    return names


def surface_from_server(fresh: bool) -> list[str] | None:
    """Registry ids from a server's agent.list surface (None = unreadable)."""
    cmd = ["opencode", "api"]
    if fresh:
        cmd.append("--standalone")
    cmd.append("agent.list")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except FileNotFoundError:
        print("FAIL: `opencode` binary not found on PATH")
        return None
    except subprocess.TimeoutExpired:
        print("FAIL: `opencode api agent.list` timed out")
        return None
    if proc.returncode != 0:
        print(f"FAIL: `opencode api agent.list` exited {proc.returncode}: {proc.stderr.strip()[:200]}")
        return None
    return parse_surface(proc.stdout)


def parse_surface(text: str) -> list[str] | None:
    try:
        payload = json.loads(text)
    except ValueError:
        print(f"FAIL: surface is not JSON: {text.strip()[:120]!r}")
        return None
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        print(f"FAIL: surface JSON has no data list: {text.strip()[:120]!r}")
        return None
    ids = []
    for entry in data:
        if isinstance(entry, dict) and isinstance(entry.get("id"), str):
            ids.append(entry["id"])
    return ids


def compare(configured: set[str], registry: list[str]) -> tuple[list[str], int]:
    missing = sorted(name for name in configured if name not in set(registry))
    return missing, len(registry)


def report(configured: set[str], registry: list[str], source: str) -> int:
    missing, size = compare(configured, registry)
    print(f"surface: {source} ({size} agent(s) listed)")
    print(f"configured: {len(configured)} agent(s)")
    if missing:
        print(f"FAIL: {len(missing)} configured agent(s) ABSENT from the registry surface:")
        for name in missing:
            print(f"  - {name}")
        print(
            "NOTE (pipe-port-m3 R1): a dark surface is not proof registration failed -\n"
            "runtime spawns still resolve - but the surface is broken and the\n"
            "silent-default trap stays open. Plugin-side guard: sisyphus-gates\n"
            "registry-guard.js (tool execute.before). Divergence is the defect."
        )
        print("check-agent-registry: FAIL (registry surface diverges from configured set)")
        return 1
    print("check-agent-registry: PASS (registry surface carries every configured agent)")
    return 0


def self_test() -> int:
    failures: list[str] = []

    with tempfile.TemporaryDirectory(prefix="agent-registry-selftest-") as tmp:
        root = Path(tmp)
        (root / "agents").mkdir()
        (root / "opencode.json").write_text(
            json.dumps({"agent": {"sisyphus": {"model": "p/m"}, "oracle": {"model": "p/m"}}}),
            encoding="utf-8",
        )
        (root / "agents" / "reviewer.md").write_text("---\ndescription: t\n---\nb\n", encoding="utf-8")

        configured = configured_agents(root)
        if configured != {"sisyphus", "oracle", "reviewer"}:
            failures.append(f"configured set wrong: {sorted(configured)}")

        # Empty surface (the live defect shape) must FAIL.
        if report(configured, [], "seeded-empty") == 0:
            failures.append("empty surface passed (must fail loudly)")

        # Partial surface must FAIL with exactly the missing name.
        missing, _ = compare(configured, ["sisyphus", "oracle"])
        if missing != ["reviewer"]:
            failures.append(f"partial-surface missing set wrong: {missing}")

        # Carrying surface must pass.
        if report(configured, ["sisyphus", "oracle", "reviewer", "build"], "seeded-full") != 0:
            failures.append("carrying surface failed (must pass)")

        # Malformed surface must not crash the comparison path.
        if parse_surface("not json") is not None:
            failures.append("malformed surface parsed as valid")

    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        print("self-test: FAIL")
        return 1
    print("self-test: PASS (configured-set extraction + empty/partial/carrier/malformed surfaces)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=str(REPO_ROOT), help="repo root to enumerate (default: this repo)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--live", action="store_true", help="query the resolved background service (default: fresh standalone server)")
    mode.add_argument("--surface-file", metavar="PATH", help="read surface JSON from a file (offline/self-test)")
    mode.add_argument("--self-test", action="store_true", help="seeded self-test")
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    repo = Path(args.repo).expanduser()
    configured = configured_agents(repo)
    if not configured:
        print(f"FAIL: no configured agents found under {repo}")
        return 1

    if args.surface_file:
        text = Path(args.surface_file).expanduser().read_text(encoding="utf-8")
        registry = parse_surface(text)
        if registry is None:
            return 1
        return report(configured, registry, f"file {args.surface_file}")

    registry = surface_from_server(fresh=not args.live)
    if registry is None:
        return 1
    return report(configured, registry, "fresh standalone server" if not args.live else "background service")


if __name__ == "__main__":
    sys.exit(main())
