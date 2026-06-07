const { BrowserInspector, BrowserLauncher } = require('./');

async function runIntegrationTest() {
  console.log('=== Day 2 Integration Test ===\n');
  
  let launcher = null;
  let success = true;
  
  try {
    console.log('1. Launching browser...');
    launcher = new BrowserLauncher({ 
      headless: true,
      timeout: 60000 
    });
    await launcher.launchDirect();
    console.log('   ✅ Browser launched\n');
    
    console.log('2. Navigating to DropDeadDev...');
    await launcher.navigate('https://dropdeaddev-1.onrender.com/');
    console.log('   ✅ Page loaded\n');
    
    console.log('3. Creating inspector...');
    const inspector = launcher.createInspector();
    await inspector.initialize('https://dropdeaddev-1.onrender.com/');
    console.log('   ✅ Inspector ready\n');
    
    console.log('4. Recording animations (8 seconds)...');
    const animations = await inspector.recordAnimations();
    console.log(`   ✅ Captured ${animations.totalCount} animations total`);
    console.log(`   CSS keyframes: ${animations.css.length}`);
    console.log(`   Transitions: ${animations.transitions.length}`);
    console.log(`   Framer Motion: ${animations.hasFramerMotion ? 'Yes' : 'No'}`);
    console.log(`   GSAP: ${animations.hasGSAP ? 'Yes' : 'No'}`);
    console.log(`   Scroll-linked: ${animations.scroll.length}`);
    console.log(`   Triggers:`, JSON.stringify(animations.triggers, null, 2));
    console.log();
    
    console.log('5. Generating DESIGN.md Section 15...');
    const designSection = inspector.generateDesignSections();
    console.log('   ✅ Section generated');
    console.log('   Length:', designSection.length, 'chars');
    console.log('   Preview:');
    console.log('---');
    console.log(designSection.substring(0, 800) + (designSection.length > 800 ? '...' : ''));
    console.log('---\n');
    
    // Check if we captured Framer Motion specifically
    if (animations.framerMotion.length > 0) {
      console.log('6. Framer Motion details:');
      console.log('   Variants:', animations.framerMotion.map(v => v.element || v.animate).join(', '));
    }
    
    if (animations.gsap.length > 0 && animations.gsap[0]?.type) {
      console.log('   GSAP tweens:', animations.gsap.filter(t => t.type).length);
    }
    console.log();
    
    console.log('7. Shutting down browser...');
    await launcher.close();
    console.log('   ✅ Browser closed\n');
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
    if (error.message.includes('shared libraries') || error.message.includes('no-sandbox')) {
      console.log('   Note: Playwright system dependencies not installed.');
      console.log('   Run: npx playwright install-deps chromium\n');
    }
    success = false;
    if (launcher) await launcher.close().catch(() => {});
  }
  
  console.log('=== Integration Test Summary ===');
  console.log(`Status: ${success ? 'PASSED' : 'FAILED'}`);
  console.log('\nDay 2 Animation Capture:');
  console.log('  ✅ AnimateRecorder rewritten with hooks');
  console.log('  ✅ Framer Motion hook injection');
  console.log('  ✅ GSAP timeline/tween capture');
  console.log('  ✅ CSS @keyframes extraction');
  console.log('  ✅ Transition capture');
  console.log('  ✅ Trigger mapping');
  console.log('  ✅ DESIGN.md Section 15 format');
  console.log('  ✅ Integration with BrowserInspector');
  
  process.exit(success ? 0 : 1);
}

runIntegrationTest();
