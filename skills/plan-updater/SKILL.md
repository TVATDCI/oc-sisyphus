---
name: plan-updater
description: "Update plan progress (mark tasks complete, log evidence). Use when: (1) user says 'mark task complete' or 'update plan', (2) slice finished and plan needs progress update, (3) logging evidence to notepad. Triggers: 'update plan', 'log progress', 'mark task complete', 'task done'."
compatibility: opencode
---

# Plan Updater

Updates execution plan with progress, marks tasks complete, logs evidence to notepad.

## Entry Criteria

- [ ] Active plan exists (from `plan-writer` or `wave-executor`)
- [ ] Task completed by `wave-executor` with evidence
- [ ] State file exists with current wave information

## Produces

- Updated plan file with checked-off tasks
- Notepad log entry with evidence reference
- Beads issue comment with progress update

## Next if Approved

- **Tasks remain**: Return to `wave-executor` for next slice
- **All tasks complete**: Delegate to `plan-closer` for final closure

## Next if Rejected

- **Plan file missing**: STOP. Run `plan-writer` first
- **State file missing**: Reinitialize state from plan file
- **Evidence missing**: Log without evidence, note "evidence not provided"

## Model Selection

**Category:** `unspecified-high` → `glm-5.2` (fallback: `glm-5.1`, `kimi-k2.6`)

**Model Transparency:**
When delegating to subagents, always report: `Executing with [model] via [category]` (e.g., "Executing with glm-5.2 via unspecified-high").

## Input

- Task number or description
- Status (completed / in_progress / blocked)
- Optional: evidence file path

## Steps

1. **Read per-project state to find active plan**
   ```bash
   STATE_FILE=~/.sisyphus/state.json
   ACTIVE_PLAN=$(python3 -c "import json; print(json.load(open('$STATE_FILE'))['active_plan'])")
   ```

2. **Edit plan file**
   - Find TODO item by number or description
   - Update checkbox: `- [ ]` → `- [x]` for completed
   - Add evidence reference if provided

3. **Log to notepad and update living state files**
   If marking complete:
   ```markdown
   ## {Date} - Task {N} Complete
   - What: {task description}
   - Evidence: {file path if applicable}
   - Next: {what comes next}
   ```

   **Update STATE.md (living project memory):**
   ```bash
   # Update metrics and position in STATE.md
   sed -i "s/Last Updated: .*/Last Updated: {TIMESTAMP}/" {project_root}/STATE.md
   sed -i "s/Current Wave: .*/Current Wave: {current_wave} \/ {total_waves}/" {project_root}/STATE.md
   sed -i "s/Slices Completed: .*/Slices Completed: {completed_count} \/ {total_slices}/" {project_root}/STATE.md
   ```

   **Update CONTEXT.md (current phase context):**
   ```bash
   # If phase changed, prepend new phase context
   if [ "{new_phase}" != "{current_phase}" ]; then
     cat > {project_root}/CONTEXT.md << EOF
   # Context: {plan_name}

   ## Phase: {new_phase}
   - **Date:** {TIMESTAMP}
   - **Trigger:** {what triggered this phase change}
   - **Decisions made:** See .sisyphus/notepads/{plan_name}/decisions.md
   - **Open questions:**
     - [ ] {list any blockers or questions}
   - **Next action:** {what happens next}

   ---
   EOF
     # Prepend old context below separator
     cat {project_root}/CONTEXT.md.bak >> {project_root}/CONTEXT.md 2>/dev/null || true
   fi
   ```

   **Purpose:** STATE.md and CONTEXT.md provide human-readable, persistent state that survives across sessions and agent restarts, addressing the AGENTS.md synthesis gap discovered in sisy-dev testing.

4. **Update beads issue** (if linked)
   Add comment with progress update

## Output

- Task marked complete (or status updated)
- Evidence saved
- Beads updated (if applicable)

## Integration with Other Skills

This skill is part of the execution tracking chain:

```
wave-executor (completes slice)
  ↓ [produces evidence]
plan-updater (marks task complete, logs evidence)
  ↓
Branch: wave-executor (more work) OR plan-closer (all done)
```

**Input from:**
- `wave-executor`: Completed slice evidence, task identifier

**Output to:**
- `wave-executor`: Updated plan ready for next slice
- `plan-closer`: All tasks marked complete, ready for closure

**When to use vs other skills:**
- Use **plan-updater** when marking specific tasks complete during execution
- Use **sisyphus-plan** for creating the initial plan
- Use **plan-closer** for final closure after all work complete
