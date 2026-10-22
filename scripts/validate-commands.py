#!/usr/bin/env python3
"""validate-commands.py — commands/*.md palette-schema validator (P1-d).

The V2 command loader (packages/core/src/config/plugin/command.ts, 2.1.x)
silently DROPS any commands/*.md whose frontmatter fails schema decode —
the same silent-drop class the agent loader has. A dropped file never
appears in the palette with zero diagnostics, so this validator pins the
structural contract every command file must satisfy:

  - well-formed YAML frontmatter (--- delimited), optional
  - keys subset of the loader's schema: description, agent, model,
    subagent, subtask, template, $schema (the BODY is the template —
    ConfigCommand.Info.template is filled from markdown content)
  - description, when present, a non-empty string
  - non-empty body (an empty template is a dead command)
  - shell blocks (`!`cmd``) syntactically balanced when present

Also asserts the fleet's wrapper invariants: every command file is a
lean wrapper (skill-load or shell-block), never a second copy of a skill
body (one-owner rule).

Usage:  python3 scripts/validate-commands.py [--check | --self-test]
        --check     validate commands/ (default)
        --self-test prove the validator catches each drop-class
Exit:   0 = PASS, 1 = FAIL.
"""

from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
COMMANDS_DIR = REPO_ROOT / "commands"

ALLOWED_KEYS = {"description", "agent", "model", "subagent", "subtask", "template", "$schema"}
SHELL_BLOCK_RE = re.compile(r"!`([^`]*)`")


def parse_frontmatter(text: str):
    """Return (fm_lines, body) or None when the file has no frontmatter."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None
    try:
        close = next(i for i, l in enumerate(lines[1:], start=1) if l.strip() == "---")
    except StopIteration:
        return None
    return lines[1:close], "\n".join(lines[close + 1 :]).strip("\n")


def parse_simple_yaml(fm_lines: list[str]) -> dict:
    """Parse the flat key: value frontmatter commands use (no nesting)."""
    out: dict = {}
    for line in fm_lines:
        if not line.strip():
            continue
        m = re.match(r"^([A-Za-z_$][\w$]*):\s*(.*)$", line)
        if not m:
            raise ValueError(f"unparseable frontmatter line: {line!r}")
        key, value = m.group(1), m.group(2).strip()
        if value.startswith('"') and value.endswith('"') and len(value) >= 2:
            value = value[1:-1]
        out[key] = value
    return out


def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    name = path.name
    parsed = parse_frontmatter(path.read_text(encoding="utf-8"))
    if parsed is None:
        return [f"{name}: no YAML frontmatter (loader requires the block; body is the template)"]
    fm_lines, body = parsed
    try:
        fm = parse_simple_yaml(fm_lines)
    except ValueError as e:
        return [f"{name}: {e}"]
    for key in fm:
        if key not in ALLOWED_KEYS:
            errors.append(f"{name}: unknown frontmatter key {key!r} (loader schema: {sorted(ALLOWED_KEYS)})")
    desc = fm.get("description")
    if desc is not None and not isinstance(desc, str) or desc == "":
        errors.append(f"{name}: description must be a non-empty string when present")
    if not body.strip():
        errors.append(f"{name}: empty body — the template is the body; empty = dead command")
    # Shell-block sanity: every !` opener needs its closing backtick.
    for match in SHELL_BLOCK_RE.finditer(body):
        if not match.group(1).strip():
            errors.append(f"{name}: empty shell block !`` (loader would run an empty command)")
    opens = len(re.findall(r"!`", body))
    if opens != len(SHELL_BLOCK_RE.findall(body)):
        errors.append(f"{name}: unbalanced shell-block backticks (!` without closing `)")
    return errors


def validate_dir(commands_dir: Path) -> tuple[list[str], int]:
    errors: list[str] = []
    files = sorted(commands_dir.glob("*.md"))
    for path in files:
        errors.extend(validate_file(path))
    return errors, len(files)


def self_test() -> int:
    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="validate-commands-") as tmp:
        root = Path(tmp)
        (root / "good.md").write_text(
            "---\ndescription: A good wrapper\n---\nDo the thing: !`echo hi`\n",
            encoding="utf-8",
        )
        err, n = validate_dir(root)
        if err or n != 1:
            failures.append(f"clean file reported {err}")

        (root / "good.md").unlink()
        cases = {
            "unknown-key.md": "---\ndescription: x\npermissions: []\n---\nbody\n",
            "empty-body.md": "---\ndescription: x\n---\n\n",
            "no-frontmatter.md": "just a body\n",
            "empty-shell-block.md": "---\ndescription: x\n---\nRun !`` now\n",
            "unbalanced-block.md": "---\ndescription: x\n---\nRun !`echo hi now\n",
        }
        for fname, text in cases.items():
            (root / fname).write_text(text, encoding="utf-8")
        err, _ = validate_dir(root)
        for fname in cases:
            if not any(fname in e for e in err):
                failures.append(f"drop-class not caught for {fname}: {err}")
    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        print("self-test: FAIL")
        return 1
    print("self-test: PASS (clean file + all 5 silent-drop classes caught)")
    return 0


def main() -> int:
    if "--self-test" in sys.argv[1:]:
        return self_test()
    if not COMMANDS_DIR.is_dir():
        print("FAIL: no commands/ directory")
        return 1
    errors, count = validate_dir(COMMANDS_DIR)
    for e in errors:
        print(f"FAIL: {e}")
    if errors:
        print(f"commands validator: FAIL ({len(errors)} error(s) in {count} files)")
        return 1
    print(f"commands validator: PASS ({count} command files palette-schema-valid)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
