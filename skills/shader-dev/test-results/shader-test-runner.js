const { chromium } = require('/home/vladi/.config/opencode/skills/website-analyzer/node_modules/playwright');
const fs = require('fs');
const path = require('path');

async function testShader(htmlPath, outputName) {
    console.log(`Testing: ${htmlPath}`);
    
    const browser = await chromium.launch();
    const page = await browser.newPage({ 
        viewport: { width: 512, height: 512 }
    });
    
    // Capture console logs
    const logs = [];
    page.on('console', msg => {
        logs.push({ type: msg.type(), text: msg.text() });
    });
    
    // Capture page errors
    const errors = [];
    page.on('pageerror', error => {
        errors.push(error.message);
    });
    
    // Load the shader HTML
    const filePath = path.resolve(htmlPath);
    await page.goto('file://' + filePath);
    
    // Wait for render loop to start
    await page.waitForTimeout(500);
    
    // Check WebGL errors
    const glErrors = await page.evaluate(() => {
        return window.glErrors || [];
    });
    
    // Take screenshot
    const screenshotPath = path.join(__dirname, `${outputName}.png`);
    await page.screenshot({ path: screenshotPath, type: 'png' });
    
    // Analyze screenshot for non-black pixels
    const imageBuffer = fs.readFileSync(screenshotPath);
    // Simple check: if file size is very small or we can check pixels
    // For now, we'll rely on the absence of errors and visual inspection
    
    await browser.close();
    
    // Report results
    console.log('\n=== Test Results ===');
    console.log(`File: ${htmlPath}`);
    console.log(`GL Errors: ${glErrors.length === 0 ? 'NONE ✓' : glErrors.length + ' errors ✗'}`);
    if (glErrors.length > 0) {
        glErrors.forEach(e => console.log(`  - [${e.type}] ${e.message}`));
    }
    console.log(`Console Errors: ${errors.length === 0 ? 'NONE ✓' : errors.length + ' errors ✗'}`);
    if (errors.length > 0) {
        errors.forEach(e => console.log(`  - ${e}`));
    }
    console.log(`Console Logs: ${logs.length}`);
    logs.forEach(l => console.log(`  [${l.type}] ${l.text}`));
    console.log(`Screenshot: ${screenshotPath}`);
    
    const passed = glErrors.length === 0 && errors.length === 0;
    console.log(`\nResult: ${passed ? 'PASS ✓' : 'FAIL ✗'}`);
    
    return passed;
}

// Run tests
(async () => {
    try {
        // Test 1: SDF Circle
        const pass1 = await testShader(
            './shader-test-sdf-circle.html',
            'shader-test-sdf-circle-result'
        );
        
        // Test 2: Raymarch Sphere
        const pass2 = await testShader(
            './shader-test-raymarch-sphere.html',
            'shader-test-raymarch-sphere-result'
        );
        
        console.log('\n=== OVERALL ===');
        console.log(`SDF Circle: ${pass1 ? 'PASS' : 'FAIL'}`);
        console.log(`Raymarch Sphere: ${pass2 ? 'PASS' : 'FAIL'}`);
        process.exit((pass1 && pass2) ? 0 : 1);
    } catch (e) {
        console.error('Test failed with error:', e);
        process.exit(1);
    }
})();
