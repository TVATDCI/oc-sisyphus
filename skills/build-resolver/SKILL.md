---
name: build-resolver
description: "Structured build error diagnosis and resolution. Use when: (1) build fails after code changes, (2) tests fail with unclear cause, (3) dependency/version issues suspected, (4) config drift broke the build. Triggers: 'build failed', 'tests failing', 'why is the build broken', 'fix build error', 'dependency issue'."
compatibility: opencode
---

# Build Resolver

Diagnoses build failures with structured triage instead of dumping raw error output. Goes through dependency tree, version mismatches, and config drift systematically.

## Entry Criteria

- [ ] Build or test command failed
- [ ] Error output is unclear or voluminous
- [ ] Failure appeared after code changes (not initial project setup)

## Produces

- Structured diagnosis report
- Root cause identification
- Fix recommendation with confidence level
- Prevention notes

## Steps

1. **Capture error context**
   ```bash
   # Run the failing command and capture full output
   {build_command} 2>&1 | tee /tmp/build-error.log
   echo "Exit code: $?"
   ```
   - Command that was run
   - Full error output (stdout + stderr)
   - Exit code
   - Last successful build timestamp (if known from git)

2. **Classify error type**

   | Pattern | Type | Check |
   |---------|------|-------|
   | `cannot find module`, `Module not found` | Import/Dependency | Step 3 |
   | `TypeError`, `Cannot read property` | Runtime/Type | Step 4 |
   | `SyntaxError`, `Unexpected token` | Syntax/Parse | Step 4 |
   | `EACCES`, `ENOENT` | File/Permission | Step 5 |
   | `version mismatch`, `peer dep` | Version/Dependency | Step 3 |
   | `config`, `configuration` | Config Drift | Step 5 |
   | `timeout`, `ECONNREFUSED` | Network/External | Step 6 |

3. **Dependency triage**

   ```bash
   # Check if node_modules exists and is complete
   [ -d node_modules ] && echo "node_modules exists" || echo "MISSING node_modules"
   
   # Check lockfile vs installed
   npm ls --depth=0 2>&1 | head -20
   
   # Check for version mismatches
   npm outdated 2>&1 | head -20
   
   # Check peer dependencies
   npm ls 2>&1 | grep -i "peer" | head -10
   ```

   **Questions to answer:**
   - Did `node_modules` change recently? (check `ls -lt node_modules | head -5`)
   - Is lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) in sync with `package.json`?
   - Are there duplicate versions of the same package? (`npm ls {package-name}`)
   - Did a dependency update break the build? (`git diff package.json`)

4. **Code drift triage**

   ```bash
   # Check what changed since last successful build
   git diff --name-only HEAD~1
   
   # Check for syntax issues in changed files
   npx eslint {changed_files} 2>&1 | head -30
   
   # Type check if TypeScript
   [ -f tsconfig.json ] && npx tsc --noEmit 2>&1 | head -30
   ```

   **Questions to answer:**
   - Which files changed since last successful build?
   - Do changed files have syntax errors?
   - Are imports correct in changed files?
   - Did a refactoring break an interface/contract?

5. **Config drift triage**

   ```bash
   # Check config files for recent changes
   git diff --name-only | grep -E "\.(json|yaml|yml|toml|config\.)$"
   
   # Check environment variables
   env | grep -i "node\|npm\|path" | sort
   
   # Check for missing .env or config
   [ -f .env ] || echo "No .env file"
   [ -f .env.example ] && echo ".env.example exists" || echo "No .env.example"
   ```

   **Questions to answer:**
   - Did build config change (webpack, vite, tsconfig, babel)?
   - Did environment variables change?
   - Is a required config file missing?
   - Are paths in config still valid?

6. **External/system triage**

   ```bash
   # Check Node version
   node --version
   
   # Check available disk space
   df -h . | tail -1
   
   # Check network connectivity (if external API needed)
   curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/ || echo "Network issue"
   ```

   **Questions to answer:**
   - Is Node version compatible with project requirements?
   - Is disk space sufficient?
   - Are external services reachable?
   - Did OS/system update break toolchains?

7. **Generate diagnosis report**

   Format:
   ```markdown
   ## Build Failure Diagnosis

   **Command:** `{command}`
   **Error type:** {classified type}
   **Confidence:** High/Medium/Low

   ### Root Cause
   {1-2 sentence description of what's actually wrong}

   ### Evidence
   - {specific observation from triage}
   - {specific observation from triage}

   ### Fix
   {specific command or code change to resolve}

   ### Prevention
   - {what would have caught this earlier}
   ```

8. **Apply fix and verify**
   - Apply recommended fix
   - Re-run original failing command
   - If still failing: re-classify and loop (max 3 attempts)
   - If fixed: document in evidence log

## Integration

Call from `wave-executor` when:
- Build fails during slice execution
- Tests fail after implementation
- Post-change verification detects build breakage

Do NOT call for:
- Initial project setup (different problem)
- Intentional breaking changes (user knows)
- External service downtime (temporary, not code issue)
