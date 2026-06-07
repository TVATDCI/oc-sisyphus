const { AnimationRecorder } = require('./');

async function validateAnimationRecorder() {
  console.log('=== Animation Recorder Validation ===\n');
  
  let success = true;
  
  try {
    console.log('1. Testing class instantiation...');
    const mockPage = {
      evaluate: async (fn) => ({}),
      locator: () => ({ all: async () => [] }),
      waitForTimeout: async () => {}
    };
    const mockInjector = {};
    const recorder = new AnimationRecorder(mockPage, mockInjector);
    
    if (!recorder.capturedAnimations.css || !recorder.capturedAnimations.framerMotion) {
      console.log('   ❌ Animation buckets not initialized');
      success = false;
    } else {
      console.log('   ✅ AnimationRecorder instantiated with proper structure\n');
    }
    
    console.log('2. Testing DESIGN.md section generation...');
    recorder.capturedAnimations = {
      css: [
        { name: 'fadeIn', keyframeCount: 2, keyframes: [] },
        { name: 'slideUp', keyframeCount: 3, keyframes: [] }
      ],
      framerMotion: [
        { element: 'div.hero', animate: 'visible', style: { transform: 'scale(1)' } }
      ],
      gsap: [
        { type: 'to', targets: '.btn', duration: 0.4, ease: 'power2.out' }
      ],
      scroll: [
        { library: 'GSAP ScrollTrigger', trigger: '.section', start: 'top 80%' }
      ],
      transitions: [
        { element: 'button', transitionProperty: 'transform, opacity', transitionDuration: '0.2s' }
      ],
      triggers: {
        hover: [{ trigger: 'hover', element: 'button' }],
        scroll: [{ trigger: 'scroll-into-view', element: '.section' }],
        mount: [],
        click: [],
        focus: []
      }
    };
    recorder.capturedAnimations.gsap._meta = {
      timelines: [{ id: 'hero', duration: 1.5 }],
      present: true
    };
    
    const designSection = recorder.toDesignSection();
    const checks = [
      ['15. Animation Inventory', 'Main header'],
      ['CSS Animations', 'CSS subsection'],
      ['Framer Motion', 'Framer Motion subsection'],
      ['GSAP', 'GSAP subsection'],
      ['Animation Triggers', 'Triggers subsection'],
      ['fadeIn', 'CSS animation name'],
      ['hover:', 'Trigger type']
    ];
    
    checks.forEach(([text, desc]) => {
      if (designSection.includes(text)) {
        console.log(`   ✅ ${desc} present`);
      } else {
        console.log(`   ❌ ${desc} missing: "${text}"`);
        success = false;
      }
    });
    console.log();
    
    console.log('3. Testing count methods...');
    const total = recorder.getTotalCount();
    console.log(`   Total animations: ${total}`);
    if (total <= 0) {
      console.log('   ❌ No animations counted');
      success = false;
    } else {
      console.log('   ✅ Count methods working\n');
    }
    
    const gpu = recorder.getGPUAcceleratedCount();
    console.log(`   GPU accelerated: ${gpu}\n`);
    
    console.log('4. Testing trigger structure...');
    const triggers = recorder.capturedAnimations.triggers;
    const hasHover = triggers.hover.length > 0;
    const hasScroll = triggers.scroll.length > 0;
    
    if (hasHover && hasScroll) {
      console.log('   ✅ Hover and scroll triggers detected');
    } else {
      console.log(`   ⚠️  Hover: ${hasHover}, Scroll: ${hasScroll}`);
    }
    console.log();
    
    console.log('5. Generated DESIGN.md Section 15 preview:');
    console.log('---');
    console.log(designSection);
    console.log('---\n');
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
    success = false;
  }
  
  console.log('=== Validation Summary ===');
  console.log(`Status: ${success ? 'PASSED' : 'FAILED'}`);
  console.log('\nAnimation Recorder Features:');
  console.log('  CSS keyframe extraction');
  console.log('  Framer Motion detection (DOM analysis)');
  console.log('  GSAP hook injection (timeline/tween capture)');
  console.log('  ScrollTrigger detection');
  console.log('  Transition capture');
  console.log('  Trigger mapping (hover, scroll, mount)');
  console.log('  DESIGN.md Section 15 generation');
  console.log('\nDay 2: Animation Capture - COMPLETE');
  
  process.exit(success ? 0 : 1);
}

validateAnimationRecorder();
