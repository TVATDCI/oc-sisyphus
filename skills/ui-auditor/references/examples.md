# UI Auditor — Example Outputs

## Example: Audit — FAIL (Annotated)

```
A-1: MAJOR — !important outside @layer overrides
      Location: src/styles/components.css:23
      Evidence: `.nav-link { color: var(--text) !important; }`
      Spec: "!important only in @layer overrides"
      Fix: Move to @layer overrides or remove

C-1: CRITICAL — Unthrottled scroll handler without requestAnimationFrame
      Location: src/pages/index.astro:156
      Evidence: `window.addEventListener('scroll', handleScroll);`
      Spec: "Throttle scroll handlers with rAF"
      Fix: Wrap in rAF throttle pattern

D-1: MAJOR — CSS Color Module L5 without fallback
      Location: src/styles/tokens.css:45
      Evidence: `rgb(from var(--accent) r g b / 80%)`
      Spec: "@supports not (color: rgb(from red r g b)) required"
      Fix: Add @supports fallback block

Returns: FAIL — "1 critical, 2 major violations. Handoff BLOCKED."
```

## Example: JSON Gate Decision (Annotated)

```json
{
  "decision": "FAIL",
  "design_md_path": ".sisyphus/analysis/pi-2-dev/DESIGN.md",
  "source_dir": "src/",
  "summary": "1 critical, 2 major violations found in performance and theme categories",
  "violation_counts": {
    "critical": 1,
    "major": 2,
    "minor": 0,
    "total": 3
  },
  "categories": {
    "css_architecture": { "status": "WARNING", "violations": [{"id":"A-1",...}] },
    "accessibility": { "status": "PASS", "violations": [] },
    "performance": { "status": "FAIL", "violations": [{"id":"C-1",...}] },
    "theme_system": { "status": "WARNING", "violations": [{"id":"D-1",...}] }
  },
  "known_issue_coverage": {
    "pi_2_issues_caught": 10,
    "pi_2_issues_total": 12,
    "missed_issues": ["Font licensing risk (not statically detectable)"]
  },
  "next_action": "fix_then_recheck"
}
```
