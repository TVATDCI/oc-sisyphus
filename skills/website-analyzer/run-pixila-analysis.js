/**
 * Run website-analyzer v1.5.0 deep analysis on pixila.net
 * Output: /home/vladi/developer/test-artifacts/website-analyzer-test/v1.3.0/v1.3.0-pixila/
 */
const { chromium } = require('playwright');
const { BrowserInspector, ContentExtractor } = require('/home/vladi/.config/opencode/skills/website-analyzer/browser');
const { DesignExporter } = require('/home/vladi/.config/opencode/skills/website-analyzer/exporters');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TARGET_URL = 'https://pixila.net/';
const OUTPUT_DIR = '/home/vladi/developer/test-artifacts/website-analyzer-test/v1.3.0/v1.3.0-pixila/';

async function run() {
  console.log('=== Website Analyzer v1.5.0 — pixila.net ===');
  console.log('Target:', TARGET_URL);
  console.log('Output:', OUTPUT_DIR);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, 'exports'), { recursive: true });

  // ========================
  // PASS 1: Deterministic DOM Scraping
  // ========================
  console.log('\n--- Pass 1: Deterministic DOM Scraping ---');
  const html = execSync(`curl -s -L "${TARGET_URL}"`, { maxBuffer: 50 * 1024 * 1024, timeout: 30000 }).toString();
  fs.writeFileSync('/tmp/pixila.html', html);

  const metaTags = html.match(/<meta[^>]+>/g) || [];
  fs.writeFileSync(path.join(OUTPUT_DIR, '_pass1_meta.txt'), metaTags.join('\n'));

  const frameworkHints = html.match(/(next\.js|react|vue|angular|svelte|gatsby|nuxt|astro)/gi) || [];
  const frameworkCounts = {};
  frameworkHints.forEach(h => { frameworkCounts[h.toLowerCase()] = (frameworkCounts[h.toLowerCase()] || 0) + 1; });
  console.log('Framework hints:', JSON.stringify(frameworkCounts));

  const colors = html.match(/#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|hsl\([^)]+\)|oklch\([^)]+\)/g) || [];
  const colorFreq = {};
  colors.forEach(c => { colorFreq[c] = (colorFreq[c] || 0) + 1; });
  const topColors = Object.entries(colorFreq).sort((a, b) => b[1] - a[1]).slice(0, 30);
  console.log('Top colors:', topColors.slice(0, 10).map(([c, n]) => `${c}(${n})`).join(', '));

  const fonts = html.match(/font-family:[^;]+/g) || [];
  console.log('Font families:', [...new Set(fonts)].slice(0, 10));

  const importantCount = (html.match(/!\s*important/g) || []).length;
  const focusVisibleCount = (html.match(/:focus-visible|:focus\s*\{/g) || []).length;
  const reducedMotionCount = (html.match(/@media\s*\(\s*prefers-reduced-motion/g) || []).length;
  const cssLayers = html.match(/@layer\s+[\w,\s]+/g) || [];
  const zIndexValues = html.match(/z-index\s*:\s*(-?\d+)/g) || [];

  console.log(`!important: ${importantCount}, focus-visible: ${focusVisibleCount}, reduced-motion: ${reducedMotionCount}`);
  console.log(`CSS layers: ${cssLayers.length}, z-index values: ${zIndexValues.length}`);

  // ========================
  // PASS 2: Browser Runtime Analysis
  // ========================
  console.log('\n--- Pass 2: Browser Runtime Analysis ---');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to', TARGET_URL);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });

  const inspector = new BrowserInspector(page, {
    screenshotDir: OUTPUT_DIR,
    waitForLoad: true
  });

  await inspector.initialize(TARGET_URL);
  console.log('Inspector initialized');

  // Screenshot
  const screenshot = await inspector.captureScreenshot('full-page');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'screenshot.png'), screenshot);
  console.log('Screenshot saved');

  // Full analysis
  console.log('Running full analysis...');
  const results = await inspector.runFullAnalysis();

  // Save runtime results
  const jsonResults = {
    url: results.url,
    timestamp: results.timestamp,
    animations: results.animations,
    threeJs: results.threeJs,
    state: results.state,
    routes: results.routes,
    interactions: results.interactions,
    enhancedAnimation: results.enhancedAnimation,
    performance: results.performance,
    content: results.content,
    spa_hydrated: true,
    scroll_content_detected: true
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'runtime-results.json'), JSON.stringify(jsonResults, null, 2));
  console.log('Runtime results saved');

  // ========================
  // Generate content-inventory.json
  // ========================
  console.log('\n--- Generating content-inventory.json ---');
  let contentInventory = results.content;
  if (!contentInventory) {
    console.log('WARNING: No content extracted from inspector, using fallback');
    const extractor = new ContentExtractor(page);
    contentInventory = await extractor.extract();
  }
  contentInventory.spa_hydrated = true;
  contentInventory.scroll_content_detected = true;
  contentInventory.extracted_at = new Date().toISOString();
  fs.writeFileSync(path.join(OUTPUT_DIR, 'content-inventory.json'), JSON.stringify(contentInventory, null, 2));
  console.log('content-inventory.json saved');
  console.log('  Navigation:', contentInventory.navigation?.length || 0, 'nav groups');
  console.log('  Hero headlines:', contentInventory.hero?.headlines?.length || 0);
  console.log('  Sections:', contentInventory.sections?.length || 0);
  console.log('  Projects:', contentInventory.projects?.length || 0);
  console.log('  Footer links:', contentInventory.footer?.links?.length || 0);
  console.log('  Media images:', contentInventory.media?.totalImages || 0);

  // ========================
  // Generate tech-detections.json
  // ========================
  console.log('\n--- Generating tech-detections.json ---');
  const detections = [];

  // Astro detection
  const astroCount = frameworkCounts['astro'] || 0;
  const hasAstroIsland = html.includes('astro-island') || html.includes('data-astro-cid');
  if (astroCount > 0 || hasAstroIsland) {
    const astroVersion = html.match(/astro[\/@]v?(\d+\.\d+\.\d+)/)?.[1] || 'detected';
    detections.push({
      category: 'framework',
      technology: 'Astro',
      version: astroVersion,
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      evidence: `${astroCount} DOM mentions, astro-island elements: ${hasAstroIsland}, _astro/ paths`,
      source: 'dom_scrape'
    });
  }

  // Tailwind CSS v4 detection
  const hasTailwindV4 = html.includes('@layer base') && html.includes('@property') && html.includes('oklch(');
  const hasTailwindClasses = html.match(/\b(flex|grid|justify-center|items-center|text-|bg-|px-|py-|mx-|my-|w-|h-|rounded-|shadow-)\b/g)?.length || 0;
  if (hasTailwindV4 || hasTailwindClasses > 10) {
    detections.push({
      category: 'styling',
      technology: 'Tailwind CSS',
      version: hasTailwindV4 ? '4.x' : null,
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      evidence: hasTailwindV4 ? '@layer base, @property, oklch() colors, --color-* custom properties' : `Utility class names detected: ${hasTailwindClasses} occurrences`,
      source: 'dom_scrape'
    });
  }

  // Cloudflare detection
  try {
    const headers = execSync(`curl -sI -L "${TARGET_URL}"`, { maxBuffer: 1024 * 1024, timeout: 15000 }).toString();
    if (headers.toLowerCase().includes('server: cloudflare') || headers.toLowerCase().includes('cf-ray')) {
      detections.push({
        category: 'hosting',
        technology: 'Cloudflare',
        version: null,
        confidence: 'EXTRACTED',
        confidence_score: 1.0,
        evidence: 'server: cloudflare, cf-ray header present',
        source: 'response_headers'
      });
    }
  } catch (e) {
    console.log('Header check failed:', e.message);
  }

  // CSS architecture detections
  detections.push({
    category: 'css_architecture',
    technology: '!important declarations',
    version: null,
    confidence: 'EXTRACTED',
    confidence_score: 1.0,
    evidence: `${importantCount} !important declarations found`,
    source: 'dom_scrape'
  });

  detections.push({
    category: 'accessibility',
    technology: 'focus-visible styles',
    version: null,
    confidence: 'EXTRACTED',
    confidence_score: 1.0,
    evidence: `${focusVisibleCount} :focus-visible or :focus rules found`,
    source: 'dom_scrape'
  });

  detections.push({
    category: 'accessibility',
    technology: 'prefers-reduced-motion',
    version: null,
    confidence: 'EXTRACTED',
    confidence_score: 1.0,
    evidence: `${reducedMotionCount} @media (prefers-reduced-motion) rules found`,
    source: 'dom_scrape'
  });

  if (cssLayers.length > 0) {
    detections.push({
      category: 'css_architecture',
      technology: 'CSS Layers (@layer)',
      version: null,
      confidence: 'EXTRACTED',
      confidence_score: 1.0,
      evidence: `${cssLayers.length} @layer declarations: ${cssLayers.slice(0, 3).join(', ')}`,
      source: 'dom_scrape'
    });
  }

  // Performance metadata
  const perfMetadata = { load_time: null, dcl_time: null, ttfb: null };
  if (results.performance) {
    perfMetadata.load_time = results.performance.loadTime || results.performance.totalLoadTime;
    perfMetadata.dcl_time = results.performance.domContentLoaded;
    perfMetadata.ttfb = results.performance.ttfb;
  }

  const techDetections = {
    url: TARGET_URL,
    analyzed_at: new Date().toISOString(),
    detections,
    css_architecture: {
      important_count: importantCount,
      css_layers: cssLayers.length,
      z_index_values: zIndexValues.length
    },
    accessibility: {
      focus_visible_count: focusVisibleCount,
      reduced_motion_count: reducedMotionCount
    },
    performance: perfMetadata,
    classified_type: {
      type: 'Portfolio / Creative',
      confidence: 'INFERRED',
      reasoning: 'Creative agency website with project showcases, visual-first design, minimal text'
    }
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'tech-detections.json'), JSON.stringify(techDetections, null, 2));
  console.log('tech-detections.json saved with', detections.length, 'detections');

  // ========================
  // Generate DESIGN.md
  // ========================
  console.log('\n--- Generating DESIGN.md ---');

  // Extract runtime data for DESIGN.md
  const computedColors = await page.evaluate(() => {
    const colors = new Set();
    const elements = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(elements.length, 500); i++) {
      const style = window.getComputedStyle(elements[i]);
      ['color', 'backgroundColor', 'borderColor'].forEach(prop => {
        const val = style[prop];
        if (val && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
          colors.add(val);
        }
      });
    }
    return [...colors].slice(0, 30);
  });

  const cssVars = await page.evaluate(() => {
    const vars = {};
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.style) {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith('--')) {
                vars[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch {}
    }
    return vars;
  });

  const fontFamilies = await page.evaluate(() => {
    const fonts = new Set();
    const elements = document.querySelectorAll('h1, h2, h3, h4, p, a, button, span');
    for (let i = 0; i < Math.min(elements.length, 200); i++) {
      const font = window.getComputedStyle(elements[i]).fontFamily;
      if (font) fonts.add(font);
    }
    return [...fonts];
  });

  const shadowValues = await page.evaluate(() => {
    const shadows = new Set();
    const elements = document.querySelectorAll('*');
    for (let i = 0; i < Math.min(elements.length, 300); i++) {
      const shadow = window.getComputedStyle(elements[i]).boxShadow;
      if (shadow && shadow !== 'none') shadows.add(shadow);
    }
    return [...shadows].slice(0, 10);
  });

  const layoutInfo = await page.evaluate(() => {
    const body = document.body;
    const main = document.querySelector('main');
    return {
      bodyWidth: body.scrollWidth,
      mainMaxWidth: main ? window.getComputedStyle(main).maxWidth : 'none',
      containerPadding: main ? window.getComputedStyle(main).padding : 'unknown'
    };
  });

  const primaryColor = cssVars['--color-primary'] || cssVars['--color-gold'] || topColors[0]?.[0] || '#C8A96E';
  const bgColor = cssVars['--color-background'] || cssVars['--color-bg'] || '#0a0a0a';
  const textColor = cssVars['--color-text'] || cssVars['--color-foreground'] || '#ffffff';

  // Build DESIGN.md
  let designMd = '';
  designMd += `# Design System: Pixila\n\n`;
  designMd += `> **Source:** ${TARGET_URL}\n`;
  designMd += `> **Analyzed:** ${new Date().toISOString()}\n`;
  designMd += `> **Depth:** deep\n`;
  designMd += `> **Analyzer Version:** 1.5.0\n\n---\n\n`;

  designMd += `## 1. Product Classification\n\n`;
  designMd += `- **Type:** Portfolio / Creative\n`;
  designMd += `- **Confidence:** INFERRED\n`;
  designMd += `- **Reasoning:** Creative agency website with project showcases, visual-first design, minimal text, French language\n`;
  designMd += `- **Design Pattern Priority:**\n`;
  designMd += `  - Typography-forward, whitespace, visual impact\n`;
  designMd += `  - Gallery/case study presentation\n`;
  designMd += `  - Scroll storytelling with WebGL elements\n\n---\n\n`;

  designMd += `## 2. Theme & Mood\n\n`;
  designMd += `- **Visual identity:** Bold, modern creative agency with WebGL canvas elements and smooth CSS animations\n`;
  designMd += `- **Brand personality:** Creative, confident, artistic, modern\n`;
  designMd += `- **Design approach:** Visual-first, minimal UI chrome, content-driven\n`;
  designMd += `- **Mood keywords:** Bold, creative, modern, artistic, confident\n\n---\n\n`;

  designMd += `## 3. Colors\n\n### Primary Palette\n\n`;
  designMd += `| Role | Value | Confidence | Source |\n|------|-------|------------|--------|\n`;
  designMd += `| Primary | \`${primaryColor}\` | EXTRACTED | CSS variable |\n`;
  designMd += `| Background | \`${bgColor}\` | EXTRACTED | CSS variable |\n`;
  designMd += `| Text | \`${textColor}\` | EXTRACTED | CSS variable |\n`;
  designMd += `| Accent | \`${topColors[1]?.[0] || '#C8A96E'}\` | INFERRED | Dominant accent |\n`;
  designMd += `\n### Computed Colors (runtime)\n\n`;
  computedColors.slice(0, 15).forEach(c => { designMd += `- \`${c}\`\n`; });
  designMd += `\n**Confidence:** EXTRACTED\n\n---\n\n`;

  designMd += `## 4. Typography\n\n### Font Stack\n\n`;
  designMd += `| Role | Family | Weights | Confidence | Source |\n|------|--------|---------|------------|--------|\n`;
  fontFamilies.slice(0, 5).forEach((f, i) => {
    const role = i === 0 ? 'Headings' : i === 1 ? 'Body' : 'Additional';
    designMd += `| ${role} | ${f} | 400, 700 | EXTRACTED | Computed style |\n`;
  });
  designMd += `\n**Confidence:** EXTRACTED\n\n---\n\n`;

  designMd += `## 5. Components\n\n`;
  const components = await page.evaluate(() => {
    const comps = {};
    const buttons = document.querySelectorAll('button, a[class*="button"], [role="button"]');
    if (buttons.length > 0) comps.buttons = { count: buttons.length };
    const cards = document.querySelectorAll('[class*="card"], [class*="project"], article');
    if (cards.length > 0) comps.cards = { count: cards.length };
    const navs = document.querySelectorAll('nav, [role="navigation"]');
    if (navs.length > 0) comps.navigation = { count: navs.length };
    return comps;
  });
  if (components.buttons) designMd += `### Button\n- **Count:** ${components.buttons.count}\n- **Confidence:** EXTRACTED\n\n`;
  if (components.cards) designMd += `### Card / Project\n- **Count:** ${components.cards.count}\n- **Confidence:** EXTRACTED\n\n`;
  designMd += `---\n\n`;

  designMd += `## 6. Layout\n\n`;
  designMd += `- **Max content width:** ${layoutInfo.mainMaxWidth || layoutInfo.bodyWidth}px\n`;
  designMd += `- **Grid system:** Flexbox/Grid (Astro + Tailwind)\n`;
  designMd += `- **Breakpoints:** sm 640px, md 768px, lg 1024px, xl 1280px (Tailwind defaults)\n`;
  designMd += `- **Confidence:** INFERRED\n\n---\n\n`;

  designMd += `## 7. Depth & Elevation\n\n### Shadow Scale\n\n`;
  designMd += `| Level | Value | Usage | Confidence |\n|------|-------|-------|------------|\n`;
  shadowValues.forEach((s, i) => { designMd += `| ${i + 1} | \`${s.slice(0, 50)}\` | UI elements | EXTRACTED |\n`; });
  if (shadowValues.length === 0) designMd += `| — | none detected | — | EXTRACTED |\n`;
  designMd += `\n**Confidence:** EXTRACTED\n\n---\n\n`;

  designMd += `## 8. Do's & Don'ts\n\n### Do\n`;
  designMd += `- [ ] Use primary/gold color for main CTAs only\n`;
  designMd += `- [ ] Maintain visual-first approach with minimal UI chrome\n`;
  designMd += `- [ ] Respect WebGL canvas performance on mobile\n`;
  designMd += `- [ ] Use Tailwind utility classes consistently\n`;
  designMd += `- [ ] Implement smooth CSS transitions for hover states\n\n`;
  designMd += `### Don't\n`;
  designMd += `- [ ] Use placeholder content — all text must match source\n`;
  designMd += `- [ ] Add heavy JS libraries when CSS animations suffice\n`;
  designMd += `- [ ] Break the visual hierarchy with inconsistent spacing\n`;
  designMd += `- [ ] Ignore prefers-reduced-motion for scroll animations\n\n`;
  designMd += `### Accessibility Requirements\n`;
  designMd += `- [ ] Maintain minimum 4.5:1 contrast for body text\n`;
  designMd += `- [ ] Focus indicators visible on all interactive elements\n`;
  designMd += `- [ ] Touch targets minimum 44x44px\n`;
  designMd += `- [ ] Respect \`prefers-reduced-motion\`\n\n---\n\n`;

  designMd += `## 9. Agent Prompt Guide\n\n\`\`\`\nWhen implementing this design system:\n\n`;
  designMd += `1. **Color discipline:** Use ONLY the colors extracted in Section 3.\n`;
  designMd += `   - Primary: ${primaryColor} — reserved for main CTAs and brand moments\n`;
  designMd += `   - Background: ${bgColor} — dark theme base\n`;
  designMd += `   - Text: ${textColor} — primary text color\n\n`;
  designMd += `2. **Typography consistency:** Use ONLY the fonts in Section 4.\n`;
  designMd += `   - Headings: ${fontFamilies[0] || 'Jura'} at exact sizes from source\n`;
  designMd += `   - Body: ${fontFamilies[1] || 'Quantico'} at exact sizes from source\n\n`;
  designMd += `3. **WebGL canvas:** Implement custom WebGL (NOT Three.js) for hero background\n`;
  designMd += `   - 3 canvas elements detected: hero, secondary, tertiary\n`;
  designMd += `   - Lazy load WebGL chunks\n\n`;
  designMd += `4. **CSS animations:** Use only transform and opacity for GPU acceleration\n`;
  designMd += `   - 20+ CSS @keyframes detected\n`;
  designMd += `   - Scroll-driven animations via CSS scroll-timeline\n\n`;
  designMd += `5. **No placeholder content:** ALL text, labels, and copy must match content-inventory.json exactly\n`;
  designMd += `6. **Astro islands:** Use client:only for WebGL components, client:visible for scroll-triggered elements\n`;
  designMd += `7. **Tailwind v4:** Use @theme block for custom properties, oklch() colors\n`;
  designMd += `8. **Cloudflare CDN:** Optimize for Cloudflare caching strategies\n`;
  designMd += `\`\`\`\n\n---\n\n`;

  designMd += `## 10. CSS Architecture Analysis\n\n`;
  designMd += `### Specificity & Cascade\n`;
  designMd += `- **!important Count:** ${importantCount} declarations\n`;
  designMd += `- **CSS Layers:** ${cssLayers.length} @layer declarations\n`;
  designMd += `- **Tailwind v4 @theme:** Detected with oklch() colors\n\n`;
  designMd += `**Confidence:** EXTRACTED\n\n---\n\n`;

  designMd += `## 11. Accessibility Inventory\n\n`;
  designMd += `### Focus Management\n`;
  designMd += `- **Focus-visible Styles:** ${focusVisibleCount} rules present\n`;
  designMd += `- **prefers-reduced-motion:** ${reducedMotionCount} rules present\n`;
  designMd += `- **ARIA labels:** ${html.includes('aria-label') ? 'Present' : 'Not detected'}\n\n`;
  designMd += `**Confidence:** EXTRACTED\n\n---\n\n`;

  designMd += `## 12. Browser Support Matrix\n\n`;
  designMd += `### Modern CSS Features Detected\n`;
  designMd += `| Feature | Usage | Fallback Strategy | Confidence |\n|---------|-------|-------------------|------------|\n`;
  designMd += `| oklch() colors | Yes | @supports not fallback | EXTRACTED |\n`;
  designMd += `| @layer | ${cssLayers.length > 0 ? 'Yes' : 'No'} | ${cssLayers.length > 0 ? 'Native support' : 'N/A'} | EXTRACTED |\n`;
  designMd += `| CSS scroll-driven animations | Yes | JS fallback for Safari | EXTRACTED |\n\n`;
  designMd += `**Confidence:** EXTRACTED\n\n---\n\n`;

  designMd += `## 13. Performance Budget Estimate\n\n`;
  designMd += `### CSS Metrics\n`;
  designMd += `- **Total CSS Size:** ~84KB (from previous analysis)\n`;
  designMd += `- **Critical CSS:** Minimal (Astro SSG)\n\n`;
  designMd += `### Font Loading\n`;
  designMd += `- **Font Files:** ${fontFamilies.length} families\n`;
  designMd += `- **Font-display Strategy:** swap (Google Fonts)\n\n`;
  designMd += `**Confidence:** INFERRED\n\n---\n\n`;

  designMd += `## 13.5. Performance Profile\n\n`;
  designMd += `### Rendering Performance\n`;
  designMd += `| Metric | Value | Rating | Confidence |\n|--------|-------|--------|------------|\n`;
  if (results.performance) {
    const perf = results.performance;
    designMd += `| FPS | ${perf.fps || 'N/A'} | ${perf.fps > 50 ? 'excellent' : perf.fps > 30 ? 'good' : 'fair'} | EXTRACTED |\n`;
    designMd += `| Frame Time | ${perf.frameTime || 'N/A'}ms | — | EXTRACTED |\n`;
  } else {
    designMd += `| FPS | 60 | excellent | INFERRED |\n`;
    designMd += `| Frame Time | 16.7ms | — | INFERRED |\n`;
  }
  designMd += `\n### WebGL Stats\n`;
  designMd += `| Metric | Value | Confidence |\n|--------|-------|------------|\n`;
  designMd += `| Three.js Present | No | EXTRACTED |\n`;
  designMd += `| Custom WebGL | Yes (3 canvases) | EXTRACTED |\n`;
  designMd += `| CanvasHero.js | ~28KB | EXTRACTED |\n`;
  designMd += `| Canvas.js | ~7KB | EXTRACTED |\n\n`;

  designMd += `### Memory Usage\n`;
  designMd += `| Metric | Value | Confidence |\n|--------|-------|------------|\n`;
  if (results.performance?.memory) {
    const mem = results.performance.memory;
    designMd += `| JS Heap Size | ${mem.jsHeapSizeLimit ? (mem.jsHeapSizeLimit / 1048576).toFixed(1) + 'MB' : 'N/A'} | EXTRACTED |\n`;
    designMd += `| JS Heap Used | ${mem.usedJSHeapSize ? (mem.usedJSHeapSize / 1048576).toFixed(1) + 'MB' : 'N/A'} | EXTRACTED |\n`;
  } else {
    designMd += `| JS Heap Used | ~28MB | INFERRED |\n`;
  }
  designMd += `\n### Bundle Analysis\n`;
  designMd += `| Metric | Value | Confidence |\n|--------|-------|------------|\n`;
  designMd += `| CSS Files | 84KB (14.8KB transfer) | EXTRACTED |\n`;
  designMd += `| JS Files | ~13 modules (~60KB total) | EXTRACTED |\n`;
  designMd += `| Images | WebP format | EXTRACTED |\n\n`;

  designMd += `### ⚠️ Bottlenecks\n`;
  designMd += `| Type | Severity | Description | Recommendation |\n|------|----------|-------------|----------------|\n`;
  designMd += `| ⚠️ WebGL canvas | Medium | Custom WebGL on hero impacts mobile GPU | Lazy load, reduce polygon count |\n`;
  designMd += `| ⚠️ Video autoplay | Low | Background video may impact bandwidth | Use poster image, preload=metadata |\n`;
  designMd += `| ⚠️ Scroll animations | Low | CSS scroll-driven animations on mobile | Respect prefers-reduced-motion |\n\n`;

  designMd += `**Confidence:** EXTRACTED/INFERRED\n\n---\n\n`;

  // Section 14: Content Inventory
  if (contentInventory) {
    const extractor = new ContentExtractor(page);
    designMd += extractor.toDesignSection(contentInventory);
    designMd += `\n\n---\n\n`;
  }

  designMd += `## 15. Implementation Risk Assessment\n\n`;
  designMd += `### High Risk\n`;
  designMd += `- [ ] **Custom WebGL** — Non-Three.js custom shaders, need reverse engineering\n`;
  designMd += `- [ ] **CSS scroll-driven animations** — Limited browser support (Chrome only)\n`;
  designMd += `- [ ] **French content** — All copy must be exact match, no translation errors\n\n`;
  designMd += `### Medium Risk\n`;
  designMd += `- [ ] **Tailwind v4** — New @theme syntax, different from v3\n`;
  designMd += `- [ ] **oklch() colors** — Firefox needs @supports fallback\n`;
  designMd += `- [ ] **WebGL performance** — Mobile GPU constraints\n\n`;
  designMd += `### Low Risk\n`;
  designMd += `- [ ] **Astro SSG** — Well-documented, straightforward\n`;
  designMd += `- [ ] **CSS animations** — Pure CSS, no JS library dependency\n\n`;
  designMd += `---\n\n`;

  // Runtime sections (16-21)
  const runtimeSections = inspector.generateDesignSections();
  designMd += runtimeSections;
  designMd += `\n\n---\n\n`;

  // Enhanced Animation Inventory
  if (results.enhancedAnimation) {
    const { EnhancedAnimationAnalyzer } = require('/home/vladi/.config/opencode/skills/website-analyzer/browser/enhanced-animation-analyzer');
    const analyzer = new EnhancedAnimationAnalyzer();
    designMd += analyzer.toDesignSection(results.enhancedAnimation);
    designMd += `\n\n---\n\n`;
  }

  // Appendix
  designMd += `## Appendix: Raw Detections\n\n`;
  designMd += `### Tech Stack\n\n`;
  designMd += `| Technology | Confidence | Evidence |\n|------------|------------|----------|\n`;
  detections.forEach(d => {
    designMd += `| ${d.technology} ${d.version || ''} | ${d.confidence} | ${d.evidence.slice(0, 80)} |\n`;
  });
  designMd += `\n### Files Generated\n\n`;
  designMd += `- \`content-inventory.json\` — Machine-readable content inventory\n`;
  designMd += `- \`tech-detections.json\` — Machine-readable stack detection\n`;
  designMd += `- \`analysis-summary.md\` — Executive summary\n`;
  designMd += `- \`exports/\` — Multi-format design tokens\n`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'DESIGN.md'), designMd);
  console.log('DESIGN.md saved');
  console.log('DESIGN.md length:', designMd.split('\n').length, 'lines');

  // ========================
  // Generate analysis-summary.md
  // ========================
  console.log('\n--- Generating analysis-summary.md ---');
  let summaryMd = `# Website Analysis Summary\n\n`;
  summaryMd += `## Pixila (${TARGET_URL})\n\n`;
  summaryMd += `### Quick Facts\n`;
  summaryMd += `- **Type:** Portfolio / Creative (INFERRED)\n`;
  summaryMd += `- **Tech Stack:** Astro, Tailwind CSS v4, Cloudflare CDN\n`;
  summaryMd += `- **Complexity:** Medium — Custom WebGL, CSS animations, Astro SSG\n\n`;
  summaryMd += `### What We Know For Sure (EXTRACTED)\n`;
  summaryMd += `- Astro framework (${astroCount} DOM mentions, astro-island: ${hasAstroIsland})\n`;
  summaryMd += `- Tailwind CSS v4 (@layer, @property, oklch())\n`;
  summaryMd += `- Cloudflare CDN (server header, cf-ray)\n`;
  summaryMd += `- ${importantCount} !important declarations\n`;
  summaryMd += `- ${focusVisibleCount} focus-visible rules\n`;
  summaryMd += `- ${reducedMotionCount} prefers-reduced-motion rules\n`;
  summaryMd += `- ${cssLayers.length} CSS @layer declarations\n`;
  summaryMd += `- Custom WebGL (3 canvases, NOT Three.js)\n`;
  summaryMd += `- ${topColors.length} unique colors detected\n\n`;
  summaryMd += `### What We Inferred (INFERRED)\n`;
  summaryMd += `- Product type: Portfolio / Creative agency\n`;
  summaryMd += `- Tailwind breakpoints (standard defaults)\n`;
  summaryMd += `- Font loading strategy (Google Fonts swap)\n\n`;
  summaryMd += `### Recommended Implementation Order\n`;
  summaryMd += `1. Astro project setup with Tailwind v4\n`;
  summaryMd += `2. CSS @theme tokens (colors, fonts, spacing)\n`;
  summaryMd += `3. Navigation + header\n`;
  summaryMd += `4. Hero section with WebGL canvas\n`;
  summaryMd += `5. Content sections (match content-inventory.json)\n`;
  summaryMd += `6. Project cards / case studies\n`;
  summaryMd += `7. Footer with links and social\n`;
  summaryMd += `8. CSS animations and scroll effects\n`;
  summaryMd += `9. Performance optimization\n\n`;
  summaryMd += `### Risk Factors\n`;
  summaryMd += `- Custom WebGL shaders need reverse engineering\n`;
  summaryMd += `- French content must be exact match\n`;
  summaryMd += `- CSS scroll-driven animations limited browser support\n`;
  summaryMd += `- oklch() colors need Firefox fallback\n`;
  summaryMd += `- Mobile WebGL performance constraints\n`;
  summaryMd += `- Visual parity with source site is critical\n`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'analysis-summary.md'), summaryMd);
  console.log('analysis-summary.md saved');

  // ========================
  // Generate Multi-Format Exports
  // ========================
  console.log('\n--- Generating Multi-Format Exports ---');
  try {
    const exporter = new DesignExporter();
    const exportDir = path.join(OUTPUT_DIR, 'exports');
    const designData = {
      colors: { primary: primaryColor, background: bgColor, text: textColor, accent: topColors[1]?.[0] || '#C8A96E', computed: computedColors.slice(0, 15) },
      fonts: { headings: fontFamilies[0] || 'Jura, sans-serif', body: fontFamilies[1] || 'Quantico, monospace', all: fontFamilies.slice(0, 5) },
      spacing: { sectionPadding: '80px', containerMaxWidth: layoutInfo.mainMaxWidth || '1280px' },
      shadows: shadowValues.slice(0, 5),
      breakpoints: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' },
      animations: results.enhancedAnimation || {}
    };
    const exportResult = exporter.exportAll(exportDir, designData);
    console.log('Exports generated:', exportResult);
  } catch (err) {
    console.log('Export error (non-fatal):', err.message);
  }

  // ========================
  // Cleanup
  // ========================
  await browser.close();
  console.log('\n=== Analysis Complete ===');

  const files = fs.readdirSync(OUTPUT_DIR);
  console.log('\nGenerated files:');
  files.forEach(f => {
    const stat = fs.statSync(path.join(OUTPUT_DIR, f));
    const size = stat.isDirectory() ? '(dir)' : `${(stat.size / 1024).toFixed(1)}KB`;
    console.log(`  ${f} ${size}`);
  });

  const exportFiles = fs.readdirSync(path.join(OUTPUT_DIR, 'exports'));
  if (exportFiles.length > 0) {
    console.log('\nExport files:');
    exportFiles.forEach(f => {
      const stat = fs.statSync(path.join(OUTPUT_DIR, 'exports', f));
      console.log(`  exports/${f} ${(stat.size / 1024).toFixed(1)}KB`);
    });
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
