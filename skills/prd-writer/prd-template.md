# Product Requirements Document: {Project Name}

> **Status:** Draft  
> **Created:** {date}  
> **Brief Source:** {brief reference}  
> **DESIGN.md Consumed:** {yes/no — version if applicable}  

---

## 1. Problem Statement

{What pain point or opportunity does this project address?}

## 2. Solution Overview

{What does the end state look like? High-level description of the delivered solution.}

## 3. User Stories

### {Vertical Slice 1}
- As a {role}, I want {feature}, so that {benefit}
- As a {role}, I want {feature}, so that {benefit}

### {Vertical Slice 2}
- As a {role}, I want {feature}, so that {benefit}
- As a {role}, I want {feature}, so that {benefit}

## 4. Design Requirements

> Only required if UI is in scope. Reference DESIGN.md when available.

### Visual Constraints
- Color tokens: {reference Section 3 of DESIGN.md}
- Typography: {reference Section 4 of DESIGN.md}
- Spacing rules: {reference Section 6 of DESIGN.md}

### Component States
- Default, hover, active, disabled, loading for all interactive elements
- Error states for form inputs
- Responsive behavior per breakpoints

### Anti-Patterns to Avoid
- {From DESIGN.md Section 8 or project-specific}

## 5. Hardening Checklist

> Auto-populated from DESIGN.md v1.1.0 Sections 10–14 when available. Manual additions welcome.

### Generic (always apply)
- [ ] Content Boundaries defined (truncation, max sizes)
- [ ] Score/Metric Normalization (ranges, meanings)
- [ ] Fixture/Test Data Provenance
- [ ] Latency/Performance Contracts
- [ ] Token/Rate Limits with fallback behavior
- [ ] Error Boundaries (explicit, not "handle gracefully")
- [ ] State/Persistence Contract (where, lifecycle, cleanup)
- [ ] **Shared packages first:** If architecture specifies shared packages (e.g., `@project/api-client`, `@project/shared-types`), they must be created in Milestone 1 before any app code. Do NOT defer to later milestones.
- [ ] **No inline API calls:** All data fetching must be extracted to shared hooks in `hooks/` or services in `services/`. Do NOT allow inline `fetch` calls in components.
- [ ] **Mid-build architecture checkpoint:** After ~30% of milestones, pause and verify the architecture is holding. Add an explicit checkpoint slice that verifies modularity before continuing.
- [ ] **MVP-first scope:** Define the smallest useful version first, then expansions. If the feature list is too big, explicitly recommend what to cut.

### CSS Architecture (from DESIGN.md Section 10)
- [ ] Specificity cap enforced — no `!important` outside `@layer overrides`
- [ ] CSS Layers enforced — all styles reside in layers if `@layer` is used
- [ ] Z-Index token scale — no ad-hoc values
- [ ] GPU-only animations — animate only `transform` and `opacity`
- [ ] Throttled handlers — `requestAnimationFrame` on scroll/resize
- [ ] Token compliance — zero hardcoded colors outside token files

### Accessibility (from DESIGN.md Section 11)
- [ ] `:focus-visible` with `--focus-ring` on all interactive elements
- [ ] `prefers-reduced-motion` respected — non-essential animations disabled
- [ ] WCAG AA contrast — body text 4.5:1, large text 3:1
- [ ] Semantic landmarks — `<header>`, `<nav>`, `<main>`, `<footer>` used correctly
- [ ] Heading hierarchy — single `<h1>`, no skipped levels
- [ ] ARIA labels — all interactive elements without visible text

### Browser Support (from DESIGN.md Section 12)
- [ ] Modern CSS fallbacks — `@supports not` or polyfills for L5, `:has()`, `dvh`, etc.
- [ ] Baseline browser contract — support matrix documented

### Performance Budget (from DESIGN.md Section 13)
- [ ] Animation budget — simultaneous animations capped
- [ ] Critical CSS threshold — above-the-fold size documented
- [ ] Font loading strategy — `font-display: swap` on custom fonts

### Risk Assessment (from DESIGN.md Section 14)
- [ ] HIGH risks resolved — each has PRD requirement with acceptance criteria
- [ ] MEDIUM risks warned — listed in Open Questions / Risks with mitigation
- [ ] Risk acceptance documented — any accepted HIGH risk escalated to user

## 6. Implementation Decisions

### Module Boundaries

| Module | Interface (small) | Hides (large) |
|--------|-------------------|---------------|
| {Module A} | {Public API} | {Implementation details} |
| {Module B} | {Public API} | {Implementation details} |

### Technology Choices
- {Choice} — {rationale}
- {Choice} — {rationale}

### Integration Points
- {Existing system A} — {how this project connects}
- {Existing system B} — {how this project connects}

## 7. Decision Log

| # | What | Why | Alternative Considered | Conditions | Escape Plan | Validation Signals | Challenged Instinct |
|---|------|-----|------------------------|------------|-------------|-------------------|---------------------|
| 1 | {Decision} | {Rationale} | {Rejected alternative + why} | {When right / when wrong} | {How to reverse} | {Success/failure signals} | {Counter-argument explored} |

## 8. Testing Decisions

### Feedback Loops
- {Tests}: {unit, integration, e2e coverage plan}
- {Types}: {TypeScript strictness level}
- {Linting}: {ESLint/Prettier rules}

### TDD Approach
- Red → Green → Refactor for: {specific modules}
- Manual QA checkpoints: {human-in-the-loop verification points}

## 9. Out of Scope

- {Explicitly excluded feature 1}
- {Explicitly excluded feature 2}
- {Explicitly excluded feature 3}

## 10. Open Questions / Risks

- {Question/Risk 1} — {Mitigation or plan to resolve}
- {Question/Risk 2} — {Mitigation or plan to resolve}
- {Question/Risk 3} — {Mitigation or plan to resolve}
