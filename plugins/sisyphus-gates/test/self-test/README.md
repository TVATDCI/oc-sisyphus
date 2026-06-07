# Sisyphus Gates — Self-Test Harness

End-to-end integration tests for the `sisyphus-gates` plugin. Whereas the
unit tests in `test/*.test.js` exercise individual functions, the
self-test boots the full plugin `server()` in sandboxed environments
and verifies that the opencode hooks (`tool.execute.before`,
`command.execute.before`) actually block the right things.

## When to run

- After modifying `src/gates.js`, `src/command-policy.js`,
  `src/sudo-policy.js`, or `src/workflow-loader.js`
- Before releasing a new version of the plugin
- As a smoke test during plugin development
- As a verification step in CI (see the `self-test` npm script)

## Usage

```bash
npm run self-test
```

Or directly:

```bash
node test/self-test/run.js
```

## Output

Each scenario produces one line. The summary at the end shows
`N/N scenarios PASS in Xms`. Exit code 0 = pass, 1 = fail.

```
═══ sisyphus-gates self-test ═══
Running 15 end-to-end scenarios...

  ✓ [state-missing] blocks destructive command when state.json is missing
  ✓ [state-corrupt] blocks destructive command when state.json is invalid JSON
  ✓ [state-unknown-gates] blocks when gate status is 'unknown'
  ✓ [state-fail-gate] blocks when plan_gate=FAIL even with approval=approved
  ✓ [state-pending-approval] blocks when approval_status=pending
  ✓ [state-approved-destructive] blocks destructive command even in execution phase
  ✓ [state-approved-safe] allows safe read-only command in execution phase
  ✓ [workflow-yaml-missing] blocks when workflow.yaml is missing (even with approved state)
  ✓ [workflow-yaml-invalid] blocks when workflow.yaml is invalid (missing required fields)
  ✓ [catastrophic-rm-rf-root] blocks rm -rf /
  ✓ [catastrophic-dd] blocks dd if=...
  ✓ [catastrophic-mkfs] blocks mkfs.*
  ✓ [catastrophic-force-push] blocks git push --force origin main
  ✓ [sudo-never-allowed] blocks sudo apt update even with approved state
  ✓ [recovery-flow] end-to-end: approved → corrupt → fail-closed → repair → restored

15/15 scenarios PASS in 287ms
```

## Scenarios covered

| Category | Scenarios |
|----------|-----------|
| **State file conditions** | `state-missing`, `state-corrupt`, `state-unknown-gates`, `state-fail-gate`, `state-pending-approval`, `state-approved-destructive`, `state-approved-safe` |
| **Workflow config** | `workflow-yaml-missing`, `workflow-yaml-invalid` |
| **Catastrophic commands** (W1.C `isAlwaysBlocked`) | `catastrophic-rm-rf-root`, `catastrophic-dd`, `catastrophic-mkfs`, `catastrophic-force-push` |
| **Sudo policy** (W1.C) | `sudo-never-allowed` |
| **Recovery flow** (multi-step) | `recovery-flow` |

## Architecture

- `helpers.js` — sandbox creation, `server()` boot, hook simulators,
  default `workflow.yaml` content, assertion helpers.
- `scenarios.js` — 15 scenario functions. Each is async and returns
  `{ name, ok, message, detail? }`.
- `run.js` — entry point. Iterates scenarios, prints colored output,
  sets exit code.

## How it differs from the unit tests

| Aspect | Unit tests (`test/*.test.js`) | Self-test (`test/self-test/`) |
|--------|-------------------------------|-------------------------------|
| **Scope** | Individual exports (`mustBlockExecution`, `shouldBlockTool`, etc.) | Full `server()` and opencode hooks |
| **State** | Mock objects | Real files in sandboxed HOME |
| **Coverage focus** | Edge cases, branch coverage | End-to-end fail-closed behavior |
| **Run time** | ~400ms total | ~300ms total |
| **Test count** | 165 | 15 |
| **Framework** | `node:test` | Plain async/await with custom runner |
| **Output** | TAP (junit-style) | Human-readable colored output |
| **Use case** | Regression safety | Smoke test / verification |

## Extending

To add a new scenario:

1. Write an async function in `scenarios.js` that returns
   `{ name, ok, message, detail? }`.
2. Use the helpers: `createSandbox`, `writeState`, `bootServer`,
   `callToolExecuteBefore`, `assertBlocked`, `assertAllowed`.
3. Add the function to the `SCENARIOS` array.
4. Use a unique `sessionID` (e.g., `"selftest-N"`) — the plugin's
   session state is a module-level Map that persists for the process
   lifetime.

## Recovery

If the self-test fails because the plugin is in a broken state, see
`~/.sisyphus/RECOVERY.md` for restoration procedures. The self-test
itself is one of the verification steps in the recovery runbook.
