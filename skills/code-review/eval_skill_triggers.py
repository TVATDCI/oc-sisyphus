#!/usr/bin/env python3
"""OpenCode-native trigger evaluation for skills.

Tests whether a skill's description causes the OpenCode LLM to trigger (load)
the skill for a set of queries by actually calling 'opencode run' and 
detecting skill tool calls in the JSON output stream.

This is a standalone version that includes the opencode_runner functionality
for easy distribution in the demo.

Usage:
    python eval_skill_triggers.py --eval-set eval_set.json --skill-path /path/to/skill

Requirements:
    - opencode CLI installed and in PATH
    - Skill already installed at ~/.config/opencode/skills/<name>/
    - Python 3.10+
"""

import json
import os
import re
import subprocess
import sys
import time
import yaml
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import argparse

TESTED_OPENCODE_VERSIONS = ["1.4.3", "1.5.x"]

def check_opencode_version():
    """Check opencode version and warn if untested."""
    try:
        result = subprocess.run(
            ["opencode", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return None, f"Could not check version: {result.stderr}"
        
        version = result.stdout.strip()
        match = re.match(r"(\d+)\.(\d+)\.(\d+)", version)
        if not match:
            return version, f"Could not parse version: {version}"
        
        major, minor, patch = match.groups()
        major_minor = f"{major}.{minor}"
        
        is_tested = False
        for tested in TESTED_OPENCODE_VERSIONS:
            if tested.endswith(".x"):
                if major_minor == tested.replace(".x", ""):
                    is_tested = True
                    break
            else:
                if version == tested:
                    is_tested = True
                    break
        
        if not is_tested:
            return version, f"⚠️  OpenCode {version} is NOT tested. Tested on: {', '.join(TESTED_OPENCODE_VERSIONS)}.\\n   If issues occur, pin: npm install -g opencode-ai@{TESTED_OPENCODE_VERSIONS[0]}"
        
        return version, None
    except FileNotFoundError:
        return None, "opencode not found in PATH. Install: npm install -g opencode-ai"
    except subprocess.TimeoutExpired:
        return None, "opencode --version timed out"
    except Exception as e:
        return None, f"Error checking version: {e}"


def _build_opencode_cmd(prompt: str, model=None, timeout: int = 60):
    cmd = [
        "opencode", "run", prompt,
        "--format", "json",
        "--dangerously-skip-permissions",
        "--log-level", "ERROR",
    ]
    if model:
        cmd.extend(["--model", model])
    return cmd


def _build_isolated_env():
    env = os.environ.copy()
    env.pop("CLAUDECODE", None)
    return env


def _kill_process(process, timeout: float = 2.0):
    try:
        process.terminate()
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def _is_skill_triggered(event: dict, target_skill: str) -> bool:
    if event.get("type") == "tool_use":
        if event.get("tool") == "skill":
            input_data = event.get("input", {})
            if input_data.get("name") == target_skill:
                return True
    
    if event.get("type") == "tool_call":
        if event.get("tool") == "skill":
            input_data = event.get("input", {})
            if input_data.get("name") == target_skill:
                return True
    
    if event.get("type") == "message":
        content = event.get("content", [])
        for item in content:
            if item.get("type") == "tool_use":
                if item.get("tool") == "skill":
                    input_data = item.get("input", {})
                    if input_data.get("name") == target_skill:
                        return True
    
    return False


def run_opencode_stream_events(prompt: str, target_skill: str, model=None, timeout: int = 60):
    cmd = _build_opencode_cmd(prompt, model, timeout)
    env = _build_isolated_env()
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        env=env,
    )
    
    start_time = time.time()
    triggered = False
    
    try:
        for line in process.stdout:
            if time.time() - start_time > timeout:
                break
            
            line = line.strip()
            if not line:
                continue
            
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            
            yield event
            
            if not triggered and _is_skill_triggered(event, target_skill):
                triggered = True
                break
                
    finally:
        if process.poll() is None:
            _kill_process(process)


def check_skill_contamination():
    skills_dir = Path.home() / ".config" / "opencode" / "skills"
    
    if not skills_dir.exists():
        return False, []
    
    other_skills = [
        d.name for d in skills_dir.iterdir() 
        if d.is_dir() and d.name != "skill-creator"
    ]
    
    return len(other_skills) > 0, other_skills


def warn_skill_contamination(other_skills: list):
    print(
        f"\n⚠️  WARNING: {len(other_skills)} other skill(s) detected in ~/.config/opencode/skills/",
        file=sys.stderr,
    )
    print(
        f"   This may contaminate evaluation results: {', '.join(other_skills[:5])}",
        file=sys.stderr,
    )
    print(
        "   Consider: HOME=/tmp/opencode-eval opencode run ...\n",
        file=sys.stderr,
    )


def parse_skill_md(skill_path: Path):
    content = (skill_path / "SKILL.md").read_text()
    lines = content.split("\n")
    
    if lines[0].strip() != "---":
        raise ValueError("No frontmatter")
    
    end_idx = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = i
            break
    
    frontmatter = yaml.safe_load("\n".join(lines[1:end_idx]))
    name = frontmatter.get("name", "")
    description = frontmatter.get("description", "")
    if isinstance(description, str):
        description = description.strip()
    
    return name, description, content


def run_single_query(query: str, skill_name: str, timeout: int = 60, model=None):
    try:
        for event in run_opencode_stream_events(query, skill_name, model, timeout):
            if _is_skill_triggered(event, skill_name):
                return True
        return False
    except Exception as e:
        print(f"Warning: query '{query[:50]}...' failed: {e}", file=sys.stderr)
        return False


def run_eval(eval_set_path: str, skill_path: str, num_workers: int = 3, 
             timeout: int = 60, runs_per_query: int = 3, 
             trigger_threshold: float = 0.5, model=None):
    skill_path = Path(skill_path)
    name, description, content = parse_skill_md(skill_path)
    
    with open(eval_set_path) as f:
        eval_set = json.load(f)
    
    results = []
    
    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        future_to_info = {}
        for item in eval_set:
            for run_idx in range(runs_per_query):
                future = executor.submit(
                    run_single_query,
                    item["query"],
                    name,
                    timeout,
                    model,
                )
                future_to_info[future] = (item, run_idx)
        
        query_triggers = {}
        query_items = {}
        
        for future in as_completed(future_to_info):
            item, run_idx = future_to_info[future]
            query = item["query"]
            query_items[query] = item
            
            if query not in query_triggers:
                query_triggers[query] = []
            
            try:
                triggered = future.result()
                query_triggers[query].append(triggered)
            except Exception as e:
                print(f"Warning: query failed: {e}", file=sys.stderr)
                query_triggers[query].append(False)
    
    for query, triggers in query_triggers.items():
        item = query_items[query]
        trigger_rate = sum(triggers) / len(triggers)
        should_trigger = item["should_trigger"]
        
        if should_trigger:
            did_pass = trigger_rate >= trigger_threshold
        else:
            did_pass = trigger_rate < trigger_threshold
        
        results.append({
            "query": query,
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": sum(triggers),
            "runs": len(triggers),
            "pass": did_pass,
        })
    
    passed = sum(1 for r in results if r["pass"])
    total = len(results)
    
    return {
        "skill_name": name,
        "description": description[:100] + "..." if len(description) > 100 else description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
        }
    }


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate skill trigger accuracy using real OpenCode runs"
    )
    parser.add_argument("--eval-set", required=True, help="Path to eval set JSON file")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory")
    parser.add_argument("--num-workers", type=int, default=3, help="Number of parallel workers")
    parser.add_argument("--timeout", type=int, default=60, help="Timeout per query in seconds")
    parser.add_argument("--runs-per-query", type=int, default=3, help="Number of runs per query")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="Trigger rate threshold")
    parser.add_argument("--model", default=None, help="Model to use (default: user's configured)")
    parser.add_argument("--verbose", action="store_true", help="Print progress to stderr")
    args = parser.parse_args()
    
    version, warning = check_opencode_version()
    if warning:
        print(warning, file=sys.stderr)
    if version and args.verbose:
        print(f"OpenCode version: {version}", file=sys.stderr)
    
    is_contaminated, other_skills = check_skill_contamination()
    if is_contaminated:
        warn_skill_contamination(other_skills)
    
    skill_path = Path(args.skill_path)
    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)
    
    name, description, _ = parse_skill_md(skill_path)
    
    if args.verbose:
        print(f"Evaluating skill: {name}", file=sys.stderr)
        print(f"Description: {description[:80]}...", file=sys.stderr)
        with open(args.eval_set) as f:
            eval_data = json.load(f)
        print(f"Queries: {len(eval_data)}", file=sys.stderr)
        print(f"Runs per query: {args.runs_per_query}", file=sys.stderr)
        print("-" * 60, file=sys.stderr)
    
    output = run_eval(
        eval_set_path=args.eval_set,
        skill_path=skill_path,
        num_workers=args.num_workers,
        timeout=args.timeout,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        model=args.model,
    )
    
    if args.verbose:
        summary = output["summary"]
        print(f"\nResults: {summary['passed']}/{summary['total']} passed", file=sys.stderr)
        for r in output["results"]:
            status = "PASS" if r["pass"] else "FAIL"
            rate_str = f"{r['triggers']}/{r['runs']}"
            indicator = "✓" if r['should_trigger'] else "✗"
            print(f"  [{status}] {indicator} rate={rate_str}: {r['query'][:60]}...", file=sys.stderr)
    
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
