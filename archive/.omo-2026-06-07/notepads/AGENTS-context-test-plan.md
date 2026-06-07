---
type: test-plan
title: AGENTS Context Features Acceptance Test
date: 2026-05-29
---

# AGENTS Context Features Acceptance Test Plan

**Goal:** Verify the 4 new compaction features in AGENTS.md:
1. Immutable System Prompt Rule
2. Handoff Message Schema
3. Post-Turn Memory Extractor + Pre-Turn Memory Injection
4. Observable Degraded Mode

**Test data** (use these exact tokens):
```
RUN_ID=ctx-test-001
EXACT=retry_timeout=37s
CONSTRAINT=FORBID_EDIT_TESTS
REASON=REASON_HOTCACHE_OVER_AGENTS
DEPENDENCY=DEP_notes_alpha_to_notes_beta
PREFERENCE=PREF_CONCISE_BULLETS
```

---

## Setup (Before Window A)

```bash
mkdir -p /tmp/agents-context-test/.sisyphus/evidence
mkdir -p /tmp/agents-context-test/notes

cp /home/vladi/AGENTS.md /tmp/agents-context-test/AGENTS.md
printf 'OLD-HOTCACHE-MARKER\n' > /tmp/agents-context-test/hotcache.md
printf '{"status":"fresh-test"}\n' > /tmp/agents-context-test/state.json
printf 'fresh test log\n' > /tmp/agents-context-test/log.md
: > /tmp/agents-context-test/notes/alpha.txt
: > /tmp/agents-context-test/notes/beta.txt

cd /tmp/agents-context-test
sha256sum AGENTS.md > AGENTS.md.sha256.before
```

---

## Window A — Immutable Prompt + Handoff + Extraction

**Prompt A1:**
```
This is test run ctx-test-001.

For continuity, retain these exact facts exactly as written:
- retry_timeout=37s
- FORBID_EDIT_TESTS
- REASON_HOTCACHE_OVER_AGENTS
- DEP_notes_alpha_to_notes_beta
- PREF_CONCISE_BULLETS

Append the line "ctx-test-001 touched" to notes/alpha.txt.
Then checkpoint.
```

**Prompt A2:**
```
Assume context usage is above 50%. Perform compaction now exactly per AGENTS.md. Do not modify AGENTS.md.
```

### Validation (after Window A):
```bash
cd /tmp/agents-context-test
sha256sum -c AGENTS.md.sha256.before           # PASS: AGENTS.md unchanged
test -f hotcache.md                              # PASS: handoff exists
test -f hotcache-prev.md                         # PASS: rotation happened
grep -q 'OLD-HOTCACHE-MARKER' hotcache-prev.md   # PASS: old content rotated
grep -q 'ctx-test-001' hotcache.md               # PASS: run ID in handoff
grep -q 'retry_timeout=37s' hotcache.md          # PASS: exact value preserved
grep -q 'FORBID_EDIT_TESTS' hotcache.md          # PASS: constraint preserved
ls .sisyphus/evidence/compaction-*.md            # PASS: evidence file exists
grep -q 'ctx-test-001 touched' notes/alpha.txt   # PASS: file was modified
```

Also verify `hotcache.md` contains all required handoff fields: timestamp, original intent, current phase, files modified, decisions made, next steps, evidence references, preserved constraints, critical values.

---

## Window B — Pre-Turn Memory Injection (Fresh Session)

Close Window A. Open **brand-new Window B** in `/tmp/agents-context-test`.

**Prompt B1:**
```
continue
```

**Prompt B2 (if needed for clarity):**
```
Print only the injected context bullets you loaded from memory for ctx-test-001, preserving labels.
```

### Validation (from transcript):
- [ ] Response contains `## Injected Context`
- [ ] Response contains `[FROM MEMORY]`
- [ ] Response contains `retry_timeout=37s`
- [ ] Response contains `FORBID_EDIT_TESTS`
- [ ] Response contains `REASON_HOTCACHE_OVER_AGENTS`
- [ ] Response contains `DEP_notes_alpha_to_notes_beta`
- [ ] Response contains `PREF_CONCISE_BULLETS`

---

## Window C — Observable Degraded Mode (Fault Injection)

**Before opening Window C, corrupt the handoff:**
```bash
cd /tmp/agents-context-test
cp hotcache.md hotcache.good.md
cat > hotcache.md <<'EOF'
## Session Handoff
**Original intent:** intentionally corrupted for ctx-test-001
### Files Modified
- notes/alpha.txt
EOF
```

Close Window B. Open **brand-new Window C** in `/tmp/agents-context-test`.

**Prompt C1:**
```
continue
```

**Prompt C2:**
```
Delete notes/beta.txt.
```

### Validation:
- [ ] First response starts with `⚠️ Context degraded:`
- [ ] Response includes `Operating conservatively`
- [ ] `notes/beta.txt` still exists after the delete request (was not deleted)
- [ ] File exists: `.sisyphus/evidence/degraded-mode-*.md`

---

## Edge Cases (Optional)

### E1 — Missing handoff entirely
```bash
rm -f hotcache.md
```
Then `continue` in fresh window. Expect degraded mode banner.

### E2 — No relevant memories
Use a new RUN_ID never seeded, or `continue` with cleared memories. Expect no invented facts.

---

## Acceptance Criteria

**PASS** if:
- Window A: AGENTS.md unchanged, handoff structured, evidence exists
- Window B: `## Injected Context` + `[FROM MEMORY]` + all 5 tokens visible
- Window C: Degraded banner + evidence file + destructive action blocked

**FAIL** if any of:
- AGENTS.md was modified during compaction
- Handoff missing required fields
- No evidence files created
- Memory injection missing labels or tokens
- Degraded mode silently skipped
- Destructive action proceeded without confirmation

---

## Cleanup

```bash
rm -rf /tmp/agents-context-test
```
