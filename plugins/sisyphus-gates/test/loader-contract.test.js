/**
 * test/loader-contract.test.js — Track 2 loader contract smoke test.
 *
 * Verifies that the dist/ entrypoint (the one shipped to fresh clones)
 * re-exports `server` as a function compatible with the opencode plugin
 * loader. If dist/ ever drifts from src/plugin.js (e.g., someone replaces
 * the re-export with a non-function or drops the export entirely), this
 * test fails before the loader breaks at runtime.
 *
 * Test framework: node:test (built-in)
 * Assertions:    node:assert/strict
 * Run: `npm test` or `node --test test/loader-contract.test.js`
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { server } from "../dist/index.js";

test("loader contract: dist entrypoint exports server function", () => {
  assert.strictEqual(
    typeof server,
    "function",
    "dist/index.js must export a function named 'server' (opencode plugin contract)"
  );
});
