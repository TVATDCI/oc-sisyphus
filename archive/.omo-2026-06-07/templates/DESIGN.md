# Design System — {Project Name}

> This file is a plain-text design contract. All models (GPT, Claude, Gemini) read markdown perfectly. When this file exists in the project root, generated UI should follow these rules exactly, preventing visual drift across models and sessions.

## 1. Mood & Atmosphere

- **Vibe**: {e.g., calm professional, energetic playful, dark premium, light airy}
- **Density**: {compact information-dense vs. spacious breathable}
- **Motion style**: {minimal/none, subtle transitions, bold animations}
- **Personality**: {3 adjectives describing the brand feel}

## 2. Color Palette

### Semantic Roles

| Role | Hex | Usage | Accessibility (on bg) |
|------|-----|-------|---------------------|
| Primary | `#000000` | CTAs, links, active states | White text: ✓ |
| Secondary | `#666666` | Secondary buttons, muted text | White text: ✓ |
| Accent | `#FF0000` | Highlights, badges, special states | White text: ✓ |
| Background | `#FFFFFF` | Page background | Any text: ✓ |
| Surface | `#F5F5F5` | Cards, panels, elevated surfaces | Dark text: ✓ |
| Text Primary | `#111111` | Headings, body text | N/A |
| Text Secondary | `#666666` | Captions, meta, placeholders | N/A |
| Border | `#E5E5E5` | Dividers, input borders, card outlines | N/A |
| Success | `#10B981` | Success states, confirmations | White text: ✓ |
| Warning | `#F59E0B` | Warnings, cautions | Dark text: ✓ |
| Error | `#EF4444` | Errors, destructive actions | White text: ✓ |

### Dark Mode (if applicable)

| Role | Hex |
|------|-----|
| Background | `#0A0A0A` |
| Surface | `#171717` |
| Text Primary | `#FAFAFA` |
| Text Secondary | `#A3A3A3` |
| Border | `#262626` |

## 3. Typography Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Display | 48px | 700 | 1.1 | Hero headings |
| H1 | 32px | 700 | 1.2 | Page titles |
| H2 | 24px | 600 | 1.3 | Section headings |
| H3 | 18px | 600 | 1.4 | Card titles, subsections |
| Body | 16px | 400 | 1.6 | Paragraphs, descriptions |
| Body Small | 14px | 400 | 1.5 | Secondary text, captions |
| Caption | 12px | 500 | 1.4 | Labels, timestamps, meta |
| Mono | 14px | 400 | 1.5 | Code, data, technical values |

**Font family**: {e.g., Inter, system-ui, Georgia}
**Mono family**: {e.g., JetBrains Mono, monospace}

## 4. Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight internal padding, icon gaps |
| sm | 8px | Tight component padding, small gaps |
| md | 16px | Standard component padding, medium gaps |
| lg | 24px | Section padding, card internal spacing |
| xl | 32px | Large section gaps |
| 2xl | 48px | Section separators |
| 3xl | 64px | Major page sections |

**Border radius scale**:
- sm: 4px (inputs, small buttons)
- md: 8px (cards, panels)
- lg: 12px (large cards, modals)
- full: 9999px (pills, badges, avatars)

## 5. Component States

### Button

| State | Background | Text | Border | Shadow |
|-------|-----------|------|--------|--------|
| Default | Primary | White | none | subtle |
| Hover | Primary darkened 10% | White | none | elevated |
| Active | Primary darkened 20% | White | none | inset |
| Disabled | Surface | Text Secondary | Border | none |
| Loading | Surface | Text Secondary | Border | none + spinner |

### Input

| State | Border | Background | Ring |
|-------|--------|-----------|------|
| Default | Border | Background | none |
| Focus | Primary | Background | 2px Primary @ 30% |
| Error | Error | Background | 2px Error @ 30% |
| Disabled | Border | Surface | none |
| Placeholder | — | — | Text Secondary |

### Card

- Background: Surface
- Border: 1px Border
- Border-radius: md
- Padding: lg
- Shadow: subtle (0 1px 3px rgba(0,0,0,0.1))
- Hover: elevated shadow (0 4px 12px rgba(0,0,0,0.15))

## 6. Breakpoints

| Name | Width | Usage |
|------|-------|-------|
| Mobile | < 640px | Single column, stacked layout |
| Tablet | 640px - 1024px | 2 columns, condensed nav |
| Desktop | > 1024px | Full layout, sidebar visible |
| Wide | > 1280px | Max-width container centered |

## 7. Do's and Don'ts

### ✅ Do
- Use semantic color tokens (Primary, Surface, Text Primary) instead of raw hex values
- Use the spacing scale consistently (md for standard gaps, not 15px or 17px)
- Respect motion preferences (`prefers-reduced-motion`)
- Ensure contrast ratios meet WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Use border-radius consistently per component type

### ❌ Don't
- Use raw hex/rgb/hsl values directly in component code — always use tokens
- Hardcode font sizes outside the typography scale
- Use absolute px for spacing unless specified in the scale
- Create one-off component variants that break the system
- Use system default fonts without specifying fallbacks
- Add animation to elements that don't need it

## 8. Anti-Patterns for This Project

| Pattern | Why Blocked | Alternative |
|---------|-------------|-------------|
| Purple gradients | Not in palette, conflicts with calm vibe | Use Surface + Border |
| Harsh animations | Conflicts with minimal motion style | Subtle opacity/translate transitions only |
| Neon colors | Not in palette | Use Accent sparingly for highlights only |
| Dark mode without toggle | If not specified, assume light-only | Add explicit dark mode section above |
| Direct store coupling in presentational components | Breaks separation of concerns | Pass data via props, use containers for state |

---

> **Usage for agents**: When generating UI, read this file first. All color, spacing, typography, and motion decisions must reference this contract. If a design decision is not covered here, ask the user rather than guessing.
