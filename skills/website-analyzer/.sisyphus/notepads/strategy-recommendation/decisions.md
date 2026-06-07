# Decisions Log

## 2026-05-31: Scored heuristic over rule-based classification

- **Decision:** Matrix-based weighted scoring (each signal contributes signed points to each strategy category).
- **Reason:** Rule-based systems explode combinatorially with 5 categories × 10 signals. A matrix is compact, interpretable, and trivially tunable.
- **Alternative considered:** Decision trees, LLM-based classification.
- **Why alternative was rejected:** Decision trees are brittle to new signals. LLM classification adds cost, latency, and nondeterminism to a mechanical task. The matrix is deterministic, cheap, and explainable.
- **Our team should know:** Right for v1.0 as long as signal set is stable. If signals grow beyond ~20, consider PCA or dimensionality reduction. If matrix produces unreasonable recommendations, fall back to rule-based "if SPA then Full Rebuild" defaults.
- **Made by:** Sisyphus
- **Date:** 2026-05-31

## 2026-05-31: Section 22 in DESIGN.md over separate file

- **Decision:** The recommendation lives as a new section in the existing DESIGN.md.
- **Reason:** DESIGN.md is the canonical output document. Adding a section keeps all findings in one place. A separate file would require users to cross-reference.
- **Alternative considered:** Separate `strategy-recommendation.md` file.
- **Why alternative was rejected:** Proliferates output files. Users already know to read DESIGN.md. Section 22 is the logical conclusion — "given everything above, here's what to do."
- **Our team should know:** Right as long as DESIGN.md remains the primary output artifact. If the recommendation needs its own lifecycle (versioning, approval), extract it. Add a `--strategy-only` flag as escape plan.
- **Made by:** Sisyphus
- **Date:** 2026-05-31

## 2026-05-31: 5 strategy categories

- **Decision:** Full Rebuild, Design System Capture, Component Extraction, Content Migration, Static Export.
- **Reason:** These cover the spectrum from "clone everything" to "download and go." Each maps to a distinct user goal.
- **Alternative considered:** 3 categories (Full, Partial, Minimal). 7 categories (adding "Hybrid" and "Template-based").
- **Why alternative was rejected:** 3 is too coarse to be actionable. 7 introduces ambiguous boundaries between categories. 5 hits the sweet spot of distinct and exhaustive.
- **Our team should know:** Right for general-purpose web analysis. If the tool is specialized (e.g., only e-commerce), the categories may need adjustment. Make categories configurable via weights JSON.
- **Made by:** Sisyphus
- **Date:** 2026-05-31

## 2026-05-31: Auth/paywall signal deferred

- **Decision:** The "auth / paywall" signal is scored as 0 (neutral) until a detection pass is added.
- **Reason:** Auth detection requires a separate analysis capability (login form detection, cookie requirements, paywall DOM patterns). Building that is out of scope for v1.0.
- **Alternative considered:** Rushing a half-baked auth detection.
- **Why alternative was rejected:** A bad auth detection (false positives) would corrupt the recommendation. Better to omit the signal than to misreport it.
- **Our team should know:** Auth signal key already reserved in the matrix schema. No restructuring needed when auth detection arrives in v2.1. Auth-gated sites typically land on Content Migration or Static Export — reasonable even without the signal.
- **Made by:** Sisyphus
- **Date:** 2026-05-31

## 2026-05-31: Tie-breaking, threshold boundaries, and config format

- **Decision:** (a) Rebuild-first tie-breaking priority, (b) numeric score ranges replace qualitative labels, (c) JSON config with versioned schema.
- **Reason:** Ties are likely with 5 strategies and overlapping signal profiles. Numeric thresholds prevent implementation ambiguity. Versioned JSON config enables forward compatibility.
- **Alternative considered:** Random tie-breaking, user-prompted tie-breaking, "pick first in array."
- **Why alternative was rejected:** Random breaks reproducibility. User-prompted breaks automation. "Pick first in array" is nondeterministic across languages.
- **Our team should know:** Rebuild-first is intentional — users can always scale back from ambitious recommendations. If user research shows preference for conservative recommendations, invert the priority (Static Export first). Make tie-breaking configurable in `strategy-weights.json` via `tie_breaker` field.
- **Made by:** Sisyphus
- **Date:** 2026-05-31
