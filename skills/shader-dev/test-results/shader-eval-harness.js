const { chromium } = require('/home/vladi/.config/opencode/skills/website-analyzer/node_modules/playwright');
const fs = require('fs');
const path = require('path');

// Eval test cases
const evals = [
    {
        id: 0,
        name: "2D SDF Circle",
        prompt: "Create a WebGL2 shader that renders a blue circle in the center of the screen with radius 0.3. The circle should have a subtle glow effect using the SDF recipe.",
        expectedTechnique: "sdf-circle",
        expectedContains: ["sdCircle", "mainImage"],
        params: { RADIUS: 0.3 }
    },
    {
        id: 1,
        name: "Cosine Color Palette",
        prompt: "Generate a WebGL2 shader that shows an animated cosine color palette. Use parameters a=(0.5,0.5,0.5), b=(0.5,0.5,0.5), c=(1.0,1.0,1.0), d=(0.0,0.33,0.67). The palette should animate over time.",
        expectedTechnique: "palette-cosine",
        expectedContains: ["cosinePalette", "mainImage"],
        params: { TIME_SCALE: 0.5, A: "vec3(0.5,0.5,0.5)", B: "vec3(0.5,0.5,0.5)", C: "vec3(1.0,1.0,1.0)", D: "vec3(0.0,0.33,0.67)" }
    },
    {
        id: 2,
        name: "FBM Noise Texture",
        prompt: "Create a WebGL2 shader that generates an FBM noise texture with 4 octaves and scale 5.0. Display it as a grayscale pattern.",
        expectedTechnique: "noise-fbm",
        expectedContains: ["fbm", "mainImage"],
        params: { SCALE: 5.0, OCTAVES: 4 }
    },
    {
        id: 3,
        name: "UV Kaleidoscope Transform",
        prompt: "Create a WebGL2 shader that applies a kaleidoscope UV transform with 6 segments and displays a colorful pattern using the transformed coordinates.",
        expectedTechnique: "uv-kaleidoscope",
        expectedContains: ["kaleidoscope", "mainImage"],
        params: { SEGMENTS: 6 }
    },
    {
        id: 4,
        name: "Basic Raymarching Sphere",
        prompt: "Create a WebGL2 shader that raymarches a single sphere with Phong lighting. The sphere should be centered at origin with radius 0.5. Include soft shadows if possible within the basic recipe.",
        expectedTechnique: "raymarch-sphere",
        expectedContains: ["raymarch", "phong", "mainImage"],
        params: { Z_OFFSET: 2.0, RADIUS: 0.5, MAX_STEPS: 64, SURF_DIST: 0.001, MAX_DIST: 100.0, CAM_Z: 3.0, FOV: 1.0, SHININESS: 32.0 }
    }
];

// Template substitution function
function substituteParams(template, params) {
    let result = template;
    for (const [key, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
}

// Read technique templates
function loadTechnique(name) {
    const filePath = path.join(__dirname, 'skills/shader-dev/reference/techniques', `${name}.glsl`);
    return fs.readFileSync(filePath, 'utf8');
}

// Read harness template
function loadHarness() {
    const filePath = path.join(__dirname, 'skills/shader-dev/reference/webgl2-harness.html');
    return fs.readFileSync(filePath, 'utf8');
}

// Build HTML from technique
function buildHtml(techniqueName, params) {
    const technique = loadTechnique(techniqueName);
    const harness = loadHarness();
    
    // Substitute parameters in technique
    const fragShader = substituteParams(technique, params);
    
    // Remove parameter comments from frag shader
    const cleanFragShader = fragShader.split('\n')
        .filter(line => !line.trim().startsWith('// Parameters:') && !line.match(/^\s*\/\/\s*[A-Z].*default:/))
        .join('\n');
    
    // Replace placeholders in harness
    let html = harness.replace('{{FRAGMENT_SHADER}}', cleanFragShader);
    html = html.replace('{{UNIFORM_BLOCK}}', ''); // No extra uniforms for basic tests
    
    return html;
}

// Test compilation and rendering
async function testEval(evalCase, outputDir) {
    console.log(`\n--- Eval ${evalCase.id}: ${evalCase.name} ---`);
    
    try {
        // Build HTML
        const html = buildHtml(evalCase.expectedTechnique, evalCase.params);
        const htmlPath = path.join(outputDir, `eval-${evalCase.id}.html`);
        fs.writeFileSync(htmlPath, html);
        
        // Check code contents
        let codeChecks = true;
        for (const expected of evalCase.expectedContains) {
            if (!html.includes(expected)) {
                console.log(`  ✗ Missing: ${expected}`);
                codeChecks = false;
            } else {
                console.log(`  ✓ Contains: ${expected}`);
            }
        }
        
        // Launch browser and test compilation
        const browser = await chromium.launch();
        const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
        
        const logs = [];
        page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
        
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        
        await page.goto('file://' + htmlPath);
        await page.waitForTimeout(500);
        
        const glErrors = await page.evaluate(() => window.glErrors || []);
        
        // Take screenshot
        const screenshotPath = path.join(outputDir, `eval-${evalCase.id}.png`);
        await page.screenshot({ path: screenshotPath });
        
        await browser.close();
        
        // Check results
        const compileOk = glErrors.length === 0;
        const jsOk = errors.length === 0;
        
        console.log(`  Compile: ${compileOk ? '✓ PASS' : '✗ FAIL'}`);
        if (!compileOk) {
            glErrors.forEach(e => console.log(`    [${e.type}] ${e.message}`));
        }
        console.log(`  JS Errors: ${jsOk ? '✓ PASS' : '✗ FAIL'}`);
        console.log(`  Screenshot: ${screenshotPath}`);
        
        return {
            id: evalCase.id,
            name: evalCase.name,
            passed: compileOk && jsOk && codeChecks,
            compileOk,
            jsOk,
            codeChecks,
            glErrors: glErrors.map(e => e.message),
            jsErrors: errors,
            screenshotPath
        };
        
    } catch (e) {
        console.error(`  ✗ ERROR: ${e.message}`);
        return {
            id: evalCase.id,
            name: evalCase.name,
            passed: false,
            error: e.message
        };
    }
}

// Run all evals
async function runEvals() {
    const outputDir = path.join(__dirname, 'shader-eval-results');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    console.log('=== Shader Eval Harness ===');
    console.log(`Running ${evals.length} technique evals...\n`);
    
    const results = [];
    for (const evalCase of evals) {
        const result = await testEval(evalCase, outputDir);
        results.push(result);
    }
    
    // Summary
    console.log('\n=== SUMMARY ===');
    let passCount = 0;
    for (const r of results) {
        const status = r.passed ? '✓ PASS' : '✗ FAIL';
        console.log(`Eval ${r.id} (${r.name}): ${status}`);
        if (r.passed) passCount++;
    }
    console.log(`\nTotal: ${passCount}/${results.length} passed`);
    
    // Save results
    const resultsPath = path.join(outputDir, 'results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);
    
    return passCount === results.length;
}

runEvals().then(success => {
    process.exit(success ? 0 : 1);
}).catch(e => {
    console.error('Eval harness failed:', e);
    process.exit(1);
});
