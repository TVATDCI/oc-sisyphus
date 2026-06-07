# Wave 1 Evidence: strategy-recommendation

## Model Used
Executing with kimi-k2.6 via orchestration

## Task 1.1: Signal Aggregation (brain-9ol)

### Implementation
- Created `strategy/signal-aggregator.js`
- Reads existing analysis outputs: tech-detections.json, content-inventory.json, DESIGN.md sections 10, 15-19
- Produces normalized signal vector with ≥8 keys in range [-3, +3]
- Writes strategy-signals.json to output directory

### Test Results
```
Test Suite 1: Signal Aggregation
  PASS: Contains at least 8 signal keys
  PASS: Detects SPA framework
  PASS: Static HTML is inverse of SPA
  PASS: Detects 3D from tech stack
  PASS: Detects state management
  PASS: Detects high route count
  PASS: Detects high CSS complexity
  PASS: Detects high content volume
  PASS: Detects animations
  PASS: No animations is inverse
  PASS: Auth signal is 0 (deferred)
  PASS: strategy-signals.json is written

Test Suite 2: Missing Files Handling
  PASS: Defaults is_spa to 0 when files missing
  PASS: Logs warnings for missing files
  PASS: Does not crash on missing files
```

### Verification
- [x] strategy-signals.json contains ≥8 signal keys with numeric values in range -3 to +3
- [x] Signal source mapping documented in _meta.source_mapping
- [x] Missing source files handled: warning logged, signal scored as 0
- [x] All existing v1.5.0 validation scripts pass (validate-day2 through validate-day5)

## Task 1.2: Scored Heuristic Engine (brain-c9t)

### Implementation
- Created `strategy/scoring-engine.js`
- Created `strategy/strategy-weights.json` (configurable, versioned schema)
- Loads strategy-signals.json and strategy-weights.json
- Applies weighted matrix scoring
- Computes confidence (HIGH >2.0, MEDIUM 1.5-2.0, AMBIGUOUS <1.5, NONE all zero)
- Implements rebuild-first tie-breaking

### Test Results
```
Test Suite 3: Scoring Engine
  PASS: All 5 categories receive a score
  PASS: Top strategy is selected
  PASS: Confidence is computed
  PASS: Rationale contains top contributing signals
  PASS: Effort estimate is computed

Test Suite 4: Tie-Breaking
  PASS: Tie broken with rebuild-first priority

Test Suite 5: Zero-Signal Edge Case
  PASS: Zero signals → null strategy
  PASS: Zero signals → NONE confidence

Test Suite 6: Determinism
  PASS: Deterministic across 10 consecutive runs

Test Suite 7: Confidence Thresholds
  PASS: Strong signals produce HIGH confidence

Test Suite 8: Weight Config Loading
  PASS: Custom weights are applied

Test Suite 9: Schema Version Validation
  PASS: Error mentions schema_version
```

### Verification
- [x] Each of 5 categories receives a numeric score
- [x] strategy-weights.json schema validated on load (version field required)
- [x] Tie-breaking: rebuild-first priority (Full Rebuild > Design Capture > Component Extract > Content Migrate > Static Export)
- [x] Confidence: HIGH (>2.0), MEDIUM (1.5–2.0), AMBIGUOUS (<1.5), NONE (all zero)
- [x] Zero-signal edge case: { strategy: null, confidence: "NONE" } — no crash
- [x] Deterministic across 10 consecutive runs with same input
- [x] Unit tests: score confidence, tie-breaking, zero-signal, weight loading

## Build / Lint
- No build system in project (pure Node.js scripts)
- No lint errors introduced
- All existing validation scripts pass (Day 2-5)

## PRD Compliance Checklist
- [x] Additive only — new module in `strategy/`, no existing files modified
- [x] No new detection passes — reads existing outputs only
- [x] Rebuild-first tie-breaking implemented
- [x] Scored heuristic (not LLM) — deterministic weighted matrix
- [x] Configurable weights externalized to strategy-weights.json
- [x] Schema versioned (schema_version: "1.0")
- [x] Forward-compatible — new signal keys ignored if unmapped

## Files Created
- `strategy/signal-aggregator.js`
- `strategy/scoring-engine.js`
- `strategy/strategy-weights.json`
- `strategy/index.js`
- `strategy/test-strategy.js`

## Wiring Check
- `strategy/index.js` exports both modules
- `strategy/test-strategy.js` imports from `./signal-aggregator` and `./scoring-engine`
- No orphaned files — all have clear consumers (test script, future integration)

## Regression Check
- validate-day1.js: FAILED (pre-existing — Section 17 generation with mock data)
- validate-day2.js: PASSED
- validate-day3.js: PASSED
- validate-day4.js: PASSED
- validate-day5.js: PASSED

Note: validate-day1.js failure is pre-existing and unrelated to strategy modules.
