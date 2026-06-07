#!/bin/bash
# Git Commit Verifier — v2.1.2
# Verifies that waves produce atomic commits with descriptive messages
# Usage: bash verify-git-commits.sh <project_root> <plan_name> <wave_number>

set -e

PROJECT_ROOT="${1:-.}"
PLAN_NAME="${2:-unknown}"
WAVE_NUM="${3:-1}"

cd "$PROJECT_ROOT"

ERRORS=0
WARNINGS=0

echo "═══════════════════════════════════════════════════════════════"
echo "  GIT COMMIT VERIFIER — v2.1.2"
echo "  Plan: ${PLAN_NAME} | Wave: ${WAVE_NUM}"
echo "═══════════════════════════════════════════════════════════════"

# Get commits since last wave or since plan start
# Look for commits with plan name or wave number in message
COMMITS=$(git log --oneline --grep="${PLAN_NAME}" -n 10 2>/dev/null || true)
if [ -z "$COMMITS" ]; then
    COMMITS=$(git log --oneline -n 10 2>/dev/null || true)
fi

if [ -z "$COMMITS" ]; then
    echo "✗ FAIL: No git commits found. Atomic commits are required per slice."
    ((ERRORS++))
else
    COMMIT_COUNT=$(echo "$COMMITS" | wc -l)
    echo "✓ Found ${COMMIT_COUNT} recent commits"
    
    # Check for conventional commit format
    FEAT_COUNT=$(echo "$COMMITS" | grep -c "^\w\+.*feat(" || true)
    FIX_COUNT=$(echo "$COMMITS" | grep -c "^\w\+.*fix(" || true)
    DOCS_COUNT=$(echo "$COMMITS" | grep -c "^\w\+.*docs(" || true)
    REFACTOR_COUNT=$(echo "$COMMITS" | grep -c "^\w\+.*refactor(" || true)
    TEST_COUNT=$(echo "$COMMITS" | grep -c "^\w\+.*test(" || true)
    
    CONVENTIONAL_COUNT=$((FEAT_COUNT + FIX_COUNT + DOCS_COUNT + REFACTOR_COUNT + TEST_COUNT))
    
    if [ "$CONVENTIONAL_COUNT" -gt 0 ]; then
        echo "✓ Conventional commits found: ${CONVENTIONAL_COUNT}"
    else
        echo "⚠ WARNING: No conventional commits (feat/fix/docs/refactor/test) found"
        echo "  Expected: feat(scope): description format"
        ((WARNINGS++))
    fi
    
    # Check for evidence in commit messages (Verification, what, why)
    EVIDENCE_COUNT=$(echo "$COMMITS" | grep -c "Verification\|what\|why\|evidence" || true)
    if [ "$EVIDENCE_COUNT" -gt 0 ]; then
        echo "✓ Commit messages include verification evidence"
    else
        echo "⚠ WARNING: Commit messages lack verification evidence"
        echo "  Expected: '- what was implemented', '- why it achieves goal', '- Verification: ...'"
        ((WARNINGS++))
    fi
    
    # Check for plan/wave references
    PLAN_REF_COUNT=$(echo "$COMMITS" | grep -ci "${PLAN_NAME}\|wave\|slice" || true)
    if [ "$PLAN_REF_COUNT" -gt 0 ]; then
        echo "✓ Commits reference plan/wave/slice"
    else
        echo "⚠ WARNING: No plan/wave/slice references in commits"
        ((WARNINGS++))
    fi
fi

# Check for uncommitted changes
UNCOMMITTED=$(git status --porcelain 2>/dev/null || true)
if [ -n "$UNCOMMITTED" ]; then
    UNCOMMITTED_COUNT=$(echo "$UNCOMMITTED" | wc -l)
    echo "⚠ WARNING: ${UNCOMMITTED_COUNT} uncommitted files present"
    echo "${UNCOMMITTED}" | head -10
    ((WARNINGS++))
else
    echo "✓ Working directory clean — all changes committed"
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
    echo "Git commit verification FAILED."
    echo "Expected: Atomic commits per slice with conventional format and evidence."
    exit 1
fi
