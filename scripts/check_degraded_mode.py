#!/usr/bin/env python3
"""check_degraded_mode.py — deterministic degraded-mode trigger scan.

Swamp Club Guard 2 (Oracle Gate-2 verdict, Upgrade 2a — ADOPT AS CHEAP
FAIL-CLOSED INSTRUMENTATION). Runs post-compaction and post-resume
(session-begin Step 1). The compaction skill's degraded-mode triggers are
mostly mechanical facts, but the model having to notice its OWN degraded
context is the coordinator-as-monitor failure in miniature — this scan
moves detection to code.

DETECTION ONLY: the degraded-mode RESPONSE (visible signal, blocking
destructive ops, aggressive rehydration, evidence logging — compaction
SKILL.md "Observable Degraded Mode") stays MODEL JUDGMENT per the
fossilize ruling. The scan emits the trigger list; it never decides what
to do about it.

Mechanical checks (compaction SKILL.md trigger list, mechanical subset):
  1. handoff-missing            — hotcache file does not exist
  2. schema-incomplete          — handoff missing required sections of the
                                   compaction Handoff Message Schema
                                   (Session Handoff / Files Modified /
                                   Decisions Made / Next Steps / Evidence
                                   References / Preserved Constraints /
                                   Critical Values + the Compacted-at
                                   marker). Header-text based: the live
                                   hotcache uses ##, the template ### —
                                   both are the same schema.
  3. constraints-absent         — Preserved Constraints section present
                                   but empty (may be legitimate when the
                                   session had no constraints — detection
                                   emits; judgment stays model-side)
  4. extractor-failed-last-run  — scripts/bd_remember.py's last recorded
                                   invocation failed (status file
                                   ~/.sisyphus/extractor-status.json,
                                   written by the wrapper around every
                                   real bd call)

Fail-closed direction: when the scan itself cannot decide (hotcache
unreadable, status file present but unparseable, internal error), it
EMITS a trigger — a false positive lands safe (conservative mode), a
false negative does not.

Usage:
    python3 scripts/check_degraded_mode.py
    python3 scripts/check_degraded_mode.py --hotcache <path> --status-file <path>

Output contract (deterministic):
    DEGRADED-MODE-SCAN: hotcache=<path>
    TRIGGER <name>: <mechanical fact>
    NOTE extractor-status: <informational, non-trigger>
    CLEAN: no mechanical degraded-mode triggers (N checks run)
    CONSUMPTION: detection only — response stays model judgment ...

Exit codes:
    0  scan ran, no triggers
    1  scan ran, trigger list non-empty (surface ⚠️ + degraded-mode protocol)
    2  internal error (a fail-closed scan-failed trigger is ALSO printed)
"""

import argparse
import datetime
import json
import os
import re
import sys

REQUIRED_SECTIONS = [
    "Session Handoff",
    "Files Modified",
    "Decisions Made",
    "Next Steps",
    "Evidence References",
    "Preserved Constraints",
    "Critical Values",
]

DEFAULT_HOTCACHE = os.path.expanduser("~/.sisyphus/hotcache.md")
DEFAULT_STATUS = os.path.expanduser("~/.sisyphus/extractor-status.json")

# Header at any level: '#'+ spaces + title (to end of line).
HEADER_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$")


def section_titles(text):
    """All markdown header titles in document order, header-text only."""
    titles = []
    for line in text.splitlines():
        m = HEADER_RE.match(line)
        if m:
            titles.append(m.group(1))
    return titles


def section_body(text, title):
    """The body lines under the (first) header whose title matches exactly."""
    lines = text.splitlines()
    body = []
    in_section = False
    for line in lines:
        m = HEADER_RE.match(line)
        if m:
            if in_section:
                break  # next header ends the section
            if m.group(1).strip() == title:
                in_section = True
                continue
        if in_section:
            body.append(line)
    return body


def nonempty_entries(body):
    """Content entries under a section header: non-blank, non-comment lines."""
    return [l for l in body if l.strip() and not l.strip().startswith("<!--")]


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Deterministic degraded-mode trigger scan (post-compaction / "
            "post-resume). Detection only — the degraded-mode response stays "
            "model judgment per compaction/SKILL.md."
        ),
    )
    parser.add_argument("--hotcache", default=DEFAULT_HOTCACHE)
    parser.add_argument("--status-file", default=DEFAULT_STATUS)
    args = parser.parse_args()

    triggers = []
    notes = []
    checks = 0

    def check(trigger_name, fact):
        triggers.append(f"TRIGGER {trigger_name}: {fact}")

    # ── Check 1 + 2: handoff presence and schema completeness ──────────
    checks += 1
    text = None
    if not os.path.exists(args.hotcache):
        check("handoff-missing", f"{args.hotcache} does not exist")
    else:
        try:
            with open(args.hotcache, "r", encoding="utf-8") as fh:
                text = fh.read()
        except OSError as err:
            check("hotcache-unreadable", f"{args.hotcache}: {err}")
        except UnicodeDecodeError as err:
            check("hotcache-unreadable", f"{args.hotcache}: {err}")

    if text is not None:
        checks += 1
        titles = section_titles(text)
        missing = [s for s in REQUIRED_SECTIONS if s not in titles]
        if missing:
            check(
                "schema-incomplete",
                "missing handoff sections: " + ", ".join(missing),
            )
        else:
            checks += 1
            if not re.search(r"\*\*Compacted at:\*\*", text):
                check(
                    "schema-incomplete",
                    "missing 'Compacted at:' marker line",
                )

        # ── Check 3: constraints absent post-compaction ────────────────
        if "Preserved Constraints" in titles:
            checks += 1
            entries = nonempty_entries(section_body(text, "Preserved Constraints"))
            if not entries:
                check(
                    "constraints-absent-post-compaction",
                    "Preserved Constraints section is present but carries no "
                    "entries (may be legitimate when the session had no "
                    "constraints — the model decides; if constraints WERE "
                    "known before compaction, this is the 2026-10-23 "
                    "silent-vanish defect class)",
                )

    # ── Check 4: extractor failed last run ──────────────────────────────
    checks += 1
    if os.path.exists(args.status_file):
        try:
            with open(args.status_file, "r", encoding="utf-8") as fh:
                status = json.load(fh)
            if status.get("ok") is False:
                check(
                    "extractor-failed-last-run",
                    f"bd_remember.py last invocation failed at "
                    f"{status.get('last_run', '<unknown time>')}: "
                    f"{status.get('error', '<no error recorded>')}",
                )
            elif status.get("ok") is not True:
                check(
                    "extractor-status-unreadable",
                    f"{args.status_file} carries no ok field — cannot verify "
                    f"extractor health",
                )
            else:
                notes.append(
                    f"extractor-status: last run {status.get('last_run', '?')} ok"
                )
        except (OSError, ValueError) as err:
            check(
                "extractor-status-unreadable",
                f"{args.status_file} present but unparseable: {err}",
            )
    else:
        notes.append(
            "extractor-status: no run recorded yet (instrument new or never "
            "run this desk) — not a trigger"
        )

    # ── Emit ────────────────────────────────────────────────────────────
    print(f"DEGRADED-MODE-SCAN: hotcache={args.hotcache}")
    for line in triggers:
        print(line)
    for line in notes:
        print(f"NOTE {line}")
    if not triggers:
        print(f"CLEAN: no mechanical degraded-mode triggers ({checks} checks run)")
    print(
        "CONSUMPTION: detection only — the degraded-mode RESPONSE (visible "
        "signal, blocking destructive ops pending confirmation, aggressive "
        "rehydration) stays model judgment per compaction/SKILL.md; a "
        "trigger means: apply the Observable Degraded Mode protocol before "
        "destructive operations."
    )
    return 1 if triggers else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:  # noqa: BLE001 — last-resort fail-closed
        stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        print(f"DEGRADED-MODE-SCAN: hotcache scan failed internally ({err})")
        print(f"TRIGGER scan-failed: internal error at {stamp} — treat as degraded (fail-closed)")
        print(
            "CONSUMPTION: detection only — response stays model judgment "
            "(compaction/SKILL.md)."
        )
        sys.exit(2)
