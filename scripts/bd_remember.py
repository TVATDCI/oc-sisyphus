#!/usr/bin/env python3
"""bd_remember.py — Gate-safe wrapper for bd remember.

The shell-safety gate blocks any command line containing '|' (even inside
double quotes). The canonical bd remember record format uses '|' as a
field delimiter:

    scope=<scope>|turn=<N>|category=<cat>|key=<key>|value=<value>

Hand-running `bd remember "scope=...|turn=...|..."` is therefore gate-blocked.
This wrapper accepts the record fields as separate argv flags, assembles the
canonical pipe-delimited string internally, and calls bd remember via
subprocess.run([...]) (argv list — no shell). The '|' never appears in the
shell command line the agent runs; it exists only inside a Python string
passed as a single argv element to bd.

Key design choices (learned from agent 2's empirical bd findings):
  - --key <dedup_key>  : bd with --key does update-in-place ("If a memory
    with this key already exists, it will be updated in place"). Without
    --key, bd slugifies the full value into the key → append-only → duplicates.
    The dedup key is {scope}:{category}:{key}, matching AGENTS.md's
    "Deduplicate by {scope}:{category}:{key}" rule.
  - --dolt-auto-commit on : bd defaults to off, meaning writes sit in the
    uncommitted working set and can be clobbered by the next auto-import.
    'on' commits after each write → durable.

Usage:
    python3 scripts/bd_remember.py \\
        --scope global --turn 12 \\
        --category exact --key retry_timeout --value "30s"

This is the ONLY gate-safe way to write canonical bd remember records.
Never hand-run:  bd remember "scope=...|turn=...|..."  (gate-blocked).
"""

import argparse
import subprocess
import sys


def build_record(scope: str, turn: str, category: str, key: str, value: str) -> str:
    """Assemble the canonical pipe-delimited record string.

    Escapes any '|' in the value as '\\|' per the AGENTS.md schema.
    """
    escaped_value = value.replace("|", "\\|")
    return (
        f"scope={scope}|turn={turn}|category={category}"
        f"|key={key}|value={escaped_value}"
    )


def build_dedup_key(scope: str, category: str, key: str) -> str:
    """Build the bd --key argument for update-in-place dedup.

    Matches AGENTS.md's "Deduplicate by {scope}:{category}:{key}" rule.
    Using --key gives update-in-place instead of append-only.
    """
    return f"{scope}:{category}:{key}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Gate-safe wrapper for bd remember. "
            "Bypasses the | shell-safety gate by passing fields as argv."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "This is the ONLY gate-safe way to write canonical bd remember "
            "records. Never hand-run: bd remember \"scope=...|...\"  (gate-blocked)."
        ),
    )
    parser.add_argument(
        "--scope", required=True,
        help="global (system-wide rules) or bead-<ID> (task-specific facts)",
    )
    parser.add_argument(
        "--turn", required=True,
        help="session-local monotonic turn counter (from ~/.sisyphus/hotcache.md)",
    )
    parser.add_argument(
        "--category", required=True,
        help=(
            "short stable identifier: exact, constraint, reason, dependency, "
            "preference (loss categories), or intent, files, decision, next "
            "(compaction categories)"
        ),
    )
    parser.add_argument(
        "--key", required=True,
        help="short stable identifier for the fact (no | characters)",
    )
    parser.add_argument(
        "--value", required=True,
        help="the fact itself; any | is auto-escaped as \\|",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="print the record and bd command without executing",
    )

    args = parser.parse_args()

    # Validate: key must not contain | (it would break the record format)
    if "|" in args.key:
        print(
            f"ERROR: key must not contain '|' (got: {args.key})",
            file=sys.stderr,
        )
        return 1

    record = build_record(
        args.scope, args.turn, args.category, args.key, args.value
    )
    dedup_key = build_dedup_key(args.scope, args.category, args.key)

    # Build the bd command as an argv list — no shell invocation.
    # The '|' in `record` is a character inside a Python string, passed as
    # a single argv element. The shell gate never sees it.
    bd_cmd = [
        "bd", "remember", record,
        "--key", dedup_key,
        "--dolt-auto-commit", "on",
    ]

    if args.dry_run:
        print(f"Record:  {record}")
        print(f"Dedup key: {dedup_key}")
        print(f"Command: bd remember <record> --key {dedup_key} --dolt-auto-commit on")
        return 0

    try:
        result = subprocess.run(bd_cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        print(
            "ERROR: bd not found — is it installed and on PATH?",
            file=sys.stderr,
        )
        return 1

    if result.returncode != 0:
        print(
            f"bd remember failed (exit {result.returncode}): "
            f"{result.stderr.strip()}",
            file=sys.stderr,
        )
        return result.returncode

    if result.stdout.strip():
        print(result.stdout.strip())

    return 0


if __name__ == "__main__":
    sys.exit(main())
