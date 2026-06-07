---
name: vault-ops
description: "Orchestrates Main-vault publishing workflows (discover → validate → publish → index → beads). Delegates individual execution steps to archivist. Use when: (1) running a full publishing pipeline, (2) coordinating multi-step vault operations, (3) user requests 'publish vault' or 'run vault workflow'. Triggers: publish vault, run vault workflow, full discovery pipeline, orchestrate publishing. NOT for: individual file edits (use archivist), read-only validation (use vault-lint or auditor)."
compatibility: opencode
triggers:
  - "publish vault"
  - "run vault workflow"
  - "full discovery pipeline"
  - "orchestrate publishing"
mode: afk-safe
inputs:
  - "results.json (for discovery)"
  - "closed issues (for sync)"
  - "vault-lint PASS (pre-publish gate)"
outputs:
  - "orchestrated pipeline execution"
  - "delegation to archivist for each step"
  - "final verification report"
produces_artifacts:
  - "wiki/discoveries/*.md"
  - "index.md updates"
requires_artifacts:
  - "results.json (for discovery)"
  - "closed issues (for sync)"
  - "vault-lint validation (pre-publish gate)"
gates:
  - "results.json must exist"
  - "beads issue must be closed"
  - "vault-lint must PASS before publishing"
metadata:
  version: 2.0.0
  category: orchestrator
---

# Vault-Ops Skill

**Orchestrator for Main-vault publishing workflows.** vault-ops defines and coordinates the publishing pipeline, then delegates individual execution steps to the **archivist** agent. vault-ops does NOT execute scripts directly — it orchestrates, delegates, and verifies.

**Relationship:** vault-ops orchestrates → archivist executes.

## Core Responsibilities

1. Define the publishing pipeline (discover → validate → publish → index → beads)
2. Delegate each pipeline step to archivist for execution
3. Verify each step's output before proceeding to the next
4. Report overall pipeline status to the user

## Pipeline Definition

### Phase 1: Discover
- **Delegate to:** archivist
- **Input:** results.json from simulation project
- **Expected output:** wiki/discoveries/YYYY-MM-DD-{slug}.md created
- **Verification:** File exists, frontmatter valid

### Phase 2: Validate
- **Delegate to:** vault-lint or auditor
- **Input:** Newly created discovery files
- **Expected output:** PASS (structure validated, safe to publish)
- **Verification:** Exit code 0, no errors reported

### Phase 3: Publish
- **Delegate to:** archivist
- **Input:** Validated discovery files
- **Expected output:** Wiki pages published, index.md updated
- **Verification:** Counts incremented, recent additions updated

### Phase 4: Sync Beads
- **Delegate to:** archivist
- **Input:** Closed beads issues with resolutions
- **Expected output:** Beads issues synced to wiki discoveries
- **Verification:** Number of synced files matches closed issues

### Phase 5: Final Index Update
- **Delegate to:** archivist
- **Input:** All published content
- **Expected output:** index.md counts match actual file counts
- **Verification:** `update_index.py` exit code 0, git diff shows expected changes

## Delegation Protocol

When executing a pipeline, vault-ops delegates to archivist for each step:

```
vault-ops (orchestrator)
  ↓ delegates "run discover.sh for {project}"
archivist (executor)
  ↓ reports: discovery created, exit code 0
vault-ops verifies output
  ↓ delegates "run vault-lint validation"
vault-lint (validator)
  ↓ reports: PASS
vault-ops verifies output
  ↓ delegates "run update_index.py"
archivist (executor)
  ↓ reports: index updated, counts match
vault-ops reports: Pipeline complete
```

## Error Handling

| Error | Action |
|-------|--------|
| `results.json` missing | STOP, report path checked, ask user to run simulation |
| Script exits non-zero | Report exit code, show last 10 lines of output, STOP pipeline |
| vault-lint FAILS | STOP, report validation errors, do NOT proceed to publish |
| Discovery file not created | Check `results.json` format, verify `discover_helper.py` parses correctly |
| Beads command fails | Check `BEADS_DB` environment variable, verify `.beads/` permissions |
| Index counts don't increment | Run `ls wiki/discoveries/ | wc -l` to manually verify count |

## Boundaries

- **Do NOT execute scripts directly** — delegate to archivist for all script execution
- **Do NOT create/edit wiki pages directly** — delegate to archivist for file operations
- **Do NOT validate vault structure** — delegate to vault-lint or auditor for validation
- **Do NOT conduct open-ended research** — delegate to athena-research for exploration
- **Do NOT modify `raw/` sources** — `raw/` is immutable per AGENTS.md

## Integration with Other Skills

**Input from:**
- User: "publish vault", "run vault workflow", "full discovery pipeline"
- sisyphus-plan: Pipeline execution trigger

**Delegates to:**
- archivist: Script execution, file creation, index updates, beads sync
- vault-lint: Pre-publish validation gate
- auditor: Post-publish quality check

**Output:**
- Pipeline execution report with per-step status
- Summary of files created, counts updated, issues synced
