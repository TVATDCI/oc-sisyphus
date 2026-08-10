---
name: plan-closer
description: "Close completed plan, archive state, close beads issues. Use when: (1) user says 'close plan' or 'finish initiative', (2) all tasks completed or explicitly deferred, (3) final cleanup after execution. Triggers: 'close plan', 'finish initiative', 'complete plan', 'archive plan'."
compatibility: opencode
---

# Plan Closer

Closes execution plan, archives state, and closes beads tracking issues.

## Entry Criteria

- [ ] All tasks completed or explicitly deferred (verified by `plan-updater`)
- [ ] User confirms completion
- [ ] State file and plan file exist

## Produces

- Plan file with completion summary appended
- State file archived to `.sisyphus/evidence/`
- Beads issue closed with resolution

## Next if Approved

- **Closure complete**: Workflow finished. Return to `discovery-orchestrator` for next initiative

## Next if Rejected

- **Incomplete tasks remain**: Return to `plan-updater` to finish remaining work
- **User does not confirm**: STOP. Wait for user approval before closing
- **Beads close fails**: Report error, leave plan marked complete but beads issue open

## Model Selection

**Category:** `unspecified-high`

Runtime model and fallbacks are resolved from `~/.omo/omo.jsonc` (`[opencode]` section) by category. Do not hardcode model identifiers here — they drift on every model refresh.

**Model Transparency:**
When delegating to subagents, always report: `Executing with [model] via [category]` — fill `[model]` from runtime context.

## Input

- Plan file path (or derive from state file)
- Confirmation that all TODOs are completed or explicitly deferred

## Steps

1. **Verify all TODOs checked or explicitly marked deferred**
   ```bash
   grep -c "^\- \[ \]" {plan_file}
   ```
   If count > 0: Report incomplete tasks, ask for confirmation

2. **Add completion summary to plan**
   Append:
   ```markdown
   ---
   ## Completion Summary
   **Completed:** {date}
   **Outcome:** {what was achieved}
   **Deferred:** {any incomplete tasks and why}
   ```

3. **Synthesize AGENTS.md Session Reflection (REQUIRED — Oracle finding: sisy-dev failed here)**
   Read:
   - `~/.sisyphus/state.json` → gate history, waves completed
   - `{project_root}/STATE.md` → living project state, blockers, metrics (if exists)
   - `{project_root}/CONTEXT.md` → phase decisions, open questions (if exists)
   - `{project_root}/.sisyphus/evidence/{plan_name}/` → build evidence, test results
   - `{project_root}/.sisyphus/notepads/{plan_name}/decisions.md` → architectural decisions
   - `{project_root}/.sisyphus/notepads/{plan_name}/problems.md` → issues encountered
   - `{project_root}/.sisyphus/notepads/{plan_name}/learnings.md` → insights

   Update `{project_root}/AGENTS.md` Session Reflection section with:
   ```markdown
   ## Session Reflection

   ### What We Accomplished
   - {wave count} waves completed, {slice count}/{total slices} slices done
   - {key deliverables built}
   - {technologies successfully integrated}

   ### What Failed / Drifted
   - {list each deviation from plan with cause}
   - {list each problem from problems.md with resolution}

   ### Developer Notes
   - {key patterns discovered}
   - {stack quirks or workarounds}
   - {what the next team should know}

   ### Next Steps
   - {specific remaining work}
   - {deployment or follow-up actions}
   ```

   **If AGENTS.md does not exist:** Create it from the project template first, then populate Session Reflection.
   **If Session Reflection section missing:** Add it at the end of AGENTS.md.

4. **Archive per-project state (JSON + living state files)**
   ```bash
   # Archive machine-readable state
cp ~/.sisyphus/state.json \
       ~/.sisyphus/evidence/state-{plan_name}-{date}.json

   # Archive human-readable living state
   if [ -f {project_root}/STATE.md ]; then
     mv {project_root}/STATE.md \
        {project_root}/.sisyphus/evidence/STATE-{plan_name}-{date}.md
   fi

   if [ -f {project_root}/CONTEXT.md ]; then
     mv {project_root}/CONTEXT.md \
        {project_root}/.sisyphus/evidence/CONTEXT-{plan_name}-{date}.md
   fi
   ```

   **Final STATE.md snapshot before archive:**
   Append completion block to STATE.md before moving:
   ```markdown
   ## Completion: {date}
   - **Outcome:** {what was achieved}
   - **Final Wave:** {current_wave}/{total_waves}
   - **Final Slices:** {completed}/{total}
   - **Deferred:** {any incomplete tasks}
   - **Archived to:** .sisyphus/evidence/STATE-{plan_name}-{date}.md
   ```

5. **Close beads issue**
   ```bash
   bd close {issue_id} --resolution completed \
      --message "Plan completed. See .sisyphus/plans/{name}.md for details."
   ```

## Output

- Plan closed with completion summary
- State archived to evidence/
- Beads issue closed

## Integration with Other Skills

This skill is the terminal phase of the execution workflow:

```
wave-executor + plan-updater (complete all tasks)
  ↓
plan-closer (archives state, closes beads issue)
  ↓
[Workflow complete]
```

**Input from:**
- `wave-executor`: Completed slices, evidence logs
- `plan-updater`: All tasks marked complete in plan file

**Output:**
- Plan archived with completion summary
- State moved to `.sisyphus/evidence/`
- Beads issue closed with resolution

**When to use vs other skills:**
- Use **plan-closer** when ALL work is done and user confirms completion
- Use **plan-updater** for incremental progress during execution
- Do NOT use if tasks remain incomplete (use plan-updater instead)
