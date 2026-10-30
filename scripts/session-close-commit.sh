#!/usr/bin/env bash
#
# session-close-commit.sh — atomic session-close docs landing (the close-commit ship).
#
# Sanctioned single-door command for the session-close ritual's final step:
#
#   bash scripts/session-close-commit.sh "<close summary line>"
#
# Guards (fail-closed, in order):
#   0. bash required; exactly one printable, single-line summary argument.
#   1. Operates only on the repo that contains this script (scripts/..) and
#      only when its origin remote is TVATDCI/oc-sisyphus.
#   2. Branch main only; no rebase already in progress.
#   3. session_close.status in $HOME/.sisyphus/state.json must be "complete"
#      or "overridden" (Layer 6.5 parity: no push while the close protocol
#      is open — run `protocol complete` first).
#   4. Working tree must hold modifications to EXACTLY the two sanctioned
#      close docs (COMPLETE-CODEBASE.md, SYSTEM-NARRATIVE.md) and nothing
#      else — any other modified/staged/untracked path hard-refuses with the
#      offending paths printed.
#   5. Stages exactly those two; nothing else is ever staged.
#   6. Commit message: fixed prefix `docs(close): <YYYY-MM-DD>` + the passed
#      summary line — no arbitrary text.
#   7. `git pull --rebase` must be clean; any conflict aborts the rebase and
#      refuses (no scripted conflict resolution).
#   8. Pushes, then prints the RECEIPT (head sha, files, message) — the
#      receipt is what the close report cites.
#
# Gates note: the sisyphus-gates command policy allowlists this exact
# invocation in every phase; the reviewed script is the only door. Hand-typed
# `git add` / `git commit` / `git push` stay on their normal gate paths.

set -euo pipefail

if [ -z "${BASH_VERSION:-}" ]; then
  printf 'session-close-commit: REFUSED: run with bash, not sh\n' >&2
  exit 1
fi

die() {
  printf 'session-close-commit: REFUSED: %s\n' "$*" >&2
  exit 1
}

# ── 0. usage ────────────────────────────────────────────────────────────────
[ "$#" -eq 1 ] || die "usage: bash scripts/session-close-commit.sh \"<close summary line>\" (got $# args)"
SUMMARY="$1"
[ -n "$SUMMARY" ] || die "summary must be non-empty"
case "$SUMMARY" in
  *[[:cntrl:]]*) die "summary contains control characters (single printable line required)" ;;
esac
case "$SUMMARY" in
  *[![:space:]]*) ;;
  *) die "summary must contain non-whitespace content" ;;
esac
[ "${#SUMMARY}" -le 160 ] || die "summary too long (${#SUMMARY} chars; cap 160)"

command -v git >/dev/null 2>&1 || die "git not on PATH"
command -v python3 >/dev/null 2>&1 || die "python3 not on PATH"

# ── 1. repo root: the repo that contains this script ───────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "not inside a git work tree: $ROOT"

REMOTE_URL="$(git -C "$ROOT" remote get-url origin 2>/dev/null)" \
  || die "no origin remote configured"
case "$REMOTE_URL" in
  *TVATDCI/oc-sisyphus*) ;;
  *) die "non-sanctioned repo (origin=$REMOTE_URL); expected TVATDCI/oc-sisyphus" ;;
esac

# ── 2. main only, no rebase in flight ───────────────────────────────────────
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || die "branch is '$BRANCH'; main only"

GDIR="$(git -C "$ROOT" rev-parse --git-dir)"
if [ -d "$GDIR/rebase-merge" ] || [ -d "$GDIR/rebase-apply" ]; then
  die "a rebase is already in progress; resolve it first"
fi

# ── 3. close protocol must not be open (Layer 6.5 parity) ──────────────────
STATE="${HOME:-}/.sisyphus/state.json"
[ -f "$STATE" ] || die "trust-root state not found at $STATE (fail-closed)"
STATUS="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print((d.get("session_close") or {}).get("status",""))' "$STATE")" \
  || die "unreadable trust-root state: $STATE"
case "$STATUS" in
  complete|overridden) ;;
  *) die "session_close.status='${STATUS}' — docs landing push requires protocol complete/overridden (run protocol complete first)" ;;
esac

# ── 4. working-tree audit: exactly the two sanctioned close docs ───────────
PORCELAIN="$(git -C "$ROOT" status --porcelain)"
OFFENDERS=()
SEEN_CC=0
SEEN_SN=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  p="${line:3}"
  case "$p" in
    COMPLETE-CODEBASE.md) SEEN_CC=1 ;;
    SYSTEM-NARRATIVE.md) SEEN_SN=1 ;;
    *) OFFENDERS+=("$line") ;;
  esac
done <<<"$PORCELAIN"

if [ "${#OFFENDERS[@]}" -gt 0 ]; then
  printf 'session-close-commit: REFUSED: working tree holds paths outside the two sanctioned close docs:\n' >&2
  for o in "${OFFENDERS[@]}"; do
    printf '  %s\n' "$o" >&2
  done
  exit 1
fi

TOTAL=$((SEEN_CC + SEEN_SN))
[ "$TOTAL" -ge 1 ] || die "nothing to land: neither COMPLETE-CODEBASE.md nor SYSTEM-NARRATIVE.md is modified"

# ── 5. stage exactly those two ──────────────────────────────────────────────
git -C "$ROOT" add -- COMPLETE-CODEBASE.md SYSTEM-NARRATIVE.md

STAGED="$(git -C "$ROOT" diff --cached --name-only)"
while IFS= read -r sp; do
  [ -n "$sp" ] || continue
  case "$sp" in
    COMPLETE-CODEBASE.md|SYSTEM-NARRATIVE.md) ;;
    *) die "unexpected staged path after add: $sp" ;;
  esac
done <<<"$STAGED"

# ── 6. commit: fixed prefix, no arbitrary text ──────────────────────────────
MSG="$(printf 'docs(close): %s %s' "$(date +%Y-%m-%d)" "$SUMMARY")"
if ! COMMIT_OUT="$(git -C "$ROOT" commit -m "$MSG" 2>&1)"; then
  printf '%s\n' "$COMMIT_OUT" >&2
  die "git commit failed"
fi

# ── 7. pull --rebase must be clean; any conflict → abort + refuse ──────────
if ! PULL_OUT="$(git -C "$ROOT" pull --rebase 2>&1)"; then
  printf '%s\n' "$PULL_OUT" >&2
  git -C "$ROOT" rebase --abort >/dev/null 2>&1 || true
  die "git pull --rebase not clean — close commit exists locally (unpushed); resolve upstream divergence manually, then push by hand"
fi

# ── 8. push ─────────────────────────────────────────────────────────────────
if ! PUSH_OUT="$(git -C "$ROOT" push 2>&1)"; then
  printf '%s\n' "$PUSH_OUT" >&2
  die "git push failed — close commit is local at $(git -C "$ROOT" rev-parse --short HEAD)"
fi

# ── receipt ─────────────────────────────────────────────────────────────────
SHA="$(git -C "$ROOT" rev-parse HEAD)"
SHORT="$(git -C "$ROOT" rev-parse --short HEAD)"
SUBJECT="$(git -C "$ROOT" log -1 --format=%s)"
FILES="$(git -C "$ROOT" diff-tree --no-commit-id --name-only -r HEAD)"
printf 'CLOSE-COMMIT RECEIPT\n'
printf '  head: %s (%s)\n' "$SHA" "$SHORT"
printf '  branch: main -> origin/main\n'
printf '  message: %s\n' "$SUBJECT"
printf '  files:\n'
while IFS= read -r f; do
  printf '    %s\n' "$f"
done <<<"$FILES"

exit 0
