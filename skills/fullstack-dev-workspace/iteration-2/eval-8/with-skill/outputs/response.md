The user is asking about a build failure in their Next.js app. According to the fullstack-dev skill's scope, this falls under "DO NOT use this skill for" — specifically "Build failure diagnosis — use build-resolver (reactive triage of broken builds)."

The skill explicitly states:

> **DO NOT use this skill for:**
> - **Build failure diagnosis** — use `build-resolver` (reactive triage of broken builds)

And at the end:

> **Build/test failures** → use `build-resolver` (structured triage: dependency, code drift, config drift, external)

So I should redirect the user to the `build-resolver` skill, which is specifically designed for this scenario. But I can also provide some immediate guidance since I have context about what they're describing.

Let me provide a helpful response that acknowledges their issue, explains why build-resolver is the right tool, and gives them some immediate first steps they can try while I help them diagnose.

This is a **build failure** — the `fullstack-dev` skill explicitly delegates build diagnosis to `build-resolver`, which is purpose-built for structured triage of broken builds (dependency issues, code drift, config drift, external failures).

That said, I can get you started right now. The error pattern you're describing — webpack module resolution failure in an API route — has a few common root causes in Next.js:

**Immediate checks — run these and share the output:**

1. **Get the full error:**
   ```bash
   npm run build 2>&1 | tee build-error.log
   ```

2. **Check for the specific missing module:**
   ```bash
   # Look at your API route imports — which module can't be resolved?
   grep -r "from ['\"]" src/app/api/ --include="*.ts" --include="*.tsx"
   ```

3. **Common Next.js module resolution culprits:**
   - **Server-only package imported in client boundary** — if your API route imports something that uses `'use client'` or browser APIs, Next.js webpack can't resolve it server-side
   - **Missing peer dependency** — a package you installed expects a peer dep that isn't in your `node_modules`
   - **Path alias misconfiguration** — `tsconfig.json` paths not matching `next.config.js` transpile patterns
   - **Monorepo hoisting issue** — if you're in a workspace, the module may be hoisted to root `node_modules` but Next.js can't find it

4. **Quick fixes to try:**
   ```bash
   # Clear Next.js cache (not just node_modules)
   rm -rf .next
   
   # Check if the missing dep is actually installed
   npm ls <package-name>
   
   # Verify tsconfig paths
   cat tsconfig.json | grep -A5 "paths"
   ```

**If those don't resolve it**, I'd recommend switching to the `build-resolver` skill for structured diagnosis — it walks through dependency → code drift → config drift → external in order, which is exactly what a cryptic webpack module resolution error needs.

Want me to switch to `build-resolver` and do a full structured triage? I'll need:
- The **exact error message** (paste the full output)
- Your `package.json` (at minimum the `dependencies` and `devDependencies` sections)
- The API route file that's failing
