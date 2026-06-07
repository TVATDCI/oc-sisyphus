---
name: code-review
compatibility: opencode
description: >
  Use this skill whenever the user asks to review, critique, audit, assess, or
  inspect existing code, pull requests, or implementations. Triggers include
  phrases like "review my code", "review this PR", "code review", "check my code
  for issues", "what do you think of this implementation", "critique this", "find
  problems in", "audit this code", "assess code quality", "look for bugs in",
  "security review", "open, or any request for feedback on
  code that already exists. The skill produces a structured review covering
  correctness, security, performance, maintainability, error handling, and
  testing. Do NOT use this skill for writing new code, generating tests,
  fixing bugs, refactoring, debugging failing tests, explaining how code works,
  or answering general programming questions. Do NOT use it when the user wants
  the assistant to implement, modify, or repair code rather than evaluate it.
license: MIT
allowed-tools: [read, grep, edit, git]
metadata:
  author: OpenCode
  version: 1.0.0
---

# Code Review Assistant

This skill helps users conduct thorough, actionable code reviews by analyzing code
for correctness, security, performance, maintainability, and clarity.

## Guidelines

### Review Framework

For every code review, evaluate these dimensions:

1. **Correctness** — Does the code do what it claims? Are there edge cases missed?
2. **Security** — Are there injection risks, unsafe inputs, or authentication gaps?
3. **Performance** — Are there N+1 queries, unnecessary allocations, or blocking operations?
4. **Maintainability** — Is the code readable, well-named, and appropriately scoped?
5. **Testing** — Is there adequate test coverage for the changes?
6. **Error Handling** — Are failures handled gracefully with useful messages?

### Intent Hierarchy (establish before reviewing)

Before evaluating code, establish what the change was *supposed* to accomplish. Use this priority order:

1. **Active plan/PRD** — read `.sisyphus/plans/` or `.sisyphus/prds/` for the current initiative
2. **Bead issue** — check `bd show <id>` for acceptance criteria
3. **`.sisyphus/notepads/`** — review recent notepads for scope context
4. **Commit messages** — `git log --oneline origin/main..HEAD` as fallback only

If intent cannot be determined from (1-3), flag: **"Scope context unclear — review may flag intended behavior as drift."**

### Review Process

1. Read the code being reviewed (from files, diffs, or pasted snippets)
2. Understand the intent: what problem is this code solving?
3. Check for the issues above, prioritizing correctness and security
4. **Scope drift check:** Compare changed files against intent. Flag:
   - Files changed that are unrelated to the stated scope
   - New features not mentioned in the plan
   - "While I was in there..." expansions
   - Requirements from plan/PRD not addressed in the diff
5. Note both problems *and* positive aspects (don't just criticize)
6. Provide specific, actionable suggestions, not vague complaints

### Finding Promotion Gate

Every finding promoted to the review report MUST include:

1. **Quoted evidence** — the exact motivating code line(s). If you cannot quote the line, do NOT promote the finding.
2. **Impact statement** — what breaks, what the user sees, or what risk is introduced
3. **Verification step** — how you ruled out the obvious false-positive (e.g., "checked that the parameterized query uses the safe path").

If any of the three are missing, the finding stays in a private `draft-findings` appendix, not the main report.

### Confidence Levels

Coarse operational levels (do NOT use numeric 1-10 scores):

| Level | When to use | Display rule |
|-------|------------|--------------|
| **Report** | Finding is concrete, evidence is quoted, and you have verified the false-positive path | Show normally in main report |
| **Report with caveat** | Pattern match is correct but context makes severity uncertain | Show in main report with note: "Verify in production context" |
| **Suppress** | Evidence is weak, the line cannot be quoted, or you are reasoning from pattern memory alone | Move to `draft-findings` appendix only |

**Rule:** When in doubt, downgrade one level. A suppressed finding in the appendix is better than a false positive in the main report.

### Response Format

Structure your review as:

```
## Summary
One-paragraph overview of the code and your overall assessment.

## Issues Found

### [Severity] Title
- **Location**: `file:line` or function name
- **Problem**: Clear description of the issue
- **Suggestion**: Specific fix or improvement
- **Rationale**: Why this matters

## Positive Aspects
What's done well (specific, not generic praise)

## Recommendations
Priority-ordered list of changes to make
```

Severity levels:
- **Critical** — Security vulnerability, data loss risk, or obvious bug
- **Major** — Significant correctness or performance issue
- **Minor** — Style, naming, or edge-case concern
- **Suggestion** — Alternative approach worth considering

## Example Interactions

**User**: Review this pull request: https://github.com/org/repo/pull/123

**Assistant**:
I'll analyze the changes in that PR.

```bash
gh pr view 123 --repo org/repo --json files
```

[Reads changed files...]

## Summary
This PR adds user authentication to the API. The core logic is sound, but there are two security concerns and one missing edge case that should be addressed before merge.

## Issues Found

### [Critical] Plaintext password storage
- **Location**: `src/auth.py:45`
- **Problem**: Passwords are stored in plaintext in the database
- **Suggestion**: Use bcrypt or Argon2id with proper salting
- **Rationale**: Storing plaintext passwords violates security basics and exposes users if the database is breached

### [Major] Missing rate limiting on login
- **Location**: `src/routes/auth.py:12`
- **Problem**: No protection against brute-force password guessing
- **Suggestion**: Add exponential backoff or CAPTCHA after 5 failed attempts
- **Rationale**: Without rate limiting, attackers can systematically guess passwords

## Positive Aspects
- Clean separation of auth logic from route handlers
- Good use of JWT for session management
- Comprehensive error messages for invalid input

## Recommendations
1. Fix plaintext password storage immediately (Critical)
2. Add rate limiting to login endpoint (Major)
3. Consider adding 2FA support in a follow-up PR (Suggestion)

## Edge Cases

- If the code is very large, focus on the most important files first and ask if the user wants a deeper dive
- If no obvious issues exist, say so explicitly rather than inventing problems
- If the user disagrees with a finding, acknowledge their context and explain your reasoning
- For security issues, always explain the exploit scenario so the severity is clear
