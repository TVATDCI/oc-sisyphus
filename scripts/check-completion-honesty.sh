#!/usr/bin/env bash
# check-completion-honesty.sh
# Completion Honesty Gate for topology docs.
# Verifies that COMPLETE-CODEBASE.md claims match filesystem reality.
# Exit 0 = PASS, Exit 1 = FAIL.

set -euo pipefail
ERRORS=0
WARNINGS=0

# Derive repo root from script location so this is portable across clones
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DOC="$REPO/COMPLETE-CODEBASE.md"

add_error() {
  ERRORS=$((ERRORS + 1))
  echo "❌ ERROR: $1" >&2
}

add_warning() {
  WARNINGS=$((WARNINGS + 1))
  echo "⚠️ WARNING: $1" >&2
}

add_pass() {
  echo "✅ $1"
}

# === Check 0: doc exists ===
if [ ! -f "$DOC" ]; then
  add_error "COMPLETE-CODEBASE.md does not exist at $DOC"
  exit 1
fi

# === Check 1: review date ===
LAST_REVIEWED=$(grep -o 'Last reviewed.*[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}' "$DOC" | grep -o '[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}' || true)
TODAY=$(date +%Y-%m-%d)
if [ -n "$LAST_REVIEWED" ]; then
  if [ "$LAST_REVIEWED" != "$TODAY" ]; then
    add_warning "COMPLETE-CODEBASE.md last reviewed $LAST_REVIEWED (today $TODAY)"
  else
    add_pass "Review date is current ($TODAY)"
  fi
else
  add_error "Could not parse 'Last reviewed' date"
fi

# === Check 2: ghost paths ===
if [ -d "$HOME/.config/opencode/.sisyphus" ]; then
  add_error "Ghost path ~/.config/opencode/.sisyphus/ still exists"
else
  add_pass "Ghost path ~/.config/opencode/.sisyphus/ does not exist"
fi

# === Check 3: canonical state root ===
if [ -d "$HOME/.sisyphus" ]; then
  add_pass "Canonical ~/.sisyphus/ exists"
else
  add_error "Canonical ~/.sisyphus/ does not exist"
fi

# === Check 4: AGENTS.md is real file ===
if [ -L "$REPO/AGENTS.md" ]; then
  add_error "AGENTS.md is a symlink; it must be a regular file in this repo"
elif [ -f "$REPO/AGENTS.md" ]; then
  add_pass "AGENTS.md is a regular file"
else
  add_error "AGENTS.md missing"
fi

# === Check 5: oh-my-openagent.json consistency ===
OMA="$REPO/oh-my-openagent.json"
if [ -f "$OMA" ]; then
  AGENT_COUNT=$(node -e "const j=JSON.parse(require('fs').readFileSync('$OMA','utf8')); console.log(Object.keys(j.agents).length);" 2>/dev/null || echo "0")
  CAT_COUNT=$(node -e "const j=JSON.parse(require('fs').readFileSync('$OMA','utf8')); console.log(Object.keys(j.categories).length);" 2>/dev/null || echo "0")

  if [ "$AGENT_COUNT" -eq 17 ]; then
    add_pass "oh-my-openagent.json has 17 agents"
  else
    add_error "oh-my-openagent.json has $AGENT_COUNT agents (expected 17)"
  fi

  if [ "$CAT_COUNT" -eq 9 ]; then
    add_pass "oh-my-openagent.json has 9 categories"
  else
    add_error "oh-my-openagent.json has $CAT_COUNT categories (expected 9)"
  fi
else
  add_error "oh-my-openagent.json missing"
fi

# === Check 6: agents/*.md have no model: lines ===
MODEL_LINES=$(grep -c "^model:" "$REPO"/agents/*.md 2>/dev/null | awk -F: '{s+=$2} END {print s+0}' || true)
if [ "$MODEL_LINES" -eq 0 ]; then
  add_pass "agents/*.md have no model: lines"
else
  add_error "agents/*.md contain $MODEL_LINES model: lines (JSON is source of truth)"
fi

# === Check 7: archivist.md scope ===
ARCHIVIST="$REPO/agents/archivist.md"
if [ -f "$ARCHIVIST" ]; then
  if grep -q '~/Main-vault' "$ARCHIVIST"; then
    add_pass "archivist.md references ~/Main-vault/"
  else
    add_error "archivist.md missing ~/Main-vault/ edit scope"
  fi
else
  add_error "archivist.md missing"
fi

# === Check 8: doc claims vs reality ===

# Helper: extract claimed count from doc line matching a pattern
claim() {
  grep -oE "$2" "$DOC" | grep -oE '[0-9]+' | head -1 || true
}

# Skills: "44 real skill directories + 1 _shared refs (45 total)"
SKILL_CLAIM=$(claim skills 'skills/ # [0-9]+ real skill directories')
SKILL_ACTUAL=$(find "$REPO/skills" -maxdepth 1 -mindepth 1 -type d ! -name '_shared' | wc -l)
if [ -n "$SKILL_CLAIM" ]; then
  if [ "$SKILL_ACTUAL" -eq "$SKILL_CLAIM" ]; then
    add_pass "skills/ claim matches: $SKILL_CLAIM directories"
  else
    add_error "skills/ claim $SKILL_CLAIM but filesystem has $SKILL_ACTUAL non-_shared directories"
  fi
else
  add_warning "Could not parse skills/ count claim"
fi

# Scripts
SCRIPT_CLAIM=$(claim scripts 'scripts/ # [0-9]+ scripts')
SCRIPT_ACTUAL=$(find "$REPO/scripts" -maxdepth 1 -type f \( -name "*.sh" -o -name "*.py" -o -name "*.js" \) | wc -l)
if [ -n "$SCRIPT_CLAIM" ]; then
  if [ "$SCRIPT_ACTUAL" -eq "$SCRIPT_CLAIM" ]; then
    add_pass "scripts/ claim matches: $SCRIPT_CLAIM files"
  else
    add_error "scripts/ claim $SCRIPT_CLAIM but filesystem has $SCRIPT_ACTUAL files"
  fi
else
  add_warning "Could not parse scripts/ count claim"
fi

# Rules
RULE_CLAIM=$(claim rules 'rules/ # [0-9]+ rule files')
RULE_ACTUAL=$(find "$REPO/rules" -type f | wc -l)
if [ -n "$RULE_CLAIM" ]; then
  if [ "$RULE_ACTUAL" -eq "$RULE_CLAIM" ]; then
    add_pass "rules/ claim matches: $RULE_CLAIM files"
  else
    add_error "rules/ claim $RULE_CLAIM but filesystem has $RULE_ACTUAL files"
  fi
else
  add_warning "Could not parse rules/ count claim"
fi

# Subagent .md count
SUBAGENT_CLAIM=$(claim agents 'agents/ # [0-9]+ subagent')
SUBAGENT_ACTUAL=$(ls "$REPO/agents"/*.md 2>/dev/null | wc -l)
if [ -n "$SUBAGENT_CLAIM" ]; then
  if [ "$SUBAGENT_ACTUAL" -eq "$SUBAGENT_CLAIM" ]; then
    add_pass "agents/ claim matches: $SUBAGENT_CLAIM subagent .md files"
  else
    add_error "agents/ claim $SUBAGENT_CLAIM but filesystem has $SUBAGENT_ACTUAL .md files"
  fi
else
  add_warning "Could not parse agents/ count claim"
fi

# === Check 9: routing claims match oh-my-openagent.json ===
if [ -f "$OMA" ]; then
  ROUTING_MISMATCHES=$(OMA="$OMA" DOC="$DOC" node - <<'NODE'
const fs = require('fs');
const oma = JSON.parse(fs.readFileSync(process.env.OMA, 'utf8'));
const doc = fs.readFileSync(process.env.DOC, 'utf8');

const jsonCats = Object.entries(oma.categories).map(([name, cfg]) => {
  const model = cfg.model.replace(/^opencode-go\//, '').replace(/^opencode\//, '');
  return { name, model };
});

const line = doc.split('\n').find(l => l.includes('Categories (via task(category'));
if (!line) {
  console.log('Could not find Categories line in COMPLETE-CODEBASE.md');
  process.exit(0);
}

const docCats = [];
const afterColon = line.split(':').slice(1).join(':');
const pairs = afterColon.split(',').map(s => s.trim()).filter(Boolean);
for (const pair of pairs) {
  const m = pair.match(/^([a-z-]+)→(.+?)$/);
  if (m) docCats.push({ name: m[1], model: m[2].trim() });
}

const jsonMap = new Map(jsonCats.map(c => [c.name, c.model]));
const docMap = new Map(docCats.map(c => [c.name, c.model]));
const mismatches = [];
for (const [name, docModel] of docMap) {
  const jsonModel = jsonMap.get(name);
  if (!jsonModel) {
    mismatches.push(`${name}: documented but missing in oh-my-openagent.json`);
  } else if (jsonModel !== docModel) {
    mismatches.push(`${name}: doc claims ${docModel}, JSON has ${jsonModel}`);
  }
}
for (const [name] of jsonMap) {
  if (!docMap.has(name)) mismatches.push(`${name}: in JSON but missing from doc`);
}
console.log(mismatches.join('\n'));
NODE
  )

  if [ -n "$ROUTING_MISMATCHES" ]; then
    while IFS= read -r line; do
      add_error "Category routing mismatch: $line"
    done <<< "$ROUTING_MISMATCHES"
  else
    add_pass "Category routing claims match oh-my-openagent.json"
  fi
fi

# === Summary ===
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  COMPLETION HONESTY GATE REPORT"
echo "═══════════════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
  echo "  ✅ PASS — $ERRORS errors, $WARNINGS warnings"
  echo "  Topology claims match filesystem reality."
  exit 0
else
  echo "  ❌ FAIL — $ERRORS errors, $WARNINGS warnings"
  echo "  Claims do NOT match reality. Update COMPLETE-CODEBASE.md or filesystem."
  exit 1
fi
