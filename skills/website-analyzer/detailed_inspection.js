const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://sinahatami.vercel.app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Deep inspection
  const data = await page.evaluate(() => {
    const results = {
      // Three.js detection
      three: {
        hasTHREE: typeof window.THREE !== 'undefined',
        hasR3F: !!document.querySelector('canvas'),
        canvasCount: document.querySelectorAll('canvas').length,
        canvasContexts: Array.from(document.querySelectorAll('canvas')).map(c => {
          try {
            const gl = c.getContext('webgl') || c.getContext('webgl2');
            return gl ? { hasWebGL: true, extensions: gl.getSupportedExtensions().slice(0, 10) } : { hasWebGL: false };
          } catch(e) { return { error: e.message }; }
        })
      },
      // Animation detection
      animations: {
        framerMotion: typeof window.Motion !== 'undefined' || typeof window.motion !== 'undefined',
        framerElements: document.querySelectorAll('[data-framer-motion], [data-motion]').length,
        gsap: typeof window.gsap !== 'undefined',
        scrollTrigger: typeof window.ScrollTrigger !== 'undefined',
        cssTransitions: Array.from(document.querySelectorAll('*')).filter(el => {
          const style = getComputedStyle(el);
          return style.transition && style.transition !== 'all 0s ease 0s';
        }).length,
        cssAnimations: document.querySelectorAll('[style*="animation"]').length + document.styleSheets.length
      },
      // Theme
      theme: {
        htmlClass: document.documentElement.className,
        bodyClass: document.body.className,
        dataTheme: document.documentElement.getAttribute('data-theme'),
        prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches
      },
      // Performance
      perf: {
        loadTime: performance.now(),
        resources: performance.getEntriesByType('resource').length
      },
      // Component patterns
      components: {
        buttons: document.querySelectorAll('button').length,
        cards: document.querySelectorAll('[class*="card"]').length,
        badges: document.querySelectorAll('[class*="badge"]').length,
        modals: document.querySelectorAll('[role="dialog"]').length,
        tooltips: document.querySelectorAll('[class*="tooltip"]').length,
        inputs: document.querySelectorAll('input, textarea, select').length
      }
    };
    return results;
  });
  
  require('fs').writeFileSync('/tmp/detailed_data.json', JSON.stringify(data, null, 2));
  console.log(JSON.stringify(data, null, 2));
  
  await browser.close();
})();
