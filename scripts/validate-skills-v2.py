#!/usr/bin/env python3
"""
validate-skills-v2.py — Real YAML + schema validation for OpenCode skills.

Replaces grep-based validate-skills.sh with proper YAML parsing and schema
enforcement. Catches syntax errors, missing fields, and type violations.

Usage:
    python3 validate-skills-v2.py [--all] [skill-name]
    python3 validate-skills-v2.py --test        # run self-test fixtures
    python3 validate-skills-v2.py --audit         # full audit mode (all surfaces)

Exit codes:
    0 = all valid
    1 = one or more failures
    2 = usage error
"""

import sys
import os
import re
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML not installed. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(2)

# --- Configuration ---

def resolve_dir(env_var: str, *fallbacks: str) -> Path:
    candidates = [c for c in (os.environ.get(env_var), *fallbacks) if c]
    for c in candidates:
        expanded = Path(c).expanduser()
        if expanded.is_dir():
            return expanded
    return Path(candidates[0]).expanduser()


SKILLS_DIR = resolve_dir(
    "OPENCODE_SKILLS_DIR",
    str(Path.home() / ".config" / "opencode" / "skills"),
    "skills",
)
AGENTS_DIR = resolve_dir(
    "OPENCODE_AGENTS_DIR",
    str(Path.home() / ".config" / "opencode" / "agents"),
    "agents",
)

# Known optional fields used by the actual skill set.
# Any field not in REQUIRED or OPTIONAL will trigger a warning.
REQUIRED_FIELDS = {"name", "description"}
OPTIONAL_FIELDS = {
    "compatibility",
    "metadata",
    "triggers",
    "mode",
    "inputs",
    "outputs",
    "produces_artifacts",
    "requires_artifacts",
    "gates",
    "license",
    "allowed-tools",
    "version",
}

# Constraints per field
MAX_LENGTHS = {
    "name": 64,
    "description": 1024,
    "compatibility": 500,
    "license": 256,
}

# Regex for kebab-case names
KEBAB_CASE_RE = re.compile(r"^[a-z0-9-]+$")


class Colors:
    RED = "\033[0;31m"
    GREEN = "\033[0;32m"
    YELLOW = "\033[1;33m"
    BLUE = "\033[0;34m"
    NC = "\033[0m"


def print_result(label: str, status: str, message: str = ""):
    """Print a single validation result line."""
    color = {"PASS": Colors.GREEN, "FAIL": Colors.RED, "WARN": Colors.YELLOW}.get(status, Colors.NC)
    msg = f"  {message}" if message else ""
    print(f"  {label:40s} {color}{status}{Colors.NC}{msg}")


def validate_frontmatter(skill_dir: Path) -> tuple[bool, list[str], list[str]]:
    """
    Validate one skill directory.
    Returns: (is_valid, errors, warnings)
    """
    errors = []
    warnings = []
    skill_name = skill_dir.name

    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        errors.append("Missing SKILL.md")
        return False, errors, warnings

    content = skill_md.read_text(encoding="utf-8")
    if not content.startswith("---"):
        errors.append("No YAML frontmatter (must start with ---)")
        return False, errors, warnings

    # Extract frontmatter using line-anchored regex (same logic as runtime)
    # Match --- on its own line, then content, then --- on its own line
    match = re.search(r'(?:^|\n)---\s*\n(.*?)\n---\s*(?:\n|$)', content, re.DOTALL)
    if not match:
        errors.append("Invalid frontmatter format (must have opening --- and closing --- on their own lines)")
        return False, errors, warnings

    frontmatter_text = match.group(1)

    # Parse YAML
    try:
        data = yaml.safe_load(frontmatter_text)
    except yaml.YAMLError as e:
        errors.append(f"Invalid YAML: {e}")
        return False, errors, warnings

    if not isinstance(data, dict):
        errors.append(f"Frontmatter must be a YAML dictionary, got {type(data).__name__}")
        return False, errors, warnings

    # Check required fields
    for field in REQUIRED_FIELDS:
        if field not in data or data[field] is None:
            errors.append(f"Missing required field: '{field}'")

    # Check for unknown fields
    all_known = REQUIRED_FIELDS | OPTIONAL_FIELDS
    unknown = set(data.keys()) - all_known
    for key in unknown:
        warnings.append(f"Unknown field '{key}' (not in schema)")

    # Validate name
    name = data.get("name", "")
    if isinstance(name, str) and name:
        if not KEBAB_CASE_RE.match(name):
            errors.append(f"Name '{name}' must be kebab-case (lowercase, digits, hyphens only)")
        if name.startswith("-") or name.endswith("-") or "--" in name:
            errors.append(f"Name '{name}' cannot start/end with hyphen or contain consecutive hyphens")
        if len(name) > MAX_LENGTHS.get("name", 64):
            errors.append(f"Name too long ({len(name)} chars, max {MAX_LENGTHS['name']})")
    elif "name" in data:
        errors.append(f"Name must be a string, got {type(name).__name__}")

    # Validate description
    description = data.get("description", "")
    if isinstance(description, str) and description:
        if "<" in description or ">" in description:
            errors.append("Description cannot contain angle brackets (< or >)")
        if len(description) > MAX_LENGTHS.get("description", 1024):
            errors.append(f"Description too long ({len(description)} chars, max {MAX_LENGTHS['description']})")
    elif "description" in data:
        errors.append(f"Description must be a string, got {type(description).__name__}")

    # Validate other string fields
    for field, max_len in MAX_LENGTHS.items():
        if field in ("name", "description"):
            continue
        value = data.get(field, "")
        if isinstance(value, str) and len(value) > max_len:
            errors.append(f"'{field}' too long ({len(value)} chars, max {max_len})")

    # Validate compatibility if present
    compat = data.get("compatibility", "")
    if compat and not isinstance(compat, (str, dict)):
        errors.append(f"Compatibility must be a string or dict, got {type(compat).__name__}")

    return len(errors) == 0, errors, warnings


def validate_agent(file_path: Path) -> tuple[bool, list[str], list[str]]:
    """Validate an agent markdown file."""
    errors = []
    warnings = []
    content = file_path.read_text(encoding="utf-8")

    if not content.startswith("---"):
        warnings.append("No YAML frontmatter")
        return True, errors, warnings

    parts = content.split("---", 2)
    if len(parts) < 2:
        errors.append("Invalid frontmatter format")
        return False, errors, warnings

    try:
        data = yaml.safe_load(parts[1])
    except yaml.YAMLError as e:
        errors.append(f"Invalid YAML: {e}")
        return False, errors, warnings

    if not isinstance(data, dict):
        errors.append(f"Frontmatter must be a YAML dictionary, got {type(data).__name__}")
        return False, errors, warnings

    # Agents should have name and description too
    for field in ("name", "description"):
        if field not in data or data[field] is None:
            warnings.append(f"Missing recommended field: '{field}'")

    return len(errors) == 0, errors, warnings


def run_tests():
    """Run self-test fixtures and exit."""
    import tempfile
    import shutil

    print("Running self-test fixtures...\n")
    tmpdir = tempfile.mkdtemp(prefix="validate-skills-test-")
    all_passed = True

    # --- Negative fixture: broken YAML (unquoted colon) ---
    broken_skill = Path(tmpdir) / "broken-yaml"
    broken_skill.mkdir()
    (broken_skill / "SKILL.md").write_text("""---
name: broken-yaml
description: Use this skill when you see: it breaks
---
""")
    valid, errors, warnings = validate_frontmatter(broken_skill)
    if not valid and any("Invalid YAML" in e for e in errors):
        print_result("broken-yaml (negative)", "PASS", "Correctly caught broken YAML")
    else:
        print_result("broken-yaml (negative)", "FAIL", f"Expected YAML error, got: {errors}")
        all_passed = False

    # --- Negative fixture: missing closing fence ---
    no_close = Path(tmpdir) / "no-close"
    no_close.mkdir()
    (no_close / "SKILL.md").write_text("""---
name: no-close
description: Missing closing fence
Some body text here
""")
    valid, errors, warnings = validate_frontmatter(no_close)
    if not valid and any("Invalid frontmatter format" in e for e in errors):
        print_result("no-close (negative)", "PASS", "Correctly caught missing closing ---")
    else:
        print_result("no-close (negative)", "FAIL", f"Expected frontmatter error, got: {errors}")
        all_passed = False

    # --- Positive fixture: description with --- inside quotes (should NOT break) ---
    dashed_desc = Path(tmpdir) / "dashed-desc"
    dashed_desc.mkdir()
    (dashed_desc / "SKILL.md").write_text("""---
name: dashed-desc
description: "A skill that uses --- in its description"
---
Body text here
""")
    valid, errors, warnings = validate_frontmatter(dashed_desc)
    if valid and not errors:
        print_result("dashed-desc (positive)", "PASS", "Correctly accepted --- inside quoted description")
    else:
        print_result("dashed-desc (positive)", "FAIL", f"Unexpected errors: {errors}")
        all_passed = False

    # --- Positive fixture: valid complex frontmatter ---
    good_skill = Path(tmpdir) / "good-skill"
    good_skill.mkdir()
    (good_skill / "SKILL.md").write_text("""---
name: good-skill
description: "A properly quoted description with: colons, and 'quotes'"
compatibility: opencode
metadata:
  priority: high
triggers:
  - "test trigger"
mode: autonomous
inputs:
  - name: query
    type: string
outputs:
  - name: result
    type: string
---
""")
    valid, errors, warnings = validate_frontmatter(good_skill)
    if valid and not errors:
        print_result("good-skill (positive)", "PASS", "Valid complex frontmatter accepted")
    else:
        print_result("good-skill (positive)", "FAIL", f"Unexpected errors: {errors}")
        all_passed = False

    # --- Missing required field ---
    missing_skill = Path(tmpdir) / "missing-desc"
    missing_skill.mkdir()
    (missing_skill / "SKILL.md").write_text("""---
name: missing-desc
---
""")
    valid, errors, warnings = validate_frontmatter(missing_skill)
    if not valid and any("Missing required field: 'description'" in e for e in errors):
        print_result("missing-desc (negative)", "PASS", "Correctly caught missing description")
    else:
        print_result("missing-desc (negative)", "FAIL", f"Expected missing description, got: {errors}")
        all_passed = False

    # --- Unknown field warning ---
    unknown_skill = Path(tmpdir) / "unknown-field"
    unknown_skill.mkdir()
    (unknown_skill / "SKILL.md").write_text("""---
name: unknown-field
description: "Has an unknown field"
fake_field: 123
---
""")
    valid, errors, warnings = validate_frontmatter(unknown_skill)
    if valid and any("Unknown field 'fake_field'" in w for w in warnings):
        print_result("unknown-field (warn)", "PASS", "Correctly warned on unknown field")
    else:
        print_result("unknown-field (warn)", "FAIL", f"Expected warning, got: {warnings}")
        all_passed = False

    shutil.rmtree(tmpdir)
    print()
    if all_passed:
        print(f"{Colors.GREEN}All self-tests passed.{Colors.NC}")
        return 0
    else:
        print(f"{Colors.RED}Some self-tests failed.{Colors.NC}")
        return 1


def run_audit():
    """Full audit: skills + agents + configs."""
    total_fail = 0
    total_warn = 0
    total_pass = 0

    print(f"Auditing skills in {SKILLS_DIR}...\n")
    if not SKILLS_DIR.exists():
        print(f"{Colors.RED}ERROR: Skills directory not found: {SKILLS_DIR}{Colors.NC}")
        return 1

    for skill_dir in sorted(SKILLS_DIR.iterdir()):
        if not skill_dir.is_dir() or skill_dir.name.startswith("_"):
            continue
        valid, errors, warnings = validate_frontmatter(skill_dir)
        if not valid:
            total_fail += 1
            print(f"{Colors.RED}FAIL{Colors.NC} {skill_dir.name}")
            for e in errors:
                print(f"  {Colors.RED}  - {e}{Colors.NC}")
            for w in warnings:
                print(f"  {Colors.YELLOW}  ! {w}{Colors.NC}")
        elif warnings:
            total_warn += 1
            print(f"{Colors.YELLOW}WARN{Colors.NC} {skill_dir.name}")
            for w in warnings:
                print(f"  {Colors.YELLOW}  ! {w}{Colors.NC}")
        else:
            total_pass += 1

    print(f"\nAuditing agents in {AGENTS_DIR}...\n")
    if AGENTS_DIR.exists():
        for agent_file in sorted(AGENTS_DIR.glob("*.md")):
            valid, errors, warnings = validate_agent(agent_file)
            if not valid:
                total_fail += 1
                print(f"{Colors.RED}FAIL{Colors.NC} {agent_file.name}")
                for e in errors:
                    print(f"  {Colors.RED}  - {e}{Colors.NC}")
            elif warnings:
                total_warn += 1
                print(f"{Colors.YELLOW}WARN{Colors.NC} {agent_file.name}")
                for w in warnings:
                    print(f"  {Colors.YELLOW}  ! {w}{Colors.NC}")
            else:
                total_pass += 1

    print(f"\n{'='*50}")
    print(f"  {Colors.GREEN}PASS:  {total_pass}{Colors.NC}")
    print(f"  {Colors.YELLOW}WARN:  {total_warn}{Colors.NC}")
    print(f"  {Colors.RED}FAIL:  {total_fail}{Colors.NC}")
    print(f"{'='*50}")

    if total_fail > 0:
        print(f"\n{Colors.RED}Audit failed. Fix errors above.{Colors.NC}")
        return 1
    return 0


def main():
    if "--test" in sys.argv:
        return run_tests()
    if "--audit" in sys.argv:
        return run_audit()

    # Default: validate all skills (backward-compatible with old script)
    return run_audit()


if __name__ == "__main__":
    sys.exit(main())
