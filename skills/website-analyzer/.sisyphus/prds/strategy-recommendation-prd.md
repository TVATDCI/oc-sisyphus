# PRD: Implementation Strategy Recommendation

**Version:** 1.0.0
**Feature target:** website-analyzer v2.0
**Date:** 2026-05-31

## Problem Statement

website-analyzer v1.5.0 produces a thorough DESIGN.md (21+ sections), content-inventory.json, tech-detections.json, and analysis-summary.md. It describes *what* is on a target website — the tech stack, design tokens, animation patterns, state management, routes, and content structure. However, it does not recommend *how* a user should approach cloning or rebuilding that site.

Users with different goals (exact clone vs. design capture vs. content migration) receive the same output. The analyzer already collects all the signals needed to infer the best approach — framework type, 3D complexity, state management depth, route count, CSS architecture sophistication, content volume, and animation complexity — but never synthesizes them into an actionable recommendation.

## Solution Overview

Add a new Section 22 (Implementation Strategy Recommendation) to the end of DESIGN.md, plus a tl;dr strategy line in analysis-summary.md. The recommendation is derived via a scored heuristic engine from signals already collected during existing analysis passes — no new detection passes required.

The system classifies the target into one of 5 strategy categories, reports confidence, estimates effort (Small/Medium/Large), lists risk factors, and suggests a wave ordering for implementation.

## User Stories (Grouped by Vertical Slice)

### Slice 1: Signal Aggregation Module

- **US-1:** As a developer running website-analyzer, I want all relevant signals (framework, 3D, state, routes, CSS complexity, content volume, animations) to be collected into a single normalized data structure, so that the scoring engine can consume them without re-parsing multiple output files.
  - *Acceptance:* A `strategy-signals.json` is written to the output path containing ≥8 signal keys with numeric values, sourced exclusively from existing detection outputs (tech-detections.json, content-inventory.json, DESIGN.md sections 10, 15-19).

### Slice 2: Scored Heuristic Engine

- **US-2:** As a developer, I want the 5-category scoring heuristic applied to the signal vector, so that a recommendation is produced with confidence reporting and deterministic tie-breaking.
  - *Acceptance:* Each of the 5 strategy categories (Full Rebuild, Design Capture, Component Extract, Content Migrate, Static Export) receives a numeric score. The top category is selected as the recommendation. Ties are broken by a deterministic priority order: **Full Rebuild > Design Capture > Component Extract > Content Migrate > Static Export** (rebuild-first — when two strategies tie, the more ambitious one wins). Confidence is computed as `max_score / second_max_score` and reported as HIGH (>2.0), MEDIUM (1.5–2.0), or AMBIGUOUS (<1.5). If all scores are 0 (no signals detected), the result is `{ strategy: null, confidence: "NONE" }` — a valid edge case that must not crash.

- **US-3:** As a developer, I want the scoring engine to use configurable weights, so that the signal-to-strategy mapping can be tuned over time without code changes.
  - *Acceptance:* Weights are defined in a JSON configuration object at `strategy-weights.json` in the output directory. Adding or modifying a weight does not require changing the scoring logic. The config schema is versioned (`schema_version: "1.0"`) for forward compatibility. Adding a new signal column to the matrix does not require restructuring — the scoring engine processes all keys present in the signals vector and ignores unmapped keys.

### Slice 3: Section 22 Generation

- **US-4:** As a user reading DESIGN.md, I want Section 22 to contain a structured implementation strategy recommendation, so that I have an actionable plan for cloning or rebuilding the target site.
  - *Acceptance:* Section 22 appears at the end of DESIGN.md with exactly these subsections:
    - **22.1 Recommended Strategy** — The top-ranked strategy category name + confidence level (HIGH/MEDIUM/AMBIGUOUS/NONE).
    - **22.2 Score Breakdown** — A table showing the numeric score for each of the 5 categories, rounded to 1 decimal place. Sorted descending by score.
    - **22.3 Rationale** — The top 3 signals that most influenced the recommendation, with their signal values and contributions. If confidence is AMBIGUOUS, also list the runner-up strategy and why it's close.
    - **22.4 Effort Estimate** — Small / Medium / Large label with a brief justification referencing total complexity score.
    - **22.5 Risk Factors** — Bullet list of risks specific to the recommended strategy (e.g., "3D scene complexity requires WebGL expertise").
    - **22.6 Implementation Wave Suggestion** — Suggested ordering of build waves, matching the strategy category. E.g., for Full Rebuild: "Wave 1: Framework setup + routing → Wave 2: Design tokens → Wave 3: Components".

### Slice 4: Summary Update & Regression Safety

- **US-5:** As a user reading analysis-summary.md, I want a one-line tl;dr strategy line appended to the executive summary, so that the recommended approach is visible at a glance.
  - *Acceptance:* analysis-summary.md contains a line: `**Strategy:** {category} (confidence: {level})`.

- **US-6:** As a maintainer, I want all existing v1.5.0 tests to pass after adding strategy recommendation, so that existing functionality is not broken.
  - *Acceptance:* All existing validation scripts (validate-day1.js through validate-day5.js) pass with unchanged outputs for targets that do not have the new feature enabled. The feature is additive — existing output formats remain unchanged.

## Design Requirements

- **No UI changes.** This feature is backend-only — it produces text output in DESIGN.md and analysis-summary.md.
- **Additive only.** Existing Phase 1–5 pipeline unchanged. New module runs as a post-processing step after Phase 5.
- **No new detection passes.** All signals come from existing artifacts (tech-detections.json, content-inventory.json, DESIGN.md sections 10, 15–19). The auth/paywall signal (Detection 11) is deferred — marked as optional.
- **Effort triage.** Use Small/Medium/Large labels, not day counts. Calibration against historical data deferred to v2.1.
- **Configurable weights.** The scoring matrix must be externalized to a JSON config (`strategy-weights.json`) for maintainability. Schema versioned (`schema_version: "1.0"`). Forward-compatible — adding a new signal key does not require restructuring.
- **Tie-breaking.** Deterministic priority order: Full Rebuild > Design Capture > Component Extract > Content Migrate > Static Export (rebuild-first — more ambitious strategy wins ties).
- **Zero-signal edge case.** If all signals are 0 (no detection outputs available), result is `{ strategy: null, confidence: "NONE" }` — valid, must not crash. Section 22 shows "Insufficient data for strategy recommendation."

## Hardening Checklist

- [ ] **Content Boundaries defined** — Signal values are normalized to a bounded range (e.g., −3 to +3) before scoring.
- [ ] **Score Normalization** — Strategy scores are relative (recommendation is the max), not absolute. Document the scoring range.
- [ ] **Latency/Performance Contracts** — The strategy pass adds <1s to total analysis time. It runs on already-collected data only.
- [ ] **Error Boundaries** — If any signal is missing (e.g., file not found), the engine logs a warning and scores that signal as 0. It does not crash.
- [ ] **Shared packages first** — If the scoring engine is extracted as a reusable module, it must be created before any app code. (Note: in v1, the engine is embedded in the Phase 4 output module — defer extraction.)
- [ ] **No inline signal access** — All signal reading goes through the `strategy-signals.json` aggregation module. Do NOT read source files directly from the scoring engine.
- [ ] **Mid-build architecture checkpoint** — After signal aggregation is complete and before scoring engine is built, verify the signal schema is stable.

### Auto-Populated (from DESIGN.md Sections 10–14)

*Note: Not applicable — this feature does not involve CSS, accessibility, browser support, or animation changes. The hardening checklist above is manually curated for this backend-only feature.*

## Implementation Decisions

| Module | Interface (small) | Hides (large) |
|--------|------------------|---------------|
| Signal Aggregation | `aggregateSignals(outputPath): SignalVector` | File I/O, parsing logic, normalization |
| Scoring Engine | `scoreStrategies(signals): StrategyResult` | Weight matrix, confidence calc, tie-breaking |
| Section 22 Generator | `generateSection22(result): string` | Markdown formatting, rationale extraction |

## Decision Log

### D1: Scored heuristic over rule-based classification

- **What:** Matrix-based weighted scoring (each signal contributes signed points to each strategy category).
- **Why:** Rule-based systems explode combinatorially with 5 categories × 10 signals. A matrix is compact, interpretable, and trivially tunable.
- **Alternative considered:** Decision trees, LLM-based classification.
- **Why rejected:** Decision trees are brittle to new signals. LLM classification adds cost, latency, and nondeterminism to a mechanical task. The matrix is deterministic, cheap, and explainable.
- **Conditions:** Right for v1.0 as long as the signal set is stable. If signals grow beyond ~20, consider PCA or dimensionality reduction.
- **Escape plan:** If the matrix produces unreasonable recommendations, fall back to rule-based "if SPA then Full Rebuild" defaults. Document the fallback.
- **Validation signals:** Run against 5 known targets (SPA, static HTML, design-heavy, content-heavy, portfolio) and verify the recommendation matches human judgment.
- **Challenged instinct:** People naturally reach for LLM classification because "it's smarter." But for a deterministic mapping of known signals to a fixed category set, a weighted matrix is cheaper, faster, and more auditable.

### D2: Section 22 in DESIGN.md over separate file

- **What:** The recommendation lives as a new section in the existing DESIGN.md.
- **Why:** DESIGN.md is the canonical output document. Adding a section keeps all findings in one place. A separate file would require users to cross-reference.
- **Alternative considered:** Separate `strategy-recommendation.md` file.
- **Why rejected:** Proliferates output files. Users already know to read DESIGN.md. Section 22 is the logical conclusion — "given everything above, here's what to do."
- **Conditions:** Right as long as DESIGN.md remains the primary output artifact. If the recommendation needs its own lifecycle (versioning, approval), extract it.
- **Escape plan:** Add a `--strategy-only` flag that outputs only Section 22 as a standalone file.
- **Validation signals:** Users find the strategy recommendation without being told where to look.
- **Challenged instinct:** "Don't bloat DESIGN.md." But Section 22 is the *conclusion* of the document — it synthesizes all prior sections. That's additive value, not bloat.

### D3: 5 strategy categories

- **What:** Full Rebuild, Design System Capture, Component Extraction, Content Migration, Static Export.
- **Why:** These cover the spectrum from "clone everything" to "download and go." Each maps to a distinct user goal.
- **Alternative considered:** 3 categories (Full, Partial, Minimal). 7 categories (adding "Hybrid" and "Template-based").
- **Why rejected:** 3 is too coarse to be actionable. 7 introduces ambiguous boundaries between categories. 5 hits the sweet spot of distinct and exhaustive.
- **Conditions:** Right for general-purpose web analysis. If the tool is specialized (e.g., only e-commerce), the categories may need adjustment.
- **Escape plan:** Make categories configurable via the weights JSON — users can collapse or expand the category set.
- **Validation signals:** For any target website, exactly one category is clearly the right answer. No target falls into a "garbage" bin.
- **Challenged instinct:** "What about SSG + SPA hybrids?" — The AMBIGUOUS confidence level handles this. The recommendation becomes a conversation starter, not a decree.

### D4: Auth/paywall signal deferred

- **What:** The "auth / paywall" signal referenced in the scoring matrix is not implemented in v1.0. It will be scored as 0 (neutral) until a detection pass is added.
- **Why:** Auth detection requires a separate analysis capability (login form detection, cookie requirements, paywall DOM patterns). Building that is out of scope for the strategy feature.
- **Alternative considered:** Rushing a half-baked auth detection.
- **Why rejected:** A bad auth detection (false positives) would corrupt the recommendation. Better to omit the signal than to misreport it.
- **Conditions:** Deferred to v2.1 or when auth detection is independently implemented.
- **Escape plan:** When auth detection is added, the signal key is already reserved in the matrix. No schema change needed.
- **Validation signals:** Auth-gated sites are still classified correctly (typically Content Migration or Static Export) despite the missing signal.
- **Challenged instinct:** "But auth is important!" — It is, but the absence of auth detection doesn't harm non-auth sites, and for auth sites, the recommendation is still reasonable (likely Content Migration).

### D5: Tie-breaking, threshold boundaries, and config format

- **What:** (a) Rebuild-first tie-breaking priority, (b) numeric score ranges replace qualitative labels, (c) JSON config with versioned schema.
- **Why:**
  - **Tie-breaking:** With 5 strategies and overlapping signal profiles, ties are not just possible but likely. A deterministic priority (rebuild-first) ensures reproducible output and maps to user psychology — when two strategies are equally viable, users prefer the more ambitious option they can scale back from.
  - **Threshold boundaries:** "High SPA score" is ambiguous at implementation time. Defining numeric thresholds (see Scoring Engine Spec below) makes the acceptance criteria testable and prevents implementation drift.
  - **Config format:** JSON with versioned schema ensures forward compatibility. When auth detection is added in v2.1, the existing matrix schema already supports adding a new signal key — no restructuring needed.
- **Alternative considered:** Random tie-breaking, user-prompted tie-breaking, "pick first in array" (which is implicit).
- **Why rejected:** Random breaks reproducibility — test suite would flake. User-prompted breaks the automation goal. "Pick first in array" is nondeterministic across programming languages.
- **Conditions:** Rebuild-first priority is right for v1.0. If user research shows a preference for conservative recommendations, invert the priority (Static Export first).
- **Escape plan:** Make tie-breaking priority order configurable in `strategy-weights.json`. Add a `tie_breaker: "ambitious" | "conservative"` field.
- **Validation signals:** Run all 5 test profiles — verify tied-score scenarios produce deterministic, sensible output. No flakes across 10 consecutive runs.
- **Challenged instinct:** "Just pick the first one alphabetically" — implicit ordering is the laziest kind of tie-breaking. Explicitly documenting the rule forces you to think about what the right behavior is. Rebuild-first is intentional: users can always scale back from an ambitious recommendation.

### Scoring Engine Specification

#### Strategy Score Ranges (Numeric Thresholds)

The scoring engine produces a numeric score for each strategy (range: -30 to +30 based on signal weights). Scores map to categorical labels for display:

| Score Range | Label | Meaning |
|-------------|-------|---------|
| 15 to 30 | **Strong Match** | Dominant strategy — high confidence |
| 5 to 14 | **Moderate Match** | Viable but not clearly dominant |
| -4 to 4 | **Neutral** | Strategy is neither indicated nor contraindicated |
| -14 to -5 | **Weak Match** | Unlikely to be the right approach |
| -30 to -15 | **Strong Mismatch** | Signals strongly discourage this strategy |

These ranges are used for effort estimation and for the Section 22 rationale (describing why certain strategies were rejected).

#### Config Format (`strategy-weights.json`)

```json
{
  "schema_version": "1.0",
  "meta": {
    "description": "Website Analyzer Strategy Scoring Matrix",
    "tie_breaker": "ambitious",
    "priority_order": ["full_rebuild", "design_capture", "component_extract", "content_migrate", "static_export"]
  },
  "signals": [
    { "key": "is_spa", "weights": { "full_rebuild": 3, "design_capture": 0, "component_extract": 1, "content_migrate": 0, "static_export": -2 } },
    { "key": "is_static_html", "weights": { "full_rebuild": -2, "design_capture": 1, "component_extract": 1, "content_migrate": 1, "static_export": 3 } },
    { "key": "has_3d", "weights": { "full_rebuild": 3, "design_capture": 1, "component_extract": 0, "content_migrate": 0, "static_export": -1 } },
    { "key": "has_state_management", "weights": { "full_rebuild": 2, "design_capture": 0, "component_extract": 1, "content_migrate": 0, "static_export": 0 } },
    { "key": "route_count_high", "weights": { "full_rebuild": 1, "design_capture": 0, "component_extract": -1, "content_migrate": 3, "static_export": -1 } },
    { "key": "css_complexity_high", "weights": { "full_rebuild": 1, "design_capture": 3, "component_extract": 1, "content_migrate": 0, "static_export": 0 } },
    { "key": "content_volume_high", "weights": { "full_rebuild": 0, "design_capture": 0, "component_extract": -1, "content_migrate": 3, "static_export": 0 } },
    { "key": "has_animations", "weights": { "full_rebuild": 2, "design_capture": 1, "component_extract": 1, "content_migrate": 0, "static_export": -1 } },
    { "key": "no_animations", "weights": { "full_rebuild": -1, "design_capture": 0, "component_extract": 0, "content_migrate": 0, "static_export": 1 } },
    { "key": "has_auth", "weights": { "full_rebuild": 2, "design_capture": -1, "component_extract": -1, "content_migrate": 0, "static_export": -1 } }
  ]
}
```

Note: `has_auth` is scored as 0 in v1.0 (detection not yet implemented). The key exists in the schema for forward compatibility — no restructuring needed when auth detection arrives.

## Testing Decisions

- **Feedback loops:** Unit tests for each module (SignalAggregation, ScoringEngine, Section22Generator). Integration test with 5 known target profiles.
- **TDD approach:** Red-green-refactor for the scoring engine (deterministic — easy to write tests first).
- **Manual QA checkpoints:**
  1. After Slice 1: verify `strategy-signals.json` against a real analysis output directory
  2. After Slice 2: run the scoring engine against the 5 test profiles and verify results match human judgment
  3. After Slice 3: manually inspect Section 22 formatting in a generated DESIGN.md
- **Test profiles for validation:**
  1. **SPA + 3D + animations** (e.g., sinahatami.vercel.app) → Expect Full Rebuild, HIGH confidence
  2. **Static HTML brochure** (e.g., advanced-team-clone) → Expect Static Export, HIGH confidence
  3. **Design-heavy portfolio** (few routes, rich CSS, animation) → Expect Design Capture, MEDIUM confidence
  4. **Content-rich blog** (many routes, simple CSS) → Expect Content Migration, MEDIUM–HIGH confidence
  5. **Hybrid SPA + content** (Next.js with many routes) → Expect Full Rebuild or Content Migration, AMBIGUOUS confidence

## Out of Scope

- Auth/paywall detection (Detection 11) — deferred to v2.1
- Day-count effort estimates — Small/Medium/Large only for v1
- User feedback loop on recommendations (e.g., "thumbs up/down") — future feature
- Separate strategy recommendation UI or dashboard — Section 22 in DESIGN.md is sufficient
- LLM-based recommendation — the scored heuristic is intentional and sufficient
- Modifying existing Phase 1–5 pipeline — additive post-processing only

## Open Questions / Risks

- **R1: Effort estimate calibration** — Without historical clone data, effort labels (Small/Medium/Large) are heuristic-based. Mitigation: document that effort is a triage, not a commitment. Recalibrate as users report actual effort.
- **R2: Auth/paywall as blind spot** — Sites behind auth gates may be misclassified (e.g., an SPA dashboard behind login might look static to the analyzer). Mitigation: the AMBIGUOUS confidence handles this — users will see multiple viable strategies.
- **R3: Ambiguity is honest but unsatisfying** — Users may be frustrated by "AMBIGUOUS" recommendations. Mitigation: document that ambiguity means multiple strategies are equally viable, which is itself useful information. Include top-3 signals in rationale to guide decision-making.
- **R4: Weight tuning without data** — Initial weights are based on human judgment, not empirical data. Mitigation: design the config to be easy to tune. Add telemetry in a future version.
