---
name: execution-receipt
description: "Post-delegation verification and execution receipt protocol. Run after every task() call to verify subagent work independently and write a structured receipt. Triggers: after task() delegation, verify subagent results, check task output, post-delegation verification, track execution. Zero trust in subagent self-reports."
compatibility: opencode
---

# Execution Receipt Protocol

**Core invariant:** Every `task()` call should produce a receipt and, when files change, an independent verification check.

Receipts are stored in `bd remember` and a local JSONL log so they survive compaction and session boundaries.

---

## Receipt Schema

One entry per task, keyed by monotonic counter:

```
task-{N}:exec={status} verify={result} model={category} files={N} duration={N}s retry={N} bead={id} session={id}
```

| Field | Values | Meaning |
|-------|--------|---------|
| `exec` | `success` `refused` `error` `partial` | Subagent outcome |
| `verify` | `pass` `fail(N)` `skipped({reason})` | Post-run verification |
| `model` | category name, e.g. `quick`, `visual-engineering` | Which category was used |
| `files` | integer | Unique changed paths count |
| `duration` | integer seconds | Wall-clock elapsed time |
| `retry` | 0–2 | Attempt number (0 = first attempt) |
| `bead` | bead issue ID or `none` | Active bead at time of task |
| `session` | session ID or `none` | OpenCode session ID |

### Verify reasons

| Reason | When |
|--------|------|
| `declined` | `exec=refused` or `exec=error` — no verification run |
| `nofiles` | No files changed by the task |
| `nolsp` | Files changed but no LSP server covers their type |
| `nosyntax` | File type has no applicable syntax checker |
| `dirtytree` | Could not reliably detect changes because worktree was already dirty |

---

## Orchestration Flow

Run these steps after every `task()` call, in order.

### 0. Read counter

```bash
COUNTER_FILE="$HOME/.sisyphus/evidence/execution-receipt-counter"
LAST=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
if ! [[ "$LAST" =~ ^[0-9]+$ ]]; then
  echo "WARN: corrupt task counter '$LAST'; resetting to 0" >&2
  LAST=0
fi
N=$((LAST + 1))
```

### 1. Capture filesystem state before

```bash
BEFORE=$(git status --porcelain 2>/dev/null || echo "")
BEFORE_DIRTY=$([ -n "$BEFORE" ] && echo "1" || echo "0")
```

### 2. Note start time and context

```bash
START=$(date +%s)
BEAD=$(bd list --status=in_progress 2>/dev/null | head -1 | awk '{print $1}' || echo "none")
SESSION="${OPENCODE_SESSION_ID:-none}"
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

### 6. Diff to find changed paths

```bash
# Parse git status lines and extract paths
# Status codes are two chars; path starts at column 4
# Renames: R  old -> new
CHANGED_PATHS=$(
  {
    echo "$BEFORE" | awk '{if (NR==1 && $0 ~ /^#/) next; print}'
    echo "$AFTER"   | awk '{if (NR==1 && $0 ~ /^#/) next; print}'
  } |
  while read -r line; do
    [ -z "$line" ] && continue
    # Skip header lines from git status --porcelain
    case "$line" in
      \#*) continue ;;
    esac
    status="${line:0:2}"
    rest="${line:3}"
    if [ "$status" = "R " ] || [ "$status" = " R" ] || [ "$status" = "RR" ]; then
      # Rename: "old -> new"
      old="${rest%% -> *}"
      new="${rest##* -> }"
      printf '%s\n' "$old" "$new"
    else
      printf '%s\n' "$rest"
    fi
  done | sort -u
)
CHANGED=$(echo "$CHANGED_PATHS" | grep -c . || echo "0")
```

**Limitation:** If the worktree was already dirty (`BEFORE_DIRTY=1`) and a task modifies a file that was already dirty with no status change, the receipt cannot reliably detect the edit. In that case record `verify=skipped(dirtytree)` and note the limitation.

### 7. Determine `exec` status

| Observation | `exec` value |
|-------------|--------------|
| Task completed and delivered full scope | `success` |
| Subagent declined or refused | `refused` |
| Task failed, crashed, or returned unexpected output | `error` |
| Task completed but scope was cut short | `partial` |

### 8. Run verification if files changed

```bash
if [ "$CHANGED" -gt 0 ] && [ "$BEFORE_DIRTY" = "1" ]; then
  VERIFY="skipped(dirtytree)"
elif [ "$CHANGED" -gt 0 ]; then
  DIAG_COUNT=0
  SYNTAX_COUNT=0
  for f in $CHANGED_PATHS; do
    full="$REPO/$f"
    case "$f" in
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
        COUNT=$(lsp_diagnostics({ filePath: "$full", severity: "all" }) | grep -cE 'error|warning' || echo "0")
        DIAG_COUNT=$((DIAG_COUNT + COUNT))
        ;;
      *.sh)
        bash -n "$full" 2>/dev/null || SYNTAX_COUNT=$((SYNTAX_COUNT + 1))
        ;;
      *.json|*.jsonc)
        node -e "JSON.parse(require('fs').readFileSync('$full','utf8'))" 2>/dev/null || SYNTAX_COUNT=$((SYNTAX_COUNT + 1))
        ;;
      *.md|*.yml|*.yaml)
        # No automated check beyond existence
        ;;
      *)
        COUNT=$(lsp_diagnostics({ filePath: "$full", severity: "all" }) | grep -cE 'error|warning' || echo "0")
        if [ "$COUNT" -gt 0 ]; then
          DIAG_COUNT=$((DIAG_COUNT + COUNT))
        else
          SYNTAX_COUNT=$((SYNTAX_COUNT + 1))
        fi
        ;;
    esac
  done

  TOTAL_FAIL=$((DIAG_COUNT + SYNTAX_COUNT))
  if [ "$TOTAL_FAIL" -eq 0 ]; then
    VERIFY="pass"
  else
    VERIFY="fail($TOTAL_FAIL)"
  fi
else
  VERIFY="skipped(nofiles)"
fi
```

If `lsp_diagnostics` cannot run at all (no server, unsupported type), use `skipped(nolsp)`.

### 9. Write receipt

```bash
RECEIPT="task-${N}:exec=${EXEC} verify=${VERIFY} model=${CATEGORY} files=${CHANGED} duration=${DURATION}s retry=${RETRY} bead=${BEAD} session=${SESSION}"

# Primary storage: bd remember for cross-session injection
bd remember "$RECEIPT" --key "task-${N}"

# Secondary durable storage: JSONL log
LOG="$HOME/.sisyphus/evidence/execution-receipts.jsonl"
echo "{\"n\":$N,\"exec\":\"$EXEC\",\"verify\":\"$VERIFY\",\"model\":\"$CATEGORY\",\"files\":$CHANGED,\"duration\":$DURATION,\"retry\":$RETRY,\"bead\":\"$BEAD\",\"session\":\"$SESSION\",\"timestamp\":\"$(date -Iseconds)\"}" >> "$LOG"
```

### 10. Update counter

```bash
echo "$N" > "$COUNTER_FILE"
```

### 11. Retry logic

Only retry when:

- `exec=success`
- `verify=fail(N)`
- `retry < 2` (max 3 total attempts: 0, 1, 2)

Retry procedure:

1. Re-delegate with the same category and prompt.
2. Prepend the diagnostic/syntax error list to the prompt.
3. Increment `retry`.
4. Write the updated receipt to the **same key** `task-${N}` and append to the JSONL log.

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
| No LSP for file type | `verify=skipped(nolsp)` or syntax-only check |
| File deletion | Counted by `git status`; diagnostics may return empty |
| Renamed files | Git shows `R`; count both old and new paths |
| Untracked files | `??` in `git status`; count as changed |
| Concurrent modifications | Expected noise; still valid data |
| Dirty worktree | `verify=skipped(dirtytree)` with note |
| Counter corruption | Reset to 1 and log to `~/.sisyphus/evidence/execution-receipt-corruption-{timestamp}.md` |

---

## Reading Receipts

**Last receipt:**

```bash
COUNTER_FILE="$HOME/.sisyphus/evidence/execution-receipt-counter"
LAST=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
tail -1 "$HOME/.sisyphus/evidence/execution-receipts.jsonl"
```

**All receipts:**

```bash
cat "$HOME/.sisyphus/evidence/execution-receipts.jsonl"
```

**By bead:**

```bash
grep '"bead":"brain-xxx"' "$HOME/.sisyphus/evidence/execution-receipts.jsonl"
```

---

## Compliance Rules

- Write a receipt on **every** `task()` call, including read-only, refused, and errored tasks.
- Verify **every** task that changes files, when the worktree is clean enough to do so reliably.
- Do **not** trust subagent self-reports — verify what the orchestrator observes.
- Use `--key "task-{N}"` for `bd remember` receipts to enable in-place retry updates.
- Counter is monotonic — never decrement.
- Receipts survive compaction because they live in `bd remember` and the JSONL log.

---

## Integration Notes

- This is an **orchestrator-side meta-skill** — no subagent needs to know about it.
- No changes to `task()` signature or subagent prompts.
- If `bd remember` fails, the JSONL log is the fallback source of truth.
