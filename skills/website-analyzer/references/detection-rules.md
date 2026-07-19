# Detection Rules Reference

The following patterns are automatically extracted during Pass 1 of Phase 1
(Multi-Pass Extraction) and verified in Phase 2. Each detection produces a
structured record in `tech-detections.json` with `confidence: "EXTRACTED"`.

These detections feed Phase 4 (CSS Architecture & Accessibility Analysis) —
see SKILL.md "CSS Architecture & Accessibility Analysis Workflow" for how
each Detection is consumed by the CSS Architecture, Accessibility, and
Browser Support sub-agents.

---

## Detection 1: !important Declarations

```javascript
// Pattern to search
/!important/g

// Report format
{
  "type": "css_specificity",
  "metric": "important_count",
  "value": X,
  "locations": [
    { "file": "path/to/file.css", "line": 23, "selector": ".class" },
    ...
  ],
  "confidence": "EXTRACTED"
}
```

## Detection 2: Unthrottled Event Handlers

```javascript
// Pattern to search
/addEventListener\(['"]scroll['"]\s*,\s*[^,]+\)/g
/addEventListener\(['"]resize['"]\s*,\s*[^,]+\)/g

// Report format (exclude if requestAnimationFrame found in same scope)
{
  "type": "performance",
  "metric": "unthrottled_handlers",
  "scroll_handlers": [{ "file": "...", "line": X }],
  "resize_handlers": [{ "file": "...", "line": X }],
  "confidence": "EXTRACTED"
}
```

## Detection 3: Hardcoded Color Values

```javascript
// Pattern to search (outside tokens.css)
/#[0-9a-fA-F]{3,6}/g  // Hex colors
/rgba?\([^)]+\)/g     // RGB/RGBA values
/hsl\([^)]+\)/g       // HSL values

// Report format
{
  "type": "design_system",
  "metric": "hardcoded_colors",
  "count": X,
  "files": ["path1", "path2"],
  "examples": ["#0d1116", "rgba(106, 159, 204, 0.07)"],
  "confidence": "EXTRACTED"
}
```

## Detection 4: Layout Property Animations

```javascript
// Pattern to search
/(top|left|right|bottom|width|height|margin|padding)\s*:\s*[^;]+transition/g

// Report format
{
  "type": "performance",
  "metric": "layout_animations",
  "count": X,
  "properties": ["top", "left"],
  "locations": [{ "file": "...", "line": X }],
  "confidence": "EXTRACTED"
}
```

## Detection 5: Z-Index Values

```javascript
// Pattern to search
/z-index\s*:\s*(-?\d+)/g

// Report format
{
  "type": "css_architecture",
  "metric": "z_index_values",
  "values": [-1, 1, 100, 200, 999],
  "ad_hoc": true/false,
  "locations": [{ "file": "...", "line": X, "value": Y }],
  "confidence": "EXTRACTED"
}
```

## Detection 6: Focus-Visible Styles

```javascript
// Pattern to search
/:focus-visible/g
/:focus\s*\{/g  // as fallback

// Report format
{
  "type": "accessibility",
  "metric": "focus_visible",
  "present": true/false,
  "count": X,
  "selectors": ["button:focus-visible", "a:focus-visible"],
  "confidence": "EXTRACTED"
}
```

## Detection 7: prefers-reduced-motion

```javascript
// Pattern to search
/@media\s*\(\s*prefers-reduced-motion\s*:/g

// Report format
{
  "type": "accessibility",
  "metric": "reduced_motion",
  "present": true/false,
  "implementation": "partial/full/none",
  "confidence": "EXTRACTED"
}
```

## Detection 8: CSS Color Module Level 5

```javascript
// Pattern to search
/rgb\(\s*from\s+/g

// Report format
{
  "type": "css_modern",
  "metric": "color_module_l5",
  "present": true/false,
  "count": X,
  "fallback_present": true/false,  // Check for @supports not
  "confidence": "EXTRACTED"
}
```

## Detection 9: CSS Layers

```javascript
// Pattern to search
/@layer\s+[\w,\s]+;/g

// Report format
{
  "type": "css_architecture",
  "metric": "css_layers",
  "present": true/false,
  "layer_order": ["reset", "tokens", "base", "layout", "components", "utilities", "overrides"],
  "violations": [{ "file": "...", "unlayered_styles": true }],
  "confidence": "EXTRACTED"
}
```

## Detection 10: Theme System Complexity

```javascript
// Pattern to search
/data-theme/g
/class="[^"]*(?:dark|light)[^"]*"/g
/prefers-color-scheme/g

// Report format
{
  "type": "design_system",
  "metric": "theme_system",
  "implementation": "data-attribute/class/media-query",
  "modes": ["dark", "light", "system"],
  "section_themes": true/false,  // e.g., .work always dark
  "transition_strategy": "universal/scoped/none",
  "confidence": "EXTRACTED/INFERRED"
}
```
