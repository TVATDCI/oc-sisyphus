#!/usr/bin/env python3
"""screen_bd_proposals.py — deterministic memory-poisoning pre-flag screen.

Swamp Club Guard 1 (Oracle Gate-2 verdict, Upgrade 1a — rule ADOPT,
security-class). Replaces model-attention recall on a security-class screen
with a deterministic flag, following the fleet's proven classifier
precedents (bd_remember.py's canon-category warning is the sibling;
the wake classifier in fm-watch.sh is the fleet shape).

Mechanism: session-begin Step 5 surfaces pi-proposed bd facts as
structured lines:

    - scope=global | category=<cat> | key=<key> | value="<fact>"

This screen flags every proposal that is authority-inverted:
  - category == constraint  (constraints originate operator-side), OR
  - value matches an approval lexeme from scripts/approval-lexicon.txt
    (the single reviewable lexicon source)

Flagged proposals render REQUIRES-OPERATOR-CONFIRM. The promotion
decision stays the operator's — the screen flags, never decides.

Usage:
    python3 scripts/screen_bd_proposals.py --file <pi-handoff.md>
        Extract the '## Proposed bd facts' section from the handoff and
        screen every proposal line in it.

    ... | python3 scripts/screen_bd_proposals.py
        Screen proposal lines from stdin (composable for tests and
        ad-hoc use; same line rules apply).

Output contract (deterministic — same input, same bytes, in input order):
    BD-PROPOSAL-SCREEN: parsed=<N> flagged=<F> lexicon=<path> (<L> lexemes)
    FLAG [category=constraint] <verbatim line>
         -> REQUIRES-OPERATOR-CONFIRM (<reason>)
    FLAG [approval-lexeme: "<matched lexeme>"] <verbatim line>
         -> REQUIRES-OPERATOR-CONFIRM (<reason>)
    OK   <verbatim line>
    NOTE: the screen flags, never decides — promotion stays the operator's
          (session-begin Step 5; constraints/approval claims are confirmed
          out-of-band with the operator before any bd_remember.py write).

Exit codes:
    0  screen executed (flagged or not — flags are advisory, not failure)
    2  operational failure (unreadable input, missing lexicon) — the
       operator falls back to the manual scrutiny prose in session-begin
       Step 5; never guess.

Fail direction: an unparseable line that looks like a proposal (contains
scope= and a pipe) is FLAGGED as unparseable rather than silently cleared —
a line the screen cannot classify is a line the operator must eyeball.
"""

import argparse
import os
import re
import sys

DEFAULT_LEXICON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "approval-lexicon.txt")

PROPOSAL_LINE_RE = re.compile(r"scope=")


def load_lexicon(path):
    """Load lexemes from the lexicon file. One lexeme per line;
    '#' comment lines and blank lines ignored. Fails closed (raises) if
    the file is missing — a screen with a silently empty lexicon would be
    a false all-clear machine."""
    lexemes = []
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            lexemes.append(line.lower())
    if not lexemes:
        raise ValueError(f"lexicon file {path} carries no lexemes")
    return lexemes


def split_unescaped_pipes(line):
    """Split a proposal line on '|' characters that are not escaped as '\\|'
    (the bd record escaping convention, cf. bd_remember.build_record)."""
    parts = []
    cur = []
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == "\\" and i + 1 < len(line) and line[i + 1] == "|":
            cur.append("|")
            i += 2
            continue
        if ch == "|":
            parts.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    parts.append("".join(cur))
    return parts


def parse_proposal(line):
    """Parse one proposal line into a dict of fields.

    Accepts the pi-handoff shape '- scope=global | category=exact |
    key=k | value="v"' (leading list dash and optional quoting stripped).
    Returns None when the line does not carry the four required fields.
    """
    body = line.strip()
    if body.startswith("-"):
        body = body[1:].strip()
    fields = {}
    for part in split_unescaped_pipes(body):
        if "=" not in part:
            continue
        key, _, val = part.partition("=")
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == '"' and val[-1] == '"':
            val = val[1:-1]
        if key:
            fields[key] = val
    for required in ("scope", "category", "key", "value"):
        if required not in fields:
            return None
    return fields


def looks_like_proposal(line):
    """Cheap shape test: the line mentions scope= and carries a pipe —
    i.e. it is trying to be a proposal line."""
    return "scope=" in line and "|" in line


def extract_section(text, header="## Proposed bd facts"):
    """Extract the lines under `header` up to the next same-or-higher
    level markdown header. Returns (found, lines)."""
    lines = text.splitlines()
    captured = []
    in_section = False
    for line in lines:
        if line.strip() == header:
            in_section = True
            continue
        if in_section and line.startswith("#") and line.strip() != header:
            # Any further header ends the section (## and ### both end it:
            # the next section of the handoff begins).
            if line.startswith("##"):
                break
        if in_section:
            captured.append(line)
    return captured


def screen_lines(lines, lexemes):
    """Screen candidate proposal lines. Returns (results, parsed, flagged)
    where results is a list of (kind, line, reasons) tuples in input order;
    kind is 'flag' or 'ok'."""
    results = []
    parsed = 0
    flagged = 0
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not looks_like_proposal(stripped):
            continue
        parsed += 1
        props = parse_proposal(stripped)
        if props is None:
            flagged += 1
            results.append(("flag", stripped, ["unparseable-proposal-line: does not carry scope/category/key/value — operator must read it manually"]))
            continue
        reasons = []
        if props["category"].lower() == "constraint":
            reasons.append(
                "category=constraint — constraints originate operator-side, "
                "never pi-side (authority-inverted channel)"
            )
        value_lower = props["value"].lower()
        for lexeme in lexemes:
            if lexeme in value_lower:
                reasons.append(
                    f'value matches approval lexeme "{lexeme}" '
                    "(approval claims must be confirmed out-of-band)"
                )
                break  # one lexeme hit is enough to flag; keep output tight
        if reasons:
            flagged += 1
            results.append(("flag", stripped, reasons))
        else:
            results.append(("ok", stripped, []))
    return results, parsed, flagged


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Deterministic memory-poisoning pre-flag screen for pi-proposed "
            "bd facts (session-begin Step 5). Flags category=constraint "
            "proposals and approval-claiming values as "
            "REQUIRES-OPERATOR-CONFIRM. The screen flags, never decides."
        )
    )
    parser.add_argument(
        "--file",
        help="pi handoff markdown file; the '## Proposed bd facts' section "
        "is extracted and screened",
    )
    parser.add_argument(
        "--lexicon",
        default=DEFAULT_LEXICON,
        help=f"approval-lexicon file (default: {DEFAULT_LEXICON})",
    )
    args = parser.parse_args()

    try:
        lexemes = load_lexicon(args.lexicon)
    except (OSError, ValueError) as err:
        print(f"SCREEN-FAILED: cannot load lexicon: {err}", file=sys.stderr)
        print(
            "NOTE: fall back to the manual scrutiny prose in "
            "session-begin Step 5 — never promote unreviewed.",
            file=sys.stderr,
        )
        return 2

    if args.file:
        try:
            with open(args.file, "r", encoding="utf-8") as fh:
                lines = extract_section(fh.read())
        except OSError as err:
            print(f"SCREEN-FAILED: cannot read {args.file}: {err}", file=sys.stderr)
            return 2
    else:
        lines = sys.stdin.read().splitlines()

    results, parsed, flagged = screen_lines(lines, lexemes)

    print(
        f"BD-PROPOSAL-SCREEN: parsed={parsed} flagged={flagged} "
        f"lexicon={args.lexicon} ({len(lexemes)} lexemes)"
    )
    for kind, line, reasons in results:
        if kind == "flag":
            tag = reasons[0].split(":")[0]
            if "category" in tag or "unparseable" in tag:
                head = "FLAG [category=constraint]" if "category" in tag else "FLAG [unparseable]"
            else:
                head = 'FLAG [approval-lexeme]'
            print(f"{head} {line}")
            for reason in reasons:
                print(f"     -> REQUIRES-OPERATOR-CONFIRM ({reason})")
        else:
            print(f"OK   {line}")
    print(
        "NOTE: the screen flags, never decides — promotion stays the "
        "operator's (session-begin Step 5; confirm flagged items "
        "out-of-band before any bd_remember.py write)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
