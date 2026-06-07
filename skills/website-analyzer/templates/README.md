# Website-Analyzer Templates
## Production-Ready Templates for v1.2.0+

**Version:** 1.2.0  
**Status:** Production Ready ✅  

---

## Available Templates

### 1. CSS Architecture Template
**Location:** `templates/css-architecture/`

**Files:**
- `index.css.template` — Complete 91 @theme token structure
- `README.md` — Usage guide and customization

**Includes:**
- 91 CSS custom properties @theme
- 23 keyframe animations
- Glass morphism system (3 levels)
- Planet gradient system (6 variants)
- Animation utilities (11 classes)
- prefers-reduced-motion support
- Accessibility patterns (focus-visible)

**Use for:** All Tailwind v4 projects as starting CSS

---

### 2. React + Vite + Tailwind v4 Scaffold
**Location:** `templates/react-vite-tailwind4/`

**Files:**
- `src/` — Components, pages, stores, utils
- `index.html` — Font preconnects
- `vite.config.js` — manualChunks for Three.js
- `README.md` — Setup and customization guide

**Includes:**
- React Router v7 with lazy loading
- Three.js lazy-loading pattern
- Cookie-based auth (no localStorage)
- Zustand stores (no persist)
- Framer Motion ready
- Production file structure

**Use for:** React-based website-analyzer builds

---

## Quick Start

### Option 1: New Project from Scratch

```bash
# 1. Create project directory
mkdir my-project && cd my-project

# 2. Initialize Vite + React
npm create vite@latest . -- --template react

# 3. Install dependencies
npm install tailwindcss @tailwindcss/vite react-router-dom zustand framer-motion three @react-three/fiber @react-three/drei axios @tanstack/react-query react-toastify react-icons

# 4. Copy templates
cp ~/.config/opencode/skills/website-analyzer/templates/css-architecture/index.css.template src/index.css
cp -r ~/.config/opencode/skills/website-analyzer/templates/react-vite-tailwind4/src/* src/
cp ~/.config/opencode/skills/website-analyzer/templates/react-vite-tailwind4/index.html .
cp ~/.config/opencode/skills/website-analyzer/templates/react-vite-tailwind4/vite.config.js .

# 5. Customize
# - Replace {{PROJECT_NAME}} in index.html and components
# - Update colors in index.css from DESIGN.md
# - Add routes in router.jsx

# 6. Verify
npm run build
npm run lint
```

### Option 2: Existing Project Enhancement

```bash
# Copy just the CSS template
cp ~/.config/opencode/skills/website-analyzer/templates/css-architecture/index.css.template src/index.css

# Or copy specific components
cp ~/.config/opencode/skills/website-analyzer/templates/react-vite-tailwind4/src/components/Scene3D.jsx src/components/
```

---

## Template Features

### CSS Architecture Template

| Feature | Implementation | Constraint Met |
|---------|---------------|----------------|
| Tailwind v4 | @theme block | ✅ No tailwind.config.js |
| oklch() colors | All colors | ✅ Modern CSS |
| prefers-reduced-motion | Global media query | ✅ Accessibility |
| focus-visible | Outline styles | ✅ Keyboard nav |
| Glass system | 3-level blur | ✅ Design pattern |
| Planet gradients | 6 variants | ✅ Brand identity |

### React Scaffold Template

| Feature | Implementation | Constraint Met |
|---------|---------------|----------------|
| React Router v7 | createBrowserRouter | ✅ Latest version |
| No App.jsx | router.jsx + Layout.jsx | ✅ v7 pattern |
| Lazy loading | React.lazy() | ✅ Code splitting |
| Three.js chunk | manualChunks | ✅ ~892KB separate |
| Cookie auth | document.cookie | ✅ No localStorage |
| No zustand/persist | Pure stores | ✅ Privacy |
| 0 lint errors | ESLint config | ✅ Quality gate |

---

## Customization Checklist

### For CSS Template:
- [ ] Replace {{PROJECT_NAME}} placeholder
- [ ] Update colors from DESIGN.md Section 3
- [ ] Update fonts from DESIGN.md Section 4
- [ ] Add project-specific keyframes
- [ ] Verify oklch() values match target site

### For React Template:
- [ ] Replace {{PROJECT_NAME}} in index.html
- [ ] Replace {{PROJECT_NAME}} in Header.jsx
- [ ] Update fonts in index.html preconnects
- [ ] Add routes in router.jsx
- [ ] Create additional pages as needed
- [ ] Update API baseURL in utils/axios.js
- [ ] Add components to components/ directory

---

## Verification Commands

```bash
# Must pass before shipping
npm run build    # 0 errors
npm run lint     # 0 errors, 0 warnings

# Optional checks
npm run preview  # Visual verification
npx lighthouse   # Performance audit
```

---

## Template Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | 2026-05-16 | Initial templates from DropDeadDev implementation |

---

## Related Documentation

- `../SKILL.md` — Website-analyzer main documentation
- `../DESIGN.md.template` — DESIGN.md structure
- `../browser/` — Runtime analysis modules

---

## Support

For issues or questions about these templates:
1. Check template README.md files
2. Reference DropDeadDev implementation
3. Review BUILD_REPORT_v1.2.0.md for patterns

**Templates are living documents** — update them as patterns evolve.
