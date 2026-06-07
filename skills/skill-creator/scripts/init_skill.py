#!/usr/bin/env python3
"""
Initialize a new skill directory with scaffolding and auto-validate.
Usage: python init_skill.py <skill-name>
"""

import sys
import os
from pathlib import Path

def init_skill(skill_name):
    skills_dir = Path.home() / ".config/opencode/skills"
    skill_dir = skills_dir / skill_name
    
    if skill_dir.exists():
        print(f"Error: Skill '{skill_name}' already exists")
        return 1
    
    skill_dir.mkdir(parents=True)
    skill_md = skill_dir / "SKILL.md"
    
    skill_md.write_text(f"""---
name: {skill_name}
description: "TODO: Add description"
compatibility: opencode
---

# {skill_name.replace('-', ' ').title()}

TODO: Add skill instructions here.
""")
    
    design_md = Path("DESIGN.md")
    if not design_md.exists():
        print("Note: No DESIGN.md found in project root.")
        print("If this project involves UI, create DESIGN.md from template:")
        print(f"  cp ~/.config/opencode/.sisyphus/templates/DESIGN.md ./DESIGN.md")
    
    print(f"Created skill at {skill_dir}")
    
    # Auto-run validation
    validator = Path.home() / ".config/opencode/scripts/validate-skills.sh"
    if validator.exists():
        print(f"Running validation...")
        os.system(f"bash {validator} {skill_name}")
    else:
        print(f"Warning: validator not found at {validator}")
    
    return 0

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python init_skill.py <skill-name>")
        sys.exit(1)
    
    sys.exit(init_skill(sys.argv[1]))
