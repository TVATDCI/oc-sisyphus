#!/usr/bin/env python3
"""OpenCode-native trigger evaluation for skills.

Tests whether a skill's description causes the OpenCode LLM to trigger (load)
the skill for a set of queries by actually calling 'opencode run' and 
detecting skill tool calls in the JSON output stream.

Usage:
    python eval_skill_triggers.py --eval-set eval_set.json --skill-path /path/to/skill

Requirements:
    - opencode CLI installed and in PATH
    - Skill already installed at ~/.config/opencode/skills/<name>/
    - Python 3.10+
"""

import json
import subprocess
import sys
import yaml
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import argparse


def parse_skill_md(skill_path: Path) -> tuple:
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


def run_single_query(query: str, skill_name: str, timeout: int = 60) -> bool:
    cmd = [
        "opencode", "run", query,
        "--format", "json",
        "--dangerously-skip-permissions",
        "--log-level", "ERROR",
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        
        if result.returncode != 0 and not result.stdout:
            return False
        
        triggered = False
        
        for line in result.stdout.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            
            if event.get("type") == "tool_call":
                tool_name = event.get("tool", "")
                tool_input = event.get("input", {})
                
                if tool_name == "skill":
                    called_skill = tool_input.get("name", "")
                    if called_skill == skill_name:
                        triggered = True
            
            elif event.get("type") == "message":
                content = event.get("content", [])
                for item in content:
                    if item.get("type") == "tool_use":
                        if item.get("tool") == "skill":
                            input_data = item.get("input", {})
                            if input_data.get("name") == skill_name:
                                triggered = True
        
        return triggered
        
    except subprocess.TimeoutExpired:
        return False
    except Exception as e:
        print(f"Error running query '{query[:50]}...': {e}", file=sys.stderr)
        return False


def run_eval(eval_set_path: str, skill_path: str, num_workers: int = 3, 
             timeout: int = 60, runs_per_query: int = 3, 
             trigger_threshold: float = 0.5) -> dict:
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
                )
                future_to_info[future] = (item, run_idx)
        
        query_triggers: dict[str, list[bool]] = {}
        query_items: dict[str, dict] = {}
        
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
    parser.add_argument("--eval-set", required=True)
    parser.add_argument("--skill-path", required=True)
    parser.add_argument("--num-workers", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--runs-per-query", type=int, default=3)
    parser.add_argument("--trigger-threshold", type=float, default=0.5)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    
    skill_path = Path(args.skill_path)
    if not (skill_path / "SKILL.md").exists():
        print(f"Error: No SKILL.md found at {skill_path}", file=sys.stderr)
        sys.exit(1)
    
    name, description, _ = parse_skill_md(skill_path)
    
    if args.verbose:
        print(f"Evaluating skill: {name}", file=sys.stderr)
        print(f"Description: {description[:80]}...", file=sys.stderr)
        print(f"Queries: {len(json.load(open(args.eval_set)))}", file=sys.stderr)
        print(f"Runs per query: {args.runs_per_query}", file=sys.stderr)
        print("-" * 60, file=sys.stderr)
    
    output = run_eval(
        eval_set_path=args.eval_set,
        skill_path=skill_path,
        num_workers=args.num_workers,
        timeout=args.timeout,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
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
