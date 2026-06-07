# Plan: Implementation Strategy Recommendation

**Version:** 1.0.0
**PRD:** `.sisyphus/prds/strategy-recommendation-prd.md`
**Issues:** brain-9ol, brain-c9t, brain-ok2, brain-d15
**Date:** 2026-05-31

## TL;DR

Add Section 22 (Implementation Strategy Recommendation) to DESIGN.md — a scored heuristic that recommends one of 5 clone strategies based on signals already collected by the analyzer. No new detection passes required. Plus a tl;dr line in analysis-summary.md.

**Deliverables:**
- [x] `strategy-signals.json` — normalized signal vector from existing outputs
- [x] `strategy-weights.json` — configurable scoring matrix (versioned schema)
- [x] Section 22 in DESIGN.md — 6 subsections (recommendation, breakdown, rationale, effort, risks, wave ordering)
- [x] tl;dr strategy line in `analysis-summary.md`
- [x] All existing v1.5.0 regression checks pass

**Effort estimate:** Medium — 4 vertical slices, additive to existing pipeline, no new detection passes.

**Risk level:** Low — deterministic scoring, no infrastructure changes, additive only.

---

## Preflight: Known Pitfalls

| Technology | Pitfall | Prevention | Checked In |
|---|---|---|---|
| JSON config schema | Schema drift between v1.0 and forward-compatible signal keys | Versioned schema field + validation at load time | Slice 2 |
| Zero-signal edge case | All signal values are 0 → crash or garbage output | Scored as `null` strategy + `NONE` confidence. Documented test case. | Slice 2 |
| Tied scores | Non-deterministic output across reads | Rebuild-first priority order documented in code + tests | Slice 2 |
| Missing analysis outputs | File not found → crash | Error boundary: log warning, score missing signals as 0 | Slice 1 |

---

## Wave 1: Core Engine (Slices 1–2)

### Task 1.1: Strategy Signal Aggregation (brain-9ol)

**What:** Read existing analysis outputs (tech-detections.json, content-inventory.json, DESIGN.md sections 10, 15-19) and produce a normalized signal vector.

**Output:** `strategy-signals.json` written to output path.

**Verify:**
- [x] `strategy-signals.json` contains ≥8 signal keys with numeric values in range -3 to +3
- [x] Signal source mapping documented (which key maps to which source file/section)
- [x] Missing source files handled: warning logged, signal scored as 0
- [x] All existing v1.5.0 outputs unchanged after module runs

### Task 1.2: Scored Heuristic Engine (brain-c9t)

**What:** Load `strategy-signals.json` and `strategy-weights.json`, apply weighted matrix, compute confidence, apply tie-breaking, produce `StrategyResult`.

**Output:** `StrategyResult` object with scores, confidence, top strategy.

**Verify:**
- [x] Each of 5 categories receives a numeric score
- [x] `strategy-weights.json` schema validated on load (version field required)
- [x] Tie-breaking: rebuild-first priority (Full Rebuild > Design Capture > Component Extract > Content Migrate > Static Export)
- [x] Confidence: HIGH (>2.0), MEDIUM (1.5–2.0), AMBIGUOUS (<1.5), NONE (all zero)
- [x] Zero-signal edge case: `{ strategy: null, confidence: "NONE" }` — no crash
- [x] Deterministic across 10 consecutive runs with same input
- [x] Unit tests: score confidence, tie-breaking, zero-signal, weight loading

**Blocked by:** Task 1.1

---

## Wave 2: Output Generation (Slices 3–4)

### Task 2.1: Section 22 Generation (brain-ok2)

**What:** Generate Section 22 of DESIGN.md with the strategy recommendation.

**Output:** DESIGN.md with Section 22 appended.

**Verify:**
- [x] Section 22 appears at end of DESIGN.md
- [x] 22.1 Recommended Strategy: category + confidence level (or "Insufficient data")
- [x] 22.2 Score Breakdown: table of 5 scores, descending, rounded to 1 decimal
- [x] 22.3 Rationale: top 3 contributing signals with values. AMBIGUOUS → include runner-up
- [x] 22.4 Effort Estimate: Small/Medium/Large with justification
- [x] 22.5 Risk Factors: bullet list specific to strategy
- [x] 22.6 Implementation Wave Suggestion: wave ordering matching the strategy

**Blocked by:** Task 1.2

### Task 2.2: Summary Update & Regression Safety (brain-d15)

**What:** Append tl;dr strategy line to analysis-summary.md. Run full regression suite.

**Output:** Updated `analysis-summary.md`. All validation scripts passing.

**Verify:**
- [x] `analysis-summary.md` contains `**Strategy:** {category} (confidence: {level})`
- [x] validate-day1.js through validate-day5.js pass with unchanged outputs
- [x] Strategy feature gracefully skipped when no detection outputs exist
- [x] Manual inspection: DESIGN.md + analysis-summary.md look correct together

**Blocked by:** Task 2.1

---

## Wave 3: Integration + Final Verification

### Task 3.1: Integration + Final Verification (blocked by all above)

**What:** Wire up all modules, run full test suite, verify PRD acceptance criteria.

**Output:** Full integration test run.

**Verify:**
- [x] All PRD acceptance criteria met
- [x] All 6 user stories verified against test profiles:
  - Test 1: sinahatami.vercel.app → Full Rebuild, HIGH confidence
  - Test 2: advanced-team-clone → Static Export, HIGH confidence
  - Test 3: design portfolio → Design Capture, MEDIUM confidence
  - Test 4: content blog → Content Migration, MEDIUM–HIGH
  - Test 5: hybrid SPA+content → AMBIGUOUS confidence
- [x] All validation scripts pass (validate-day1.js through validate-day5.js)
- [x] No debug code or TODO markers left
- [x] Edge case: zero-signal produces "Insufficient data" — no crash

**Blocked by:** Tasks 2.1, 2.2

---

## Completion Summary
**Completed:** 2026-05-31
**Outcome:** Implementation Strategy Recommendation feature fully built and tested. All 3 waves complete, 97/97 tests passing, 5 test profiles verified.

**Deliverables:**
- `strategy/signal-aggregator.js` — reads existing analysis outputs → normalized signal vector
- `strategy/scoring-engine.js` — weighted matrix scoring with configurable weights, confidence, tie-breaking
- `strategy/section-22-generator.js` — generates 6-subsection Section 22 in DESIGN.md
- `strategy/strategy-weights.json` — versioned schema (v1.0), forward-compatible
- `strategy/test-strategy.js` (27 tests), `strategy/test-wave2.js` (45 tests), `strategy/test-integration.js` (25 tests)

**Bugs fixed during integration:**
- Zero-signal bias: no_animations incorrectly defaulted to 1 when Section 15 absent
- Framework inference bias: is_static_html incorrectly defaulted to 1 when no framework detected

**Deferred:**
- Auth/paywall signal detection (Detection 11) — deferred to v2.1
- Day-count effort estimates — Small/Medium/Large triage only for v1.0
- Weight calibration from production data — deferred to v2.1
