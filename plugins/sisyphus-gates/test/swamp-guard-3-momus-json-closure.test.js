/**
 * test/swamp-guard-3-momus-json-closure.test.js — Swamp Club Guard 3
 * (Oracle Gate-2 Upgrade 4a, VERIFY-THEN-CLOSE): documentation-assertion
 * test for the ALREADY-CLOSED case.
 *
 * Verification finding (docs/momus-decision-json-consumption.md): the
 * spine's momus-gate consumption path (SISYPHUS_GATE signed verdicts)
 * already schema-validates and fail-closes (verdict-parser.validateVerdict,
 * review-scanner.mapVerdictToGate null-on-invalid, loadSignedVerdicts HMAC
 * + non-PASS/FAIL → null, cli.js enum validation at signing). The momus
 * Step-4 strict decision JSON is model-facing only — the spine never
 * parses it, so no pass-adjacent prose-scrape channel exists.
 *
 * This test pins BOTH halves:
 *   1. the closure record exists and states the finding (documentation
 *      assertion — the PR-body evidence has a durable in-repo anchor);
 *   2. TRIPWIRE: no spine source consumes the Step-4 JSON field names
 *      (artifact_path / next_action) — anyone introducing spine
 *      consumption of the momus decision JSON must revisit the closure
 *      record and add fail-closed schema validation first.
 *
 * Run: `npm test` or `node --test test/swamp-guard-3-momus-json-closure.test.js`
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, "..", "..", "..");
const CLOSURE_DOC = join(REPO_ROOT, "docs", "momus-decision-json-consumption.md");

// Step-4 JSON markers that ONLY the producer skills/agents may carry.
// `artifact_path`, `fix_then_recheck`, and `user_decision` are unique to
// the momus Step-4 decision-JSON contract. (`next_action` alone is NOT a
// marker: workflow.yaml's phase schema has its own next_action field —
// collision-verified; the enum values below are unique.) If these appear
// in spine source, someone started consuming the momus decision JSON
// there — the closure record must be revisited.
const STEP4_FIELD_NAMES = ["artifact_path", "fix_then_recheck", "user_decision"];

// Spine source = the code that runs inside the opencode harness.
// Producers (skills/, agents/, commands/ markdown) and the deliberately
// buggy reference plugin are out of scope, as are tests and node_modules.
const SPINE_DIRS = [
  join(REPO_ROOT, "plugins", "sisyphus-gates", "src"),
  join(REPO_ROOT, "plugins", "model-fallback", "src"),
  join(REPO_ROOT, "scripts"),
];
const SPINE_FILES = [
  join(REPO_ROOT, "plugins", "sisyphus-gates", "cli.js"),
  join(REPO_ROOT, "plugins", "sisyphus-gates.js"),
  join(REPO_ROOT, "plugins", "model-fallback.js"),
];
const SPINE_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".py", ".sh"]);

function listSpineSources() {
  const files = [...SPINE_FILES];
  for (const dir of SPINE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) continue;
      const dot = entry.name.lastIndexOf(".");
      if (dot === -1 || !SPINE_EXTENSIONS.has(entry.name.slice(dot))) continue;
      files.push(p);
    }
  }
  return files.filter((f) => existsSync(f) && statSync(f).isFile());
}

describe("Guard 3 — momus decision-JSON consumption closure (documented, gap=zero)", () => {
  test("closure record exists and states the verified finding", () => {
    assert.ok(existsSync(CLOSURE_DOC), `missing ${CLOSURE_DOC}`);
    const doc = readFileSync(CLOSURE_DOC, "utf-8");
    assert.match(doc, /gap = zero \(case CLOSED at verification; no code needed\)/);
    assert.match(doc, /model-facing, never spine-parsed/);
    assert.match(doc, /already schema-validated, fail-closed/i);
    // file-line evidence anchors must be present in the record
    assert.match(doc, /verdict-parser\.js/);
    assert.match(doc, /validateVerdict/);
    assert.match(doc, /loadSignedVerdicts/);
    assert.match(doc, /cli\.js.*L208-212/s);
  });

  test("TRIPWIRE: no spine source parses the momus Step-4 JSON field names", () => {
    const offenders = [];
    for (const file of listSpineSources()) {
      const text = readFileSync(file, "utf-8");
      for (const field of STEP4_FIELD_NAMES) {
        if (text.includes(field)) offenders.push(`${file}: ${field}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "Spine source started consuming the momus Step-4 decision JSON. Per " +
        "docs/momus-decision-json-consumption.md, that consumption MUST add " +
        "fail-closed schema validation (parse failure = fail-closed re-invoke, " +
        "never best-effort interpretation) and update the closure record first.",
    );
  });
});
