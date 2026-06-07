---
name: vault-lint
description: "Validate Main-vault structure: wiki frontmatter, discovery completeness, index accuracy, broken links. Use when: (1) before publishing, (2) after bulk operations, (3) periodic health checks. Triggers: lint, validate vault, check structure, verify wiki."
compatibility: opencode
triggers:
  - "wiki pages"
  - "discovery files"
  - "index.md"
  - ".sisyphus/plans/*.md"
mode: afk-safe
inputs:
  - "wiki pages"
  - "discovery files"
  - "index.md"
  - ".sisyphus/plans/*.md"
outputs:
  - "validation report"
  - "error list"
  - "health check"
produces_artifacts:
requires_artifacts:
  - "vault structure (wiki/, raw/, .sisyphus/)"
gates:
metadata:
  version: 1.0.0
  category: validation
---



# Vault Lint - Structure Validation

## Overview

Validates Main-vault's knowledge structures: wiki frontmatter, discovery file completeness, index.md accuracy, and internal link integrity. Catches errors before they propagate.

## Core Workflows

### Workflow 1: Validate Discovery Files

**Trigger:** "lint discoveries", "validate discoveries", "check discovery format"

**Steps:**
1. **List all discovery files**
   ```bash
   find ~/Main-vault/wiki/discoveries/ -name "*.md" -type f
   ```

2. **For each discovery file, check:**
   ```python
   import yaml
   
   # Extract frontmatter
   with open(filepath) as f:
       content = f.read()
   parts = content.split('---', 2)
   if len(parts) < 3:
       REPORT: "Missing frontmatter delimiters"
   
   frontmatter = yaml.safe_load(parts[1])
   body = parts[2]
   
    # Required fields
    required = ['title', 'date_created', 'sources']
    for field in required:
        if field not in frontmatter:
            REPORT: f"Missing required field: {field}"
    
    # Date format
    if not re.match(r'\d{4}-\d{2}-\d{2}', frontmatter['date_created']):
        REPORT: f"Invalid date format: {frontmatter['date_created']} (expected YYYY-MM-DD)"
   
   # Body sections
   required_sections = ['Summary', 'Evidence', 'Implications', 'Next Steps']
   for section in required_sections:
       if f'## {section}' not in body:
           REPORT: f"Missing section: {section}"
   ```

3. **Report findings**
   ```
   Validation Report: wiki/discoveries/
   
   Files checked: 12
   Files valid: 10
   Files with warnings: 2
   
   Warnings:
     - 2026-04-27-rep-herding-behavior.md: Missing "Next Steps" section
     - 2026-04-28-sim-fish-tank-v2-protocol-comparison.md: Date format suspect (has time component)
   
   Status: WARNING (non-critical issues found)
   ```

**Output:** Count of files checked, list of files with issues, severity assessment

---

### Workflow 2: Validate Index Accuracy

**Trigger:** "validate index", "check index counts", "verify index.md"

**Steps:**
1. **Count actual files**
   ```bash
    DISCOVERIES=$(find ~/Main-vault/wiki/discoveries/ -name "*.md" | wc -l)
    CONCEPTS=$(find ~/Main-vault/wiki/concepts/ -name "*.md" | wc -l)
    ENTITIES=$(find ~/Main-vault/wiki/entities/ -name "*.md" | wc -l)
    SOURCES=$(find ~/Main-vault/wiki/sources/ -name "*.md" | wc -l)
    SYNTHESIS=$(find ~/Main-vault/wiki/synthesis/ -name "*.md" | wc -l)
    QUESTIONS=$(find ~/Main-vault/wiki/questions/ -name "*.md" | wc -l)
    PROJECTS=$(find ~/Main-vault/projects/ -maxdepth 1 -type d | wc -l)
   ```

2. **Extract counts from index.md**
   ```bash
    INDEX_DISCOVERIES=$(grep "Discoveries:" ~/Main-vault/index.md | grep -oP '\d+' | head -1)
    INDEX_CONCEPTS=$(grep "Concepts:" ~/Main-vault/index.md | grep -oP '\d+' | head -1)
    INDEX_ENTITIES=$(grep "Entities:" ~/Main-vault/index.md | grep -oP '\d+' | head -1)
    INDEX_SOURCES=$(grep "Sources:" ~/Main-vault/index.md | grep -oP '\d+' | head -1)
    INDEX_SYNTHESIS=$(grep "Synthesis:" ~/Main-vault/index.md | grep -oP '\d+' | head -1)
    INDEX_QUESTIONS=$(grep "Questions:" ~/Main-vault/index.md | grep -oP '\d+' | head -1)
   ```

3. **Compare**
   ```
    Discoveries: actual=49, index=49  ✓ MATCH
    Concepts: actual=42, index=42     ✓ MATCH
    Entities: actual=18, index=18     ✓ MATCH
    Sources: actual=28, index=28      ✓ MATCH
    Synthesis: actual=10, index=10    ✓ MATCH
    Questions: actual=3, index=3      ✓ MATCH
    Projects: actual=2, index=2       ✓ MATCH
   ```

4. **If mismatch: suggest fix**
   ```
   Action Required:
   Run: python3 ~/Main-vault/scripts/update_index.py
   ```

**Output:** Comparison table, status (MATCH/MISMATCH), suggested fix

---

### Workflow 3: Check Broken Internal Links

**Trigger:** "check links", "validate links", "find broken references"

**Steps:**
1. **Extract all markdown links (standard and wikilinks)**
   ```bash
   grep -rE "\[.*\]\(.*\.md\)|\[\[.*\]\]" ~/Main-vault/wiki/ | grep -oP '(?<=\().*?\.md(?=\))|(?<=\[\[).*?(?=\]\])'
   ```

2. **For each link, check if target exists**
   ```python
   import re
   from pathlib import Path
   
   vault_root = Path('~/Main-vault')
   wiki_root = vault_root / 'wiki'
   
   for file in wiki_root.rglob('*.md'):
       content = file.read_text()
       # Standard markdown links
       md_links = re.findall(r'\[.*?\]\((.*?\.md)\)', content)
       for link in md_links:
           target = file.parent / link
           if not target.exists():
               REPORT: f"{file.name} → {link} (NOT FOUND)"
       # Wikilinks [[page-name]]
       wiki_links = re.findall(r'\[\[(.*?)\]\]', content)
       for link in wiki_links:
           # Strip alias if present: [[page-name|alias]]
           page_name = link.split('|')[0].strip()
           # Search in all wiki subdirectories
           found = any((wiki_root / subdir / (page_name + '.md')).exists() 
                      for subdir in ['discoveries', 'concepts', 'entities', 'sources', 'synthesis', 'questions'])
           if not found:
               REPORT: f"{file.name} → [[{page_name}]] (NOT FOUND)"
   ```

3. **Report broken links**
   ```
   Broken Links Report:
   
   wiki/discoveries/2026-04-27-rep-herding-behavior.md:
     - ../concepts/reputation-systems.md (NOT FOUND)
     - ../../projects/sim-fish-tank/README.md (NOT FOUND)
   
   Status: FAIL (2 broken links)
   ```

**Output:** List of files with broken links, target paths, status

---

### Workflow 4: Validate Plan Structure

**Trigger:** "lint plan", "validate plan", "check plan format"

**Input Requirements:**
- Plan file path (e.g., `.sisyphus/plans/brain-characters.md`)

**Steps:**
1. **Check required sections**
   ```python
   required_sections = [
       '# ',           # Title
       '## TL;DR',
       '## Context',
       '## Work Objectives',
       '## Verification',
       '## Execution'
   ]
   
   content = Path(plan_file).read_text()
   for section in required_sections:
       if section not in content:
           REPORT: f"Missing section: {section}"
   ```

2. **Check TODOs have structure**
   ```python
   todos = re.findall(r'- \[.\] \d+\. (.+)', content)
   for todo in todos:
       # Check if followed by What/Output/Verify
       if 'What:' not in content[content.index(todo):content.index(todo)+200]:
           REPORT: f"TODO '{todo}' missing acceptance criteria"
   ```

3. **Delegate to auditor agent**
   For comprehensive plan validation, use auditor agent with checklist

**Output:** Section checklist, TODO validation, status

---

### Workflow 5: Full Vault Health Check

**Trigger:** "full vault lint", "health check", "validate everything"

**Steps:**
1. Run Workflow 1 (validate discoveries)
2. Run Workflow 2 (validate index)
3. Run Workflow 3 (check broken links)
4. Check `.sisyphus/` structure exists
5. Check beads database accessible
6. Check all scripts executable

**Output:** Comprehensive health report with severity levels (PASS/WARNING/FAIL)

---

## Integration with Auditor Agent

For deep validation, delegate to `auditor` agent:

```
Task: Use auditor agent with vault-lint skill to validate {target}
```

Auditor provides checklist-driven validation with detailed failure reports.

## Quality Standards

- All discovery files must have valid YAML frontmatter with title, date_created, sources
- All discovery files must have 4 sections: Summary, Evidence, Implications, Next Steps
- index.md counts must match actual file counts (±0 tolerance)
- No broken internal links in wiki/ (external links allowed to be stale)
- All plans must follow template structure

## Error Handling

| Issue | Severity | Action |
|-------|----------|--------|
| Missing frontmatter field | WARNING | Report, suggest adding field |
| Invalid date format | WARNING | Report, suggest YYYY-MM-DD |
| Missing body section | WARNING | Report, suggest adding section |
| Index count mismatch | FAIL | Run update_index.py immediately |
| Broken internal link | FAIL | Fix link or remove reference |
| Missing plan section | WARNING | Report, delegate to auditor for details |

## Reporting Format

```
Vault Lint Report
Generated: {timestamp}

Summary:
  Files checked: {N}
  Issues found: {M}
  
  Status: [PASS / WARNING / FAIL]

Details:
  ✓ {item passed}
  ⚠ {item warned} - {suggestion}
  ✗ {item failed} - {what's wrong}

Recommended Actions:
  1. [Action to fix critical issues]
  2. [Action to address warnings]
```

## Tool Usage

- **Read tools**: Use to read wiki pages, discovery files, plans, and index.md for validation
- **Write tools**: Use ONLY to fix broken links or update index.md counts if validation fails
- **Bash tools**: Use for running `grep`, `find`, `wc`, and Python validation scripts
- **Question tool**: Use when validation target is ambiguous or user scope is unclear
- **Task tool**: Use to delegate deep validation to `auditor` agent for comprehensive checks

## Boundaries

- **Do NOT create new wiki pages or discovery files** — validation is read-only; fixing is `vault-ops` domain
- **Do NOT modify `raw/` sources** — `raw/` is immutable per AGENTS.md; report violations but don't fix
- **Do NOT create or close beads issues** — issue management is `vault-ops` or `sisyphus-plan` domain
- **Do NOT run simulations or generate results** — `vault-lint` is for structural validation only
- **Do NOT modify plan content** — report plan structure issues; content changes require user approval via `sisyphus-plan`
- **Do NOT modify agent definitions or skill files** — those are `agent-development` domain

## Integration with Other Skills

This skill provides automated structural validation for the vault:

```
[Before publish]
  ↓
vault-lint (structural validation)
  ↓
Branch: PASS / WARNING / FAIL
  ↓
vault-ops (fixes issues if needed)
  ↓
archivist (publishes after validation)
```

**Input from:**
- `archivist`: "Validate before publishing" trigger
- `vault-ops`: Periodic health checks
- User: "lint", "validate vault", "check structure"

**Output to:**
- `vault-ops`: Validation report with fixes needed
- `archivist`: PASS allows publishing to proceed
- `auditor`: Structural output for semantic review

**Relationship with other skills:**
- **vault-lint** (this skill): Automated structural checks (frontmatter, counts, links)
- **auditor**: Semantic validation (PRD quality, issue structure, TDD evidence)
- **vault-ops**: Fixes issues found by vault-lint
- **archivist**: Uses vault-lint before publishing

**When to use vs other skills:**
- Use **vault-lint** for automated structural validation (can run frequently)
- Use **auditor** for semantic quality review (human judgment required)
- Use **vault-ops** to fix issues found by vault-lint
- Use **archivist** for publishing (validates first via vault-lint)

## Related Skills

- **vault-ops**: Fix issues found by vault-lint (update index, sync beads)
- **sisyphus-plan**: Validate plan structure before starting execution
- **athena-research**: Research vault conventions if uncertain about structure
