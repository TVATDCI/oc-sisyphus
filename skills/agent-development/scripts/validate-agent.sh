#!/usr/bin/env bash
# Agent Configuration Validator
# Validates agent configurations in JSON or Markdown format

set -euo pipefail

usage() {
  echo "Usage: $0 <path/to/agents.json | path/to/agent.md>"
  echo ""
  echo "Validates agent configuration for Opencode:"
  echo "  - JSON: Validates agents.json structure"
  echo "  - Markdown: Validates agent .md file with frontmatter"
  echo ""
  echo "Examples:"
  echo "  $0 agent/agents.json"
  echo "  $0 ~/.config/opencode/agents/review.md"
  exit 1
}

validate_json() {
  local file="$1"
  echo "🔍 Validating JSON agent configuration: $file"
  echo ""

  # Check JSON syntax
  if ! python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then
    echo "❌ Invalid JSON syntax"
    exit 1
  fi
  echo "✅ Valid JSON syntax"

  # Parse and validate each agent
  local error_count=0
  local warning_count=0

  # Get agent names
  local agents
  agents=$(python3 -c "
import json
import sys

with open('$file') as f:
    data = json.load(f)

# Handle both formats: direct agents or nested under 'agent' key
if 'agent' in data:
    agents = data['agent']
else:
    agents = data

for name in agents.keys():
    print(name)
")

  if [ -z "$agents" ]; then
    echo "❌ No agents found in configuration"
    exit 1
  fi

  echo ""
  echo "Found agents: $agents"
  echo ""

  # Validate each agent
  for agent_name in $agents; do
    echo "Checking agent: $agent_name"
    
    local validation_result
    validation_result=$(python3 -c "
import json
import sys

with open('$file') as f:
    data = json.load(f)

# Handle both formats
if 'agent' in data:
    agents = data['agent']
else:
    agents = data

agent = agents.get('$agent_name', {})
errors = []
warnings = []

# Check required field: description
if 'description' not in agent:
    errors.append('Missing required field: description')
elif len(agent['description']) < 10:
    warnings.append('Description is very short (< 10 chars)')

# Check mode if present
mode = agent.get('mode', 'all')
if mode not in ['primary', 'subagent', 'all']:
    errors.append(f'Invalid mode: {mode} (must be primary, subagent, or all)')

# Check model format if present
model = agent.get('model', '')
if model and '/' not in model:
    warnings.append(f'Model should use provider/model-id format: {model}')

# Check temperature if present
temp = agent.get('temperature')
if temp is not None:
    if not isinstance(temp, (int, float)):
        errors.append(f'Temperature must be a number: {temp}')
    elif temp < 0 or temp > 2:
        warnings.append(f'Temperature {temp} is outside typical range (0-1)')

# Check prompt
prompt = agent.get('prompt', '')
if prompt:
    if prompt.startswith('{file:') and not prompt.endswith('}'):
        errors.append('Invalid file reference syntax in prompt')
elif 'prompt' not in agent:
    warnings.append('No prompt defined (will use default)')

# Check tools if present
tools = agent.get('tools', {})
if tools and not isinstance(tools, dict):
    errors.append('Tools must be an object')

# Check permission if present
permission = agent.get('permission', {})
if permission and not isinstance(permission, dict):
    errors.append('Permission must be an object')

# Output results
for e in errors:
    print(f'ERROR:{e}')
for w in warnings:
    print(f'WARNING:{w}')
if not errors and not warnings:
    print('OK')
")

    while IFS= read -r line; do
      if [[ "$line" == ERROR:* ]]; then
        echo "  ❌ ${line#ERROR:}"
        ((error_count++))
      elif [[ "$line" == WARNING:* ]]; then
        echo "  ⚠️  ${line#WARNING:}"
        ((warning_count++))
      elif [[ "$line" == "OK" ]]; then
        echo "  ✅ Valid"
      fi
    done <<< "$validation_result"
  done

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ $error_count -eq 0 ] && [ $warning_count -eq 0 ]; then
    echo "✅ All agents validated successfully!"
    exit 0
  elif [ $error_count -eq 0 ]; then
    echo "⚠️  Validation passed with $warning_count warning(s)"
    exit 0
  else
    echo "❌ Validation failed with $error_count error(s) and $warning_count warning(s)"
    exit 1
  fi
}

validate_markdown() {
  local file="$1"
  echo "🔍 Validating Markdown agent file: $file"
  echo ""

  # Check file exists
  if [ ! -f "$file" ]; then
    echo "❌ File not found: $file"
    exit 1
  fi
  echo "✅ File exists"

  # Check starts with ---
  local first_line
  first_line=$(head -1 "$file")
  if [ "$first_line" != "---" ]; then
    echo "❌ File must start with YAML frontmatter (---)"
    exit 1
  fi
  echo "✅ Starts with frontmatter"

  # Check has closing ---
  if ! tail -n +2 "$file" | grep -q '^---$'; then
    echo "❌ Frontmatter not closed (missing second ---)"
    exit 1
  fi
  echo "✅ Frontmatter properly closed"

  local error_count=0
  local warning_count=0

  # Extract and validate frontmatter
  local frontmatter
  frontmatter=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$file")

  # Check description (required)
  if ! echo "$frontmatter" | grep -q '^description:'; then
    echo "❌ Missing required field: description"
    ((error_count++))
  else
    echo "✅ description: present"
  fi

  # Check mode if present
  local mode
  mode=$(echo "$frontmatter" | grep '^mode:' | sed 's/mode: *//' || true)
  if [ -n "$mode" ]; then
    case "$mode" in
      primary|subagent|all)
        echo "✅ mode: $mode"
        ;;
      *)
        echo "❌ Invalid mode: $mode (must be primary, subagent, or all)"
        ((error_count++))
        ;;
    esac
  else
    echo "💡 mode: not specified (defaults to 'all')"
  fi

  # Check model if present
  local model
  model=$(echo "$frontmatter" | grep '^model:' | sed 's/model: *//' || true)
  if [ -n "$model" ]; then
    if [[ "$model" == */* ]]; then
      echo "✅ model: $model"
    else
      echo "⚠️  model should use provider/model-id format: $model"
      ((warning_count++))
    fi
  else
    echo "💡 model: not specified (will inherit)"
  fi

  # Check temperature if present
  local temp
  temp=$(echo "$frontmatter" | grep '^temperature:' | sed 's/temperature: *//' || true)
  if [ -n "$temp" ]; then
    echo "✅ temperature: $temp"
  fi

  # Check system prompt (body after frontmatter)
  local system_prompt
  system_prompt=$(awk '/^---$/{i++; next} i>=2' "$file")
  
  if [ -z "$system_prompt" ]; then
    echo "⚠️  System prompt (body) is empty"
    ((warning_count++))
  else
    local prompt_length=${#system_prompt}
    echo "✅ System prompt: $prompt_length characters"
    
    if [ $prompt_length -lt 50 ]; then
      echo "⚠️  System prompt is very short"
      ((warning_count++))
    fi
    
    if ! echo "$system_prompt" | grep -q "You are\|You will\|Your"; then
      echo "⚠️  System prompt should use second person (You are..., You will...)"
      ((warning_count++))
    fi
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ $error_count -eq 0 ] && [ $warning_count -eq 0 ]; then
    echo "✅ Validation passed!"
    exit 0
  elif [ $error_count -eq 0 ]; then
    echo "⚠️  Validation passed with $warning_count warning(s)"
    exit 0
  else
    echo "❌ Validation failed with $error_count error(s) and $warning_count warning(s)"
    exit 1
  fi
}

# Main
if [ $# -eq 0 ]; then
  usage
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
  echo "❌ File not found: $FILE"
  exit 1
fi

# Determine file type and validate
if [[ "$FILE" == *.json ]]; then
  validate_json "$FILE"
elif [[ "$FILE" == *.md ]]; then
  validate_markdown "$FILE"
else
  echo "❌ Unknown file type. Expected .json or .md"
  echo ""
  usage
fi
