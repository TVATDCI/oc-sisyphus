# Discovery Brief: Implementation Strategy Recommendation

**Date:** 2026-05-31
**Discovery session:** 3 questions
**Feature target:** website-analyzer v2.0

## Context

- **Current state:** website-analyzer v1.5.0 produces DESIGN.md (21+ sections), content-inventory.json, tech-detections.json, analysis-summary.md. It describes *what* is on a site but does not recommend *how* to approach cloning it.
- **Pain point / opportunity:** Users with different goals (exact clone, design capture, content migration) get the same output. The analyzer has all the signals to infer intent but doesn't synthesize them into a actionable recommendation.
- **Existing work:** None — greenfield feature.
- **Constraints:** Must use existing detection signals only (no new Phase 1/2 passes). Strategy recommendation is additive — must not break existing output.

## Work Objectives

1. **Signal extraction pass** — Collect relevant signals into a single data structure: framework type, 3D presence, state management, route count, CSS complexity score, content volume, animation complexity
2. **Scored heuristic engine** — Implement 5-category classification with per-signal scoring and confidence reporting
3. **Section 22 generation** — Write Section 22 (Implementation Strategy) into DESIGN.md with recommendation, rationale, effort estimate, risk factors, and wave ordering suggestion
4. **analysis-summary.md update** — Add tl;dr strategy line to the executive summary

## Strategy Categories (5)

| # | Category | Description |
|---|----------|-------------|
| 1 | **Full Rebuild** | Exact framework-level clone (SPA → React/Next), preserves 3D, state, routing, animations |
| 2 | **Design System Capture** | Extract design tokens, colors, typography, component patterns — rebuild with own stack |
| 3 | **Component Extraction** | Extract specific UI components (hero, cards, nav) without replicating the full site |
| 4 | **Content Migration** | Migrate text content, copy, articles — design is secondary |
| 5 | **Static Export** | Simple brochure site, download HTML/CSS/JS with minimal processing |

## Scored Heuristic Design

Each signal contributes a signed weight to each strategy category. Highest score wins.

| Signal | Source | Full Rebuild | Design Capture | Component Extract | Content Migrate | Static Export |
|--------|--------|:---:|:---:|:---:|:---:|:---:|
| SPA framework | tech-detections | +3 | 0 | +1 | 0 | -2 |
| Static HTML | tech-detections | -2 | +1 | +1 | +1 | +3 |
| 3D / WebGL | Section 16 | +3 | +1 | 0 | 0 | -1 |
| State management | Section 17 | +2 | 0 | +1 | 0 | 0 |
| Routes >5 | Section 18 | +1 | 0 | -1 | +3 | -1 |
| CSS tokens heavy | Section 10 | +1 | +3 | +1 | 0 | 0 |
| Content >10 sections | content-inventory | 0 | 0 | -1 | +3 | 0 |
| GSAP / Framer Motion | Section 15 | +2 | +1 | +1 | 0 | -1 |
| Animations none | Section 15 | -1 | 0 | 0 | 0 | +1 |
| Auth / paywall | Detection 11 (new) | +2 | -1 | -1 | 0 | -1 |

**Confidence:** `max_score / second_max_score`. If ratio > 2.0 → HIGH confidence. If ratio 1.5-2.0 → MEDIUM. If < 1.5 → AMBIGUOUS (multiple viable strategies).

**Effort estimate:** Derived from total complexity score (sum of absolute signal values).

## Verification

- [ ] Section 22 present in DESIGN.md after analysis
- [ ] Recommendation matches known signals (e.g., static HTML site → Static Export)
- [ ] Confidence is HIGH for unambiguous targets, AMBIGUOUS for mixed-signal targets
- [ ] Effort estimate correlates with content volume + tech complexity
- [ ] analysis-summary.md contains tl;dr strategy line
- [ ] All existing v1.5.0 regression checks still pass
- [ ] No new detection passes required — uses existing signal data only

## First Execution Wave

- [ ] **Signal aggregation pass** — Create a module that reads all existing outputs (tech-detections, sections 15-19, content-inventory) and produces a normalized signal vector
- [ ] **Scoring engine** — Implement the heuristic with configurable weights
- [ ] **Section 22 template** — DESIGN.md template update for strategy recommendation + effort estimate
- [ ] **analysis-summary update** — Add tl;dr strategy line

## Open Questions / Risks

- **Auth detection (Detection 11)** — Not yet implemented. The heuristic table references it but it doesn't exist. Can either: (a) skip auth as a signal for v1, or (b) add a lightweight auth detection pass. Flagged as optional for first wave.
- **Effort estimate calibration** — Without historical clone data, effort estimates will be rough. Recommend "small/medium/large" triage rather than day counts for v1.

## Decisions Made

- D1: Section 22 in DESIGN.md (not separate file)
- D2: 5 strategy categories (Full Rebuild, Design Capture, Component Extract, Content Migrate, Static Export)
- D3: Scored heuristic (not rule-based) with confidence ratio
