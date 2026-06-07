#!/usr/bin/env bash
#
# Validate Opencode skills and agents for correct structure.
#
# Usage:
#   ./validate-skills.sh [skill-name]
#   ./validate-skills.sh --all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="${HOME}/.config/opencode/skills"
AGENTS_DIR="${HOME}/.config/opencode/agents"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

validate_agent() {
    local agent_file="$1"
    local agent_name=$(basename "$agent_file")
    local has_errors=false

    echo -n "  Checking agent $agent_name... "

    if ! head -1 "$agent_file" | grep -q '^---$'; then
        echo -e "${YELLOW}SKIP${NC} (no YAML frontmatter)"
        return 0
    fi

    local frontmatter=$(sed -n '/^---$/,/^---$/p' "$agent_file")

    if echo "$frontmatter" | grep -A1 '^  websearch:' | grep -q '"\*".*allow'; then
        echo -e "${RED}FAIL${NC} (websearch permission uses invalid object format)"
        ((FAIL++)) || true
        has_errors=true
    fi

    if echo "$frontmatter" | grep -A1 '^  webfetch:' | grep -q '"\*".*allow'; then
        echo -e "${RED}FAIL${NC} (webfetch permission uses invalid object format)"
        ((FAIL++)) || true
        has_errors=true
    fi

    if [[ "$has_errors" == false ]]; then
        echo -e "${GREEN}PASS${NC}"
        ((PASS++)) || true
    fi
}

validate_skill() {
    local skill_dir="$1"
    local skill_name=$(basename "$skill_dir")
    local has_errors=false

    echo -n "  Checking $skill_name... "

    if [[ ! -f "$skill_dir/SKILL.md" ]]; then
        echo -e "${RED}FAIL${NC} (missing SKILL.md)"
        ((FAIL++)) || true
        return 1
    fi

    if ! head -1 "$skill_dir/SKILL.md" | grep -q '^---$'; then
        echo -e "${RED}FAIL${NC} (no YAML frontmatter)"
        ((FAIL++)) || true
        return 1
    fi

    local frontmatter=$(sed -n '/^---$/,/^---$/p' "$skill_dir/SKILL.md")
    local missing_fields=()

    if ! echo "$frontmatter" | grep -q '^name:'; then
        missing_fields+=("name")
    fi
    if ! echo "$frontmatter" | grep -q '^description:'; then
        missing_fields+=("description")
    fi
    if ! echo "$frontmatter" | grep -q '^compatibility:'; then
        missing_fields+=("compatibility")
    fi

    if [[ ${#missing_fields[@]} -gt 0 ]]; then
        echo -e "${RED}FAIL${NC} (missing: ${missing_fields[*]})"
        ((FAIL++)) || true
        return 1
    fi

    if [[ -f "$skill_dir/README.md" ]]; then
        echo -e "${YELLOW}WARN${NC} (README.md inside skill dir)"
        ((WARN++)) || true
        has_errors=true
    fi
    if [[ -f "$skill_dir/CHANGELOG.md" ]]; then
        echo -e "${YELLOW}WARN${NC} (CHANGELOG.md inside skill dir)"
        ((WARN++)) || true
        has_errors=true
    fi

    local line_count=$(wc -l < "$skill_dir/SKILL.md")
    if [[ $line_count -gt 500 ]]; then
        echo -e "${YELLOW}WARN${NC} (SKILL.md is $line_count lines; consider moving examples to references/)"
        ((WARN++)) || true
        has_errors=true
    fi

    if [[ "$has_errors" == false ]]; then
        echo -e "${GREEN}PASS${NC}"
        ((PASS++)) || true
    fi
}

if [[ "${1:-}" == "--all" ]] || [[ -z "${1:-}" ]]; then
    echo "Validating all skills in $SKILLS_DIR..."
    echo

    for skill_dir in "$SKILLS_DIR"/*/; do
        if [[ -d "$skill_dir" ]]; then
            bn=$(basename "$skill_dir")
            # Skip non-skill directories (prefixed with _)
            if [[ "$bn" == _* ]]; then
                echo "  Skipping $bn (non-skill directory)"
                continue
            fi
            validate_skill "$skill_dir" || true
        fi
    done

    echo
    echo "Validating all agents in $AGENTS_DIR..."
    echo

    if [[ -d "$AGENTS_DIR" ]]; then
        for agent_file in "$AGENTS_DIR"/*.md; do
            if [[ -f "$agent_file" ]]; then
                validate_agent "$agent_file" || true
            fi
        done
    fi

    echo
    echo "Results:"
    echo -e "  ${GREEN}PASS:${NC} $PASS"
    echo -e "  ${YELLOW}WARN:${NC} $WARN"
    echo -e "  ${RED}FAIL:${NC} $FAIL"

    if [[ $FAIL -gt 0 ]]; then
        echo
        echo -e "${RED}Validation failed.${NC} Fix errors above."
        exit 1
    fi

elif [[ -d "$SKILLS_DIR/$1" ]]; then
    validate_skill "$SKILLS_DIR/$1"
else
    echo -e "${RED}Error: Skill '$1' not found in $SKILLS_DIR${NC}"
    exit 1
fi