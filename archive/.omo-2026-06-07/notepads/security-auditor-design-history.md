# Security-Auditor Skill Plan

## Overview

**Goal**: Create a standalone `security-auditor` skill (~300 lines) for pre-deployment security scanning. Designed to slot in after `momus-reviewer` and before `archivist` publishing.

**Mode**: Subagent, read-only (like momus-reviewer)

---

## YAML Frontmatter

```yaml
---
name: security-auditor
description: "Pre-deployment security scanner. Use when: (1) 'security review' requested, (2) before publishing sensitive features, (3) auditing for vulnerabilities. Triggers: 'security review', 'audit', 'check for vulnerabilities', 'pre-deploy scan', 'security check'. Scans for: plaintext secrets, API keys, missing CSRF, XSS risks, injection vulnerabilities."
compatibility: opencode
triggers:
  - "security review"
  - "audit"
  - "check for vulnerabilities"
  - "pre-deploy scan"
  - "security check"
  - "vulnerability scan"
  - "security audit"
mode: automatic
inputs:
  - "Project path (required) — root directory to scan"
  - "PRD file path (optional) — for context on what was built"
  - "Plan file path (optional) — for slice context"
  - "Specific files to scan (optional) — comma-separated list"
outputs:
  - "Security audit report with severity (critical/warning/info)"
  - "List of vulnerabilities with file paths, line numbers"
  - "Remediation suggestions per finding"
  - "Gate decision: PASS / WARNING / FAIL"
produces_artifacts:
  - ".sisyphus/notepads/{plan-name}/security-audit-{timestamp}.md"
requires_artifacts:
  - "None — performs fresh scan each time"
gates:
  - "Gate decision: FAIL blocks deployment until fixed"
  - "Gate decision: WARNING requires acknowledgment"
  - "Gate decision: PASS allows deployment to proceed"
metadata:
  version: 1.0.0
  category: security
  complexity: advanced
---
```

---

## Core Workflow: Security Audit

**Trigger:** "security review", "audit", "check for vulnerabilities", "pre-deploy scan", "security check"

**Input Requirements:**
- `project_path` (required) — root directory to scan (default: current working directory)
- `prd_path` (optional) — PRD for feature context
- `plan_path` (optional) — plan file for slice context
- `target_files` (optional) — specific files to focus scan (comma-separated)

**When to use:**
- Pre-deployment gate before `archivist` publishing
- After `momus-reviewer` passes but before release
- User explicitly requests security audit
- Handling sensitive data (auth, payments, PII)

---

## Steps:

### Step 0: Load Context

1. Read PRD if provided (for feature context)
2. Read plan if provided (for slice boundaries)
3. Identify target scope:
   - If `target_files` provided: scan only those files
   - Else: scan all source files in project (exclude node_modules, .git, etc.)

### Step 1: Scan for Vulnerabilities

Review code across these security categories. For each finding, identify specific evidence (file path, line number, code snippet) and severity.

#### Category A: Plaintext Secrets & API Keys
**Question:** Are secrets, API keys, or credentials exposed in code?

Check for:
- [ ] Hardcoded passwords or API keys in source files
- [ ] Database connection strings with credentials
- [ ] Private keys, PEM files, or certificates in repo
- [ ] `.env` files committed to version control
- [ ] AWS/Azure/GCP credentials in code
- [ ] JWT secrets or signing keys in plaintext
- [ ] OAuth client secrets in frontend code

**Patterns to detect:**
```
/api[key|_key|Key]\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']
/password\s*[:=]\s*["'][^"']+["']
/secret\s*[:=]\s*["'][^"']+["']
/private[_-]?key/
/-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/
```

**Finding format:**
```
A-{n}: [Severity] [Title]
- Location: `file:line`
- Evidence: `[exact code snippet]`
- Risk: [exploit scenario]
- Fix: [specific remediation]
```

#### Category B: Injection Vulnerabilities
**Question:** Are user inputs safely handled to prevent injection attacks?

Check for:
- [ ] SQL injection (string concatenation in queries, unsanitized inputs)
- [ ] Command injection (user input in shell commands)
- [ ] NoSQL injection (unfiltered MongoDB queries)
- [ ] LDAP injection (user input in directory queries)
- [ ] XML/XXE injection (parsing user XML without safeguards)
- [ ] Template injection (user input in template engines)

**Patterns to detect:**
```javascript
// SQL injection red flags:
`SELECT * FROM users WHERE id = '${userId}'`
query("SELECT * FROM table WHERE id = " + userInput)

// Command injection red flags:
exec(`rm -rf ${userPath}`)
spawn('sh', ['-c', userInput])
```

**Finding format:**
```
B-{n}: [Severity] [Title]
- Location: `file:line`
- Evidence: `[exact code snippet]`
- Risk: [injection exploit scenario]
- Fix: [parameterization or sanitization approach]
```

#### Category C: Cross-Site Scripting (XSS)
**Question:** Is user input properly escaped before rendering?

Check for:
- [ ] `innerHTML` with user input (DOM-based XSS)
- [ ] `document.write` with user input
- [ ] Unescaped output in templates (React `dangerouslySetInnerHTML`, Vue `v-html`)
- [ ] URL parameters rendered without encoding
- [ ] User input in `<script>` tags or event handlers
- [ ] Missing Content-Security-Policy headers

**Patterns to detect:**
```javascript
element.innerHTML = userInput
document.write(userContent)
dangerouslySetInnerHTML={{__html: userData}}
```

**Finding format:**
```
C-{n}: [Severity] [Title]
- Location: `file:line`
- Evidence: `[exact code snippet]`
- Risk: [XSS exploit scenario]
- Fix: [escape/encode approach or CSP addition]
```

#### Category D: CSRF & Authentication Gaps
**Question:** Are state-changing actions protected against CSRF?

Check for:
- [ ] POST/PUT/DELETE endpoints without CSRF tokens
- [ ] Missing SameSite cookie attributes
- [ ] State-changing actions via GET requests
- [ ] No anti-CSRF headers (X-Requested-With, Origin validation)
- [ ] CORS misconfigurations allowing cross-origin state changes
- [ ] Session fixation vulnerabilities

**Patterns to detect:**
```javascript
// Express without CSRF protection:
app.post('/transfer', (req, res) => { ... })

// Missing SameSite:
cookie without SameSite=Strict or SameSite=Lax
```

**Finding format:**
```
D-{n}: [Severity] [Title]
- Location: `file:line`
- Evidence: `[exact code snippet]`
- Risk: [CSRF exploit scenario]
- Fix: [CSRF token implementation or cookie fix]
```

#### Category E: Insecure Dependencies & Configurations
**Question:** Are dependencies and configurations secure by default?

Check for:
- [ ] Outdated dependencies with known CVEs
- [ ] Use of deprecated/insecure libraries
- [ ] Disabled security features (verify: false, ssl: false)
- [ ] Overly permissive CORS (Allow-Origin: *)
- [ ] Debug mode enabled in production
- [ ] Missing security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
- [ ] Insecure file upload handling (no type/mime validation)

**Finding format:**
```
E-{n}: [Severity] [Title]
- Location: `file:line` or `package.json`
- Evidence: `[exact code snippet or dependency]`
- Risk: [configuration exploit scenario]
- Fix: [secure configuration or dependency update]
```

#### Category F: Path Traversal & File Access
**Question:** Are file paths properly validated to prevent directory traversal?

Check for:
- [ ] User input in file paths without sanitization
- [ ] `../` sequences allowed in file operations
- [ ] Absolute paths constructed from user input
- [ ] Missing path validation in static file serving

**Patterns to detect:**
```javascript
fs.readFile(`./uploads/${userFilename}`)
res.sendFile(path.join(__dirname, req.query.file))
```

**Finding format:**
```
F-{n}: [Severity] [Title]
- Location: `file:line`
- Evidence: `[exact code snippet]`
- Risk: [path traversal exploit scenario]
- Fix: [path validation approach]
```

### Step 2: Synthesize Findings

1. **Count findings by severity:**
   - **CRITICAL**: Immediate exploit possible, data breach risk
   - **WARNING**: Security weakness, should fix before production
   - **INFO**: Security hygiene issue, best practice recommendation

2. **Identify top 3 risks** — the vulnerabilities most likely to be exploited

3. **Map to CWE categories** (Common Weakness Enumeration):
   - CWE-798: Hardcoded Credentials
   - CWE-89: SQL Injection
   - CWE-79: XSS
   - CWE-352: CSRF
   - CWE-22: Path Traversal
   - etc.

### Step 3: Write Security Audit Report

Create audit report at `.sisyphus/notepads/{plan-name}/security-audit-{YYYY-MM-DD}.md`

**Report structure:**
```markdown
# Security Audit: {plan-name}
**Date:** {YYYY-MM-DD}
**Auditor:** Security Auditor (pre-deployment scan)
**Scope:**
- Project: {project_path}
- Files scanned: {n}
- PRD: {prd_path or "not reviewed"}

## Summary

**Gate Decision:** {PASS / WARNING / FAIL}
**Findings:** {n} total ({critical} critical, {warning} warning, {info} info)
**Risk Level:** {LOW / MEDIUM / HIGH / CRITICAL}

### Top 3 Risks
1. [Title] — [one-line explanation with CWE reference]
2. [Title] — [one-line explanation with CWE reference]
3. [Title] — [one-line explanation with CWE reference]

## Detailed Findings

### A. Plaintext Secrets & API Keys
{findings or "None found"}

### B. Injection Vulnerabilities
{findings or "None found"}

### C. Cross-Site Scripting (XSS)
{findings or "None found"}

### D. CSRF & Authentication Gaps
{findings or "None found"}

### E. Insecure Dependencies & Configurations
{findings or "None found"}

### F. Path Traversal & File Access
{findings or "None found"}

## Remediation Priority

1. **[Severity]** [CWE-ID] [Title] — [specific fix] — Effort: [size]
2. ...

## Security Checklist

Before deployment, verify:
- [ ] All CRITICAL findings fixed
- [ ] All WARNING findings acknowledged or fixed
- [ ] Secrets rotated if exposed
- [ ] Security headers configured
- [ ] Dependencies updated
```

### Step 4: Return Gate Decision

Return a **machine-readable gate decision** that the orchestrator can consume automatically.

**Required output format (strict):**
```json
{
  "decision": "PASS" | "WARNING" | "FAIL",
  "artifact_path": "{path_to_audit_report}",
  "summary": "{one-line human-readable summary}",
  "risk_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "findings": [
    {
      "id": "A-1",
      "severity": "CRITICAL" | "WARNING" | "INFO",
      "category": "Secrets" | "Injection" | "XSS" | "CSRF" | "Configuration" | "Path Traversal",
      "cwe": "CWE-XXX",
      "title": "{finding title}",
      "location": "file:line",
      "fix": "{specific remediation}"
    }
  ],
  "next_action": "proceed" | "fix_then_recheck" | "user_decision"
}
```

**Findings array rules:**
- PASS: empty array `[]`
- WARNING: may include warning/info findings with caution notes
- FAIL: must include all critical findings preventing deployment

---

## Gate Behavior

This skill acts as a **mandatory pre-deployment gate**:

| Gate Decision | Orchestrator Action | User Action |
|--------------|---------------------|-------------|
| PASS | Proceed to archivist publishing | None |
| WARNING | Proceed with caution, document accepted risks | Acknowledge findings |
| FAIL | STOP. Fix vulnerabilities before deployment | Review findings, approve fixes, re-run audit |

---

## Integration with Workflow

**Pre-deployment Gate (after momus-reviewer, before archivist):**

```
sisyphus-plan Workflow 1d completes final slice
  → Gate: [[DELEGATE: momus-reviewer]] (Checkpoint 3 - PASS)
  → Gate: [[DELEGATE: security-auditor]] (Pre-deployment)
    → Input: project_path, PRD path
    → Scan for vulnerabilities across all 6 categories
    → Output: Gate decision
    → If FAIL: STOP. Fix security issues, re-run audit.
    → If PASS/WARNING: proceed to archivist publishing
  → [[DELEGATE: archivist]] (Publish to wiki)
```

**Why this works:**
- Security audit is the **final checkpoint** before release
- Finds vulnerabilities mechanical execution missed
- Cheap to run (scanning, not reasoning) but high-value
- Blocks deployment of insecure code

---

## Tool Usage

- **Read tools**: Read source files, PRD, plan
- **Grep tools**: Search for vulnerability patterns (secrets, injection, XSS)
- **Bash tools**: `find`, `grep` for file discovery and pattern matching
- **Write tools**: Create audit report in notepads directory
- **Task tool**: NEVER delegate — this skill IS the auditor

---

## Boundaries

- **Do NOT execute code or modify implementation files** — this is audit only
- **Do NOT create or modify PRDs** — report findings, let orchestrator fix
- **Do NOT deploy code** — gate decision only, execution happens elsewhere
- **Do NOT conduct open-ended research** — scan only the provided project scope
- **Do NOT approve your own audit** — gate decision is output, not self-executing
- **Do NOT access production systems** — scan source code only

---

## Examples

### Example 1: Security Audit — PASS
```
User: "Security audit /home/vladi/projects/my-api"

Agent loads security-auditor skill:
1. Scans all source files in project
2. Checks all 6 security categories
3. Finds: 0 critical, 0 warning, 3 info (missing security headers, dependency outdated but no CVE)
4. Writes audit report to .sisyphus/notepads/my-api/security-audit-2026-05-04.md
5. Returns: PASS — "No critical vulnerabilities. 3 info-level improvements recommended."
```

### Example 2: Security Audit — FAIL
```
User: "Pre-deploy scan for guess-the-number game"

Agent loads security-auditor skill:
1. Scans project files
2. Category A (Secrets):
   A-1: CRITICAL — API key committed to repo
   - Location: `src/config.js:12`
   - Evidence: `const API_KEY = "sk_live_abc123xyz789"`
   - Risk: API key exposed in version control
   - Fix: Remove from repo, rotate key, use environment variables

3. Category C (XSS):
   C-1: WARNING — innerHTML with user input
   - Location: `src/ui.js:45`
   - Evidence: `element.innerHTML = userMessage`
   - Risk: Stored XSS if userMessage contains script tags
   - Fix: Use textContent instead, or sanitize with DOMPurify

4. Returns: FAIL — "1 critical, 1 warning. Deployment BLOCKED. See audit report for fixes."
```

### Example 3: Pre-deployment Gate — Auto-invoked
```
Orchestrator completes final slice, reaches pre-deployment:
- Delegates to security-auditor: "Scan /home/vladi/projects/dashboard"
- Framework loads skill, performs vulnerability scan
- Returns: WARNING — "1 warning: CORS allows all origins in dev config. Acceptable for dev, fix before prod."
- Orchestrator asks user: "Security audit found 1 warning. Proceed to publish?"
- User: "Yes, we'll fix CORS before production deploy"
- Orchestrator proceeds to archivist
```

---

## Edge Cases

| Error | Action |
|-------|--------|
| Project path not found | FAIL — cannot audit non-existent project |
| No source files found | PASS with note — "No code to scan" |
| Binary files in scan | Skip binary files, note in report |
| Large codebase (>1000 files) | Sample critical paths first, ask if full scan needed |
| Encrypted/obfuscated code | Note in report — "Unable to analyze obfuscated code" |
| No PRD provided | Scan with reduced context, note limitation |

---

## Cost Monitoring

**Target cost:** ≤€0.05 per audit (mechanical scanning with pattern matching).

**If costs exceed target:**
1. Check category routing — should use cheap model (GLM-5.1 or GPT-5.4-mini)
2. Consider caching scan results for unchanged files
3. Report: "Cost drift detected: {model} used for scanning"

---

## Scoring Reference

For skill validation, a good security audit scores high on:
- **Coverage**: All 6 categories checked (not skipped)
- **Accuracy**: Findings cite exact file:line and code snippets
- **Actionability**: Every finding has specific remediation steps
- **Severity accuracy**: Critical findings are actually exploitable
- **No false positives**: Doesn't flag safe patterns as vulnerabilities

---

## Implementation Notes

1. **File**: `/home/vladi/.config/opencode/skills/security-auditor/SKILL.md`
2. **Line count target**: ~300 lines (this plan is detailed but actual skill should be concise)
3. **Pattern**: Follows momus-reviewer gate structure with reference-checker mechanical scanning
4. **Category**: Use `category="unspecified-low"` for mechanical scanning (cheap model)
5. **Integration**: Insert after momus-reviewer Checkpoint 3, before archivist in sisyphus-plan workflow
