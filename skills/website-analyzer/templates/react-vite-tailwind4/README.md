# React + Vite + Tailwind v4 Component Scaffold Template
## Website-Analyzer v1.2.0 - Production-Ready Project Structure

**Version:** 1.2.0  
**Based on:** DropDeadDev Portfolio Implementation  
**Status:** Production-Ready Template  

---

## Purpose

This template provides a **complete project scaffold** for website-analyzer v1.2.0 builds. It includes:

- React Router v7 with lazy-loaded routes
- Tailwind CSS v4 (CSS-first, no config file)
- Three.js lazy-loading pattern
- Cookie-based auth (no localStorage)
- Zustand stores (no persist)
- Framer Motion animations
- Production-ready file structure

**Use this template as the starting point for all React-based website-analyzer builds.**

---

## File Structure

```
templates/react-vite-tailwind4/
├── src/
│   ├── main.jsx              # Entry: RouterProvider + QueryClient + Toastify
│   ├── router.jsx            # createBrowserRouter with lazy routes
│   ├── Layout.jsx            # Shared layout with Outlet
│   ├── index.css             # ⚠️ COPY from css-architecture/index.css.template
│   ├── components/
│   │   ├── Header.jsx        # Auth-aware navigation
│   │   ├── Footer.jsx        # Site footer
│   │   ├── Scene3D.jsx       # Three.js lazy-loading pattern
│   │   └── FeatureCard.jsx   # Reusable card component
│   ├── pages/
│   │   ├── Home.jsx          # Homepage
│   │   ├── Login.jsx         # Auth form
│   │   └── NotFound.jsx      # 404 page
│   ├── stores/
│   │   └── authStore.js      # In-memory auth (no persist)
│   └── utils/
│       └── axios.js          # Axios with cookie interceptors
├── index.html                # Font preconnects
├── vite.config.js            # manualChunks for Three.js
└── README.md                 # This file
```

**Important:** The `src/index.css` file is NOT included in this template. You must copy it from `templates/css-architecture/index.css.template` and customize it for your project.

---

## Quick Start

### Step 1: Copy Template

```bash
cp -r templates/react-vite-tailwind4/* /path/to/your/project/
cp templates/css-architecture/index.css.template src/index.css
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Copy CSS Template

See `templates/css-architecture/README.md`

### Step 4: Customize

Replace placeholder values:
- `{{PROJECT_NAME}}` in index.html
- Fonts in index.html
- Colors in index.css
- Routes in router.jsx

### Step 5: Verify

```bash
npm run build   # Must pass
npm run lint    # Must have 0 errors
```

---

## Key Patterns

### 1. No App.jsx Pattern

React Router v7 uses `createBrowserRouter` + `RouterProvider`. Delete App.jsx.

**Files:**
- `router.jsx` — Route definitions
- `Layout.jsx` — Shared layout wrapper
- `main.jsx` — Entry with RouterProvider

### 2. Cookie-Based Auth (No localStorage)

**REQUIRED:** Runtime analysis showed localStorage empty for auth. Use cookies.

```javascript
// authStore.js
export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  // NO zustand/persist!
}))

// axios.js
const token = document.cookie
  .split('; ')
  .find(row => row.startsWith('auth-token='))
  ?.split('=')[1]
```

### 3. Three.js Lazy Loading

```javascript
const Scene3D = lazy(() => import('./components/Scene3D.jsx'))

// In component
<Suspense fallback={<div>Loading 3D...</div>}>
  <Scene3D />
</Suspense>
```

**vite.config.js:**
```javascript
manualChunks: {
  three: ['three', '@react-three/fiber', '@react-three/drei']
}
```

### 4. No Tailwind Config

All styling in `index.css` with @theme block.

### 5. prefers-reduced-motion

Global media query in index.css disables all animations.

---

## Constraint Checklist

Before shipping:

| Constraint | Template Includes | Status |
|------------|-------------------|--------|
| React Router v7 | ✅ createBrowserRouter | Required |
| No App.jsx | ✅ router.jsx + Layout.jsx | Required |
| Tailwind v4 CSS-first | ✅ No tailwind.config.js | Required |
| Three.js lazy-loaded | ✅ React.lazy() + manualChunks | Required |
| Cookie auth (no localStorage) | ✅ authStore + axios interceptors | Required |
| No zustand/persist | ✅ Pure in-memory stores | Required |
| prefers-reduced-motion | ✅ Global media query | Required |
| 0 lint errors | ✅ ESLint config included | Required |
| `npm run build` passes | ✅ Vite 8 config | Required |

---

## Customization Guide

### Adding Routes

1. Create page component in `src/pages/`
2. Add lazy import in `router.jsx`
3. Add route to `createBrowserRouter` array
4. Add nav link in `Header.jsx`

### Adding Components

1. Create component in `src/components/`
2. Use Tailwind classes from index.css
3. Export default
4. Import in pages

### Adding Stores

1. Create store in `src/stores/`
2. Use `create()` from zustand
3. NO persist middleware
4. Export hook

### Adding API Calls

1. Use `utils/axios.js` instance
2. Handle 401 in interceptor
3. Use React Query for caching

---

## Dependencies

**Core:**
- react ^19.0.0
- react-dom ^19.0.0
- react-router-dom ^7.0.0

**Styling:**
- tailwindcss ^4.0.0

**State:**
- zustand ^5.0.0 (no persist)

**3D:**
- three ^0.184.0
- @react-three/fiber ^9.0.0
- @react-three/drei ^10.0.0

**Animation:**
- framer-motion ^12.0.0

**HTTP:**
- axios ^1.7.0
- @tanstack/react-query ^5.0.0

**UI:**
- react-toastify ^11.0.0
- react-icons ^5.0.0

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | 2026-05-16 | Extracted from DropDeadDev successful implementation |

---

## Related

- [[website-analyzer]] — Main tool documentation
- [[css-architecture-template]] — Design system CSS template
- [[dropdeaddev-replica]] — Reference implementation
