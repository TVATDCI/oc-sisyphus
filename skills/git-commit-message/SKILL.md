---
name: git-commit-message
compatibility: opencode
description: "Use this skill when the user specifically needs to draft, write, or generate git commit message content. This includes composing new commit messages from staged diffs, rewriting or improving existing commit messages, or determining what message to use for pending changes. The skill creates descriptive text following conventional commit format. Do not use for revert operations, branch management, merging, rebasing, or other git workflows unrelated to crafting commit message text."
license: MIT
triggers:
  - "git diff"
  - "staged changes"
  - "commit context"
mode: afk-safe
inputs:
  - "git diff"
  - "staged changes"
  - "commit context"
outputs:
  - "commit message"
produces_artifacts:
requires_artifacts:
  - "git diff or staged changes"
gates:
metadata:
  author: OpenCode
  version: 1.0.0
  category: git
---



# Git Commit Message Assistant

This skill helps users write high-quality git commit messages by analyzing their staged changes and generating appropriate commit messages following conventional commit format.

## Guidelines

### Analyzing Changes
1. First, check what files are staged using `git diff --cached --name-only`
2. Read the actual diff with `git diff --cached` to understand the changes
3. Identify the scope: Is this a feature, fix, docs, style, refactor, test, or chore?

### Message Format
Use conventional commit format:
```
<type>(<scope>): <short description>

<body explaining what and why>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, semicolons, etc)
- `refactor`: Code changes that neither fix bugs nor add features
- `test`: Adding or correcting tests
- `chore`: Build process or auxiliary tool changes

### Body Guidelines
- Use present tense ("Add feature" not "Added feature")
- Be specific about what changed
- Explain why the change was made, not just what
- Keep the first line under 50 characters
- Wrap body at 72 characters

## Example Interactions

**User**: Write a commit message for my changes

**Claude**:
Let me check your staged changes first.

```bash
git diff --cached --name-only
```

[Analyzes files... reads diff...]

Based on your changes to `src/auth.js` and `src/utils/token.js`, here's a commit message:

```
feat(auth): implement JWT token refresh mechanism

Add automatic token refresh to auth middleware to handle expired
access tokens transparently. Includes:
- Token expiry detection in request interceptor
- Background refresh without user interruption
- Graceful fallback to login on refresh failure

Fixes edge case where users were logged out unexpectedly
after 24h token expiration.
```

## Edge Cases

- If no changes are staged, suggest `git add` first
- If changes span multiple concerns, suggest splitting into multiple commits
- For WIP commits, suggest marking as such and explain cleanup later
