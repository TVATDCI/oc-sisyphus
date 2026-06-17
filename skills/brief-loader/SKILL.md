---
name: brief-loader
description: "Load and validate an approved planning brief from discovery-orchestrator. Use when: (1) user says 'brief approved' or 'create PRD from brief', (2) brief exists in .sisyphus/notepads/ and needs validation before PRD creation, (3) checking brief completeness before handing off to prd-writer. Triggers: 'approved brief', 'brief approved', 'load brief', 'validate brief'."
compatibility: opencode
---

# Brief Loader

Validates that a discovery-orchestrator brief exists and is complete enough for PRD creation. This is NOT discovery — discovery happens in `discovery-orchestrator`.

## Entry Criteria

- [ ] Discovery session completed by `discovery-orchestrator`
- [ ] Brief file exists in `.sisyphus/notepads/` or brief content in session context
- [ ] Project root resolved (from boulder.json or session context)

## Produces

- Brief content (loaded into workflow context)
- Validation result: "complete" or "incomplete" with missing sections listed

## Next if Approved

- **Complete brief**: Delegate to `prd-writer` to create PRD

## Next if Rejected

- **Incomplete brief**: Delegate to `discovery-orchestrator` to fill gaps
- **No brief found**: Report missing artifact, do not proceed

## Model Selection

**Category:** `unspecified-high` → `glm-5.2` (fallback: `glm-5.1`, `kimi-k2.6`)

**Model Transparency:**
When delegating to subagents, always report: `Executing with [model] via [category]` (e.g., "Executing with glm-5.2 via unspecified-high").

## Input

- Brief file path (from discovery-orchestrator output) OR brief content in session context
- Optional: project_root override

## Steps

1. **Locate brief file**
   ```bash
   ls {project_root}/.sisyphus/notepads/*/discovery-*.md 2>/dev/null | tail -1
   ```
   Or check session context for brief content.

2. **Validate brief completeness**
   Brief must contain ALL of:
   - [ ] Context (current state, pain point)
   - [ ] Work Objectives (2-5 specific, testable deliverables)
   - [ ] Verification criteria (how we'll know it's done)
   - [ ] First execution wave (first concrete slice)

3. **If brief incomplete**
   - Do NOT start discovery here
   - Delegate to `discovery-orchestrator`: "Brief incomplete — need discovery session"
   - Report: "The brief is missing [specific sections]. Handing back to discovery to fill gaps."

4. **If brief complete**
   - Load brief into workflow context
   - Report: "Brief validated and loaded. Ready for PRD creation."

## Output

- Brief content (loaded into context)
- Validation result: "complete" or "incomplete" with missing sections listed

## Gate to Next Phase

Brief validated (complete) → hand off to `prd-writer`

## Error Handling

| Scenario | Action |
|----------|--------|
| Brief not found | Report "No brief found in .sisyphus/notepads/" — delegate to discovery-orchestrator |
| Brief missing sections | List missing sections, do not proceed |
| Multiple briefs | Use most recently modified |

## Integration

- **Previous**: `discovery-orchestrator` (produces the brief)
- **Next**: `prd-writer` (consumes the validated brief)
