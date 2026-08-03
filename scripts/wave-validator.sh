#!/bin/bash
# Wave Completion Validator — v2.1.2
# Mechanical gate: wave cannot complete if required outputs are missing
# Usage: bash wave-validator.sh <project_root> <wave_number> <plan_name>

set -e

PROJECT_ROOT="${1:-.}"
WAVE_NUM="${2:-1}"
PLAN_NAME="${3:-unknown}"
EVIDENCE_DIR="${PROJECT_ROOT}/.sisyphus/evidence/${PLAN_NAME}"
STATE_FILE="${PROJECT_ROOT}/.sisyphus/state/${PLAN_NAME}.json"

ERRORS=0
WARNINGS=0

echo "═══════════════════════════════════════════════════════════════"
echo "  WAVE COMPLETION VALIDATOR — v2.1.2"
echo "  Plan: ${PLAN_NAME} | Wave: ${WAVE_NUM}"
echo "═══════════════════════════════════════════════════════════════"

# 1. Check evidence directory exists and has files
if [ -d "$EVIDENCE_DIR" ]; then
    FILE_COUNT=$(find "$EVIDENCE_DIR" -type f | wc -l)
    if [ "$FILE_COUNT" -gt 0 ]; then
        echo "✓ Evidence directory: ${FILE_COUNT} files found"
    else
        echo "✗ FAIL: Evidence directory exists but is EMPTY"
        ((ERRORS++))
    fi
else
    echo "✗ FAIL: Evidence directory missing: ${EVIDENCE_DIR}"
    ((ERRORS++))
fi

# 2. Check for goal-backward verification files
GBV_COUNT=$(find "$EVIDENCE_DIR" -name "*goal*backward*" -o -name "*verification*" | wc -l)
if [ "$GBV_COUNT" -gt 0 ]; then
    echo "✓ Goal-backward verification: ${GBV_COUNT} files found"
else
    echo "✗ FAIL: No goal-backward verification files found"
    ((ERRORS++))
fi

# 3. Check for build output evidence
BUILD_COUNT=$(find "$EVIDENCE_DIR" -name "*build*" | wc -l)
if [ "$BUILD_COUNT" -gt 0 ]; then
    echo "✓ Build evidence: ${BUILD_COUNT} files found"
else
    echo "⚠ WARNING: No build evidence files found"
    ((WARNINGS++))
fi

# 4. Check for model transparency in evidence files
TRANSPARENCY_FOUND=false
for f in "$EVIDENCE_DIR"/*.md; do
    if [ -f "$f" ] && grep -q "Executing with" "$f" 2>/dev/null; then
        TRANSPARENCY_FOUND=true
        break
    fi
done

if [ "$TRANSPARENCY_FOUND" = true ]; then
    echo "✓ Model transparency: Found 'Executing with' in evidence"
else
    echo "✗ FAIL: Model transparency line ('Executing with [model] via [category]') not found"
    ((ERRORS++))
fi

# 5. Check DESIGN.md if UI is in scope
if [ -f "${PROJECT_ROOT}/DESIGN.md" ]; then
    echo "✓ DESIGN.md exists"
else
    # Check if any UI components were created in this wave
    UI_FILES=$(find "$EVIDENCE_DIR" -name "*component*" -o -name "*ui-*" -o -name "*ui_*" -o -name "*filter*" | wc -l)
    if [ "$UI_FILES" -gt 0 ]; then
        echo "✗ FAIL: DESIGN.md missing but UI work detected in evidence"
        ((ERRORS++))
    else
        echo "ℹ DESIGN.md not required (no UI work detected)"
    fi
fi

# 6. Check state file exists and wave is marked complete
if [ -f "$STATE_FILE" ]; then
    echo "✓ State file exists"
    # Check if wave is in gate_history
    if grep -q "wave_${WAVE_NUM}_complete" "$STATE_FILE" 2>/dev/null; then
        echo "✓ Wave ${WAVE_NUM} marked complete in state"
    else
        echo "⚠ WARNING: Wave ${WAVE_NUM} not found in state file gate_history"
        ((WARNINGS++))
    fi
else
    echo "✗ FAIL: State file missing: ${STATE_FILE}"
    ((ERRORS++))
fi

# 7. Check parallel fan-out receipt gate (graph-node traceability)
# Requires an EXPLICIT node declaration: "fan-out N nodes" / "fan_out N nodes" /
# "delegated N parallel" — bare "fan-out" mentions (incl. "no fan-out was
# needed") must NOT trip the gate. Count is scoped to bead=<PLAN_NAME> so the
# gate verifies THIS plan filed its receipts, not that receipts exist somewhere
# in the global cumulative log. Residual: intra-plan cross-wave accumulation
# (wave 1 of plan X counts toward wave 2's check); future improvement is to
# snapshot the receipt counter at wave start and require `n >` that value.
RECEIPT_LOG="${HOME}/.sisyphus/evidence/execution-receipts.jsonl"
FANOUT_DECLARED=false
DECLARED_NODES=0
if [ -d "$EVIDENCE_DIR" ]; then
    FANOUT_HITS=$(grep -rhoEi "fan-out[[:space:]]+[0-9]+|fan_out[[:space:]]+[0-9]+|delegated[[:space:]]+[0-9]+[[:space:]]+parallel" "$EVIDENCE_DIR" --include="*.md" 2>/dev/null || true)
    if [ -n "$FANOUT_HITS" ]; then
        FANOUT_DECLARED=true
        DECLARED_NODES=$(echo "$FANOUT_HITS" | grep -oE "[0-9]+" | sort -n | tail -1)
        if [ -z "$DECLARED_NODES" ]; then
            DECLARED_NODES=1
        fi
    fi
fi

if [ "$FANOUT_DECLARED" = true ]; then
    if [ ! -f "$RECEIPT_LOG" ]; then
        echo "✗ FAIL: Parallel fan-out declared (${DECLARED_NODES} nodes) but receipt log missing: ${RECEIPT_LOG}"
        ((ERRORS++))
    else
        FOUND_ENTRIES=$(grep "\"bead\":\"${PLAN_NAME}\"" "$RECEIPT_LOG" 2>/dev/null | grep -c '"n":' || true)
        if [ "$FOUND_ENTRIES" -lt "$DECLARED_NODES" ]; then
            echo "✗ FAIL: Parallel fan-out declared ${DECLARED_NODES} nodes but plan '${PLAN_NAME}' has ${FOUND_ENTRIES} receipt entries (need >= ${DECLARED_NODES}): ${RECEIPT_LOG}"
            ((ERRORS++))
        else
            echo "✓ Fan-out receipt gate: plan '${PLAN_NAME}' has ${FOUND_ENTRIES} receipt entries >= ${DECLARED_NODES} declared nodes"
        fi
    fi
else
    echo "ℹ Fan-out receipt gate: no fan-out declared (serial/no delegation; gate N/A)"
fi

GIT_VERIFIER="${HOME}/.config/opencode/scripts/verify-git-commits.sh"
if [ -f "$GIT_VERIFIER" ]; then
    echo ""
    echo "Running git commit verification..."
    if bash "$GIT_VERIFIER" "$PROJECT_ROOT" "$PLAN_NAME" "$WAVE_NUM" 2>/dev/null; then
        echo "✓ Git commits verified"
    else
        echo "⚠ WARNING: Git commit verification found issues"
        ((WARNINGS++))
    fi
else
    echo "ℹ Git verifier not found, skipping commit check"
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
    echo "  RESULT: PASS (${WARNINGS} warnings)"
    echo "═══════════════════════════════════════════════════════════════"
    exit 0
else
    echo "  RESULT: FAIL (${ERRORS} errors, ${WARNINGS} warnings)"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Wave ${WAVE_NUM} CANNOT be marked complete."
    echo "Fix the errors above and re-run validation before proceeding."
    exit 1
fi
