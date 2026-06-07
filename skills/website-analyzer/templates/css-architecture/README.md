# Website-Analyzer CSS Architecture Template
## Tailwind CSS v4 (CSS-first) - Design System Template

**Version:** 1.2.0  
**Based on:** DropDeadDev Portfolio Implementation  
**Status:** Production-Ready Template  

---

## Purpose

This template provides a **complete, reusable CSS architecture** extracted from successful website-analyzer v1.2.0 implementations. It includes:

- 91 CSS custom properties @theme structure
- 23 keyframe animations
- Glass morphism system
- Planet gradient system
- Animation utilities
- Accessibility patterns (prefers-reduced-motion, focus-visible)

**Use this template as the starting point for all website-analyzer builds.**

---

## File Structure

```
templates/css-architecture/
├── index.css.template          # Main CSS file with @theme block
├── animations.css.template      # 23 keyframe definitions
├── glass-system.css.template    # Glass morphism utilities
├── planet-gradients.css.template # Gradient definitions
└── README.md                    # This file
```

---

## Usage

### Step 1: Copy index.css.template

```bash
cp templates/css-architecture/index.css.template src/index.css
```

### Step 2: Customize Colors

Replace the oklch() values with colors extracted from DESIGN.md Section 3.

**Template Structure:**
- Primary palette (6 colors)
- Accent system (8 colors)
- Semantic colors (success/error/warning/link)
- Planet/brand gradients (6 colors)
- Neutral scale (11 steps)
- Additional raw colors from extraction

### Step 3: Customize Fonts

Replace font families with those from DESIGN.md Section 4.

**Default Template Includes:**
- Zodiak (serif/headings)
- JetBrains Mono (code/mono)
- Space Grotesk (UI)
- Sora (body)
- Dune Rise (display/special)

### Step 4: Verify Build

```bash
npm run build   # Must pass
npm run lint    # Must have 0 errors
```

---

## Key Patterns

### 1. No tailwind.config.js

**CRITICAL:** Tailwind v4 uses CSS-first architecture. All configuration is in `index.css`.

```css
@import "tailwindcss";

@theme {
  /* All tokens here */
}
```

### 2. oklch() Color Space

All colors use oklch() for perceptual uniformity:

```css
--color-primary: oklch(98.83% 0.0365 103.7);
--color-accent: oklch(62.3% 0.2507 3.84);
```

### 3. CSS Custom Properties @theme

Tokens defined in `@theme` are automatically available as Tailwind classes:

```css
@theme {
  --color-primary: oklch(98.83% 0.0365 103.7);
  --text-h1: 4.5rem;
  --spacing-rhythm-lg: 2rem;
}
```

Usage:
```jsx
<div className="bg-primary text-h1 p-rhythm-lg">
```

### 4. Animation Registration

Register animations in @theme for Tailwind v4 compatibility:

```css
@theme {
  --animate-float: float 6s ease-in-out infinite;
  --animate-fade-in: fade-in 0.5s ease-out forwards;
}
```

### 5. prefers-reduced-motion

**REQUIRED:** All animations respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 6. Glass Morphism System

Three levels of glass effect:

```css
.glass { /* Standard glass */ }
.glass-light { /* Subtle */ }
.glass-heavy { /* Prominent */ }
```

### 7. Planet Gradient System

Six planet-themed gradients for visual identity:

```css
.planet-gold { }
.planet-green { }
.planet-orange { }
.planet-purple { }
.planet-white { }
.planet-prime { }
```

---

## Constraint Checklist

Before shipping any website-analyzer build, verify:

| Constraint | Template Includes | Status |
|------------|-------------------|--------|
| No tailwind.config.js | ✅ CSS-only @theme | Required |
| oklch() colors | ✅ All colors in oklch | Required |
| prefers-reduced-motion | ✅ Global media query | Required |
| focus-visible | ✅ Outline styles | Required |
| No !important | ✅ Clean CSS | Required |
| 0 lint errors | ✅ ESLint compatible | Required |

---

## Customization Guide

### Adding New Colors

1. Extract from DESIGN.md Section 3
2. Convert to oklch() if needed
3. Add to @theme block
4. Use in components as `bg-[token-name]`

### Adding New Animations

1. Define keyframes at bottom of file
2. Register in @theme: `--animate-name: name duration timing`
3. Add `.animate-name` utility class
4. Test with prefers-reduced-motion

### Adding New Utilities

Create utility classes outside @theme:

```css
.my-utility {
  /* Custom styles */
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | 2026-05-16 | Extracted from DropDeadDev successful implementation |

---

## Related

- [[website-analyzer]] — Main tool documentation
- [[react-vite-tailwind4-template]] — Component scaffold template
- [[dropdeaddev-replica]] — Reference implementation
