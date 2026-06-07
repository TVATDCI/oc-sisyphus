#!/usr/bin/env node
/**
 * test/self-test/run.js — End-to-end self-test runner for sisyphus-gates.
 *
 * Boots the plugin's `server()` in sandboxed environments with synthetic
 * state corruption, and verifies that the plugin's opencode hooks
 * (`tool.execute.before`, `command.execute.before`) actually block the
 * right things.
 *
 * Use this to verify the plugin is enforcing gates correctly, especially
 * after modifications to src/gates.js, src/command-policy.js,
 * src/sudo-policy.js, or src/workflow-loader.js.
 *
 * Usage:
 *   npm run self-test
 *   node test/self-test/run.js
 *
 * Output:
 *   ✓ [state-missing] blocks destructive command when state.json is missing
 *   ✓ [state-corrupt] blocks destructive command when state.json is invalid JSON
 *   ...
 *   15/15 scenarios PASS in 287ms
 *
 * Exit code:
 *   0 = all scenarios passed
 *   1 = at least one scenario failed
 */

import { SCENARIOS } from "./scenarios.js";

const COLOR_PASS = "\x1b[32m";  // green
const COLOR_FAIL = "\x1b[31m";  // red
const COLOR_INFO = "\x1b[36m";  // cyan
const COLOR_OFF = "\x1b[0m";    // reset

async function main() {
  const start = Date.now();
  console.log(`${COLOR_INFO}═══ sisyphus-gates self-test ═══${COLOR_OFF}`);
  console.log(`Running ${SCENARIOS.length} end-to-end scenarios...\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const scenario of SCENARIOS) {
    try {
      const result = await scenario();
      if (result.ok) {
        console.log(`  ${COLOR_PASS}✓${COLOR_OFF} [${result.name}] ${result.message}`);
        passed++;
      } else {
        console.log(`  ${COLOR_FAIL}✗${COLOR_OFF} [${result.name}] ${result.message}`);
        if (result.detail) {
          console.log(`      ${COLOR_FAIL}↳ ${result.detail}${COLOR_OFF}`);
        }
        failures.push(result);
        failed++;
      }
    } catch (err) {
      console.log(`  ${COLOR_FAIL}✗${COLOR_OFF} [unknown] scenario threw an exception`);
      console.log(`      ${COLOR_FAIL}↳ ${err.message}${COLOR_OFF}`);
      console.log(`      ${err.stack?.split("\n").slice(0, 3).join("\n      ")}`);
      failed++;
    }
  }

  const ms = Date.now() - start;
  console.log("");
  if (failed === 0) {
    console.log(
      `${COLOR_PASS}${passed}/${passed + failed} scenarios PASS in ${ms}ms${COLOR_OFF}`
    );
  } else {
    console.log(
      `${COLOR_FAIL}${passed}/${passed + failed} scenarios PASS (${failed} FAILED) in ${ms}ms${COLOR_OFF}`
    );
    console.log("\nFailing scenarios:");
    for (const f of failures) {
      console.log(`  - [${f.name}] ${f.message}`);
      if (f.detail) console.log(`      ${f.detail}`);
    }
  }

  process.exit(failed === 0 ? 0 : 1);
}

main();
