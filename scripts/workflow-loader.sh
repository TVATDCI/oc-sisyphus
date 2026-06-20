#!/usr/bin/env bash
# workflow-loader.sh — Read and validate workflow.yaml for the sisyphus-gates plugin
#
# Usage:
#   workflow-loader.sh validate        # Validate workflow.yaml against current plugin behavior
#   workflow-loader.sh phase <id>      # Show phase definition for <id>
#   workflow-loader.sh phases          # List all phases in order
#   workflow-loader.sh next <id>       # Show the phase after <id>
#   workflow-loader.sh gates <id>      # Show gates blocking phase <id>
#   workflow-loader.sh auto-advance    # Show all auto-advance rules
#   workflow-loader.sh state-schema    # Show the state schema
#   workflow-loader.sh blocking-rules  # Show global blocking rules
#   workflow-loader.sh query <jq-expr>  # Raw query via Python
#
# Requires: python3 with PyYAML (yaml module) OR yq

set -euo pipefail

WORKFLOW_FILE="${SISYPHUS_WORKFLOW:-$HOME/.sisyphus/workflow.yaml}"

if [ ! -f "$WORKFLOW_FILE" ]; then
  echo "ERROR: Workflow file not found at $WORKFLOW_FILE" >&2
  echo "Set SISYPHUS_WORKFLOW env var to point to your workflow.yaml" >&2
  exit 1
fi

# ── Query the YAML via Python (yaml module) ──────────────────────
query_yaml() {
  python3 -c "
import yaml, json, sys, os

with open('${WORKFLOW_FILE}') as f:
    data = yaml.safe_load(f)

${1:-'print(json.dumps(data, indent=2))'}
" 2>/dev/null
}

# ── Commands ──────────────────────────────────────────────────────
case "${1:-help}" in
  validate)
    echo "🔍 Validating workflow.yaml against plugin state machine..."
    query_yaml "
workflow = data.get('workflow', {})
errors = []

# Check required top-level fields
if not workflow.get('name'):
    errors.append('Missing workflow.name')
if not workflow.get('version'):
    errors.append('Missing workflow.version')
if not workflow.get('phases'):
    errors.append('Missing workflow.phases')

# Check phases
phases = workflow.get('phases', [])
phase_ids = [p['id'] for p in phases if 'id' in p]
if not phase_ids:
    errors.append('No phases with id found')

expected_sequence = ['discovery', 'prd-writing', 'prd-review', 'issue-creation',
                     'plan-writing', 'plan-review', 'execution', 'validation', 'close']
for i, expected in enumerate(expected_sequence):
    if i < len(phase_ids) and phase_ids[i] != expected:
        errors.append(f'Phase sequence mismatch at position {i}: expected \"{expected}\", got \"{phase_ids[i]}\"')
if len(phase_ids) < len(expected_sequence):
    errors.append(f'Missing phases: {set(expected_sequence) - set(phase_ids)}')

# Check auto_advance rules
advance = workflow.get('auto_advance', [])
advance_from = {a.get('from') for a in advance if 'from' in a}
for a in advance:
    if a.get('from') not in phase_ids:
        errors.append(f'Auto-advance from \"{a.get(\"from\")}\" references unknown phase')
    if a.get('to') not in phase_ids:
        errors.append(f'Auto-advance to \"{a.get(\"to\")}\" references unknown phase')

# Check skill_map
skill_map = workflow.get('skill_map', {})
for phase_id, skill in skill_map.items():
    if phase_id not in phase_ids:
        errors.append(f'skill_map references unknown phase \"{phase_id}\"')

if errors:
    print(f'❌ {len(errors)} validation error(s):')
    for e in errors:
        print(f'   • {e}')
    sys.exit(1)
else:
    print(f'✅ Valid: {len(phase_ids)} phases, {len(advance)} auto-advance rules, {len(skill_map)} skill mappings')
    print(f'   Phase sequence: {\" → \".join(phase_ids)}')
"
    ;;

  phase)
    if [ -z "${2:-}" ]; then
      echo "Usage: workflow-loader.sh phase <id>" >&2
      exit 1
    fi
    query_yaml "
workflow = data.get('workflow', {})
phase = next((p for p in workflow.get('phases', []) if p.get('id') == '$2'), None)
if phase:
    print(json.dumps(phase, indent=2))
else:
    print(f'Phase \"$2\" not found')
    print(f'Available: {[p[\"id\"] for p in workflow.get(\"phases\", []) if \"id\" in p]}')
    sys.exit(1)
"
    ;;

  phases)
    query_yaml "
workflow = data.get('workflow', {})
phases = workflow.get('phases', [])
print(f'{\" \u2192 \".join([p[\"id\"] for p in phases if \"id\" in p])}')
"
    ;;

  next)
    if [ -z "${2:-}" ]; then
      echo "Usage: workflow-loader.sh next <current_phase_id>" >&2
      exit 1
    fi
    query_yaml "
workflow = data.get('workflow', {})
phases = [p['id'] for p in workflow.get('phases', []) if 'id' in p]
try:
    idx = phases.index('$2')
    if idx + 1 < len(phases):
        print(phases[idx + 1])
    else:
        print('(final phase — no next phase)')
except ValueError:
    print(f'Phase \"$2\" not found')
    print(f'Available: {phases}')
    sys.exit(1)
"
    ;;

  gates)
    if [ -z "${2:-}" ]; then
      echo "Usage: workflow-loader.sh gates <phase_id>" >&2
      exit 1
    fi
    query_yaml "
workflow = data.get('workflow', {})
phase = next((p for p in workflow.get('phases', []) if p.get('id') == '$2'), None)
if phase:
    gates = phase.get('gates', [])
    if gates:
        print(json.dumps(gates, indent=2))
    else:
        print(f'Phase \"$2\" has no gates configured')
else:
    print(f'Phase \"$2\" not found')
    sys.exit(1)
"
    ;;

  auto-advance)
    query_yaml "
workflow = data.get('workflow', {})
advance = workflow.get('auto_advance', [])
if advance:
    print(json.dumps(advance, indent=2))
else:
    print('No auto-advance rules configured')
"
    ;;

  state-schema)
    query_yaml "
workflow = data.get('workflow', {})
state = workflow.get('state', {})
if state:
    print(json.dumps(state, indent=2))
else:
    print('No state schema defined')
"
    ;;

  blocking-rules)
    query_yaml "
workflow = data.get('workflow', {})
rules = workflow.get('blocking', {})
if rules:
    print(json.dumps(rules, indent=2))
else:
    print('No blocking rules defined')
"
    ;;

  query)
    # Raw jq-style query: pass a Python expression
    if [ -z "${2:-}" ]; then
      echo "Usage: workflow-loader.sh query '<python-expression>'" >&2
      echo "The variable 'data' contains the parsed YAML" >&2
      exit 1
    fi
    query_yaml "$2"
    ;;

  help|*)
    echo "Sisyphus Workflow Loader v1.0.0"
    echo ""
    echo "Usage: workflow-loader.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  validate              Validate workflow.yaml against plugin state machine"
    echo "  phase <id>            Show phase definition"
    echo "  phases                List all phases in sequence"
    echo "  next <id>             Show the next phase after <id>"
    echo "  gates <id>            Show gates blocking <id>"
    echo "  auto-advance          Show all auto-advance triggers"
    echo "  state-schema          Show the state schema"
    echo "  blocking-rules        Show global blocking rules"
    echo "  query '<expr>'        Raw Python query on parsed YAML"
    echo ""
    echo "Environment:"
    echo "  SISYPHUS_WORKFLOW     Path to workflow.yaml (default: ~/.sisyphus/workflow.yaml)"
    echo ""
    echo "Examples:"
    echo "  workflow-loader.sh validate"
    echo "  workflow-loader.sh phase prd-review"
    echo "  workflow-loader.sh next prd-review"
    echo "  workflow-loader.sh gates execution"
    echo "  workflow-loader.sh query 'len(data[\"workflow\"][\"phases\"])'"
    ;;
esac
