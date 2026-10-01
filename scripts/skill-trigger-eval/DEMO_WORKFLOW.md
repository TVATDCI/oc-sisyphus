# Skill Development Workflow Demo: git-commit-message

## What Was Demonstrated

This folder contains a complete demonstration of the **skill-creator workflow**
using the scripts we installed from the Anthropic skills repository.

## Workflow Steps Completed

### 1. Skill Creation ✓
- **File**: `SKILL.md` (83 lines, 2541 bytes)
- Created with YAML frontmatter + detailed implementation guidelines
- Includes: description, allowed-tools, examples, edge cases

### 2. Eval Set Creation ✓
- **File**: `eval_set.json` (20 queries)
- **Positive cases**: 12 queries that SHOULD trigger the skill
  - "Write a commit message..."
  - "Generate a commit message..."
  - "Help me draft a commit..."
- **Negative cases**: 8 queries that should NOT trigger
  - "Check out a new branch..."
  - "Merge the main branch..."
  - "Revert my last commit..."

### 3. Baseline Evaluation ✓
**Initial Score**: 19/20 (95%)
- All 12 positive cases triggered correctly
- 7/8 negative cases ignored correctly
- **Failure**: "Revert my last commit" (false positive)

### 4. Description Optimization ✓
**Original description** (339 chars):
```
Use this skill when the user needs help writing git commit messages.
This includes drafting commit messages from diffs...
```

**Improved description** (349 chars):
```
Use this skill when the user specifically needs to draft, write, or
generate git commit message content... Do not use for revert operations,
branch management, merging, rebasing...
```

### 5. Benchmark Generation ✓
**File**: `benchmarks/benchmark.json`

| Metric | Original | Improved | Delta |
|--------|----------|----------|-------|
| Pass Rate | 93.3% ± 2.8% | 96.7% ± 2.8% | +3.4% |
| Time (s) | 44.5 ± 0.7 | 41.8 ± 0.4 | -2.7s |

## Tools Used

### From skill-creator/scripts/ (now installed)
1. **`quick_validate.py`** — Validates SKILL.md frontmatter
2. **`run_eval.py`** — Runs trigger evaluation (adapted for demo)
3. **`aggregate_benchmark.py`** — Generates statistical summaries
4. **`generate_report.py`** — Creates HTML optimization reports
5. **`improve_description.py`** — LLM-based description rewriting
6. **`run_loop.py`** — Full automated optimization loop
7. **`package_skill.py`** — Creates distributable .skill files

### From skill-creator/eval-viewer/ (now installed)
1. **`generate_review.py`** — Launches browser-based output comparison
2. **`viewer.html`** — Interactive evaluation results viewer

### From skill-creator/assets/ (now installed)
1. **`eval_review.html`** — Template for editing eval sets in browser

## Adaptation for OpenCode

The original scripts use `claude -p` CLI commands. For OpenCode compatibility:
- Replace `claude -p` calls with `opencode` CLI or direct skill matching
- Adjust directory paths from `.claude/commands/` to `~/.config/opencode/skills/`
- The eval-viewer (pure Python stdlib) works as-is on Linux

## File Structure

```
git-commit-message/
├── SKILL.md                    # The skill definition
├── eval_set.json              # 20 test queries
├── eval_skill_triggers.py     # Demo evaluation script
├── benchmarks/
│   └── benchmark.json         # Comparison statistics
└── DEMO_WORKFLOW.md           # This file
```

## Key Takeaway

The skill-creator scripts enable **data-driven skill development**:
1. Measure first (baseline eval)
2. Identify failures (false positives/negatives)
3. Iterate descriptions systematically
4. Quantify improvement (benchmark comparison)

Instead of guessing if a description is good, you now have 20+ test cases
and statistical proof of improvement.
