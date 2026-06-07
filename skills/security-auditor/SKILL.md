---
name: security-auditor
description: "Pre-deployment security scanner that finds vulnerabilities before they reach production. (1) Use when 'security review' is requested or before deploying sensitive features. (2) Use to scan for plaintext secrets, API keys, hardcoded credentials, private keys. (3) Use to check for XSS, CSRF gaps, injection vulnerabilities, IDOR, missing auth, weak crypto. Triggers: 'security review', 'audit', 'check for vulnerabilities', 'pre-deploy scan', 'security check', 'vulnerability scan', 'security audit', 'scan for secrets', 'check for XSS', 'find SQL injection'. Scans 6 categories: secrets, injection, XSS, auth/CSRF, dependencies, path traversal. Returns PASS/WARNING/FAIL gate decision. Not for: performance issues, functional bugs, PCI/HIPAA compliance, or penetration testing."
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
outputs:
  - "Security audit report with severity (critical/warning/info)"
  - "List of vulnerabilities with file paths, line numbers"
  - "Remediation suggestions per finding"
  - "Gate decision: PASS / WARNING / FAIL"
produces_artifacts:
  - ".sisyphus/notepads/{plan-name}/security-audit-{YYYY-MM-DD-HHmm}.md"
requires_artifacts:
  - "None — performs fresh scan each time"
gates:
  - "Gate decision: FAIL blocks deployment until fixed"
  - "Gate decision: WARNING requires acknowledgment"
  - "Gate decision: PASS allows deployment to proceed"
metadata:
  version: 1.2.0
  category: security
  complexity: advanced
  system_version: "v2.1"
  handoff_contract:
    - "Orchestrator provides: project_path, optional PRD/plan paths"
    - "Skill returns: machine-readable gate decision + written report"
    - "Skill does NOT: self-approve, modify code, or deploy"
    - "On FAIL: orchestrator halts pipeline; user must fix and re-audit"
---

# Security Auditor

A pre-deployment security scanner that finds vulnerabilities before they reach production. Scans code for secrets, injection risks, XSS, CSRF gaps, and insecure configurations.

## Identity & Scope

**Purpose:** Pre-deployment security scanner that finds vulnerabilities before they reach production.
**Triggers:** "security review", "audit", "check for vulnerabilities", "pre-deploy scan", "security check", "vulnerability scan", "security audit"
**Scans for:** plaintext secrets, API keys, missing CSRF, XSS risks, injection vulnerabilities
**Not For:**
- Runtime performance issues (use a different profiling tool)
- Functional bugs (use momus-reviewer or wave-executor)
- Compliance audits (PCI, HIPAA — use specialized compliance tools)
- Penetration testing (this is static analysis, not red-team)

**Entry Criteria:**
- [ ] project_path provided
- [ ] (Optional) PRD/plan paths for feature context
- [ ] Source files accessible for grep

**Produces:**
- Security audit report at `.sisyphus/notepads/{plan-name}/security-audit-{YYYY-MM-DD-HHmm}.md`
- List of vulnerabilities with file paths, line numbers, severity (critical/warning/info)
- Remediation suggestions per finding
- Machine-readable gate decision (PASS / WARNING / FAIL)

**Next if Approved:**
- PASS → deployment proceeds
- WARNING → acknowledge, fix before production
- FAIL → halt pipeline, fix and re-audit

**Skill Usage:**
This skill is loaded via `load_skills` into category-routed tasks:
```typescript
task(
  category="unspecified-low",
  load_skills=["security-auditor"],
  prompt="Security review /home/vladi/projects/my-app"
)
```

**Category routing:** Use cheap models (deepseek-v4-flash) for mechanical pattern scanning.

## Hard Constraints (NEVER/MUST)

- **No invented vulnerabilities** — report only what patterns confirm; if no finding in a check, explicitly state "No findings in [check]"
- **Cite exact file paths and line numbers** — every finding MUST have a verifiable location, not vague claims
- **Check exclusions before reporting** — test files, fixtures, examples, generated code, config templates with placeholder values, documentation-only files, local dev overrides
- **All 6 categories must be checked** — Secrets → Dependency chain → CI/CD → Injection/XSS → Auth/CSRF → Config
- **Daily mode default** — only verified findings; comprehensive mode requires `--comprehensive` flag and TENTATIVE confidence
- **Use grep for pattern matching, not reasoning** — mechanical scan, not LLM-based
- **Boundary: scan only, no code modification** — do NOT modify code, deploy, or self-approve
- **Boundary: report findings, don't fix** — let orchestrator fix; this skill is read-only
- **Boundary: no open-ended research** — scan only the provided project_path
- **5-Case Eval-First Discipline (MANDATORY)** — Before scanning (Step 1), build a 5-case eval suite per `Main-vault/AGENTS.md` §6: 1 control case (clean repo, no vulns), 2-3 edge failure cases (where you have seen the skill fail), 1 capability boundary case (novel vuln class that requires hand-off to a human). Eval must be saved to `.sisyphus/evidence/<plan>-security-eval.md` BEFORE invoking Step 0. A skill with no eval can return false-negative PASS on novel vuln classes (CWE-918 SSRF, CWE-79 server-side XSS) — this rule is what makes "PASS" mean PASS. [Reference: [[2026-06-02-oracle-test-suite-results]] `brain-q9i` FAIL finding]

## Core Workflow (Summary)

The 5-step security audit pipeline — see `## Detailed Steps` below for per-step procedures.
1. **Step -1: Build 5-Case Eval Suite** — Construct the eval FIRST (per Hard Constraint #10). Without it, the audit cannot distinguish "no vulns found" from "no patterns for these vulns."
2. **Step 0: Determine Target & Scan Order** — Repo-type-aware ordering (application code vs agent/config vs library), applicability matrix, scope rules
3. **Step 1: Scan for Vulnerabilities** — Apply false-positive exclusions, scan all 6 categories with grep patterns
4. **Step 2: Triage & Severity** — Classify findings (critical/warning/info), prioritize remediation
5. **Step 3: Write Audit Report + Return Gate Decision** — Generate report at `.sisyphus/notepads/.../security-audit-{ts}.md` with Summary/Detailed Findings/Remediation/Pre-deployment Checklist; return machine-readable JSON

**Modes:** Daily (default, verified findings only) vs Comprehensive (`--comprehensive`, includes TENTATIVE)

## Tool Usage

- **Read tools**: Read PRD, plan, project files for context
- **Grep tools**: Primary scan method for pattern matching (regex, fixed-string)
- **Write tools**: Create audit report in notepads directory
- **Task tool**: NEVER delegate — this skill IS the auditor; scanning happens in this context

## Boundaries

- **Do NOT modify code** — read-only scanning
- **Do NOT deploy or trigger deployment** — gate decision is output, not self-executing
- **Do NOT create beads issues** — findings stay in report unless orchestrator decides
- **Do NOT fix vulnerabilities directly** — report findings, let orchestrator fix
- **Do NOT conduct open-ended research** — scan only the provided project_path

## Integration with Other Skills

- **sisyphus-plan**: Creates plans that this skill reviews at pre-deployment gate
- **momus-reviewer**: Reviews PRDs/plans for logical/architectural issues (complementary; this skill reviews code)
- **wave-executor**: Implements slices; security-auditor runs after wave-executor and before deployment
- **vault-lint**: Validates documentation structure (different domain)

## Gate Behavior

This skill acts as a **mandatory pre-deployment gate**:

| Gate Decision | Orchestrator Action | User Action |
|--------------|---------------------|-------------|
| PASS | Proceed to deployment | None |
| WARNING | Acknowledge, fix before production | Review findings, approve fix |
| FAIL | STOP deployment | Fix vulnerabilities, re-audit |

## Cost Monitoring

- **Daily mode** uses cheap models (unspecified-low / deepseek-v4-flash)
- **Comprehensive mode** may use more expensive reasoning if patterns are ambiguous
- Per-check cost is bounded by the 6-category check list; no open-ended search

## Edge Cases

| Error | Action |
|-------|--------|
| project_path not found | FAIL — report missing path, cannot scan |
| project_path is a symlink loop | FAIL — report path resolution error |
| All checks find no issues | Report PASS with explicit "No findings" in each category |
| No source files found (empty project) | Report PASS with note: "No source files to scan" |
| Massive project (>100K LOC) | Use sampling strategy, note in "Coverage" section |
| Permission denied on files | Skip with note in report, do not fail entire audit |

## Scoring Reference

For skill validation, a good security audit scores high on:
- **Coverage**: All 6 categories checked (not skipped)
- **Specificity**: Findings cite exact file paths, line numbers, and the matched pattern
- **Actionability**: Every finding has a remediation suggestion
- **Honesty**: Reports "No findings" when appropriate (no invented vulnerabilities)
- **Severity accuracy**: Critical findings actually represent exploitable risks

---

## Detailed Steps

### Step -1: Build 5-Case Eval Suite

**Purpose:** Make "PASS" mean PASS. Without an eval, the skill can return false-negative PASS on a fixture with CWE-918 (SSRF) or CWE-79 (server-side XSS) because the 6-category pattern set doesn't cover those classes. The capability boundary case (case 5) is what catches this.

**When:** BEFORE invoking Step 0. The eval is the gate; scanning cannot start without it.

**Procedure:**

1. **Create eval file** at `.sisyphus/evidence/<plan-name>-security-eval.md` with exactly 5 cases:

   | # | Type | Purpose | Example |
   |---|------|---------|---------|
   | 1 | **CONTROL** | Proves the scan infrastructure works (clean repo, no vulns) | Minimal Express app with parameterized queries, bcrypt, csurf, helmet — expect PASS with "no findings" in each of 6 categories |
   | 2 | **EDGE failure** | Tests a known failure pattern | SQLi via string concatenation: `db.query(\`SELECT * FROM users WHERE id = ${id}\`)` — expect B-1 CRITICAL at file:line |
   | 3 | **EDGE failure** | Tests a second known failure pattern | Hardcoded Stripe-style key: `const apiKey = "sk_live_..."` — expect A-1 CRITICAL |
   | 4 | **EDGE failure** | Tests IDOR / missing auth (optional 3rd edge) | POST endpoint updating user data by URL param without ownership check — expect D-1 IDOR + D-2 missing CSRF |
   | 5 | **CAPABILITY BOUNDARY** | Tests graceful hand-off to human on novel attack class | SSRF: `app.get('/api/fetch', async (req, res) => fetch(req.query.url))` — skill has no SSRF pattern, must report "OUT OF SCOPE — escalate to human reviewer" rather than false-negative PASS |

2. **Reference AGENTS.md §6** in the eval file header: "Per Eval-First Discipline (1 control, 2-3 edge failures, 1 capability boundary)"

3. **For each case**, document:
   - Input: code snippet or file path
   - Expected finding (or "no findings" for control)
   - Severity classification (CRITICAL/WARNING/INFO/NONE)
   - CWE reference (for edge failures)

4. **Verify eval exists** before invoking Step 0: `ls -la .sisyphus/evidence/<plan-name>-security-eval.md`

5. **If eval cannot be built** (e.g., no test fixtures available): STOP. Do not invoke Step 0. The eval is mandatory.

**Reference:** [[2026-06-02-oracle-test-suite-results]] `brain-q9i` (FAIL finding — false-negative PASS on case 5 was the load-bearing discovery)

**Why case 5 (capability boundary) is load-bearing:** The 6-category scan covers patterns the skill knows. Case 5 covers patterns the skill DOESN'T know. Without case 5, the skill can confidently report "PASS" while missing a real SSRF/XSS class. The capability boundary case forces the skill to admit what it doesn't know.

### Step 0: Determine Target & Scan Order

**Target-aware scan ordering:** The optimal scan order depends on what kind of repo you're auditing:

| Repo Type | Primary Risk Surface | Order |
|-----------|---------------------|-------|
| **Application code** (web app, API, CLI) | User-facing endpoints, auth, data flow | Secrets in code → Dependency chain → CI/CD → Injection/XSS → Auth/CSRF → Config |
| **Agent/config system** (like our opencode setup) | Config files, skill definitions, plugin code | Secrets in config → Dependency chain → CI/CD → LLM/prompt injection → Code vulns |
| **Library/SDK** | Public API surface, dependency tree | Dependency chain → Secrets in tests/ci → Code vulns → Config |

**Mode selection:**
- **Daily mode (default):** Report only verified findings. Suppress anything you cannot quote evidence for.
- **Comprehensive mode (`--comprehensive`):** Surface more — include borderline patterns, but flag as `TENTATIVE` so the user knows confidence is lower.

### Step 0: Determine Applicability & Scope

Before scanning, determine which checks are relevant to this project:

**Applicability matrix:**
| Check | Applicable If | Not Applicable If |
|-------|--------------|-------------------|
| CSRF tokens | Browser app with cookie auth | API-only (bearer token), mobile app |
| SameSite cookies | Session uses cookies | JWT in Authorization header |
| CSP headers | Browser-facing app | API/backend service |
| CORS checks | Browser-facing app | Internal service, CLI tool |
| XSS checks | Renders user content in browser | API-only, no HTML output |
| Path traversal | Handles user-controlled file paths | No file upload/download |
| Access control / IDOR | Multi-user app with owned resources | Single-user tool, public static site |
| Session checks | Stateful session (cookie/JWT) | Stateless API with external auth |

**Scope rules:**
1. Read PRD if provided (for feature context)
2. Read plan if provided (for slice boundaries)
3. Identify source files to scan
4. **Exclude:** `node_modules/`, `.git/`, `*.min.js`, `dist/`, `build/`, `coverage/`, generated output, fixtures/examples/tests (unless explicitly included)
5. Note excluded paths in report under "Coverage"

### Step 1: Scan for Vulnerabilities

**False-positive exclusions (check before reporting):**
- Test files, fixtures, examples (unless explicitly in scope)
- Generated code (e.g., `dist/`, `build/`, `.next/`, autogenerated API clients)
- Config templates with placeholder values (`changeme`, `your_*`, `example`, `dummy`)
- Documentation-only files (`.md`, comments)
- Local dev overrides in `.env.example` or `docker-compose.override.yml`

If a finding matches any exclusion, note it as `EXCLUDED: {reason}` in the appendix but do NOT include in the main report.

Review code across these 6 categories:

#### Category A: Plaintext Secrets & API Keys
**Layered detection model:**

**Layer 1 — Regex/Keyword Pass (high recall, low precision)**
Scan for known secret patterns:
- [ ] API key patterns: `api_key`, `apikey`, `api-key`, `apiKey` with values ≥16 chars
- [ ] Password patterns: `password`, `passwd`, `pwd`, `db_password` with non-empty values
- [ ] Secret patterns: `secret`, `client_secret`, `app_secret` with non-empty values
- [ ] Token patterns: `token`, `access_token`, `bearer_token`, `auth_token` with values ≥8 chars
- [ ] Private keys: `-----BEGIN .* PRIVATE KEY-----`, `-----BEGIN OPENSSH PRIVATE KEY-----`
- [ ] AWS: `AKIA...` (access key ID), `aws_secret_access_key`
- [ ] GitHub: `ghp_...`, `gho_...`, `github_token`
- [ ] Database URIs: `postgres://`, `mysql://`, `mongodb://` with embedded credentials
- [ ] `.env` files in version control (check `.gitignore` for `.env` exclusion)

**Layer 2 — Entropy/Structure Pass (reduce false positives)**
For each Layer 1 hit, verify:
- [ ] Value length ≥16 characters (or ≥8 for tokens with known prefixes)
- [ ] Contains mix of alphanumeric + special characters (high entropy)
- [ ] NOT a placeholder: exclude `changeme`, `password`, `secret`, `123456`, `your_*`, `example`, `test`, `dummy`
- [ ] NOT in test/example/fixture files (unless explicitly included)

**Layer 3 — Confidence Classification**
```
HIGH confidence (CRITICAL): Private keys, AWS keys with correct format, database URIs with real passwords
MEDIUM confidence (WARNING): API keys with high entropy but unknown vendor, generic "secret" variables
LOW confidence (INFO): Short tokens, variables named "password" but value is placeholder or empty
```

**Layer 4 — Allowlist/Baseline (optional, if `.security-auditor-baseline` exists)**
- [ ] Check if secret is already known/allowlisted
- [ ] If yes, downgrade to INFO with note: "Known secret in baseline"

**Check for:**
- [ ] Hardcoded passwords or API keys
- [ ] Database connection strings with credentials
- [ ] Private keys or certificates in repo
- [ ] `.env` files committed to version control
- [ ] AWS/Azure/GCP credentials in code
- [ ] JWT secrets in plaintext

**Patterns:**
```
/api[key|_key|Key]\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']
/password\s*[:=]\s*["'][^"']+["']
/secret\s*[:=]\s*["'][^"']+["']
/-----BEGIN .*PRIVATE KEY-----/
```

**Finding format:**
```
A-{n}: [Severity] [Title] — Confidence: [HIGH/MEDIUM/LOW]
- Location: `file:line`
- CWE: CWE-XXX
- Evidence: `[exact code snippet]`
- Risk: [exploit scenario]
- Fix: [specific remediation]
```

#### Category B: Injection Vulnerabilities
**Taint analysis approach:** Identify user-controlled **sources**, dangerous **sinks**, and verify **sanitizers** are present.

**Sources (user-controlled input):**
- `req.params`, `req.query`, `req.body`, `req.headers`
- `req.cookies`, `req.files`
- Form inputs, URL parameters, JSON payloads
- External API responses used without validation

**Sinks (dangerous operations):**
- SQL: `.query()`, `.raw()`, `.execute()`, string-concatenated SQL
- Command: `exec()`, `spawn()`, `eval()`, `system()`
- NoSQL: unfiltered `$where`, `$expr`, `$function` operators
- LDAP: filter string construction
- XML: `DOMParser`, `loadXML`, `XmlDocument` without entity restrictions

**Sanitizers (safe patterns to NOT flag):**
- Parameterized queries: `query("SELECT * WHERE id = ?", [id])`
- ORM prepared statements: `Model.findByPk(id)`
- Whitelist validation before sink usage
- Explicit escaping functions: `escapeHtml()`, `sanitize()`

**Check for:**
- [ ] Source → sink with NO sanitizer (direct flow)
- [ ] Source → sink with WEAK sanitizer (regex replace, blacklist)
- [ ] String concatenation in SQL/command contexts
- [ ] `eval()` / `Function()` with any user input

**Patterns (flag only when source and sink both present):**
```javascript
// Direct flow: source → sink, no sanitizer
const userId = req.query.id;  // SOURCE
db.query(`SELECT * FROM users WHERE id = '${userId}'`);  // SINK

// Safe: parameterized (DO NOT flag)
db.query("SELECT * FROM users WHERE id = ?", [req.query.id]);
```

#### Category C: Cross-Site Scripting (XSS)
**Taint analysis approach:** Same source/sink/sanitizer model.

**Sources:**
- `req.query`, `req.body`, `req.params`, `req.headers`, `req.cookies`
- `localStorage`, `sessionStorage` (if populated from user input)
- URL fragments (`location.hash`)
- External messages (`postMessage`)

**Sinks:**
- `element.innerHTML = ...`
- `element.outerHTML = ...`
- `document.write(...)`
- `dangerouslySetInnerHTML` (React)
- `v-html` (Vue)
- `[ng-bind-html]` (Angular)
- `eval(...)`, `setTimeout(string)`, `setInterval(string)`

**Sanitizers:**
- DOMPurify, `textContent`, `createTextNode`
- Framework auto-escaping (React/Vue/Angular default bindings)
- Explicit `escapeHtml()` functions

**Check for:**
- [ ] Source → DOM sink with NO sanitizer
- [ ] Source → `eval`/`setTimeout(string)` with any flow
- [ ] Missing Content-Security-Policy headers (reported as INFO unless source→sink found)

**Patterns:**
```javascript
// Flag: source → sink, no sanitizer
const userInput = req.query.message;
preview.innerHTML = userInput;

// DO NOT flag: framework-safe binding
<div>{userInput}</div>  // React auto-escapes
```

#### Category D: Authentication, Authorization & CSRF
**Check for:**
- [ ] POST/PUT/DELETE without CSRF tokens
- [ ] Missing SameSite cookie attributes
- [ ] State-changing actions via GET requests
- [ ] Overly permissive CORS (`Access-Control-Allow-Origin: *`)
- [ ] **Missing server-side authorization checks** (routes that should require auth but don't)
- [ ] **Missing object ownership / tenant isolation** (IDOR: can user A access user B's data?)
- [ ] **Admin routes without role checks** (admin actions callable by regular users)
- [ ] **Missing default-deny middleware** (unlisted routes are accessible by default)
- [ ] **Client-side auth only** (UI hides buttons but server doesn't enforce)

**Session & Cryptography Checks:**
- [ ] **Weak password hashing** (`md5`, `sha1`, plain text, unsalted hashes)
- [ ] **Missing `Secure` / `HttpOnly` cookie flags** on session cookies
- [ ] **Session fixation** (session ID reused after login without regeneration)
- [ ] **JWT verification mistakes**:
  - Missing `exp` (expiration) validation
  - Missing `aud` (audience) / `iss` (issuer) checks
  - Algorithm confusion (`alg: none`, RS256→HS256 downgrade)
  - Secret/key stored in client-side code
- [ ] **Insecure token storage** (JWT in localStorage, sensitive tokens in URL params)
- [ ] **Weak randomness** for tokens/secrets (`Math.random()` instead of crypto PRNG)

**Patterns:**
```javascript
// Missing authorization
app.delete('/api/users/:id', (req, res) => { ... })  // no auth middleware

// IDOR / missing ownership check
const data = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id])
// Should also check: AND user_id = ?

// Admin route unprotected
app.post('/api/admin/reset', adminController.reset)  // no role check
```

#### Category E: Insecure Dependencies & Configurations
**Check for:**
- [ ] Outdated dependencies with known CVEs
- [ ] Disabled security features (`verify: false`, `ssl: false`)
- [ ] Debug mode in production
- [ ] Missing security headers (HSTS, X-Frame-Options)
- [ ] Unvalidated file uploads

#### Category F: Path Traversal
**Check for:**
- [ ] User input in file paths without sanitization
- [ ] `../` sequences allowed
- [ ] Absolute paths from user input

**Patterns:**
```javascript
fs.readFile(`./uploads/${userFilename}`)
res.sendFile(path.join(__dirname, req.query.file))
```

### Step 2: Active Verification

For each finding that survived exclusions, attempt to verify before promoting to the report:

1. **Can you quote the exact line that triggered the finding?** If not → suppress or downgrade.
2. **Can you construct a minimal exploit or test case?** If yes → promote. If no → flag as `TENTATIVE` (comprehensive mode only).
3. **Is the finding framework-aware?** For framework-generated symbols (ORM relationships, decorators, etc.), verify against the meta-construct (Meta block, schema, migration) rather than expecting literal field names.

### Step 3: Synthesize Findings

1. **Count by severity:**
   - **CRITICAL**: Immediate exploit, data breach risk
   - **WARNING**: Security weakness, fix before production  
   - **INFO**: Best practice recommendation
   - **TENTATIVE**: Comprehensive-mode finding below verification threshold

2. **Identify top 3 risks** with CWE references
3. **Estimate fix effort**: trivial (<1h), small (1-4h), medium (half day), large (full day+)

### Step 4: Write Audit Report

Create report at `.sisyphus/notepads/{plan-name}/security-audit-{YYYY-MM-DD-HHmm}.md`

**If no plan-name provided:** Use project directory name as slug.

```markdown
# Security Audit: {plan-name}
**Date:** {YYYY-MM-DD}
**Scope:** {project_path} ({n} files scanned)

## Summary
**Gate Decision:** {PASS / WARNING / FAIL}
**Findings:** {n} total ({critical} critical, {warning} warning, {info} info)
**Risk Level:** {LOW / MEDIUM / HIGH / CRITICAL}

### Top 3 Risks
1. [CWE-XXX] [Title] — [explanation]
2. [CWE-XXX] [Title] — [explanation]
3. [CWE-XXX] [Title] — [explanation]

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
1. **[Severity]** [CWE-XXX] [Title] — [fix] — Effort: [size]

## Pre-deployment Checklist
- [ ] All CRITICAL findings fixed
- [ ] All WARNING findings acknowledged or fixed
- [ ] Secrets rotated if exposed
```

### Step 4: Return Gate Decision

**Machine-readable output:**
```json
{
  "decision": "PASS" | "WARNING" | "FAIL",
  "artifact_path": "{path_to_report}",
  "summary": "{one-line summary}",
  "risk_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "findings": [
    {
      "id": "A-1",
      "severity": "CRITICAL" | "WARNING" | "INFO",
      "category": "Secrets" | "Injection" | "XSS" | "CSRF" | "Configuration" | "Path Traversal",
      "cwe": "CWE-XXX",
      "title": "...",
      "location": "file:line",
      "fix": "..."
    }
  ],
  "next_action": "proceed" | "fix_then_recheck" | "user_decision"
}
```

## Examples

### Example 1: PASS
```
User: "Security audit /home/vladi/projects/my-api"

Agent:
1. Scans 47 source files
2. Checks all 6 categories
3. Finds: 0 critical, 0 warning, 2 info
4. Writes: .sisyphus/notepads/my-api/security-audit-2026-05-04.md
5. Returns: PASS — "No critical vulnerabilities. 2 info-level improvements."
```

### Example 2: FAIL
```
User: "Pre-deploy scan for dashboard"

Agent:
1. Scans project files
2. Category A: A-1: CRITICAL — API key in config.js:12
3. Category C: C-1: WARNING — innerHTML in ui.js:45
4. Returns: FAIL — "1 critical, 1 warning. Deployment BLOCKED."
```

### Example 3: Auto-invoked Gate
```
Orchestrator reaches pre-deployment:
→ Delegates: "Security audit /home/vladi/projects/app"
→ Returns: WARNING — "CORS allows all origins. Fix before prod?"
→ User: "Accept for dev, fix before prod"
→ Proceeds to archivist
```