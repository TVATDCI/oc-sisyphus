---
name: checkpoint
description: "Memory checkpoint protocol for Sisyphus phase boundaries. Run at the end of each Sisyphus phase to archive completed-phase state, update hotcache, and prevent context bloat. Triggers: after brief-loader, prd-writer, momus-prd-reviewer, issue-creator, plan-writer, momus-plan-reviewer, wave-executor, plan-updater, plan-closer. Also triggers: when estimated tokens exceed 50K mid-phase."
compatibility: opencode
---

# Memory Checkpoint Protocol

**Purpose:** Archive completed-phase state to prevent context bloat in long Sisyphus workflows.

**When to run:**
- After **every** Sisyphus phase completion (mandatory)
- When estimated tokens exceed **50K** mid-phase (emergency)
- Before session close (mandatory)

**Who runs this:** The orchestrator agent (Sisyphus), not a background daemon. Subagents cannot read parent context.

---

## Core Workflow

### Step 1: Summarize completed phase

Extract 3–5 bullets capturing:
- Phase name and outcome (PASS / FAIL / WARNING)
- Key decisions made in this phase
- Critical blockers resolved (or still open)
- Active Beads issue IDs (if any)

```markdown
## Phase Checkpoint: {phase-name}
- **Outcome:** {PASS/FAIL/WARNING}
- **Decisions:** {key decisions}
- **Blockers:** {resolved or open}
- **Beads IDs:** {active issue IDs}
```

### Step 2: Write to evidence

Save summary to `.sisyphus/evidence/{phase}-checkpoint-{timestamp}.md`:

```bash
CHECKPOINT_FILE=".sisyphus/evidence/${PHASE_NAME}-checkpoint-$(date +%Y%m%d-%H%M%S).md"
mkdir -p .sisyphus/evidence
echo "## Phase Checkpoint: ${PHASE_NAME}" > "$CHECKPOINT_FILE"
echo "- **Outcome:** ${OUTCOME}" >> "$CHECKPOINT_FILE"
```

### Step 3: Update hotcache.md

Read current `hotcache.md`, update:
- `date_updated` in frontmatter
- Decisions Log (append new decisions)
- Open Questions (mark resolved, add new)
- Archive Pointer (add reference to checkpoint file)
- Session Context (update token estimate)

Target: keep hotcache at **800–1200 words**. If it grows beyond, archive oldest decisions to a wiki page.

### Step 4: Update wiki (if needed)

If phase produced durable knowledge:
- Update relevant wiki pages (CONTRIBUTE workflow)
- Log in `log.md`
- Update `index.md` if new pages created

### Step 5: Log the checkpoint

Append to `log.md`:
```markdown
## [YYYY-MM-DD] checkpoint | {phase-name}
- Outcome: {PASS/FAIL/WARNING}
- Checkpoint: `.sisyphus/evidence/{phase}-checkpoint-{timestamp}.md`
- Hotcache updated: yes/no
- Wiki updated: yes/no
```

---

## Emergency Compaction (Mid-Phase)

**Trigger:** Estimated tokens > 50K before phase completes.

1. **Estimate tokens:** `(input_chars + output_chars) / 3.5`
2. **If > 50K:**
   - Archive current context: `.sisyphus/evidence/emergency-compaction-{timestamp}.md`
   - Write 50–100 word summary of current state
   - Truncate conversation history to last 5 turns + summary
   - Continue from summary + hotcache
3. **Log emergency:** `log.md` entry with pre/post token estimates

---

## Output Format

After checkpoint, report:
```
Checkpoint complete for {phase-name}
- Evidence file: {path}
- Hotcache: updated (now {N} words)
- Wiki: {updated/unchanged}
- Next phase: {phase-name}
```

---

## Tool Usage

- `read`: Read hotcache.md, log.md, evidence files
- `write`: Write checkpoint files, update hotcache.md
- `edit`: Update log.md, index.md
- `home_list_directory`: Check evidence directory exists

## Boundaries

- **MUST NOT** spawn background agents for checkpointing (they can't read parent context)
- **MUST NOT** skip checkpoint at phase boundaries (even if "nothing happened")
- **MUST NOT** delete old evidence files during checkpoint (archive, don't prune)
- **MUST NOT** update raw/ sources during checkpoint (raw is immutable)
