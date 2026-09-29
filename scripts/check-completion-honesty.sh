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

# === Check 5: ~/.omo/omo.jsonc consistency ===
OMO="$HOME/.omo/omo.jsonc"
OMO_QUERY="$REPO/scripts/omo-query.js"
if [ -f "$OMO" ]; then
  AGENT_COUNT=$(node "$OMO_QUERY" agents 2>/dev/null || echo "0")
  CAT_COUNT=$(node "$OMO_QUERY" categories 2>/dev/null || echo "0")

  if [ "$AGENT_COUNT" -eq 18 ]; then
    add_pass "~/.omo/omo.jsonc has 18 agents"
  else
    add_error "~/.omo/omo.jsonc has $AGENT_COUNT agents (expected 18)"
  fi

  if [ "$CAT_COUNT" -eq 9 ]; then
    add_pass "~/.omo/omo.jsonc has 9 categories"
  else
    add_error "~/.omo/omo.jsonc has $CAT_COUNT categories (expected 9)"
  fi
else
  add_error "~/.omo/omo.jsonc missing"
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

# === Check 9: routing claims match ~/.omo/omo.jsonc ===
if [ -f "$OMO" ]; then
  OMO_ROUTING=$(node "$OMO_QUERY" categories-routing 2>/dev/null || echo "{}")
  ROUTING_MISMATCHES=$(OMO_ROUTING="$OMO_ROUTING" DOC="$DOC" node - <<'NODE'
const fs = require('fs');
const doc = fs.readFileSync(process.env.DOC, 'utf8');
const omaCats = JSON.parse(process.env.OMO_ROUTING || '{}');

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

const jsonMap = new Map(Object.entries(omaCats).map(([name, cfg]) => [name, cfg.model]));
const docMap = new Map(docCats.map(c => [c.name, c.model]));
const mismatches = [];
for (const [name, docModel] of docMap) {
  const jsonModel = jsonMap.get(name);
  if (!jsonModel) {
    mismatches.push(`${name}: documented but missing in ~/.omo/omo.jsonc`);
  } else if (jsonModel !== docModel) {
    mismatches.push(`${name}: doc claims ${docModel}, config has ${jsonModel}`);
  }
}
for (const [name] of jsonMap) {
  if (!docMap.has(name)) mismatches.push(`${name}: in config but missing from doc`);
}
console.log(mismatches.join('\n'));
NODE
  )

  if [ -n "$ROUTING_MISMATCHES" ]; then
    while IFS= read -r line; do
      add_error "Category routing mismatch: $line"
    done <<< "$ROUTING_MISMATCHES"
  else
    add_pass "Category routing claims match ~/.omo/omo.jsonc"
  fi
fi

# === Check 9b: Named-Agents runtime line matches ~/.omo/omo.jsonc ===
# Kills the hand-synced-drift class: the '18 Named Agents (runtime)' line is a
# current-state claim and must match the live agents block, same as categories.
if [ -f "$OMO" ]; then
  AGENT_MISMATCHES=$(OMO="$OMO" DOC="$DOC" node - <<'NODE'
const fs = require('fs');
const doc = fs.readFileSync(process.env.DOC, 'utf8');
const raw = fs.readFileSync(process.env.OMO, 'utf8');

// brace-match the first "agents" block; extract name -> first "model" per agent
const ai = raw.indexOf('"agents"');
if (ai < 0) { console.log('no agents block in ~/.omo/omo.jsonc'); process.exit(0); }
let j = raw.indexOf('{', ai), depth = 0, k = j;
for (;; k++) {
  const c = raw[k];
  if (c === '"') { k++; while (raw[k] !== '"') k += raw[k] === '\\' ? 2 : 1; }
  else if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) break; }
}
const block = raw.slice(j, k + 1);
const live = new Map();
for (const m of block.matchAll(/^ {6}"([a-z][a-z0-9-]*)": \{$/gm)) {
  const name = m[1];
  const seg = block.slice(m.index, m.index + 2200);
  const mm = seg.match(/^ {8}"model": "([^"]+)"/m);
  if (mm) live.set(name, mm[1]);
}

const line = doc.split('\n').find(l => l.includes('Named Agents (runtime)'));
if (!line) { console.log('Could not find Named-Agents line in COMPLETE-CODEBASE.md'); process.exit(0); }
const body = line.replace(/^.*?\(runtime\):\s*/, '');
const docAgents = new Map();
for (const chunk of body.split(/, (?=[a-z][a-z0-9-]* \()/)) {
  const m = chunk.match(/^([a-z][a-z0-9-]*) \(([^;,)]+)/);
  if (m) docAgents.set(m[1], m[2].trim());
}

const out = [];
for (const [name, model] of docAgents) {
  const lm = live.get(name);
  if (!lm) out.push(`${name}: documented but missing in ~/.omo/omo.jsonc`);
  else if (lm !== model) out.push(`${name}: doc claims ${model}, config has ${lm}`);
}
for (const [name] of live) if (!docAgents.has(name)) out.push(`${name}: in config but missing from doc`);
console.log(out.join('\n'));
NODE
  )

  if [ -n "$AGENT_MISMATCHES" ]; then
    while IFS= read -r line; do
      add_error "Named-Agents mismatch: $line"
    done <<< "$AGENT_MISMATCHES"
    else
      add_pass "Named-Agents runtime line matches ~/.omo/omo.jsonc"
    fi
fi

# === Check 9c: provider tallies on the Provider-mix line match live config ===
if [ -f "$OMO" ]; then
  TALLY_MISMATCHES=$(OMO="$OMO" DOC="$DOC" node - <<'NODE'
const fs = require('fs');
const doc = fs.readFileSync(process.env.DOC, 'utf8');
const raw = fs.readFileSync(process.env.OMO, 'utf8');
const ai = raw.indexOf('"agents"');
let j = raw.indexOf('{', ai), depth = 0, k = j;
for (;; k++) {
  const c = raw[k];
  if (c === '"') { k++; while (raw[k] !== '"') k += raw[k] === '\\' ? 2 : 1; }
  else if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) break; }
}
const block = raw.slice(j, k + 1);
let zai = 0, go = 0, oc = 0;
for (const m of block.matchAll(/^ {6}"([a-z][a-z0-9-]*)": \{$/gm)) {
  const seg = block.slice(m.index, m.index + 2200);
  const mm = seg.match(/^ {8}"model": "([^"]+)"/m);
  if (!mm) continue;
  const p = mm[1].split('/')[0];
  if (p === 'zai-coding-plan') zai++; else if (p === 'opencode-go') go++; else if (p === 'opencode') oc++;
}
const ci = raw.indexOf('"categories"', k);
let czai = 0, cgo = 0, coc = 0;
if (ci > 0) {
  let j2 = raw.indexOf('{', ci), d2 = 0, k2 = j2;
  for (;; k2++) {
    const c = raw[k2];
    if (c === '"') { k2++; while (raw[k2] !== '"') k2 += raw[k2] === '\\' ? 2 : 1; }
    else if (c === '{') d2++;
    else if (c === '}') { d2--; if (d2 === 0) break; }
  }
  const cblock = raw.slice(j2, k2 + 1);
  for (const m of cblock.matchAll(/^ {6}"([a-z][a-z0-9-]*)": \{$/gm)) {
    const seg = cblock.slice(m.index, m.index + 2200);
    const mm = seg.match(/^ {8}"model": "([^"]+)"/m);
    if (!mm) continue;
    const p = mm[1].split('/')[0];
    if (p === 'zai-coding-plan') czai++; else if (p === 'opencode-go') cgo++; else if (p === 'opencode') coc++;
  }
}
const line = doc.split('\n').find(l => l.startsWith('Provider mix:'));
if (!line) { console.log('Could not find Provider-mix line'); process.exit(0); }
const out = [];
const az = line.match(/Agents on zai-coding-plan primary \((\d+) of 18/);
const ago = line.match(/opencode-go \((\d+) of 18/);
const aoc = line.match(/opencode \((\d+)\)/);
const cz = line.match(/Categories: zai-coding-plan \((\d+):/);
const cgo2 = line.match(/Categories:.*opencode-go \((\d+):/);
if (az && +az[1] !== zai) out.push(`agent tally: doc claims ${az[1]} zai primaries, config has ${zai}`);
if (ago && +ago[1] !== go) out.push(`agent tally: doc claims ${ago[1]} opencode-go primaries, config has ${go}`);
if (aoc && +aoc[1] !== oc) out.push(`agent tally: doc claims ${aoc[1]} opencode primaries, config has ${oc}`);
if (cz && +cz[1] !== czai) out.push(`category tally: doc claims ${cz[1]} zai categories, config has ${czai}`);
if (cgo2 && +cgo2[1] !== cgo) out.push(`category tally: doc claims ${cgo2[1]} opencode-go categories, config has ${cgo}`);
console.log(out.join('\n'));
NODE
  )

  if [ -n "$TALLY_MISMATCHES" ]; then
    while IFS= read -r line; do
      add_error "Provider-mix tally mismatch: $line"
    done <<< "$TALLY_MISMATCHES"
    else
      add_pass "Provider-mix tallies match ~/.omo/omo.jsonc"
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
