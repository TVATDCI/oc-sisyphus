const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://sinahatami.vercel.app', { waitUntil: 'networkidle' });
  
  // Wait for hydration and animations
  await page.waitForTimeout(3000);
  
  // Get rendered HTML
  const html = await page.content();
  require('fs').writeFileSync('/tmp/rendered.html', html);
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/screenshot.png', fullPage: true });
  
  // Extract structured data
  const data = await page.evaluate(() => {
    const cleanText = (t) => t ? t.replace(/\s+/g, ' ').trim() : '';
    return {
      title: document.title,
      headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({tag: h.tagName, text: cleanText(h.innerText)})),
      nav: Array.from(document.querySelectorAll('nav a, header a')).map(a => ({text: cleanText(a.innerText), href: a.href})),
      links: Array.from(document.querySelectorAll('a[href]')).map(a => ({text: cleanText(a.innerText).substring(0, 100), href: a.href})).slice(0, 50),
      buttons: Array.from(document.querySelectorAll('button')).map(b => ({text: cleanText(b.innerText).substring(0, 100)})).slice(0, 30),
      footer: document.querySelector('footer') ? cleanText(document.querySelector('footer').innerText).substring(0, 1000) : null,
      sections: Array.from(document.querySelectorAll('section, [id]')).map((s, i) => {
        const text = cleanText(s.innerText).substring(0, 300);
        return {id: s.id || s.className || `el-${i}`, tag: s.tagName.toLowerCase(), text: text};
      }).filter(s => s.text.length > 10),
      images: Array.from(document.querySelectorAll('img')).map(img => ({src: img.src, alt: img.alt})).slice(0, 20),
      meta: {
        description: document.querySelector('meta[name="description"]')?.content || null,
        lang: document.documentElement.lang || null
      },
      bodyClasses: document.body.className,
      htmlClasses: document.documentElement.className
    };
  });
  
  require('fs').writeFileSync('/tmp/page_data.json', JSON.stringify(data, null, 2));
  
  // Check libraries
  const libs = await page.evaluate(() => {
    return {
      threejs: typeof window.THREE !== 'undefined',
      r3f: !!document.querySelector('canvas'),
      canvasCount: document.querySelectorAll('canvas').length,
      framerMotion: typeof window.Motion !== 'undefined' || typeof window.motion !== 'undefined',
      gsap: typeof window.gsap !== 'undefined',
      scrollTrigger: typeof window.ScrollTrigger !== 'undefined',
      react: typeof window.React !== 'undefined',
      next: typeof window.__NEXT_DATA__ !== 'undefined'
    };
  });
  
  console.log('=== Libraries ===');
  console.log(JSON.stringify(libs, null, 2));
  console.log('\n=== Page Data ===');
  console.log('Title:', data.title);
  console.log('Headings:', data.headings.length);
  console.log('Nav:', data.nav.length);
  console.log('Sections:', data.sections.length);
  console.log('Footer:', data.footer ? data.footer.substring(0, 200) : 'None');
  
  await browser.close();
})();
