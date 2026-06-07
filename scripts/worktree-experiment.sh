#!/usr/bin/env bash
# worktree-experiment.sh — Git worktree isolation experiment for Sisyphus
#
# Implements the parallel wave execution experiment described in
# worktree-isolation-plan.md
#
# Usage:
#   worktree-experiment.sh setup [project-dir]
#   worktree-experiment.sh exec <worktree-name> <command>
#   worktree-experiment.sh status [project-dir]
#   worktree-experiment.sh check-conflicts [project-dir]
#   worktree-experiment.sh merge [project-dir]
#   worktree-experiment.sh rollback [project-dir]
#   worktree-experiment.sh cleanup [project-dir]
#
# Environment:
#   W1_NAME     Name for wave 1 worktree (default: sisy-dev-w1)
#   W2_NAME     Name for wave 2 worktree (default: sisy-dev-w2)
#   DRY_RUN     Set to "true" to print commands without executing

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── Defaults ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MERGE_DIR="${HOME}/.sisyphus/merge"
W1_NAME="${W1_NAME:-sisy-dev-w1}"
W2_NAME="${W2_NAME:-sisy-dev-w2}"

# ── Helpers ──────────────────────────────────────────────────────
run_cmd() {
  if [ "${DRY_RUN:-false}" = "true" ]; then
    echo -e "${YELLOW}[DRY_RUN]${NC} $*"
  else
    "$@"
  fi
}

require_git_clean() {
  local dir="$1"
  if ! git -C "$dir" diff --quiet HEAD 2>/dev/null; then
    log_warn "Working tree has uncommitted changes: $dir"
    git -C "$dir" status --short 2>/dev/null | head -5
    echo ""
    read -rp "Continue with uncommitted changes? [y/N] " yn
    if [ "$yn" != "y" ] && [ "$yn" != "Y" ]; then
      log_error "Aborted by user"
      exit 1
    fi
  fi
}

get_project_dir() {
  if [ -n "${1:-}" ]; then
    echo "$(cd "$1" && pwd)"
  else
    echo "$(pwd)"
  fi
}

check_project() {
  local dir
  dir="$(get_project_dir "${1:-}")"
  if [ ! -d "$dir/.git" ]; then
    log_error "Not a git repository: $dir"
    exit 1
  fi
  echo "$dir"
}

# ── Commands ─────────────────────────────────────────────────────
cmd_setup() {
  local dir
  dir="$(check_project "$1")"
  local branch="experiment/worktree-isolation"
  local w1_path="${dir}/../${W1_NAME}"
  local w2_path="${dir}/../${W2_NAME}"

  echo "=============================================="
  echo "  Worktree Isolation Experiment — Setup"
  echo "  Project: $dir"
  echo "  Branch:  $branch"
  echo "=============================================="
  echo ""

  # Resolve absolute paths
  w1_path="$(cd "$dir/.." && pwd)/${W1_NAME}"
  w2_path="$(cd "$dir/.." && pwd)/${W2_NAME}"

  # 0. Check preconditions
  require_git_clean "$dir"

  if [ -d "$w1_path" ]; then
    log_error "Worktree already exists: $w1_path"
    log_error "Run 'worktree-experiment.sh rollback $dir' first"
    exit 1
  fi

  # 1. Create experiment branch from current HEAD
  log_info "Creating experiment branch: $branch"
  if git -C "$dir" rev-parse --verify "$branch" 2>/dev/null; then
    log_warn "Branch $branch already exists. Checking out..."
    git -C "$dir" checkout "$branch"
  else
    git -C "$dir" checkout -b "$branch"
  fi

  # 2. Create worktrees
  log_info "Creating worktree 1 (Wave 1): $w1_path"
  run_cmd git -C "$dir" worktree add "$w1_path" "$branch"

  log_info "Creating worktree 2 (Wave 2): $w2_path"
  run_cmd git -C "$dir" worktree add "$w2_path" "$branch"

  # 3. Seed shared state into each worktree
  log_info "Seeding .sisyphus state into worktrees..."
  for wt in "$w1_path" "$w2_path"; do
    run_cmd mkdir -p "$wt/.sisyphus/state" "$wt/.sisyphus/notepads" \
      "$wt/.sisyphus/plans" "$wt/.sisyphus/evidence" "$wt/.beads-worktree"

    # Copy project state files
    if ls "$dir/.sisyphus/state/"*.json 2>/dev/null; then
      run_cmd cp "$dir/.sisyphus/state/"*.json "$wt/.sisyphus/state/"
    fi

    # Copy plan files
    if ls "$dir/.sisyphus/plans/"*.md 2>/dev/null; then
      run_cmd cp "$dir/.sisyphus/plans/"*.md "$wt/.sisyphus/plans/"
    fi

    # Initialize isolated beads store
    (
      export BEADS_STATE_DIR="$wt/.beads-worktree"
      run_cmd bd init 2>/dev/null || log_warn "bd init failed or beads not available"
    )

    # Create gitignore for .sisyphus in worktrees
    if [ ! -f "$wt/.gitignore" ]; then
      echo ".sisyphus/" > "$wt/.gitignore"
    else
      grep -qxF '.sisyphus/' "$wt/.gitignore" 2>/dev/null || \
        echo ".sisyphus/" >> "$wt/.gitignore"
    fi

    log_ok "Seeded: $wt"
  done

  # 4. Create merge directory
  run_cmd mkdir -p "$MERGE_DIR"

  # 5. Print summary
  echo ""
  echo "=============================================="
  echo "  Setup Complete"
  echo "=============================================="
  echo ""
  echo "  Main:       $dir ($branch)"
  echo "  Wave 1:     $w1_path"
  echo "  Wave 2:     $w2_path"
  echo ""
  echo "  Next steps:"
  echo "    1. Open two terminals"
  echo "    2. Terminal 1: cd $w1_path && worktree-experiment.sh exec $W1_NAME"
  echo "    3. Terminal 2: cd $w2_path && worktree-experiment.sh exec $W2_NAME"
  echo "    4. Monitor:    worktree-experiment.sh status $dir"
  echo "    5. Merge:      worktree-experiment.sh merge $dir"
  echo ""
}

cmd_exec() {
  local wt_name="${1:-}"
  local cmd="${2:-interactive}"

  if [ -z "$wt_name" ]; then
    log_error "Usage: worktree-experiment.sh exec <worktree-name> [command]"
    exit 1
  fi

  # Detect which worktree we're in
  local dir
  dir="$(pwd)"

  # Set up isolated beads
  export BEADS_STATE_DIR="${dir}/.beads-worktree"

  log_info "Starting work in worktree: $wt_name ($dir)"
  log_info "Beads state dir: $BEADS_STATE_DIR"

  if [ "$cmd" = "interactive" ]; then
    log_info "Entering interactive session. Set BEADS_STATE_DIR=${dir}/.beads-worktree"
    log_info "Run 'exit' or Ctrl-D when done with this session."
    echo ""
    export PS1="[${wt_name}] \\w \\$ "
    bash --norc --noprofile 2>/dev/null || bash
    log_ok "Session ended for: $wt_name"
  else
    # Run the provided command in this worktree's context
    eval "$cmd"
  fi

  # After execution, sync state to merge dir
  if ls "$dir/.sisyphus/state/"*.json 2>/dev/null; then
    run_cmd mkdir -p "$MERGE_DIR/state-${wt_name}"
    run_cmd cp "$dir/.sisyphus/state/"*.json "$MERGE_DIR/state-${wt_name}/"
    log_ok "State synced to $MERGE_DIR/state-${wt_name}/"
  fi
}

cmd_status() {
  local dir
  dir="$(check_project "$1")"
  local w1_path="${dir}/../${W1_NAME}"
  local w2_path="${dir}/../${W2_NAME}"

  echo "=============================================="
  echo "  Worktree Status"
  echo "=============================================="
  echo ""

  # Main worktree
  echo "── Main: $dir ──"
  git -C "$dir" branch --show-current 2>/dev/null
  git -C "$dir" status --short 2>/dev/null | head -10
  echo ""

  # Wave 1 worktree
  if [ -d "$w1_path" ]; then
    echo "── Wave 1: $w1_path ──"
    local w1_changes
    w1_changes="$(git -C "$w1_path" diff --stat HEAD 2>/dev/null | tail -1)"
    echo "  Changes: ${w1_changes:-none}"
    git -C "$w1_path" status --short 2>/dev/null | head -10
    echo ""
  else
    echo "── Wave 1: NOT SETUP ──"
    echo ""
  fi

  # Wave 2 worktree
  if [ -d "$w2_path" ]; then
    echo "── Wave 2: $w2_path ──"
    local w2_changes
    w2_changes="$(git -C "$w2_path" diff --stat HEAD 2>/dev/null | tail -1)"
    echo "  Changes: ${w2_changes:-none}"
    git -C "$w2_path" status --short 2>/dev/null | head -10
    echo ""
  else
    echo "── Wave 2: NOT SETUP ──"
    echo ""
  fi
}

cmd_check_conflicts() {
  local dir
  dir="$(check_project "$1")"
  local w1_path="${dir}/../${W1_NAME}"
  local w2_path="${dir}/../${W2_NAME}"

  echo "=============================================="
  echo "  Conflict Detection"
  echo "=============================================="

  if [ ! -d "$w1_path" ] || [ ! -d "$w2_path" ]; then
    log_error "Both worktrees must exist. Run setup first."
    exit 1
  fi

  local common_files
  common_files=$(comm -12 \
    <(git -C "$w1_path" diff --name-only HEAD 2>/dev/null | sort -u) \
    <(git -C "$w2_path" diff --name-only HEAD 2>/dev/null | sort -u))

  if [ -z "$common_files" ]; then
    log_ok "No overlapping modified files — worktrees are independent"
  else
    log_warn "Files modified in BOTH worktrees:"
    echo "$common_files" | while read -r f; do
      local w1_content w2_content
      w1_content="$(git -C "$w1_path" diff HEAD -- "$f" 2>/dev/null | head -20)"
      w2_content="$(git -C "$w2_path" diff HEAD -- "$f" 2>/dev/null | head -20)"
      if [ "$w1_content" = "$w2_content" ]; then
        echo "  • $f (identical changes — safe)"
      else
        echo -e "  • ${RED}$f${NC} (DIFFERENT changes — conflict risk)"
      fi
    done
  fi

  # Also check state conflicts
  if [ -d "$MERGE_DIR" ]; then
    for state_file in "$MERGE_DIR/state-${W1_NAME}/"*.json; do
      local base
      base="$(basename "$state_file")"
      local w2_state="$MERGE_DIR/state-${W2_NAME}/${base}"
      if [ -f "$w2_state" ]; then
        if ! diff -q "$state_file" "$w2_state" >/dev/null 2>&1; then
          log_warn "State file differs: $base"
        fi
      fi
    done
  fi
}

cmd_merge() {
  local dir
  dir="$(check_project "$1")"
  local w1_path="${dir}/../${W1_NAME}"
  local w2_path="${dir}/../${W2_NAME}"

  echo "=============================================="
  echo "  Merging Worktrees"
  echo "=============================================="

  if [ ! -d "$w1_path" ] || [ ! -d "$w2_path" ]; then
    log_error "Both worktrees must exist. Run setup first."
    exit 1
  fi

  # Ensure we're on the experiment branch
  git -C "$dir" checkout experiment/worktree-isolation 2>/dev/null || true

  # Step 1: Export beads from both worktrees
  log_info "Exporting beads from worktrees..."
  for wt_name in "$W1_NAME" "$W2_NAME"; do
    local wt_path
    if [ "$wt_name" = "$W1_NAME" ]; then
      wt_path="$w1_path"
    else
      wt_path="$w2_path"
    fi
    if [ -f "$wt_path/.beads-worktree/beads.db" ]; then
      (
        export BEADS_STATE_DIR="$wt_path/.beads-worktree"
        run_cmd bd export --file "$MERGE_DIR/beads-${wt_name}.json" 2>/dev/null || \
          log_warn "Failed to export beads from $wt_name (bd may not be available)"
      )
      log_ok "Exported beads from $wt_name"
    fi
  done

  # Step 2: Sync state files
  log_info "Syncing state files..."
  for wt_name in "$W1_NAME" "$W2_NAME"; do
    local wt_path
    if [ "$wt_name" = "$W1_NAME" ]; then
      wt_path="$w1_path"
    else
      wt_path="$w2_path"
    fi
    if ls "$wt_path/.sisyphus/state/"*.json 2>/dev/null; then
      run_cmd cp "$wt_path/.sisyphus/state/"*.json "$dir/.sisyphus/state/"
      log_ok "State synced from $wt_name"
    fi
  done

  # Step 3: Sync notepads (review artifacts)
  log_info "Syncing review artifacts..."
  for wt_name in "$W1_NAME" "$W2_NAME"; do
    local wt_path
    if [ "$wt_name" = "$W1_NAME" ]; then
      wt_path="$w1_path"
    else
      wt_path="$w2_path"
    fi
    if ls "$wt_path/.sisyphus/notepads/"* 2>/dev/null; then
      run_cmd cp -r "$wt_path/.sisyphus/notepads/"* "$dir/.sisyphus/notepads/" 2>/dev/null || true
      log_ok "Notepads synced from $wt_name"
    fi
  done

  # Step 4: Fetch and merge Wave 1
  log_info "Merging Wave 1 changes..."
  run_cmd git -C "$dir" fetch "$w1_path" experiment/worktree-isolation
  if ! run_cmd git -C "$dir" merge FETCH_HEAD --no-edit; then
    log_warn "Merge conflicts in Wave 1. Resolve them, then continue."
    echo "  After resolving: git merge --continue"
    echo "  Then fetch and merge Wave 2:"
    echo "    git fetch $w2_path experiment/worktree-isolation"
    echo "    git merge FETCH_HEAD --no-edit"
    return 1
  fi
  log_ok "Wave 1 merged successfully"

  # Step 5: Fetch and merge Wave 2
  log_info "Merging Wave 2 changes..."
  run_cmd git -C "$dir" fetch "$w2_path" experiment/worktree-isolation
  if ! run_cmd git -C "$dir" merge FETCH_HEAD --no-edit; then
    log_warn "Merge conflicts in Wave 2. Please resolve manually."
    echo "  git mergetool  # or manually edit conflicted files"
    echo "  git merge --continue"
    return 1
  fi
  log_ok "Wave 2 merged successfully"

  # Step 6: Merge beads
  log_info "Merging beads..."
  for wt_name in "$W1_NAME" "$W2_NAME"; do
    if [ -f "$MERGE_DIR/beads-${wt_name}.json" ]; then
      run_cmd bd import --file "$MERGE_DIR/beads-${wt_name}.json" 2>/dev/null || \
        log_warn "bd import failed for $wt_name"
    fi
  done

  # Step 7: Remove worktrees
  echo ""
  log_info "Merge complete. Clean up worktrees?"
  read -rp "Remove worktrees? [y/N] " yn
  if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
    run_cmd git -C "$dir" worktree remove "$w1_path" 2>/dev/null || \
      log_warn "Failed to remove $w1_path (may have uncommitted changes)"
    run_cmd git -C "$dir" worktree remove "$w2_path" 2>/dev/null || \
      log_warn "Failed to remove $w2_path (may have uncommitted changes)"
    log_ok "Worktrees removed"
  fi

  echo ""
  echo "=============================================="
  echo "  Merge Complete"
  echo "=============================================="
  echo ""
  log_ok "All changes merged into $dir"
  log_ok "Final check: git status"
  git -C "$dir" status --short 2>/dev/null | head -20
  echo ""
  log_info "Verify with:"
  echo "  git log --oneline --graph -10"
  echo "  worktree-experiment.sh cleanup $dir"
}

cmd_rollback() {
  local dir
  dir="$(check_project "$1")"
  local w1_path="${dir}/../${W1_NAME}"
  local w2_path="${dir}/../${W2_NAME}"

  echo "=============================================="
  echo "  Rollback"
  echo "=============================================="

  log_warn "This will remove worktrees and discard changes."
  read -rp "Are you sure? [y/N] " yn
  if [ "$yn" != "y" ] && [ "$yn" != "Y" ]; then
    log_info "Rollback cancelled"
    exit 0
  fi

  # Remove worktrees
  if [ -d "$w1_path" ]; then
    log_info "Removing Wave 1 worktree: $w1_path"
    run_cmd git -C "$dir" worktree remove "$w1_path" 2>/dev/null || \
      run_cmd rm -rf "$w1_path"
    log_ok "Removed $w1_path"
  else
    log_info "Wave 1 worktree does not exist"
  fi

  if [ -d "$w2_path" ]; then
    log_info "Removing Wave 2 worktree: $w2_path"
    run_cmd git -C "$dir" worktree remove "$w2_path" 2>/dev/null || \
      run_cmd rm -rf "$w2_path"
    log_ok "Removed $w2_path"
  else
    log_info "Wave 2 worktree does not exist"
  fi

  # Remove merge artifacts
  if [ -d "$MERGE_DIR" ]; then
    run_cmd rm -rf "$MERGE_DIR"
    log_ok "Removed merge directory: $MERGE_DIR"
  fi

  # Reset main branch to pre-experiment state
  log_info "Resetting main worktree to HEAD of experiment branch..."
  git -C "$dir" checkout experiment/worktree-isolation 2>/dev/null || true
  log_warn "To keep changes: git add -A && git stash"
  log_warn "To discard: git reset --hard HEAD"
  echo ""
  log_info "Rollback complete"
}

cmd_cleanup() {
  local dir
  dir="$(check_project "$1")"

  echo "=============================================="
  echo "  Cleanup"
  echo "=============================================="

  log_info "Removing merge directory..."
  run_cmd rm -rf "${MERGE_DIR}"

  log_info "Available worktrees:"
  git -C "$dir" worktree list 2>/dev/null

  echo ""
  log_info "To delete the experiment branch:"
  echo "  git branch -D experiment/worktree-isolation"
  echo ""
  log_ok "Cleanup complete"
}

# ── Main ──────────────────────────────────────────────────────────
case "${1:-help}" in
  setup)
    cmd_setup "${2:-}"
    ;;
  exec)
    cmd_exec "${2:-}" "${@:3}"
    ;;
  status)
    cmd_status "${2:-}"
    ;;
  check-conflicts)
    cmd_check_conflicts "${2:-}"
    ;;
  merge)
    cmd_merge "${2:-}"
    ;;
  rollback)
    cmd_rollback "${2:-}"
    ;;
  cleanup)
    cmd_cleanup "${2:-}"
    ;;
  help|*)
    echo "Sisyphus Worktree Isolation Experiment v1.0.0"
    echo ""
    echo "Usage:"
    echo "  worktree-experiment.sh setup [project-dir]"
    echo "    Create experiment branch + 2 worktrees, seed state"
    echo ""
    echo "  worktree-experiment.sh exec <name> [command]"
    echo "    Enter interactive session in a worktree with isolated beads"
    echo ""
    echo "  worktree-experiment.sh status [project-dir]"
    echo "    Show diff stats and state for all worktrees"
    echo ""
    echo "  worktree-experiment.sh check-conflicts [project-dir]"
    echo "    Detect files modified in both worktrees simultaneously"
    echo ""
    echo "  worktree-experiment.sh merge [project-dir]"
    echo "    Merge both worktrees back to main via git merge"
    echo ""
    echo "  worktree-experiment.sh rollback [project-dir]"
    echo "    Remove worktrees, reset state, discard changes"
    echo ""
    echo "  worktree-experiment.sh cleanup [project-dir]"
    echo "    Remove merge artifacts and temp files"
    echo ""
    echo "Environment:"
    echo "  W1_NAME       Name for wave 1 worktree (default: sisy-dev-w1)"
    echo "  W2_NAME       Name for wave 2 worktree (default: sisy-dev-w2)"
    echo "  DRY_RUN       Set to 'true' to print commands without executing"
    echo ""
    echo "Example workflow:"
    echo "  cd ~/developer/sisy-dev"
    echo "  worktree-experiment.sh setup"
    echo "  # Open 2 terminals:"
    echo "  #   Terminal 1: cd ../sisy-dev-w1 && worktree-experiment.sh exec w1"
    echo "  #   Terminal 2: cd ../sisy-dev-w2 && worktree-experiment.sh exec w2"
    echo "  # Monitor:"
    echo "  worktree-experiment.sh status"
    echo "  worktree-experiment.sh check-conflicts"
    echo "  # When done:"
    echo "  worktree-experiment.sh merge"
    echo "  worktree-experiment.sh cleanup"
    ;;
esac
