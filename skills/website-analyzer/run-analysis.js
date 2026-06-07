const { chromium } = require('playwright');
const { BrowserInspector } = require('/home/vladi/.config/opencode/skills/website-analyzer/browser/inspector.js');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to https://www.aboutluca.com/...');
  await page.goto('https://www.aboutluca.com/', { waitUntil: 'networkidle', timeout: 60000 });
  
  console.log('Waiting for hydration...');
  await page.waitForTimeout(5000);
  
  const inspector = new BrowserInspector(page, {
    screenshotDir: '/home/vladi/developer/test-artifacts/website-analyzer-test/v1.3.0-aboutluca/',
    waitForLoad: true
  });
  
  await inspector.initialize('https://www.aboutluca.com/');
  
  console.log('Running full analysis...');
  const results = await inspector.runFullAnalysis();
  
  const outputDir = '/home/vladi/developer/test-artifacts/website-analyzer-test/v1.3.0-aboutluca/';
  fs.mkdirSync(outputDir, { recursive: true });
  
  if (results.screenshots) {
    results.screenshots.forEach((ss, i) => {
      fs.writeFileSync(`${outputDir}/screenshot-${ss.name}-${i}.png`, ss.buffer);
    });
  }
  
  const jsonResults = {
    url: results.url,
    timestamp: results.timestamp,
    animations: results.animations,
    threeJs: results.threeJs,
    state: results.state,
    routes: results.routes,
    interactions: results.interactions,
    enhancedAnimation: results.enhancedAnimation,
    performance: results.performance
  };
  
  fs.writeFileSync(`${outputDir}/runtime-results.json`, JSON.stringify(jsonResults, null, 2));
  
  const designSections = inspector.generateDesignSections();
  fs.writeFileSync(`${outputDir}/runtime-sections.md`, designSections);
  
  console.log('Analysis complete. Results saved to:', outputDir);
  
  await browser.close();
})();
