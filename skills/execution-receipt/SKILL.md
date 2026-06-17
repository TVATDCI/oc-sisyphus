---
name: execution-receipt
description: "Post-delegation verification and execution receipt protocol. Run after every task() call to verify subagent work independently and write a structured receipt. Triggers: after task() delegation, verify subagent results, check task output, post-delegation verification, track execution. Zero trust in subagent self-reports."
compatibility: opencode
---

# Execution Receipt Protocol

**Core invariant:** Every `task()` call must produce a receipt and, when files change, an independent verification check.

Receipts are stored in `bd remember` so they survive compaction and session boundaries.

---

## Receipt Schema

One entry per task, keyed by monotonic counter:

```
task-{N}:exec={status} verify={result} model={category} files={N} duration={N}s retry={N}
```

| Field | Values | Meaning |
|-------|--------|---------|
| `exec` | `success` `refused` `error` `partial` | Subagent outcome |
| `verify` | `pass` `fail(N)` `skipped({reason})` | Post-run verification |
| `model` | category name, e.g. `quick`, `visual-engineering` | Which category was used |
| `files` | integer | Unique changed files count |
| `duration` | integer seconds | Wall-clock elapsed time |
| `retry` | 0–2 | Attempt number (0 = first attempt) |

### Verify reasons

| Reason | When |
|--------|------|
| `declined` | `exec=refused` or `exec=error` — no verification run |
| `nofiles` | No files changed by the task |
| `nolsp` | Files changed but no LSP server covers their type |

---

## Orchestration Flow

Run these steps after every `task()` call, in order.

### 0. Read counter

```bash
LAST=$(bd remember --query "task-counter" 2>/dev/null | tail -1 || echo "0")
N=$((LAST + 1))
```

### 1. Capture filesystem state before

```bash
BEFORE=$(git status --porcelain 2>/dev/null || echo "")
```

### 2. Note start time

```bash
START=$(date +%s)
```

### 3. Execute task()

```bash
task(category="...", load_skills=[...], prompt="...")
```

### 4. Note end time and compute duration

```bash
END=$(date +%s)
DURATION=$((END - START))
```

### 5. Capture filesystem state after

```bash
AFTER=$(git status --porcelain 2>/dev/null || echo "")
```

### 6. Diff to find changed files

```bash
CHANGED=$(diff <(echo "$BEFORE") <(echo "$AFTER") | grep -E '^[<>]' | awk '{print $NF}' | sort -u | wc -l)
```

### 7. Determine `exec` status

| Observation | `exec` value |
|-------------|--------------|
| Task completed and delivered full scope | `success` |
| Subagent declined or refused | `refused` |
| Task failed, crashed, or returned unexpected output | `error` |
| Task completed but scope was cut short | `partial` |

### 8. Run verification if files changed

```bash
if [ "$CHANGED" -gt 0 ]; then
  FILES=$(diff <(echo "$BEFORE") <(echo "$AFTER") | grep -E '^[<>]' | awk '{print $NF}' | sort -u)
  DIAG_COUNT=0
  for f in $FILES; do
    # lsp_diagnostics may return empty if no server covers the file type
    COUNT=$(lsp_diagnostics --file "$f" --severity all 2>/dev/null | grep -cE 'error|warning' || echo "0")
    DIAG_COUNT=$((DIAG_COUNT + COUNT))
  done
  if [ "$DIAG_COUNT" -eq 0 ]; then
    VERIFY="pass"
  else
    VERIFY="fail($DIAG_COUNT)"
  fi
else
  VERIFY="skipped(nofiles)"
fi
```

If `lsp_diagnostics` cannot run at all (no server, unsupported type), use `skipped(nolsp)`.

### 9. Write receipt

```bash
bd remember "task-${N}:exec=${EXEC} verify=${VERIFY} model=${CATEGORY} files=${CHANGED} duration=${DURATION}s retry=${RETRY}" --key "task-${N}"
```

### 10. Update counter

```bash
bd remember "${N}" --key "task-counter"
```

### 11. Retry logic

Only retry when:

- `exec=success`
- `verify=fail(N)`
- `retry < 2` (max 3 total attempts: 0, 1, 2)

Retry procedure:

1. Re-delegate with the same category and prompt.
2. Prepend the diagnostic error list to the prompt.
3. Increment `retry`.
4. Write the updated receipt to the **same key** `task-${N}`.

Do **not** retry:

- `exec=refused` — re-route to a different category.
- `exec=error` — escalate; likely a tool/permission issue.
- `exec=partial` — escalate; scope was already cut.

---

## Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Non-git workspace | `BEFORE`/`AFTER` empty → `files=0`, `verify=skipped(nofiles)` |
| Read-only task | `files=0`, `verify=skipped(nofiles)` |
| Refused task | `exec=refused`, `verify=skipped(declined)` |
| Errored task | `exec=error`, `verify=skipped(declined)` |
| No LSP for file type | `verify=skipped(nolsp)` |
| File deletion | Counted by `git status`; diagnostics may return empty |
| Renamed files | Git shows `R`; count both paths |
| Untracked files | `??` in `git status`; count as changed |
| Concurrent modifications | Expected noise; still valid data |
| Counter corruption | Reset to 1 and log to `~/.sisyphus/evidence/execution-receipt-corruption-{timestamp}.md` |

---

## Bash Templates

**Read all receipts:**

```bash
LAST=$(bd remember --query "task-counter" 2>/dev/null | tail -1 || echo "0")
for i in $(seq 1 "$LAST"); do
  bd remember --query "task-${i}"
done
```

**Read last receipt:**

```bash
LAST=$(bd remember --query "task-counter" 2>/dev/null | tail -1 || echo "0")
bd remember --query "task-${LAST}"
```

---

## Compliance Rules

- Write a receipt on **every** `task()` call, including read-only, refused, and errored tasks.
- Verify **every** task that changes files.
- Do **not** trust subagent self-reports — verify what the orchestrator observes.
- Use `--key "task-{N}"` for all receipts to enable in-place retry updates.
- Counter is monotonic — never decrement.
- Receipts survive compaction because they live in `bd remember`.

---

## Integration Notes

- This is an **orchestrator-side meta-skill** — no subagent needs to know about it.
- No changes to `task()` signature or subagent prompts.
- Store deferred or rejected findings in `~/.sisyphus/evidence/execution-receipt-{timestamp}.md` if `bd remember` fails.
