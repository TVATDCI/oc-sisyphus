---
name: issue-creator
description: "Break an approved PRD into vertical slice issues (beads tracking). Use when: (1) user says 'break into issues' or 'create kanban', (2) PRD is approved and needs executable slices, (3) after prd-writer presents approved PRD. Triggers: 'break into issues', 'vertical slices', 'create kanban', 'slice this', 'approved PRD'."
compatibility: opencode
---

# Issue Creator

Transforms an approved PRD into vertical slice issues with dependency mapping. Each issue represents one end-to-end feature. Runs mandatory reference-checker gate.

## Entry Criteria

- [ ] PRD approved by user and passed `momus-prd-reviewer` gate
- [ ] PRD file exists and is frozen (not being edited)
- [ ] Reference check passed (no naming conflicts via `reference-checker`)

## Produces

- Beads issues (one per vertical slice) with acceptance criteria
- Dependency graph summary (blocking relationships)
- Ready queue (slices with no blockers)
- AFK vs human-review classification

## Next if Approved

- **Issues created**: Delegate to `plan-writer` to create execution plan

## Next if Rejected

- **Reference-check FAIL**: STOP. Resolve conflicts, retry (max 3)
- **No vertical slices possible**: Create enabling slice, document rationale
- **Dependency cycle detected**: FAIL. Report cycle. Require user to break it

## Model Selection

**Category:** `unspecified-high` → `kimi-k2.6` (fallback: `glm-5.1`)

**Rationale:** Issue creation is mechanical — read PRD, identify vertical slices, assign IDs. No deep reasoning needed.

**Model Transparency:**
When delegating to subagents, always report: `Executing with [model] via [category]` (e.g., "Executing with kimi-k2.6 via unspecified-high").

## Input

- Approved PRD path (from prd-writer output)
- Optional: beads project ID

## Rules (CRITICAL)

1. **Vertical slices only** — each issue cuts through ALL system layers
2. **NEVER horizontal layers** — no "all schema" then "all API" then "all UI"
3. **Tracer bullet rule** — first slice must be end-to-end and testable
4. **Exceptions** (rare, documented):
   - Enabling slices: foundational infrastructure
   - Legacy characterization: understanding existing system

## Steps

0. **Checkpoint 2: Reference Verification**
   Before creating issues, verify no conflicts:
   ```
   Delegate to reference-checker:
     artifact_name = {PRD slug}
     artifact_type = "plan"
     project_root = {resolved}
   ```
   
   | Decision | Action |
   |----------|--------|
   | PASS | Proceed with issue creation |
   | WARNING | Proceed with caution. Log related work |
   | FAIL | STOP. "Cannot create issues — conflicts found." Resolve and retry (max 3) |

1. **Read approved PRD** (frozen document)
2. **Draft vertical slices** from user stories
   - Each slice = complete feature, end-to-end
   - Each slice produces something visible/testable
   - Slice size: should fit in smart zone

3. **Map dependencies (blocking relationships)**
   - Enabling slices may block feature slices
   - Feature slices should be independent where possible
   - Check for dependency cycles — these are FAIL
   - Document blocker rationale

4. **Create beads issues** (one per slice)
   ```bash
   bd create --title "Slice: {brief description}" \
             --body "PRD: .sisyphus/prds/{name}-prd.md
   
   Acceptance Criteria:
   - [ ] {criterion 1}
   - [ ] {criterion 2}
   
   Blockers: {issue IDs or none}
   Type: {AFK | human-review}
   PRD Reference: .sisyphus/prds/{name}-prd.md"
   ```

5. **Mark AFK vs human-review**
   - AFK: implementation can run without human (clear acceptance criteria, bounded scope)
   - human-review: requires human taste check, UI review, or architectural decision

6. **Verify dependency graph**
   - No cycles
   - Ready queue is clear (no unclaimed blockers for first slice)

7. **Present issues to user**
   Report:
   - Issue IDs and descriptions
   - Slice count
   - Dependency graph summary
   - Ready queue (what can start first)
   - Ask: "Issues created. Approve to create execution plan?"

## Output

- Issue IDs
- Slice count
- Dependency graph summary
- Ready queue

## Gate to Next Phase

User explicitly approves issues → hand off to `plan-writer`

## Error Handling

| Scenario | Action |
|----------|--------|
| PRD not approved | STOP. "PRD must be approved before creating issues" |
| No vertical slices possible | Create enabling slice, document rationale |
| Dependency cycle detected | FAIL. Report cycle. Require user to break it |
| Beads command fails | Check BEADS_DB, verify .beads/ permissions |

## Integration

- **Previous**: `prd-writer` (provides approved PRD)
- **Next**: `plan-writer` (after user approves issues)
- **Gates**: `reference-checker` (pre-creation)
