---
name: website-analyzer
description: "Analyzes a target website and produces DESIGN.md (21 sections), tech-detections.json, content-inventory.json, and design tokens for cloning or reference. (1) Use when user provides a URL and wants to clone or rebuild a site. (2) Use to extract design system, tech stack, color palette, and typography from any live URL. (3) Use to generate Tailwind config, shadcn theme, or Figma variables from a reference site. Triggers: 'clone this website', 'analyze this URL', 'rebuild this site', 'what tech does this site use', 'extract design from', 'website analysis', 'design system extraction', 'export design tokens', 'analyze via MCP', 'generate tailwind config'. TAKES PRECEDENCE over discovery-orchestrator when a URL is in the message. Not for: login-walled sites, static text-only articles, or anti-bot-protected targets."
compatibility: opencode
triggers:
  - "clone this website"
  - "analyze this URL"
  - "rebuild this site"
  - "what tech does this site use"
  - "extract design from"
  - "website analysis"
  - "clone"
  - "analyze website"
  - "design system extraction"
  - "analyze via MCP"
  - "run website-analyzer MCP server"
  - "export design tokens"
  - "generate tailwind config"
  - "extract figma variables"
  - "create shadcn theme"
mode: agent-driven
inputs:
  - "Target URL (required) — the website to analyze"
  - "Analysis depth (optional) — 'quick' (2 min) or 'deep' (10 min)"
  - "Output path (optional) — where to write DESIGN.md"
outputs:
  - "DESIGN.md — structured design specification"
  - "tech-detections.json — machine-readable tech stack with confidence"
  - "analysis-summary.md — human-readable summary"
  - "{output_path}/tokens.json — W3C Design Tokens"
  - "{output_path}/tailwind.config.js — Tailwind CSS config"
  - "{output_path}/figma-variables.json — Figma variables"
  - "{output_path}/globals.css — shadcn/ui theme CSS"
  - "{output_path}/theme.js — React theme object"
produces_artifacts:
  - "{output_path}/DESIGN.md"
  - "{output_path}/tech-detections.json"
  - "{output_path}/analysis-summary.md"
  - "{output_path}/tokens.json"
  - "{output_path}/tailwind.config.js"
  - "{output_path}/figma-variables.json"
  - "{output_path}/globals.css"
  - "{output_path}/theme.js"
requires_artifacts:
  - "None — starts from URL"
gates:
  - "User approves DESIGN.md: 'looks good', 'proceed', 'approved'"
  - "User requests changes: 'add section', 'fix color', 'deeper analysis'"
metadata:
  version: 1.5.0
  category: analysis
  complexity: advanced
  status: complete
---

# Website Analyzer

Analyzes a target website through multi-pass extraction to produce a structured DESIGN.md specification suitable for cloning or reference implementation.

## Identity & Scope

**Purpose:** Analyze a target website for cloning or reference; produce DESIGN.md + tech stack + tokens.
**Triggers:** "clone this website", "analyze this URL", "rebuild this site", "what tech does this site use", "extract design from", "website analysis", "clone", "analyze website", "design system extraction", "analyze via MCP", "run website-analyzer MCP server", "export design tokens", "generate tailwind config", "extract figma variables", "create shadcn theme"
**Takes Precedence Over:** discovery-orchestrator when a URL is present in the user message
**Not For:** Sites requiring login to access content (use a different skill); sites with anti-bot protection that defeats headless browsers; static text-only articles (no design system to extract)

## Hard Constraints (NEVER/MUST)

- **No invented content** — every design claim must be sourced from the actual page DOM; Visual Parity Gate verifies zero invented content (grep for lorem/placeholder/todo)
- **Confidence tagging required** — every factual claim in DESIGN.md MUST have a confidence tag (EXTRACTED/INFERRED/AMBIGUOUS); no untagged claims allowed
- **Tech detection verification** — verify CSS framework and library detection with multiple signals (class names, build artifacts, HTTP headers); never claim detection without evidence; never confuse CDN-hosted libs with actual stack
- **Output schema adherence** — DESIGN.md must follow the 21-section template; tech-detections.json must follow the schema; content-inventory.json must have all required fields
- **Browser automation required** — static HTML analysis alone misses JS-rendered content; use Playwright for Phase 2 runtime analysis
- **Preserve user intent** — 'quick' (2 min) vs 'deep' (10 min) analysis depth affects scope, not quality
- **MCP server as boundary** — the skill is the wrapper; the MCP server does the heavy lifting
- **No destructive actions on target** — read-only analysis, never write to or modify the target site
- **Collect subagent outputs immediately** — upon each `<system-reminder>` notification, call `background_output` in the same turn; max total wait time for all subagents: 10 minutes
- **All text values must be exact source strings** — never summarized or paraphrased in content-inventory.json
- **Never block Phase 4 on CSS/Accessibility/Browser subagents** — missing data is marked AMBIGUOUS, not blocking

## Core Workflow (Summary)

The 9-step analysis pipeline — see `## Detailed Steps` below for per-step procedures.
1. **Fetch + classify** — Load target, detect product type, build confidence profile
2. **Theme + mood** — Visual style (vibe, density, formality, era)
3. **Colors** — Palette extraction (OKLCH preferred), dark/light mode detection
4. **Typography** — Font families, scales, weights, fallbacks
5. **Components** — UI primitives detected (buttons, cards, modals, etc.)
6. **Layout** — Grid system, breakpoints, container widths
7. **Depth & elevation** — Shadow systems, layering, z-index
8. **Do's & Don'ts** — Heuristics for the design system (with code patterns)
9. **Agent prompt guide** — How to instruct an LLM to recreate the design

**Output:** DESIGN.md (21 sections) + tech-detections.json + analysis-summary.md + tokens.json

## Tool Usage

| Tool | Purpose | Phase |
|------|---------|-------|
| `webfetch` | Fetch target URL HTML content | Phase 1 |
| `bash` (curl, grep) | Deterministic DOM scraping, CSS extraction | Phase 1 Pass 1 |
| `call_omo_agent` | Dispatch parallel subagents for deep analysis | Phase 1 Pass 2 |
| `background_output` | Collect subagent outputs immediately upon notification | Phase 1.5 |
| Playwright MCP | Browser automation for runtime analysis | Phase 2 |

## Model Selection

**Category:** `deep` → `kimi-k2.6` (fallback: `glm-5.1`)

**Rationale:** Website analysis requires visual interpretation, tech stack inference, and design system extraction — tasks that benefit from strong multimodal and reasoning capabilities.

**Model Transparency:**
When delegating to subagents, always report: `Executing with [model] via [category]` (e.g., "Executing with kimi-k2.6 via deep").

## Input

- Target URL (e.g., `https://example.com`)
- Analysis depth: `quick` (structure + tech only) or `deep` (full DESIGN.md)
- Output path (default: `{project_root}/.sisyphus/analysis/`)

## Produces

- `DESIGN.md` — structured design specification with 21+ sections
- `content-inventory.json` — machine-readable content inventory (navigation, hero, sections, projects, footer, metadata)
- `tech-detections.json` — machine-readable tech stack with confidence scores
- `analysis-summary.md` — human-readable executive summary

## Entry Criteria

- [ ] Target URL provided and accessible
- [ ] Analysis depth specified (default: deep)
- [ ] Output directory exists or can be created

## Next if Approved

- **DESIGN.md approved**: Hand off to `prd-writer` or `sisyphus-plan` for implementation planning

## Next if Rejected

- **Missing sections**: Re-run specific analysis pass for missing data
- **Incorrect detections**: Re-run with corrected assumptions
- **User wants deeper analysis**: Expand to component-level extraction

## Confidence Legend

- **EXTRACTED (1.0)** — Directly observed in DOM/network, no interpretation needed
- **INFERRED (0.55-0.95)** — Strong signal but requires interpretation
- **AMBIGUOUS (0.1-0.3)** — Weak signal, multiple possibilities, needs human verification

## Confidence Tagging Reference

| Tag | Score | Meaning | When to Use |
|-----|-------|---------|-------------|
| EXTRACTED | 1.0 | Direct observation, verifiable | CSS value in stylesheet, meta tag present, DOM attribute visible |
| INFERRED | 0.55-0.95 | Strong signal, reasonable interpretation | Pattern recognition, visual alignment, behavioral observation |
| AMBIGUOUS | 0.1-0.3 | Weak signal, multiple interpretations possible | Conflicting evidence, requires human judgment |

**Rule:** Every factual claim in DESIGN.md MUST have a confidence tag. No untagged claims allowed.

## Product Type Patterns

| Type | Key Indicators | Design Patterns to Apply |
|------|---------------|-------------------------|
| SaaS | Dashboard, tables, auth, settings | Dense UI, data viz, form validation, empty states |
| Landing | Hero, features, social proof | Emotional design, scroll storytelling, CTA hierarchy |
| E-commerce | Products, cart, checkout | Product cards, filtering, trust signals, urgency |
| Portfolio | Galleries, case studies | Typography-forward, whitespace, visual hierarchy |
| Blog | Articles, reading, subscribe | Readability, content discovery, subscription nudges |
| Corporate | Services, team, about | Structured nav, credibility markers, clear taxonomy |
| Web App | Interactive, workflows, real-time | Stateful UI, optimistic updates, collaboration |

## Error Handling

| Scenario | Action |
|----------|--------|
| URL inaccessible | Report HTTP status, suggest alternatives |
| Single-page app (SPA) | Note limited DOM extraction, rely more on visual analysis |
| paywall/gated content | Analyze visible portion, flag limitations |
| Heavy animation/video | Capture static state, note dynamic elements as AMBIGUOUS |
| Dark mode auto-detect | Check `prefers-color-scheme`, test both modes |
| Subagent never completes (no notification after 5 min) | Mark as FAILED. Use direct tool fallback for that category (Phase 1.6). Do NOT retry the subagent. |
| Subagent output lost (`"Task not found"`) | Retry `background_output` once after 10s. If still lost, use direct tool fallback (Phase 1.6). |
| Only partial subagent outputs received | Proceed with available outputs. Fill missing categories via direct tools. Do NOT restart all subagents. |
| All subagent outputs lost | Fall back entirely to deterministic DOM/CSS extraction (Phase 1 Pass 1 expanded). This is a valid and complete path — the analysis can still proceed. |

## Integration with Other Skills

### With prd-writer skill:
- Feed Sections 10-19 as implementation constraints
- Flag high-risk items (CSS Color Module L5, animations, accessibility)
- Auto-populate hardening checklist items based on findings

### With plan-writer skill:
- Use Risk Assessment (Section 14) to order implementation waves
- Put CSS architecture foundation first (wave 1)
- Defer animation optimization to later waves (wave 3+)

### With wave-executor:
- Use Agent Prompt Guide items 16-24 as per-wave acceptance criteria
- Check off accessibility at each wave boundary
- Verify browser fallbacks before marking wave complete

## Integration with Planning Skills

### With prd-writer skill:
- Feed Sections 10-14 as implementation constraints
- Feed `content-inventory.json` as exact content requirements (every text value is a source-truth string)
- Flag high-risk items (CSS Color Module L5, animations, accessibility)
- Auto-populate hardening checklist items based on findings

### With plan-writer skill:
- Use Risk Assessment (Section 14) to order implementation waves
- Put CSS architecture foundation first (wave 1)
- Defer animation optimization to later waves (wave 3+)
- **source_content_ref (v1.5.0):** Every content-producing slice MUST include a `source_content_ref` field mapping to a specific `content-inventory.json` path. Never use placeholder content — reference exact inventory paths (e.g., `content-inventory.json → hero.title_lines[0]`)

### With wave-executor:
- Use Agent Prompt Guide items 16-24 as per-wave acceptance criteria
- Check off accessibility at each wave boundary
- Verify browser fallbacks before marking wave complete
- Run Open Question Gate before each wave — scan for HIGH/MEDIUM/LOW unresolved questions

## Integration with File-Based State

After analysis completes, update project state files:

```bash
# Append to STATE.md
echo "## {date}: Website Analysis Complete
- **Target:** {url}
- **Type:** {classified type}
- **Confidence:** {avg confidence}
- **Artifacts:** DESIGN.md (21+ sections), content-inventory.json, tech-detections.json
- **High-risk items:** {count} (see Section 14 of DESIGN.md)
- **Ambiguous items:** {count} (see analysis-summary.md)
- **SPA hydration:** {yes|no} (see content-inventory.json spa_hydrated)
" >> {project_root}/STATE.md

# Update CONTEXT.md for planning phase
echo "## Planning Context: {Site Name}
- **Product type:** {type} → Use {type} component patterns
- **Tech stack:** {stack} → Plan build setup accordingly
- **Design complexity:** {low|medium|high} → Adjust wave sizing
- **CSS architecture risks:** {high/medium/low count} (Section 10)
- **Accessibility gaps:** {count} (Section 11)
- **Browser support needs:** {features requiring fallbacks} (Section 12)
- **Risk assessment:** {high-risk items} (Section 14)
- **Known gaps:** {list AMBIGUOUS items}
" >> {project_root}/CONTEXT.md
```

## Browser Automation Dependencies

### Required for Phase 2 (Runtime Analysis)

```bash
# Install Playwright
npm install playwright

# Install browser binaries
npx playwright install chromium

# Install system dependencies (requires sudo)
npx playwright install-deps chromium
```

### System Requirements
- **Linux:** Ubuntu 20.04+ or equivalent (libnspr4, libnss3, libxss1)
- **macOS:** 11+ (no additional deps needed)
- **Windows:** 10+ with Visual C++ Redistributable

### Alternative: MCP Mode
If system dependencies cannot be installed, use MCP mode:
```javascript
const launcher = new BrowserLauncher({ headless: true });
await launcher.launchMCP(); // Uses Playwright MCP server
```

## Output

- `{output_path}/DESIGN.md` — Full design specification
- `{output_path}/content-inventory.json` — Machine-readable content inventory
- `{output_path}/tech-detections.json` — Machine-readable stack detection
- `{output_path}/analysis-summary.md` — Executive summary

---

## Detailed Steps

### Phase 1: Multi-Pass Extraction (Static Analysis)

#### Pass 1: Deterministic DOM Scraping (Cheap)

Extract factual, observable data without LLM interpretation:

```bash
# Fetch and parse HTML
curl -s -L "{target_url}" -o /tmp/target.html

# Extract meta tags
grep -oP '<meta[^>]+>' /tmp/target.html > /tmp/meta_tags.txt

# Detect framework hints
grep -oP '(next\.js|react|vue|angular|svelte|gatsby|nuxt)' /tmp/target.html -i | sort | uniq -c > /tmp/framework_hints.txt

# Extract inline styles
grep -oP 'style="[^"]+"' /tmp/target.html | head -50 > /tmp/inline_styles.txt

# Detect CSS files
grep -oP 'href="[^"]+\.css[^"]*"' /tmp/target.html > /tmp/css_files.txt

# Detect JS files
grep -oP 'src="[^"]+\.js[^"]*"' /tmp/target.html > /tmp/js_files.txt

# Extract color values (hex, rgb, hsl)
grep -oP '#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|hsl\([^)]+\)' /tmp/target.html | sort | uniq -c | sort -rn | head -30 > /tmp/colors_raw.txt

# Extract font families
grep -oP 'font-family:[^;]+' /tmp/target.html | sort | uniq -c | sort -rn | head -20 > /tmp/fonts_raw.txt

# Detect !important usage
grep -oP '![ ]*important' /tmp/target.html | wc -l > /tmp/important_count.txt

# Detect focus-visible usage
grep -oP ':focus-visible|:focus\s*\{' /tmp/target.html | wc -l > /tmp/focus_visible_count.txt

# Detect prefers-reduced-motion
grep -oP '@media\s*\(\s*prefers-reduced-motion' /tmp/target.html | wc -l > /tmp/reduced_motion_count.txt

# Detect CSS Color Module L5 (rgb(from...))
grep -oP 'rgb\(\s*from\s+' /tmp/target.html | wc -l > /tmp/color_l5_count.txt

# Detect CSS Layers
grep -oP '@layer\s+[\w,\s]+' /tmp/target.html | wc -l > /tmp/css_layers_count.txt

# Detect z-index usage
grep -oP 'z-index\s*:\s*(-?\d+)' /tmp/target.html | sort | uniq -c | sort -rn > /tmp/zindex_values.txt

# Detect data-theme or theme classes
grep -oP 'data-theme|class="[^"]*(?:dark|light)[^"]*"|prefers-color-scheme' /tmp/target.html | wc -l > /tmp/theme_system_count.txt

# Detect unthrottled scroll/resize listeners (naive JS pattern match)
grep -oP 'addEventListener\([\'"]scroll[\'"]\s*,\s*[^,]+\)' /tmp/target.html | wc -l > /tmp/scroll_handlers.txt
grep -oP 'addEventListener\([\'"]resize[\'"]\s*,\s*[^,]+\)' /tmp/target.html | wc -l > /tmp/resize_handlers.txt

# Detect hardcoded colors (expanded patterns)
grep -oP '#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsl\([^)]+\)' /tmp/target.html | grep -v '\-\-' | wc -l > /tmp/hardcoded_colors_count.txt
```

**Pass 1 Output:** Raw extraction files with frequency counts (including new CSS architecture/accessibility metrics)

#### Pass 2: LLM Semantic Analysis (Expensive)

Dispatch parallel subagents for deep analysis:

**Subagent A: Visual Structure Analysis**
```
TASK: Analyze the visual structure of {target_url}
EXPECTED OUTCOME: Section breakdown with layout patterns
REQUIRED TOOLS: webfetch, screenshot
MUST DO:
- Identify all major sections (hero, features, CTA, footer, etc.)
- Describe layout grid system (if visible)
- Note spacing patterns (padding, margin, gap)
- Detect responsive breakpoints behavior
MUST NOT DO:
- Do NOT guess colors without visual evidence
- Do NOT invent component names not visible in screenshot
```

**Subagent B: Design System Extraction**
```
TASK: Extract design tokens and system from {target_url}
EXPECTED OUTCOME: Color palette, typography scale, spacing system
REQUIRED TOOLS: webfetch
MUST DO:
- Extract primary, secondary, accent, neutral, semantic colors
- Identify heading hierarchy (H1-H6 sizes and weights)
- Note body text size, line-height, letter-spacing
- Extract border radius patterns, shadow depths
- Detect animation/motion patterns (hover states, transitions)
MUST NOT DO:
- Do NOT output raw CSS — interpret into design tokens
- Do NOT miss dark/light mode variants if present
```

**Subagent C: Tech Stack Detection**
```
TASK: Detect tech stack and architecture of {target_url}
EXPECTED OUTCOME: Framework, build tool, hosting, CMS inference
REQUIRED TOOLS: webfetch, bash
MUST DO:
- Check response headers for server/framework hints
- Analyze JS bundle patterns for framework fingerprints
- Detect CSS-in-JS vs traditional CSS
- Check for meta generator tags
- Infer build tool (Webpack, Vite, etc.) from asset naming
MUST NOT DO:
- Do NOT claim detection without evidence
- Do NOT confuse CDN-hosted libs with actual stack
```

**Subagent D: Component Inventory**
```
TASK: Inventory reusable components on {target_url}
EXPECTED OUTCOME: List of components with variants and states
REQUIRED TOOLS: webfetch
MUST DO:
- List all button styles (primary, secondary, ghost, sizes)
- List all card patterns
- List all form input styles
- Note navigation patterns (mobile, desktop)
- Detect modal/drawer/overlay patterns
MUST NOT DO:
- Do NOT list one-off decorative elements as components
- Do NOT miss disabled/error states
```

**Subagent E: Content & Copy Analysis**
```
TASK: Analyze content strategy and copy patterns on {target_url}
EXPECTED OUTCOME: Voice/tone assessment, content structure patterns
REQUIRED TOOLS: webfetch
MUST DO:
- Characterize brand voice (professional, playful, technical, etc.)
- Note headline patterns (length, structure, CTAs)
- Identify content sections and their purpose
- Detect microcopy patterns (buttons, labels, errors)
MUST NOT DO:
- Do NOT copy actual text — describe patterns only
- Do NOT analyze content not visible above fold without scrolling
```

#### Phase 1.5: Collect Subagent Outputs (Critical)

**Rule: Collect outputs IMMEDIATELY upon receiving each `<system-reminder>` notification. Do NOT batch collection at the end.**

Background task outputs can expire or be garbage-collected between the completion notification and collection. Treat each notification as a time-sensitive window.

1. Upon each `<system-reminder>` for a completed subagent, call `background_output(task_id="...")` **in the same turn**.
2. If `background_output` returns `"Task not found"`, retry once after 10 seconds.
3. Track completion status in a checklist:
   - [ ] Subagent A (Visual Structure)
   - [ ] Subagent B (Design System)
   - [ ] Subagent C (Tech Stack)
   - [ ] Subagent D (Components)
   - [ ] Subagent E (Content)
4. **Max total wait time for all subagents: 10 minutes.** Do not block Phase 2 longer than this.
5. If a subagent hasn't sent a completion notification after **5 minutes**, mark it FAILED and proceed.

#### Phase 1.6: Gap Filling (If Subagents Failed or Outputs Lost)

For each missing subagent output, use direct deterministic tools to extract that category. Do NOT re-dispatch LLM subagents — they have the same reliability risk.

| Missing Category | Direct Tool Fallback |
|---|---|
| Visual Structure | `curl` + `grep` for section class names (`hero`, `feature`, `section`, `cta`, `footer`); inspect DOM tree structure |
| Design System | Fetch CSS file, extract variables with `grep -oP '\-\-[a-zA-Z0-9-]+:[^;]+'`; grep for `font-size`, `color`, `border-radius`, `gap` |
| Tech Stack | `curl -I` for response headers; `grep` HTML for framework markers (`__NEXT_DATA__`, `data-reactroot`, `ng-`); inspect JS filenames |
| Components | `grep` for class name patterns (`button`, `card`, `nav`, `modal`, `drawer`, `badge`, `tag`, `input`, `toggle`); inspect CSS for component-specific selectors |
| Content | `webfetch` for full page text; `grep` for heading tags (`<h1>` through `<h4>`); analyze CTA and button text patterns |

**Parallelize gap filling:** All direct tool extractions can run simultaneously. They are cheap and reliable.

### Phase 2: Runtime Analysis (NEW in v1.2.0)

After static analysis completes, use browser automation to capture dynamic data:

```bash
# Phase 2 is implemented via browser/inspector.js module
# The skill dispatches a subagent with Playwright MCP to execute runtime analysis
```

#### Phase 2.1: Launch Browser Inspector

**Agent:** Dispatch subagent with `category="deep"` and `load_skills=["playwright"]`

**Task Prompt:**
```
TASK: Execute Phase 2 Runtime Analysis for {target_url}
EXPECTED OUTCOME: Sections 15-19 data for DESIGN.md, spa_hydrated status for content-inventory.json
REQUIRED TOOLS: playwright MCP, browser inspector module
MUST DO:
- Launch Playwright browser and navigate to {target_url}
- Wait for full page hydration (React/Vue/Angular/Astro/swup)
- Detect SPA framework and set spa_hydrated: true if confirmed
- Inject browser/inspector.js runtime scripts
- Capture screenshots for visual reference
- Extract dynamic content from all detected routes (for content-inventory.json)
MUST NOT DO:
- Do NOT modify the target website
- Do NOT click through auth walls without permission
```

**Implementation:**
```javascript
const { BrowserInspector } = require('./browser');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(targetUrl);

const inspector = new BrowserInspector(page, {
  screenshotDir: outputPath,
  waitForLoad: true
});

await inspector.initialize(targetUrl);
```

#### Phase 2.2: Record Animations

**Captures:** CSS @keyframes, Framer Motion variants, GSAP timelines, scroll-linked animations

**Agent Task:**
```
TASK: Record all animation systems on {target_url}
EXPECTED OUTCOME: Section 15 (Animation Inventory) populated
REQUIRED TOOLS: browser/animation-recorder.js
MUST DO:
- Inject animation detection scripts
- Hook Framer Motion globals if present
- Hook GSAP timeline methods if present
- Extract CSS @keyframes from stylesheets
- Identify scroll-linked animation libraries
MUST NOT DO:
- Do NOT trigger animations that require user interaction
- Do NOT assume animation library versions
```

**Implementation:**
```javascript
const animations = await inspector.recordAnimations();
// Returns: { css, js, scroll, framerMotion, gsap, transitions }
```

#### Phase 2.3: Inspect Three.js Scene

**Captures:** Camera config, lights, meshes, materials, animation loop

**Agent Task:**
```
TASK: Extract Three.js scene graph from {target_url}
EXPECTED OUTCOME: Section 16 (3D Scene Specification) populated
REQUIRED TOOLS: browser/three-inspector.js
MUST DO:
- Detect Three.js presence (window.THREE, react-three-fiber)
- Access scene graph via canvas.__r3f or window.scene
- Extract camera position, FOV, near/far planes
- List all meshes with geometry and material info
- List all lights with type, color, intensity
- Capture 1-second animation loop frame count
MUST NOT DO:
- Do NOT attempt to extract custom shader code (flag as AMBIGUOUS)
- Do NOT fail if Three.js is not present
```

**Implementation:**
```javascript
const threeJsData = await inspector.inspectThreeJS();
// Returns: { present, renderer, scene, materials, animationLoop }
```

#### Phase 2.4: Extract State Management

**Captures:** Zustand stores, Redux store, MobX observables, React Context

**Agent Task:**
```
TASK: Extract state management architecture from {target_url}
EXPECTED OUTCOME: Section 17 (State Management) populated
REQUIRED TOOLS: browser/state-extractor.js
MUST DO:
- Detect Zustand via create() hook or store.getState()
- Detect Redux via __REDUX_DEVTOOLS_EXTENSION__
- Detect MobX via __mobxAdministration
- Detect React Context via fiber tree traversal
- Detect React Query / TanStack Query
- Extract store state keys and action names
MUST NOT DO:
- Do NOT attempt to read sensitive state (passwords, tokens)
- Do NOT modify store state
```

**Implementation:**
```javascript
const stateData = await inspector.extractState();
// Returns: { stores, stateManagementCount, primaryLibrary }
```

#### Phase 2.5: Map Routes & Interactions

**Captures:** React Router routes, event handlers, user flows

**Agent Task:**
```
TASK: Map routing and interaction patterns on {target_url}
EXPECTED OUTCOME: Sections 18-19 populated
REQUIRED TOOLS: browser inspector core
MUST DO:
- Detect React Router (v6/v7) via __reactRouterContext
- Detect Next.js via __NEXT_DATA__
- List route paths and associated components
- Patch addEventListener to capture event bindings
- Identify common user flows (form submit, theme toggle)
MUST NOT DO:
- Do NOT navigate to protected routes without permission
- Do NOT submit forms
```

**Implementation:**
```javascript
const routes = await inspector.mapRoutes();
const interactions = await inspector.recordInteractions();
// Returns: Route definitions and event handler inventory
```

#### Phase 2.6: Synthesize & Generate Sections

**Merge runtime data into DESIGN.md Sections 15-19:**

```javascript
const designSections = inspector.generateDesignSections();
// Returns markdown strings for:
// - Section 15: Animation Inventory
// - Section 16: 3D Scene Specification
// - Section 17: State Management Architecture
// - Section 18: Route Map & Navigation
// - Section 19: Interaction Patterns
```

**Confidence Tagging for Runtime Data:**
- **EXTRACTED:** Directly observed (e.g., `window.__reactRouterContext.routes`)
- **INFERRED:** Strong signal but required interpretation (e.g., fiber tree traversal)
- **AMBIGUOUS:** Weak signal, multiple possibilities (e.g., custom animation library)

### Phase 3: Confidence Tagging

Merge all subagent outputs and tag every detection. See Confidence Legend above for tag definitions.

**Tagging Rules:**
- Colors found in CSS with >3 occurrences: **EXTRACTED**
- Framework detected via bundle analysis: **EXTRACTED**
- Font family from `font-family` declaration: **EXTRACTED**
- Layout grid inferred from element alignment: **INFERRED**
- Animation easing guessed from visual observation: **INFERRED**
- Dark mode support not visually confirmed: **AMBIGUOUS**
- CMS detected only via meta generator: **INFERRED**

### Phase 3: Product Type Classification

Classify the website using ui-ux-pro-max pattern matching:

```
Analyze the extracted data and classify into ONE category:

1. **SaaS / Dashboard** — Complex UI, data tables, auth flows, admin panels
2. **Landing Page / Marketing** — Hero section, feature grids, social proof, CTAs
3. **E-commerce / Product** — Product cards, cart flow, checkout, filtering
4. **Portfolio / Creative** — Visual-first, galleries, case studies, minimal text
5. **Blog / Content** — Article lists, reading focus, subscription CTAs
6. **Corporate / Institutional** — Formal, navigation-heavy, service descriptions
7. **Web App / Tool** — Interactive functionality, user workflows, real-time updates

Output: { "type": "<category>", "confidence": "EXTRACTED|INFERRED|AMBIGUOUS", "reasoning": "<why>" }
```

**Apply Design Patterns by Type:**
- SaaS: Dense information architecture, data visualization patterns
- Landing: Emotional design, social proof placement, scroll storytelling
- E-commerce: Product hierarchy, trust signals, conversion optimization
- Portfolio: Typography-forward, whitespace, visual impact
- Blog: Readability-first, subscription integration, related content
- Corporate: Structured navigation, service taxonomy, credibility markers
- Web App: Stateful components, error handling, loading states

### Phase 4: Structured Output Generation

#### Generate `DESIGN.md`

Write the 21+ section DESIGN.md using the template from `.sisyphus/templates/DESIGN.md`. The template generates Sections 1-19; Phase 4 also produces `content-inventory.json` (Section 14 equivalent in machine-readable form) and adds SPA hydration metadata:

```markdown
# Design System: {Site Name}

## 1. Product Classification
- **Type:** {classified type}
- **Confidence:** {EXTRACTED|INFERRED|AMBIGUOUS}
- **Reasoning:** {brief explanation}

## 2. Theme & Mood
- **Visual identity:** {description}
- **Brand personality:** {keywords}
- **Design approach:** {e.g., minimal, bold, playful, corporate}
- **Mood keywords:** {3-5 adjectives}

## 3. Colors
### Primary Palette
| Role | Value | Confidence | Source |
|------|-------|------------|--------|
| Primary | `#hex` | EXTRACTED | CSS variable --color-primary |
| Secondary | `#hex` | INFERRED | Dominant accent in hero |
| Accent | `#hex` | EXTRACTED | Button backgrounds |
| Neutral | `#hex` | EXTRACTED | Text and borders |

### Semantic Colors
| Role | Value | Confidence |
|------|-------|------------|
| Success | `#hex` | EXTRACTED |
| Warning | `#hex` | INFERRED |
| Error | `#hex` | EXTRACTED |
| Info | `#hex` | INFERRED |

### Dark Mode (if detected)
| Role | Light | Dark | Confidence |
|------|-------|------|------------|
| Background | `#fff` | `#0a0a0a` | EXTRACTED |

## 4. Typography
### Font Stack
| Role | Family | Weights | Confidence | Source |
|------|--------|---------|------------|--------|
| Headings | `Inter` | 700, 800 | EXTRACTED | Google Fonts link |
| Body | `Inter` | 400, 500 | EXTRACTED | CSS font-family |
| Mono | `JetBrains Mono` | 400 | INFERRED | Code blocks |

### Type Scale
| Level | Size | Weight | Line-Height | Confidence |
|-------|------|--------|-------------|------------|
| H1 | 48px | 800 | 1.1 | EXTRACTED |
| H2 | 32px | 700 | 1.2 | EXTRACTED |

## 5. Components
### Button
- **Variants:** primary, secondary, ghost, danger
- **Sizes:** sm (32px), md (40px), lg (48px)
- **States:** default, hover, active, disabled, loading
- **Confidence:** EXTRACTED

### Card
- **Padding:** 24px
- **Border radius:** 12px
- **Shadow:** `0 4px 6px -1px rgba(0,0,0,0.1)`
- **Confidence:** EXTRACTED

[Additional components...]

## 6. Layout
- **Max width:** 1280px
- **Grid system:** 12-column
- **Gutter:** 24px
- **Breakpoints:** sm 640px, md 768px, lg 1024px, xl 1280px
- **Confidence:** INFERRED (from visual analysis)

## 7. Depth & Elevation
- **Shadow scale:** 3 levels (sm, md, lg)
- **Border radius scale:** 3 levels (sm 4px, md 8px, lg 16px)
- **Z-index layers:** backdrop (40), modal (50), toast (60)
- **Confidence:** INFERRED

## 8. Do's & Don'ts
- **Do:** Use primary color for main CTAs only
- **Don't:** Use accent color for body text
- **Do:** Maintain 4.5:1 contrast minimum
- **Don't:** Mix border radius inconsistently within components
- **Confidence:** INFERRED (from design principles)

## 9. Agent Prompt Guide
```
When implementing this design system:
1. Prioritize {primary color} for all primary actions
2. Use {font stack} for all text — do not substitute
3. Maintain {spacing system} rhythm throughout
4. Implement all button states: default, hover, active, disabled
5. Use {border radius} consistently per component category
6. Respect {breakpoint} responsive behavior
7. Follow {product type} patterns for component density
```
```

#### Generate `tech-detections.json`

```json
{
  "url": "{target_url}",
  "analyzed_at": "{ISO8601}",
  "detections": [
    {
      "category": "framework",
      "technology": "Next.js",
      "version": "14.x",
      "confidence": "EXTRACTED",
      "confidence_score": 1.0,
      "evidence": "__NEXT_DATA__ in DOM, _next/static chunks",
      "source": "dom_scrape"
    },
    {
      "category": "styling",
      "technology": "TailwindCSS",
      "version": null,
      "confidence": "INFERRED",
      "confidence_score": 0.75,
      "evidence": "Utility class names detected: flex, justify-center, bg-blue-500",
      "source": "llm_analysis"
    }
  ],
  "classified_type": {
    "type": "SaaS",
    "confidence": "INFERRED",
    "reasoning": "Dashboard layout, data tables, auth patterns detected"
  }
}
```

#### Generate `analysis-summary.md`

```markdown
# Website Analysis Summary

## {Site Name} ({target_url})

### Quick Facts
- **Type:** {classified type} ({confidence})
- **Tech Stack:** {primary framework}, {styling approach}, {hosting}
- **Complexity:** {Low|Medium|High} — {reasoning}

### What We Know For Sure (EXTRACTED)
- {list of EXTRACTED items}

### What We Inferred (INFERRED)
- {list of INFERRED items}

### What Needs Your Eyes (AMBIGUOUS)
- {list of AMBIGUOUS items with specific questions}

### Recommended Implementation Order
1. {first component to build}
2. {second}
3. {third}

### Risk Factors
- {potential issues}
```

#### Generate `content-inventory.json` (v1.5.0)

Create a structured content inventory from all extraction passes, merging static DOM data, subagent analysis, and Phase 2 runtime results:

```json
{
  "url": "{target_url}",
  "analyzed_at": "{ISO8601}",
  "spa_hydrated": true,
  "navigation": [
    { "label": "Work", "href": "/work", "type": "primary" }
  ],
  "hero": {
    "title_lines": [],
    "subtitle": null,
    "description": null,
    "cta": null
  },
  "sections": [
    { "id": "features", "heading": "Features", "type": "content" }
  ],
  "projects": [],
  "footer": {
    "links": [],
    "copyright": null
  },
  "metadata": {
    "title": null,
    "description": null,
    "lang": "en"
  },
  "interactive_elements": [
    { "type": "button", "text": "Get Started", "count": 3 }
  ]
}
```

**Field mapping rules:**
- `navigation` — extracted from DOM nav elements, verified by Visual Structure Agent
- `hero` — extracted from first prominent section (h1 + subtitle + description)
- `sections` — all major content sections identified by Visual Structure Agent
- `projects` — portfolio/case study items (if detected as portfolio type); product catalog items (if e-commerce)
- `footer` — links and copyright text from `<footer>` element
- `metadata` — `<title>`, `<meta name="description">`, `<html lang>`
- `interactive_elements` — button, link, form, slider, toggle detected across all passes
- `spa_hydrated` — `true` if Phase 2 confirmed SPA hydration (React/Vue/Astro/swup); `false` if static HTML

**All text values must be exact strings from the source, never summarized or paraphrased.**

### Phase 5: Quality Gate

Run automated checks on output:

```
CHECK: DESIGN.md has all 21+ sections (1-9 + 10-14 + 15-19)
CHECK: Every detection in tech-detections.json has confidence tag
CHECK: At least one AMBIGUOUS item flagged for human review
CHECK: Product type classification present
CHECK: Agent Prompt Guide section populated with items 1-24
CHECK: CSS Architecture section (10) populated if CSS files detected
CHECK: Accessibility Inventory (11) includes focus and motion checks
CHECK: Browser Support Matrix (12) lists detected modern features
CHECK: Risk Assessment (14) flags high/medium/low items
CHECK: Animation Inventory (15) present if animations detected
CHECK: 3D Scene section (16) present if Three.js detected
CHECK: State Management (17) present if stores detected
CHECK: Route Map (18) present if router detected
CHECK: Interaction Patterns (19) present for interactive sites
```

**v1.5.0 Additional Checks:**

```
CHECK: content-inventory.json exists with all required fields (navigation, hero, sections, projects/footer, metadata, interactive_elements, spa_hydrated)
CHECK: Visual Parity Gate — clone screenshot captured and compared to source; no invented content found
CHECK: Open Question Gate — scan for HIGH/MEDIUM/LOW unresolved questions before proceeding to planning
CHECK: SPA Hydration confirmed — spa_hydrated: true if SPA framework detected, runtime content extracted from all routes
```

**If any check fails:** Re-run the relevant analysis pass.

---

## Detection Rules Reference

The following patterns are automatically extracted during Pass 1 and verified in Phase 2.

### Detection 1: !important Declarations

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

### Detection 2: Unthrottled Event Handlers

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

### Detection 3: Hardcoded Color Values

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

### Detection 4: Layout Property Animations

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

### Detection 5: Z-Index Values

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

### Detection 6: Focus-Visible Styles

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

### Detection 7: prefers-reduced-motion

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

### Detection 8: CSS Color Module Level 5

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

### Detection 9: CSS Layers

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

### Detection 10: Theme System Complexity

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

---

## CSS Architecture & Accessibility Analysis Workflow

### Step X: CSS Architecture & Accessibility Analysis

**Purpose:** Identify UI/UX implementation risks before they become refactor debt

**When to Run:** After Phase 1 (Multi-Pass Extraction) completes, before Phase 4 (Structured Output Generation)

**Subagents to Dispatch:**

1. **CSS Architecture Agent**
   - Analyze specificity, !important, layers (Detection 1, 9)
   - Detect hardcoded values (Detection 3)
   - Identify z-index chaos (Detection 5)
   - Check animation performance patterns (Detection 2, 4)
   - Output: Populates Section 10 of DESIGN.md

2. **Accessibility Agent**
   - Scan for focus indicators (Detection 6)
   - Check ARIA usage (landmark elements, roles, labels)
   - Verify reduced motion support (Detection 7)
   - Estimate color contrast (Detection 3 hardcoded values)
   - Output: Populates Section 11 of DESIGN.md

3. **Browser Support Agent**
   - Detect modern CSS features (Detection 8, 9)
   - Identify fallback requirements
   - Map to browser support matrix (Detection 10 for theme complexity)
   - Output: Populates Section 12 of DESIGN.md

**Collective Output:**
- Sections 10-14 added to DESIGN.md
- Risk assessment with confidence tags (EXTRACTED/INFERRED/AMBIGUOUS)
- Implementation warnings for PRD hardening checklist
- Updated tech-detections.json with new detection categories

**Failure Handling:**
- If CSS Architecture Agent fails: Use direct `grep` fallbacks for Detection 1, 3, 5, 9
- If Accessibility Agent fails: Use direct `grep` fallbacks for Detection 6, 7
- If Browser Support Agent fails: Use direct `grep` fallbacks for Detection 8, 10
- **Never block Phase 4 on these subagents** — missing data is marked AMBIGUOUS, not blocking

---

## Implementation Status

### v1.5.0 Progress
| Feature | Status | Evidence |
|---------|--------|----------|
| Content Inventory Extraction | **✅ MERGED** | `content-inventory.json` in Phase 4, 21+ section DESIGN.md |
| Visual Parity Gate | **✅ MERGED** | Phase 5 checks — screenshot, content parity, invented content |
| source_content_ref in Plans | **✅ MERGED** | Integration with plan-writer, mapped to inventory paths |
| Open Question Gate | **✅ MERGED** | Pre-wave scan, HIGH/MEDIUM/LOW classification |
| SPA Hydration Verification | **✅ MERGED** | spa_hydrated field, multi-route dynamic extraction |

### v1.2.0 Progress

| Day | Feature | Status | Files |
|-----|---------|--------|-------|
| 1 | Browser Automation Infrastructure | **✅ COMPLETE** | `browser/inspector.js`, `browser/launcher.js`, `browser/injector.js` |
| 2 | Animation Capture | **✅ COMPLETE** | `browser/animation-recorder.js` (Framer Motion hooks, GSAP hooks, trigger mapping) |
| 3 | 3D Scene Inspection | **✅ COMPLETE** | `browser/three-inspector.js` (R3F support, scene graph, performance metrics) |
| 4 | State & Route Extraction | **✅ COMPLETE** | `browser/state-extractor.js`, `browser/route-mapper.js` (Zustand, React Router, Next.js) |
| 5 | Integration & Testing | **✅ COMPLETE** | Full pipeline validation, all sections 15-19 generated end-to-end |

### Day 1 Completion Checklist
- [x] BrowserLauncher with headless/headed modes
- [x] BrowserInspector with phase coordination
- [x] Injector with script injection and error handling
- [x] Playwright direct integration
- [x] MCP server mode support
- [x] Screenshot capture
- [x] SPA hydration waiting
- [x] DESIGN.md Sections 15-19 generation
- [x] SKILL.md updated with Phase 2 workflow
- [x] Validation test passed (module structure)

### Day 2 Completion Checklist
- [x] AnimationRecorder rewritten with hooks
- [x] Framer Motion detection via MutationObserver
- [x] Framer Motion variant capture from DOM
- [x] GSAP hook injection (gsap.to, gsap.from, gsap.timeline)
- [x] GSAP ScrollTrigger detection
- [x] CSS @keyframes extraction from stylesheets
- [x] CSS transitions capture
- [x] Animation trigger mapping (hover, scroll, mount, click)
- [x] DESIGN.md Section 15 generation (toDesignSection())
- [x] Integration with BrowserInspector
- [x] Validation test passed (unit tests)

### Day 4 Completion Checklist
- [x] StateExtractor with library detection (Zustand, Redux, MobX, React Query)
- [x] Zustand store extraction (runtime hooks, DOM markers)
- [x] Redux store extraction (DevTools, Provider tree)
- [x] MobX store extraction (observable scanning)
- [x] React Context extraction (fiber tree)
- [x] React Query / TanStack Query detection
- [x] URL state extraction (path, query params, hash)
- [x] RouteMapper with router detection
- [x] React Router v5/v6/v7 route extraction
- [x] Next.js route extraction (build manifest, scripts)
- [x] Vue Router extraction
- [x] Remix route extraction
- [x] Navigation pattern detection (links, programmatic)
- [x] Layout hierarchy detection
- [x] DESIGN.md Section 17 generation (toDesignSection())
- [x] DESIGN.md Section 18 generation (toDesignSection())
- [x] Integration with BrowserInspector
- [x] Validation test passed (unit tests)

### Day 5 Completion Checklist
- [x] Full pipeline integration test (all 5 sections generated)
- [x] Cross-module data flow verified (inspector → recorder → section)
- [x] BrowserInspector cleanup (removed old format methods)
- [x] All 8 browser module files present and exported
- [x] package.json with Playwright dependency
- [x] DESIGN.md template updated with Sections 15-19
- [x] Validation scripts for all 5 days (validate-day1.js through validate-day5.js)
- [x] SKILL.md updated with complete v1.2.0 implementation status
- [x] Error handling for missing system dependencies documented
- [x] Ready for live site testing

## v1.2.0 Release Notes

### What's New
- **Runtime Analysis Engine**: 5 new browser automation modules extract dynamic data
- **Section 15 (Animation Inventory)**: CSS keyframes, Framer Motion, GSAP, scroll-linked animations
- **Section 16 (3D Scene Specification)**: Three.js/R3F camera, lights, meshes, materials, performance
- **Section 17 (State Management)**: Zustand, Redux, MobX, React Context, React Query
- **Section 18 (Route Map)**: React Router, Next.js, Vue Router, Remix with lazy loading
- **Section 19 (Interaction Patterns)**: Event handlers, user flows, form handling

### Files Added
```
browser/
├── inspector.js          # Main coordinator (177 lines)
├── launcher.js           # Browser lifecycle (138 lines)
├── injector.js           # Script injection (281 lines)
├── animation-recorder.js # Animation capture (516 lines)
├── three-inspector.js    # 3D scene extraction (710 lines)
├── state-extractor.js    # State management (516 lines)
├── route-mapper.js       # Route mapping (385 lines)
├── index.js              # Entry point (36 lines)
└── validate-day*.js      # 5 validation scripts
```

### Validation
Run `node browser/validate-day5.js` to verify full pipeline.

## v1.2.1 Update: Production Templates (2026-05-16)

Based on successful DropDeadDev portfolio replication, two production-ready templates were created:

### CSS Architecture Template
**Location:** `templates/css-architecture/`

- `index.css.template` — 91 CSS custom properties @theme structure
- `README.md` — Usage and customization guide

**Contents:**
- 91 @theme tokens (colors, fonts, spacing, depth, radius, blur)
- 23 keyframe animations with utility classes
- Glass morphism system (3 levels)
- Planet gradient system (6 variants)
- prefers-reduced-motion support
- Accessibility patterns (focus-visible)

### React + Vite + Tailwind v4 Scaffold
**Location:** `templates/react-vite-tailwind4/`

- Complete project structure with React Router v7
- Three.js lazy-loading pattern
- Cookie-based auth (no localStorage)
- Zustand stores (no persist)
- Framer Motion ready
- 0 ESLint errors guaranteed

**Time Saved:** ~5 hours per project

### Template Usage

```bash
# Copy CSS template
cp templates/css-architecture/index.css.template src/index.css

# Copy React scaffold
cp -r templates/react-vite-tailwind4/src/* src/

# Customize and verify
npm run build && npm run lint
```

See `templates/README.md` for full documentation.

## v1.5.0 Update: Pipeline Hardening (2026-05-19)

Based on the full pipeline test against quentinhocde.com, 5 Oracle pipeline fixes merged:

### Fix 1: Content Inventory Extraction
- New output artifact `content-inventory.json` with structured content (navigation, hero, sections, projects, footer, metadata, interactive_elements)
- All text values are exact source strings — never summarized or paraphrased
- Generated during Phase 4 after all analysis passes complete

### Fix 2: Visual Parity Gate
- New quality check added to Phase 5 Gate
- Captures clone screenshot, compares content count against `content-inventory.json`
- Verifies zero invented content (grep for lorem/placeholder/todo)
- Scored 0-3: 0=placeholder content found, 3=perfect parity

### Fix 3: source_content_ref in Plans
- Integration with plan-writer: every content-producing slice MUST include `source_content_ref`
- Maps each UI element to a specific `content-inventory.json` path
- Eliminates placeholder content from clone builds

### Fix 4: Open Question Gate
- Pre-wave scan for unresolved HIGH/MEDIUM/LOW questions
- No HIGH blockers allowed before wave execution
- All questions must have documented mitigation plans

### Fix 5: SPA Hydration Verification
- Phase 2 now explicitly confirms SPA hydration status
- `spa_hydrated: true/false` field in `content-inventory.json`
- Dynamic content extracted from all detected routes for SPA sites
- Supports React, Vue, Astro, swup, and custom SPA frameworks

### Files Modified
- SKILL.md — Produces, Phase 4 (new content-inventory.json step), Phase 5 (4 new checks), Integration sections, Output, File-Based State

### Validation
- Pipeline test PASSED on quentinhocde.com (Astro + GSAP + swup): all 5 fixes verified, 46/46 archive projects extracted, 23-section DESIGN.md, zero placeholder content
- See: `~/developer/test-artifacts/v1.5.0/questin-clone/PIPELINE_TEST_REPORT_v1.5.0.md`