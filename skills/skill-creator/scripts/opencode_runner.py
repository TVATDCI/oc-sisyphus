"""Shared OpenCode CLI runner for skill-creator scripts.

Provides two execution modes:
  - stream_skill_trigger(): run opencode, stream JSON events, early-exit on skill trigger
  - collect_text(): run opencode, collect all text parts, return concatenated string

Both modes use:
  opencode run <prompt> --format json --dangerously-skip-permissions [--model <model>]

The opencode --format json output is line-buffered (verified), so streaming works correctly.

Environment isolation note:
  OpenCode auto-discovers ALL skills from ~/.config/opencode/skills/.
  If multiple skills are installed, the eval may be contaminated by other skill descriptions.
  Call warn_if_multiple_skills() at eval startup to alert the user.
  Full isolation (temp HOME + skill symlink) is a future improvement if needed.
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path


SKILLS_DIR = Path.home() / ".config" / "opencode" / "skills"


def warn_if_multiple_skills() -> None:
    """Warn if more than one skill is installed (evaluation contamination risk).

    OpenCode presents all installed skills to the LLM simultaneously. If other
    skills are installed, their descriptions compete with the skill under test,
    which can cause false negatives (model picks a different skill) or alter
    triggering behaviour unexpectedly.
    
    NOTE: For Main-vault production system, 10 skills is expected.
    Only warn during eval runs (when OPENCODE_EVAL_MODE is set).
    """
    # Skip warning in production mode (Main-vault system has 10 skills by design)
    if os.environ.get("OPENCODE_PRODUCTION"):
        return
    
    try:
        installed = [p for p in SKILLS_DIR.iterdir() if p.is_dir()]
    except FileNotFoundError:
        return
    
    # Only warn if running in eval mode or if more than 10 skills (unexpected)
    eval_mode = os.environ.get("OPENCODE_EVAL_MODE")
    if len(installed) > 10 and not eval_mode:
        # Production system expects up to 10 skills
        return
    if len(installed) > 1 and eval_mode:
        names = ", ".join(p.name for p in installed)
        print(
            f"WARNING: {len(installed)} skills installed ({names}). "
            "Eval results may be contaminated by other skill descriptions. "
            "For clean isolation, run with a dedicated HOME directory:\n"
            "  HOME=/tmp/opencode-eval-home OPENCODE_EVAL_MODE=1 opencode run ...",
            file=sys.stderr,
        )


def _build_cmd(prompt: str, model: str | None) -> list[str]:
    """Build the base opencode run command."""
    cmd = [
        "opencode", "run", prompt,
        "--format", "json",
        "--dangerously-skip-permissions",
    ]
    if model:
        cmd.extend(["--model", model])
    return cmd


def stream_skill_trigger(
    prompt: str,
    target_skill: str,
    timeout: int = 60,
    model: str | None = None,
) -> bool:
    """Run opencode with prompt, return True if target_skill was triggered.

    Streams line-delimited JSON events from opencode run --format json.
    Exits early (kills the subprocess) the moment the target skill is detected,
    avoiding unnecessary wait for the full LLM response.

    The skill tool_use event shape (verified from live opencode output):
        {
          "type": "tool_use",
          "part": {
            "tool": "skill",
            "state": {
              "status": "completed",
              "input": {"name": "<skill-name>", "user_message": "..."}
            }
          }
        }

    Returns False on timeout, subprocess error, or no skill trigger detected.
    """
    cmd = _build_cmd(prompt, model)

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except FileNotFoundError:
        print("ERROR: 'opencode' not found in PATH.", file=sys.stderr)
        return False

    triggered = False
    start_time = time.time()

    try:
        # opencode --format json is line-buffered; each event arrives as a
        # complete JSON line. readline() blocks until a line is available or
        # the process ends — no select() or manual buffering needed.
        while True:
            if time.time() - start_time > timeout:
                break

            line = process.stdout.readline()
            if not line:
                # EOF — process ended
                break

            line = line.strip()
            if not line:
                continue

            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            if event.get("type") != "tool_use":
                continue

            part = event.get("part", {})
            if part.get("tool") != "skill":
                continue

            # Any non-skill tool use means the model chose a different path —
            # early-exit as False (no point waiting further).
            # Actually: only exit early on confirmed trigger or step_finish.
            # Other tool_use events (read, bash, etc.) may precede the skill call.

            state = part.get("state", {})
            inp = state.get("input", {})
            if inp.get("name") == target_skill:
                triggered = True
                break

    finally:
        # Kill the process if it's still running (early-exit case or timeout)
        if process.poll() is None:
            process.kill()
            process.wait()

    return triggered


def collect_text(
    prompt: str,
    model: str | None = None,
    timeout: int = 300,
) -> str:
    """Run opencode with prompt, collect and return the full text response.

    Waits for the process to complete, then concatenates all type="text"
    events from the JSON output stream in order.

    Raises RuntimeError if opencode exits with non-zero and produced no output.
    """
    cmd = _build_cmd(prompt, model)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        raise RuntimeError("'opencode' not found in PATH.")
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"opencode timed out after {timeout}s.")

    if result.returncode != 0 and not result.stdout.strip():
        raise RuntimeError(
            f"opencode exited {result.returncode}\nstderr: {result.stderr}"
        )

    text_parts: list[str] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        if event.get("type") == "text":
            part = event.get("part", {})
            chunk = part.get("text", "")
            if chunk:
                text_parts.append(chunk)

    return "".join(text_parts)
