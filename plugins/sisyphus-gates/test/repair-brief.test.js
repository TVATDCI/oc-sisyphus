/**
 * repair-brief.test.js — TDD tests for src/repair-brief.js (G1).
 *
 * RED → GREEN → REFACTOR: write tests first, see them fail, then implement.
 * Test count target: 6-8 (per g1-g3-g5-implementation.md §6 Guard spec).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import {
  buildRepairBrief,
  serializeBrief,
  parseRepairBrief,
  writeRepairBrief,
  readLatestRepairBrief,
  maybeEmitRepairBrief,
  BRIEF_SCHEMA_VERSION,
} from "../src/repair-brief.js";

function withTempRepairs(fn) {
  const originalHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "repair-brief-test-"));
  process.env.HOME = home;
  try {
    return fn(home);
  } finally {
    process.env.HOME = originalHome;
    try { rmSync(home, { recursive: true, force: true }); } catch {}
  }
}

function mockState(overrides = {}) {
  return {
    planId: "rotating-x",
    prdGateStatus: "FAIL",
    planGateStatus: "PASS",
    ...overrides,
  };
}

function mockVerdict(overrides = {}) {
  return {
    kind: "prd",
    decision: "FAIL",
    blockers: ["B1 missing auth spec", "B2 unbounded retry"],
    timestamp: "2026-06-06T12:00:00.000Z",
    reviewer: "momus-prd-reviewer",
    ...overrides,
  };
}

describe("G1 — repair-brief: buildRepairBrief", () => {
  test("returns object with schema_version, plan_id, prior_verdict, status, created_at", () => {
    const brief = buildRepairBrief(mockState(), mockVerdict());
    assert.equal(brief.schema_version, BRIEF_SCHEMA_VERSION);
    assert.equal(brief.plan_id, "rotating-x");
    assert.equal(brief.prior_verdict.kind, "prd");
    assert.equal(brief.prior_verdict.decision, "FAIL");
    assert.deepEqual(brief.prior_verdict.blockers, [
      "B1 missing auth spec",
      "B2 unbounded retry",
    ]);
    assert.equal(brief.prior_verdict.reviewer, "momus-prd-reviewer");
    assert.equal(brief.status, "open");
    assert.equal(brief.iterations, 1);
    assert.ok(typeof brief.created_at === "string" && brief.created_at.length > 0);
  });

  test("returns null when state or verdict is missing", () => {
    assert.equal(buildRepairBrief(null, mockVerdict()), null);
    assert.equal(buildRepairBrief(mockState(), null), null);
  });
});

describe("G1 — repair-brief: serializeBrief / parseRepairBrief round-trip", () => {
  test("round-trips a brief through YAML", () => {
    const original = buildRepairBrief(mockState(), mockVerdict());
    const text = serializeBrief(original);
    const parsed = parseRepairBrief(text);
    assert.equal(parsed.schema_version, BRIEF_SCHEMA_VERSION);
    assert.equal(parsed.plan_id, "rotating-x");
    assert.deepEqual(parsed.prior_verdict.blockers, original.prior_verdict.blockers);
    assert.equal(parsed.status, "open");
  });

  test("rejects wrong schema_version", () => {
    const bad = yaml.dump({ schema_version: "2.0.0", plan_id: "x" });
    assert.throws(() => parseRepairBrief(bad), /unsupported schema_version/);
  });
});

describe("G1 — repair-brief: writeRepairBrief", () => {
  test("writes YAML to ~/.sisyphus/repairs/<planId>-<ts>.yaml", () => {
    withTempRepairs((home) => {
      const state = mockState();
      const path = writeRepairBrief(state, mockVerdict());
      assert.ok(path && existsSync(path));
      const content = readFileSync(path, "utf-8");
      assert.match(content, /schema_version: ?['"]?1\.0\.0['"]?/);
      assert.match(content, /plan_id: rotating-x/);
      assert.equal(state.repairBriefPath, path);
    });
  });

  test("is idempotent: same (planId, timestamp) returns same path, no rewrite", () => {
    withTempRepairs(() => {
      const state = mockState();
      const verdict = mockVerdict();
      const path1 = writeRepairBrief(state, verdict);
      const mtime1 = readFileSync(path1, "utf-8");
      const path2 = writeRepairBrief(state, verdict);
      assert.equal(path1, path2);
      const mtime2 = readFileSync(path2, "utf-8");
      assert.equal(mtime1, mtime2);
    });
  });

  test("returns null when state.planId or verdict.timestamp is missing", () => {
    withTempRepairs(() => {
      assert.equal(writeRepairBrief(mockState({ planId: null }), mockVerdict()), null);
      assert.equal(writeRepairBrief(mockState(), mockVerdict({ timestamp: undefined })), null);
    });
  });
});

describe("G1 — repair-brief: readLatestRepairBrief", () => {
  test("returns null when no briefs exist", () => {
    withTempRepairs(() => {
      assert.equal(readLatestRepairBrief("rotating-x"), null);
    });
  });

  test("returns the most recent brief for a planId", () => {
    withTempRepairs(() => {
      const state = mockState();
      writeRepairBrief(state, mockVerdict({ timestamp: "2026-06-06T10:00:00.000Z" }));
      writeRepairBrief(state, mockVerdict({ timestamp: "2026-06-06T11:00:00.000Z" }));
      writeRepairBrief(state, mockVerdict({ timestamp: "2026-06-06T09:00:00.000Z" }));
      const latest = readLatestRepairBrief("rotating-x");
      assert.ok(latest);
      assert.equal(latest.prior_verdict.timestamp, "2026-06-06T11:00:00.000Z");
    });
  });

  test("returns null for unknown planId", () => {
    withTempRepairs(() => {
      const state = mockState();
      writeRepairBrief(state, mockVerdict());
      assert.equal(readLatestRepairBrief("nonexistent-plan"), null);
    });
  });
});

describe("G1 — repair-brief: maybeEmitRepairBrief", () => {
  test("writes a brief when state has FAIL gate and verdict is FAIL", () => {
    withTempRepairs(() => {
      const state = mockState({ prdGateStatus: "FAIL" });
      const path = maybeEmitRepairBrief(state, mockVerdict());
      assert.ok(path && existsSync(path));
    });
  });

  test("no-op when both gates are PASS", () => {
    withTempRepairs(() => {
      const state = mockState({ prdGateStatus: "PASS", planGateStatus: "PASS" });
      const path = maybeEmitRepairBrief(state, mockVerdict());
      assert.equal(path, null);
    });
  });

  test("no-op when verdict is not FAIL", () => {
    withTempRepairs(() => {
      const state = mockState({ prdGateStatus: "FAIL" });
      const path = maybeEmitRepairBrief(state, mockVerdict({ decision: "PASS" }));
      assert.equal(path, null);
    });
  });

  test("no-op when latestVerdict is missing", () => {
    withTempRepairs(() => {
      const state = mockState({ prdGateStatus: "FAIL" });
      const path = maybeEmitRepairBrief(state, null);
      assert.equal(path, null);
    });
  });
});
