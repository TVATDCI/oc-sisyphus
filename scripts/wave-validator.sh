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
    UI_FILES=$(find "$EVIDENCE_DIR" -name "*component*" -o -name "*ui*" -o -name "*filter*" | wc -l)
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
