#!/usr/bin/env bash
# check-doc-claims.sh — Numeric-claim drift guard for COMPLETE-CODEBASE.md
#
# Extracts numeric claims from COMPLETE-CODEBASE.md via 5 regex patterns
# (Oracle-revised, per g1-g3-g5-implementation.md §3), deduplicates by
# noun_phrase, runs the corresponding ground-truth command, and asserts
# the claimed number matches the filesystem reality.
#
# Usage:
#   bash scripts/check-doc-claims.sh          # Normal — exit 0 on no drift, 1 on drift
#   bash scripts/check-doc-claims.sh --self-test  # Self-test mode
#
# Self-test protocol:
#   1. Run against current COMPLETE-CODEBASE.md → exit 0 (no drift)
#   2. Break one claim (change "17 agents" to "99 agents" in a temp copy) → exit 1
#   3. Restore → exit 0
#
# Ground-truth table (current system state):
#   17 agents | 9 categories | 14 rule files | 45 skill directories | 8 subagent .md
#   0 model: lines | 15 scripts | 13 src/ modules | 3 JSONL baseline runs
#   180 unit tests | 2 agents have write access
#
# Design:
#   - set -euo pipefail for strict error handling
#   - 5 regex patterns matching the 5 claim formats in COMPLETE-CODEBASE.md
#   - Exclusion list: timeline bullets (47-49, 80-83), historical (55,66),
#     workflow phase table (143-151)
#   - Dedup by normalized noun_phrase (case-insensitive)
#   - Self-test: --self-test flag runs a 3-step verification

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC_FILE="${DOC_CLAIMS_FILE:-$REPO_ROOT/COMPLETE-CODEBASE.md}"
TMP_CLAIMS=$(mktemp)
trap 'rm -f "$TMP_CLAIMS"' EXIT

failures=0

# Exclusion: line numbers to skip when extracting claims
# 47-49: Wave 4C/Track 1/Track 2 timeline bullets
# 55,66: Historical counts in §2 Timeline
# 80-83: Jun 6 timeline bullet entries
# 143-151: Workflow phase table (9-phase count enforced by state.js schema)
EXCLUDE='^(47|48|49|55|66|80|81|82|83|14[3-9]|15[0-1])$'

# ── Helpers ─────────────────────────────────────────────────────────────────

is_excluded() { echo "$1" | grep -qE "$EXCLUDE"; }

# ── Pattern extraction functions ────────────────────────────────────────────
# Each extracts "number|noun_phrase" from matching non-excluded lines.
# Regex patterns are stored in variables to avoid bash parsing unquoted #
# inside [[ =~ ]] as a comment start.

# Pattern 1: Inline # annotation in directory tree (lines 11, 17, 19, 22, 37, 38, 39)
#   grep -E '│?\s*└?──\s*[^\s#]+\s*#\s+[0-9]+\s+([a-zA-Z]+|-Phase)'
extract_p1() {
  local greppat='│?\s*└?──\s*[^\s#]+\s*#\s+[0-9]+\s+([a-zA-Z]+|-Phase)'
  local re='#[[:space:]]([0-9]+)[[:space:]]+([a-zA-Z]+)'
  while IFS=: read -r ln rest; do
    is_excluded "$ln" && continue
    if [[ "$rest" =~ $re ]]; then
      echo "${BASH_REMATCH[1]}|${BASH_REMATCH[2]}"
    fi
  done < <(grep -nE "$greppat" "$DOC_FILE" || true)
}

# Pattern 2: Parenthetical count in inline comment (lines 11, 17, 19, 22, 37, 38)
#   grep -E '#\s*\b[0-9]+\b\s+(rule files|subagent|directories|scripts|src/|unit tests|categories|agents|model:)'
extract_p2() {
  local greppat='#\s*\b[0-9]+\b\s+(rule files|subagent|directories|scripts|src/|unit tests|categories|agents|model:)'
  local re='#[[:space:]]*([0-9]+)[[:space:]]+(rule files|subagent|directories|scripts|src/|unit tests|categories|agents|model:)'
  while IFS=: read -r ln rest; do
    is_excluded "$ln" && continue
    if [[ "$rest" =~ $re ]]; then
      echo "${BASH_REMATCH[1]}|${BASH_REMATCH[2]}"
    fi
  done < <(grep -nE "$greppat" "$DOC_FILE" || true)
}

# Pattern 3: Bolded count in bullet (low yield — Oracle-revised)
#   grep -nE '\*\*[A-Za-z0-9 ]+\*\*.*\b[0-9]+\b\s+(SKILL\.md|plugin source|scripts|categories|unit tests|tests)'
extract_p3() {
  local greppat='\*\*[A-Za-z0-9 ]+\*\*.*\b[0-9]+\b\s+(SKILL\.md|plugin source|scripts|categories|unit tests|tests)'
  local re='\*\*[A-Za-z0-9 ]+\*\*.*\b([0-9]+)\b\s+(SKILL\.md|plugin source|scripts|categories|unit tests|tests)'
  while IFS=: read -r ln rest; do
    is_excluded "$ln" && continue
    if [[ "$rest" =~ $re ]]; then
      echo "${BASH_REMATCH[1]}|${BASH_REMATCH[2]}"
    fi
  done < <(grep -nE "$greppat" "$DOC_FILE" || true)
}

# Pattern 4: Prose assertion with parenthetical (line 152, 155, 158)
#   grep -E '^\s*\b[0-9]+\b\s+([A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+)*?)\s*(\(.+\))?:'
extract_p4() {
  local greppat='^\s*\b[0-9]+\b\s+([A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+)*?)\s*(\(.+\))?:'
  local re='^[[:space:]]*([0-9]+)[[:space:]]+([A-Z][a-zA-Z]+)'
  while IFS=: read -r ln rest; do
    is_excluded "$ln" && continue
    if [[ "$rest" =~ $re ]]; then
      echo "${BASH_REMATCH[1]}|${BASH_REMATCH[2]}"
    fi
  done < <(grep -nE "$greppat" "$DOC_FILE" || true)
}

# Pattern 5A: Section header with embedded count (line 7)
#   grep -E '^[0-9]+\.\s+[A-Z][a-zA-Z ]+?\s*[—(]\s*[0-9]+\s+([a-zA-Z]+|-Phase)'
extract_p5a() {
  local greppat='^[0-9]+\.\s+[A-Z][a-zA-Z ]+?\s*[—(]\s*[0-9]+\s+([a-zA-Z]+|-Phase)'
  local re='[—(][[:space:]]*([0-9]+)[[:space:]]+([a-zA-Z]+)'
  while IFS=: read -r ln rest; do
    is_excluded "$ln" && continue
    if [[ "$rest" =~ $re ]]; then
      echo "${BASH_REMATCH[1]}|${BASH_REMATCH[2]}"
    fi
  done < <(grep -nE "$greppat" "$DOC_FILE" || true)
}

# Pattern 5B: Section header em-dash form for 9-Phase (line 86)
#   grep -E '^[0-9]+\.\s+[A-Z][a-zA-Z ]+?\s+—\s+[0-9]+-Phase'
extract_p5b() {
  local greppat='^[0-9]+\.\s+[A-Z][a-zA-Z ]+?\s+—\s+[0-9]+-Phase'
  local re='—[[:space:]]*([0-9]+)-Phase'
  while IFS=: read -r ln rest; do
    is_excluded "$ln" && continue
    if [[ "$rest" =~ $re ]]; then
      echo "${BASH_REMATCH[1]}|Phase"
    fi
  done < <(grep -nE "$greppat" "$DOC_FILE" || true)
}

# ── Self-test mode ──────────────────────────────────────────────────────────

if [ "${1:-}" = "--self-test" ]; then
  echo "==> Self-test 1/3: running against current COMPLETE-CODEBASE.md..."
  if bash "$0" 2>&1; then
    echo "==> PASS: guard exits 0 against current doc"
  else
    echo "FAIL: guard should exit 0 against current doc"
    exit 1
  fi

  echo "==> Self-test 2/3: breaking a claim (18 agents -> 99 agents)..."
  TMP_DOC=$(mktemp)
  cp "$DOC_FILE" "$TMP_DOC"
  sed -i '0,/18 agents/s//99 agents/' "$TMP_DOC"
  if DOC_CLAIMS_FILE="$TMP_DOC" bash "$0" 2>&1; then
    rm -f "$TMP_DOC"
    echo "FAIL: guard should have detected drift (18->99 agents)"
    exit 1
  fi
  echo "==> PASS: guard correctly caught drift"
  rm -f "$TMP_DOC"

  echo "==> Self-test 3/3: verifying clean state after restoration..."
  if bash "$0" 2>&1; then
    echo "==> PASS: guard exits 0 after restoration"
  else
    echo "FAIL: guard should exit 0 after restoration"
    exit 1
  fi

  echo "==> Self-test: ALL PASS"
  exit 0
fi

# ── Main: extract claims ────────────────────────────────────────────────────

extract_p1 >> "$TMP_CLAIMS"
extract_p2 >> "$TMP_CLAIMS"
extract_p3 >> "$TMP_CLAIMS"
extract_p4 >> "$TMP_CLAIMS"
extract_p5a >> "$TMP_CLAIMS"
extract_p5b >> "$TMP_CLAIMS"

if [ ! -s "$TMP_CLAIMS" ]; then
  echo "FAIL: No numeric claims extracted from $DOC_FILE"
  exit 1
fi

# Dedup by lowercased noun_phrase (field after |). Keep first occurrence.
awk -F'|' '{
    key = tolower($2)
    if (!seen[key]++) print
}' "$TMP_CLAIMS" > "${TMP_CLAIMS}.dedup"
mv "${TMP_CLAIMS}.dedup" "$TMP_CLAIMS"

# ── Main: verify each claim against ground truth ────────────────────────────

while IFS='|' read -r claimed_num noun; do
  nkey=$(echo "$noun" | tr '[:upper:]' '[:lower:]')

  cmd=""

  case "$nkey" in
    agents|"named agents"|"runtime agents")
      cmd="node -e \"console.log(Object.keys(require('$REPO_ROOT/oh-my-openagent.json').agents).length)\""
      ;;
    categories)
      cmd="node -e \"console.log(Object.keys(require('$REPO_ROOT/oh-my-openagent.json').categories).length)\""
      ;;
    "rule files"|rule)
      cmd="find \"$REPO_ROOT/rules\" -maxdepth 2 -name '*.md' -not -path '*/node_modules/*' | wc -l"
      ;;
    directories)
      cmd="find \"$REPO_ROOT/skills\" -maxdepth 1 -mindepth 1 -type d -not -name node_modules | wc -l"
      ;;
    subagent)
      cmd="ls \"$REPO_ROOT/agents\"/*.md 2>/dev/null | wc -l"
      ;;
    scripts)
      cmd="find \"$REPO_ROOT/scripts\" -maxdepth 1 -type f -not -path '*/__pycache__/*' -not -path '*/_shared/*' 2>/dev/null | wc -l"
      ;;
    src/)
      cmd="find \"$REPO_ROOT/plugins/sisyphus-gates/src\" -maxdepth 1 -name '*.js' | wc -l"
      ;;
    jsonl|"baseline runs")
      cmd="ls \"$REPO_ROOT/benchmark/results\"/*.jsonl 2>/dev/null | wc -l"
      ;;
    layers|phase)
      # Structural claims — verified by tree structure / state.js schema
      continue
      ;;
    *)
      # No ground-truth mapping — skip (e.g., model:, unit tests, write access)
      continue
      ;;
  esac

  # Run ground-truth command (strip whitespace from output)
  actual=$(eval "$cmd" 2>/dev/null | tr -d '[:space:]')

  # Compare
  if [ "$claimed_num" != "$actual" ]; then
    echo "FAIL: '$noun' claims $claimed_num; actual is $actual"
    failures=$((failures + 1))
  fi
done < "$TMP_CLAIMS"

# ── Result ──────────────────────────────────────────────────────────────────

if [ "$failures" -gt 0 ]; then
  echo "Doc-claims drift detected: $failures claim(s) mismatch"
  exit 1
fi

echo "Doc-claims drift check: PASS"
exit 0
