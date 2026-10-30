/**
 * test/trust-root-paths-gate-key-env.test.js — Layer-0 hardening (brain-xrtj)
 *
 * Captain-ruled companion to the curated shell allowlist in
 * agents/sisyphus.md: the allowlist makes cat/head/tail/grep/rg/jq no-ask
 * at the opencode layer, so the verdict-signing key and .env-class files
 * must be hard-blocked at the gate layer on EVERY tool surface --
 * mechanism, not model judgment.
 *
 * Adds to the unconditional trust-root denylist:
 *   - sisyphus-gate-key: read AND write blocked
 *   - .env-class files: read blocked (.env.example stays readable)
 *   - .env writes intentionally stay at the ask layer (pinned below)
 *
 * Path-agnostic fixtures per house style: these patterns are pure
 * path-shape regexes; no realpath-resolvable fixtures required.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import {
  matchTrustRootRead,
  matchTrustRootWrite,
} from "../src/trust-root-paths.js";

// ─── verdict-signing key: read + write blocked ────────────────────────────

test("L0: matchTrustRootRead blocks the verdict-signing key", () => {
  const result = matchTrustRootRead({
    filePath: `${homedir()}/.local/share/sisyphus-gate-key`,
  });
  assert.notEqual(result, null, "key read must be blocked");
  assert.equal(result.includes("sisyphus-gate-key"), true);
});

test("L0: key read blocked via 'path' arg key and any prefix dir", () => {
  assert.notEqual(
    matchTrustRootRead({ path: "/home/anyone/.local/share/sisyphus-gate-key" }),
    null
  );
});

test("L0: matchTrustRootWrite blocks the verdict-signing key", () => {
  const result = matchTrustRootWrite({
    filePath: `${homedir()}/.local/share/sisyphus-gate-key`,
  });
  assert.notEqual(result, null, "key write must be blocked (forge vector)");
});

test("L0: near-miss key names are NOT blocked", () => {
  assert.equal(
    matchTrustRootRead({
      filePath: `${homedir()}/.local/share/sisyphus-gate-keys`,
    }),
    null
  );
  assert.equal(
    matchTrustRootRead({
      filePath: `${homedir()}/.local/share/sisyphus-gate-key.bak`,
    }),
    null
  );
});

// ─── .env-class: read blocked, .env.example exempt ────────────────────────

test("L0: read of home .env is blocked", () => {
  assert.notEqual(matchTrustRootRead({ filePath: `${homedir()}/.env` }), null);
});

test("L0: read of project .env is blocked", () => {
  assert.notEqual(matchTrustRootRead({ filePath: "/srv/app/.env" }), null);
});

test("L0: read of basename-ending-.env files is blocked", () => {
  assert.notEqual(
    matchTrustRootRead({ filePath: "/srv/app/production.env" }),
    null
  );
});

test("L0: read of .env.local is blocked", () => {
  assert.notEqual(matchTrustRootRead({ filePath: "/srv/app/.env.local" }), null);
});

test("L0: .env.example stays readable (parity with opencode default)", () => {
  assert.equal(matchTrustRootRead({ filePath: "/srv/app/.env.example" }), null);
});

test("L0: non-env names that merely contain 'env' are NOT blocked", () => {
  assert.equal(matchTrustRootRead({ filePath: "/srv/app/envelope.txt" }), null);
  assert.equal(
    matchTrustRootRead({ filePath: "/srv/app/environment.yml" }),
    null
  );
});

// ─── doctrine pin: .env writes stay at the ask layer ──────────────────────

test("L0: .env writes are intentionally NOT Layer-0 blocked (ask-layer surface)", () => {
  assert.equal(matchTrustRootWrite({ filePath: "/srv/app/.env" }), null);
});

// ─── regressions: existing Layer-0 behavior unchanged ─────────────────────

test("regression: state.json write still blocked", () => {
  assert.notEqual(
    matchTrustRootWrite({ filePath: `${homedir()}/.sisyphus/state.json` }),
    null
  );
});

test("regression: plugin source read still blocked", () => {
  assert.notEqual(
    matchTrustRootRead({
      filePath: `${homedir()}/.config/opencode/plugins/sisyphus-gates/src/v2.js`,
    }),
    null
  );
});

test("regression: opencode.json read still NOT blocked", () => {
  assert.equal(
    matchTrustRootRead({
      filePath: `${homedir()}/.config/opencode/opencode.json`,
    }),
    null
  );
});
