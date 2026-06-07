---
name: shell-safety
description: "Non-interactive shell command safety rules for avoiding hanging prompts. Use when: (1) running cp, mv, rm, scp, ssh, apt-get, brew, or any command that may prompt for confirmation, (2) writing scripts with file operations, (3) setting up CI/CD commands. Triggers: cp, mv, rm, scp, ssh, apt-get, brew, non-interactive, shell safety, batch mode."
compatibility: opencode
---

# Shell Safety — Non-Interactive Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

## Safe Forms

```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

## Commands That May Prompt

| Command | Safe Usage |
|---------|-----------|
| `scp` | `scp -o BatchMode=yes source dest` |
| `ssh` | `ssh -o BatchMode=yes host` (fails instead of prompting) |
| `apt-get` | `apt-get -y install package` |
| `brew` | `HOMEBREW_NO_AUTO_UPDATE=1 brew install package` |

## Principle

If you can't run the command without human interaction, use the flag that makes it non-interactive. Batch mode (`-o BatchMode=yes`) for SSH/SCP makes them fail closed rather than hang waiting for a password prompt.
