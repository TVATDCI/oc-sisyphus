/**
 * Enhanced Animation Analyzer Validation Script
 * Tests all methods of EnhancedAnimationAnalyzer with sample data
 *
 * Part of website-analyzer v1.3.0 validation suite
 */

const { EnhancedAnimationAnalyzer } = require('./enhanced-animation-analyzer');

function assert(condition, message) {
  if (!condition) {
    console.error(`   ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

function assertType(value, expectedType, message) {
  const actualType = typeof value;
  assert(actualType === expectedType, `${message}: expected ${expectedType}, got ${actualType}`);
}

function createSpringHeavyAnimations() {
  return {
    css: [],
    transitions: [],
    gsap: [
      { type: 'to', targets: '.btn', duration: 0.5, ease: 'elastic.out(1, 0.3)', vars: ['scale'] },
      { type: 'to', targets: '.card', duration: 0.6, ease: 'bounce.out', vars: ['y'] },
      { type: 'to', targets: '.modal', duration: 0.4, ease: 'back.out(1.7)', vars: ['opacity', 'scale'] },
      { type: 'to', targets: '.menu', duration: 0.3, ease: 'elastic.out(1, 0.5)', vars: ['x'] }
    ],
    framerMotion: [],
    scroll: []
  };
}

function createTweenHeavyAnimations() {
  return {
    css: [],
    transitions: [
      { element: 'button.btn', transitionProperty: 'background-color, color', transitionDuration: '0.2s', transitionTimingFunction: 'ease-out', willChange: '' },
      { element: 'a.link', transitionProperty: 'opacity', transitionDuration: '0.3s', transitionTimingFunction: 'ease', willChange: '' },
      { element: 'div.card', transitionProperty: 'transform, box-shadow', transitionDuration: '0.25s', transitionTimingFunction: 'ease-in-out', willChange: '' }
    ],
    gsap: [
      { type: 'to', targets: '.hero', duration: 0.8, ease: 'power2.out', vars: ['opacity', 'y'] }
    ],
    framerMotion: [],
    scroll: []
  };
}

function createMixedAnimations() {
  return {
    css: [
      {
        name: 'fadeIn',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'opacity', value: '0' }, { property: 'transform', value: 'translateY(20px)' }] },
          { keyText: '100%', properties: [{ property: 'opacity', value: '1' }, { property: 'transform', value: 'translateY(0)' }] }
        ]
      }
    ],
    transitions: [
      { element: 'button', transitionProperty: 'transform', transitionDuration: '0.3s', transitionTimingFunction: 'ease', willChange: 'transform' }
    ],
    gsap: [
      { type: 'to', targets: '.bounce', duration: 0.5, ease: 'bounce.out', vars: ['y'] },
      { type: 'to', targets: '.elastic', duration: 0.6, ease: 'elastic.out(1, 0.3)', vars: ['scale'] },
      { type: 'to', targets: '.slide', duration: 0.4, ease: 'power2.out', vars: ['x'] }
    ],
    framerMotion: [],
    scroll: []
  };
}

function createEmptyAnimations() {
  return {
    css: [],
    transitions: [],
    gsap: [],
    framerMotion: [],
    scroll: []
  };
}

function createDurationTestAnimations() {
  return {
    css: [],
    transitions: [
      { element: 'a', transitionProperty: 'opacity', transitionDuration: '0.05s', transitionTimingFunction: 'linear' },
      { element: 'b', transitionProperty: 'color', transitionDuration: '150ms', transitionTimingFunction: 'ease' },
      { element: 'c', transitionProperty: 'transform', transitionDuration: '0.25s', transitionTimingFunction: 'ease-out' },
      { element: 'd', transitionProperty: 'background', transitionDuration: '400ms', transitionTimingFunction: 'ease-in-out' },
      { element: 'e', transitionProperty: 'width', transitionDuration: '0.6s', transitionTimingFunction: 'linear' },
      { element: 'f', transitionProperty: 'height', transitionDuration: '1000ms', transitionTimingFunction: 'ease' }
    ],
    gsap: [
      { type: 'to', targets: '.fast', duration: 0.08, ease: 'none' },
      { type: 'to', targets: '.slow', duration: 1.2, ease: 'power2.out' }
    ],
    framerMotion: [],
    scroll: []
  };
}

function createEasingTestAnimations() {
  return {
    css: [],
    transitions: [
      { element: 'a', transitionProperty: 'opacity', transitionDuration: '0.3s', transitionTimingFunction: 'ease' },
      { element: 'b', transitionProperty: 'transform', transitionDuration: '0.3s', transitionTimingFunction: 'ease-out' },
      { element: 'c', transitionProperty: 'color', transitionDuration: '0.3s', transitionTimingFunction: 'ease-in-out' },
      { element: 'd', transitionProperty: 'width', transitionDuration: '0.3s', transitionTimingFunction: 'linear' },
      { element: 'e', transitionProperty: 'height', transitionDuration: '0.3s', transitionTimingFunction: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' }
    ],
    gsap: [
      { type: 'to', targets: '.spring', duration: 0.5, ease: 'elastic.out(1, 0.3)' },
      { type: 'to', targets: '.custom', duration: 0.5, ease: 'cubic-bezier(0.4, 0, 0.2, 1)' }
    ],
    framerMotion: [],
    scroll: []
  };
}

function createPatternTestAnimations() {
  return {
    css: [
      {
        name: 'fadeUp',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'opacity', value: '0' }, { property: 'transform', value: 'translateY(30px)' }] },
          { keyText: '100%', properties: [{ property: 'opacity', value: '1' }, { property: 'transform', value: 'translateY(0)' }] }
        ]
      },
      {
        name: 'scaleIn',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'transform', value: 'scale(0.8)' }] },
          { keyText: '100%', properties: [{ property: 'transform', value: 'scale(1)' }] }
        ]
      },
      {
        name: 'slideX',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'transform', value: 'translateX(-100%)' }] },
          { keyText: '100%', properties: [{ property: 'transform', value: 'translateX(0)' }] }
        ]
      },
      {
        name: 'pulse',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'transform', value: 'scale(1)' }] },
          { keyText: '50%', properties: [{ property: 'transform', value: 'scale(1.1)' }] },
          { keyText: '100%', properties: [{ property: 'transform', value: 'scale(1)' }] }
        ]
      },
      {
        name: 'rotate',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'transform', value: 'rotate(0deg)' }] },
          { keyText: '100%', properties: [{ property: 'transform', value: 'rotate(360deg)' }] }
        ]
      },
      {
        name: 'bounce',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'transform', value: 'translateY(0)' }] },
          { keyText: '50%', properties: [{ property: 'transform', value: 'translateY(-20px)' }] },
          { keyText: '100%', properties: [{ property: 'transform', value: 'translateY(0)' }] }
        ]
      }
    ],
    transitions: [],
    gsap: [],
    framerMotion: [],
    scroll: []
  };
}

function createPerformanceTestAnimations() {
  return {
    css: [
      {
        name: 'gpuAnim',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'transform', value: 'translateX(0)' }, { property: 'opacity', value: '0' }] },
          { keyText: '100%', properties: [{ property: 'transform', value: 'translateX(100px)' }, { property: 'opacity', value: '1' }] }
        ]
      },
      {
        name: 'layoutAnim',
        keyframes: [
          { keyText: '0%', properties: [{ property: 'width', value: '100px' }, { property: 'height', value: '100px' }] },
          { keyText: '100%', properties: [{ property: 'width', value: '200px' }, { property: 'height', value: '200px' }] }
        ]
      }
    ],
    transitions: [
      { element: 'div.gpu', transitionProperty: 'transform, opacity', transitionDuration: '0.3s', willChange: 'transform' },
      { element: 'div.layout', transitionProperty: 'width, height', transitionDuration: '0.3s', willChange: '' }
    ],
    gsap: [],
    framerMotion: [],
    scroll: []
  };
}

function runValidation() {
  console.log('=== EnhancedAnimationAnalyzer Validation ===\n');

  let success = true;
  let testsPassed = 0;
  let testsFailed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`   PASS: ${name}`);
      testsPassed++;
    } catch (error) {
      console.error(`   FAIL: ${name} - ${error.message}`);
      testsFailed++;
      success = false;
    }
  }

  try {
    console.log('1. Testing module exports...');
    test('EnhancedAnimationAnalyzer is exported', () => {
      assert(typeof EnhancedAnimationAnalyzer === 'function', 'EnhancedAnimationAnalyzer should be a constructor');
    });

    const analyzer = new EnhancedAnimationAnalyzer();
    test('Instance created successfully', () => {
      assert(analyzer instanceof EnhancedAnimationAnalyzer, 'Should create instance');
    });
    console.log();

    console.log('2. Testing classifyFeel...');
    test('classifyFeel returns correct type', () => {
      const result = analyzer.classifyFeel(createMixedAnimations());
      assertType(result, 'object', 'classifyFeel should return object');
      assertType(result.feel, 'string', 'feel should be string');
      assertType(result.springRatio, 'number', 'springRatio should be number');
      assertType(result.tweenRatio, 'number', 'tweenRatio should be number');
      assertType(result.reasoning, 'string', 'reasoning should be string');
    });

    test('classifyFeel with spring-heavy input', () => {
      const result = analyzer.classifyFeel(createSpringHeavyAnimations());
      assert(result.feel === 'springy', `Expected springy, got ${result.feel}`);
      assert(result.springRatio > 60, `Expected springRatio > 60, got ${result.springRatio}`);
    });

    test('classifyFeel with tween-heavy input', () => {
      const result = analyzer.classifyFeel(createTweenHeavyAnimations());
      assert(result.feel === 'smooth', `Expected smooth, got ${result.feel}`);
      assert(result.tweenRatio > 60, `Expected tweenRatio > 60, got ${result.tweenRatio}`);
    });

    test('classifyFeel with mixed input', () => {
      const result = analyzer.classifyFeel(createMixedAnimations());
      assert(result.feel === 'mixed', `Expected mixed, got ${result.feel}`);
    });

    test('classifyFeel with empty input', () => {
      const result = analyzer.classifyFeel(createEmptyAnimations());
      assert(result.feel === 'static', `Expected static, got ${result.feel}`);
      assert(result.springRatio === 0, 'springRatio should be 0');
      assert(result.tweenRatio === 0, 'tweenRatio should be 0');
    });
    console.log();

    console.log('3. Testing bucketDurations...');
    test('bucketDurations returns correct type', () => {
      const result = analyzer.bucketDurations(createDurationTestAnimations());
      assertType(result, 'object', 'bucketDurations should return object');
      assertType(result.buckets, 'object', 'buckets should be object');
      assertType(result.total, 'number', 'total should be number');
      assertType(result.distribution, 'string', 'distribution should be string');
    });

    test('bucketDurations parses "0.3s" correctly', () => {
      const result = analyzer.bucketDurations({
        css: [],
        transitions: [{ element: 'test', transitionDuration: '0.3s' }],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.buckets.md.count === 1, `Expected md bucket count 1, got ${result.buckets.md.count}`);
    });

    test('bucketDurations parses "300ms" correctly', () => {
      const result = analyzer.bucketDurations({
        css: [],
        transitions: [{ element: 'test', transitionDuration: '300ms' }],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.buckets.md.count === 1, `Expected md bucket count 1, got ${result.buckets.md.count}`);
    });

    test('bucketDurations parses "0.5" (no unit) correctly', () => {
      const result = analyzer.bucketDurations({
        css: [],
        transitions: [{ element: 'test', transitionDuration: '0.5' }],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.buckets.lg.count === 1, `Expected lg bucket count 1, got ${result.buckets.lg.count}`);
    });

    test('bucketDurations with various duration formats', () => {
      const result = analyzer.bucketDurations(createDurationTestAnimations());
      assert(result.total > 0, 'Total should be > 0');
      assert(result.buckets.instant.count >= 0, 'instant bucket should exist');
      assert(result.buckets.xs.count >= 0, 'xs bucket should exist');
      assert(result.buckets.sm.count >= 0, 'sm bucket should exist');
      assert(result.buckets.md.count >= 0, 'md bucket should exist');
      assert(result.buckets.lg.count >= 0, 'lg bucket should exist');
      assert(result.buckets.xl.count >= 0, 'xl bucket should exist');
    });
    console.log();

    console.log('4. Testing classifyEasings...');
    test('classifyEasings returns correct type', () => {
      const result = analyzer.classifyEasings(createEasingTestAnimations());
      assertType(result, 'object', 'classifyEasings should return object');
      assertType(result.families, 'object', 'families should be object');
      assertType(result.dominant, 'string', 'dominant should be string');
      assertType(result.total, 'number', 'total should be number');
    });

    test('classifyEasings detects ease-out family', () => {
      const result = analyzer.classifyEasings({
        css: [],
        transitions: [{ element: 'test', transitionTimingFunction: 'ease-out' }],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.families['ease-out'].count > 0, 'ease-out family should have count > 0');
    });

    test('classifyEasings detects spring-overshoot from cubic-bezier', () => {
      const result = analyzer.classifyEasings({
        css: [],
        transitions: [{ element: 'test', transitionTimingFunction: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' }],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.families['spring-overshoot'].count > 0, 'spring-overshoot family should have count > 0');
    });

    test('classifyEasings detects linear family', () => {
      const result = analyzer.classifyEasings({
        css: [],
        transitions: [{ element: 'test', transitionTimingFunction: 'linear' }],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.families['linear'].count > 0, 'linear family should have count > 0');
    });

    test('classifyEasings with common easing values', () => {
      const result = analyzer.classifyEasings(createEasingTestAnimations());
      assert(result.total > 0, 'total should be > 0');
      const familyNames = Object.keys(result.families);
      assert(familyNames.includes('ease-out'), 'Should have ease-out family');
      assert(familyNames.includes('spring-overshoot'), 'Should have spring-overshoot family');
      assert(familyNames.includes('ease-in-out'), 'Should have ease-in-out family');
      assert(familyNames.includes('linear'), 'Should have linear family');
      assert(familyNames.includes('custom'), 'Should have custom family');
    });
    console.log();

    console.log('5. Testing identifyPatterns...');
    test('identifyPatterns returns correct type', () => {
      const result = analyzer.identifyPatterns(createPatternTestAnimations());
      assertType(result, 'object', 'identifyPatterns should return object');
      assertType(result.patterns, 'object', 'patterns should be object');
      assertType(result.dominant, 'string', 'dominant should be string');
      assertType(result.total, 'number', 'total should be number');
    });

    test('identifyPatterns detects fade-up', () => {
      const result = analyzer.identifyPatterns({
        css: [{
          name: 'fadeUp',
          keyframes: [
            { keyText: '0%', properties: [{ property: 'opacity', value: '0' }, { property: 'transform', value: 'translateY(20px)' }] },
            { keyText: '100%', properties: [{ property: 'opacity', value: '1' }, { property: 'transform', value: 'translateY(0)' }] }
          ]
        }],
        transitions: [],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.patterns['fade-up'] > 0, 'fade-up pattern should be detected');
    });

    test('identifyPatterns detects scale-in', () => {
      const result = analyzer.identifyPatterns({
        css: [{
          name: 'scaleIn',
          keyframes: [
            { keyText: '0%', properties: [{ property: 'transform', value: 'scale(0.5)' }] },
            { keyText: '100%', properties: [{ property: 'transform', value: 'scale(1)' }] }
          ]
        }],
        transitions: [],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.patterns['scale-in'] > 0, 'scale-in pattern should be detected');
    });

    test('identifyPatterns detects pulse', () => {
      const result = analyzer.identifyPatterns({
        css: [{
          name: 'pulse',
          keyframes: [
            { keyText: '0%', properties: [{ property: 'transform', value: 'scale(1)' }] },
            { keyText: '50%', properties: [{ property: 'transform', value: 'scale(1.2)' }] },
            { keyText: '100%', properties: [{ property: 'transform', value: 'scale(1)' }] }
          ]
        }],
        transitions: [],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.patterns['pulse'] > 0, 'pulse pattern should be detected');
    });

    test('identifyPatterns with known keyframe structures', () => {
      const result = analyzer.identifyPatterns(createPatternTestAnimations());
      assert(result.total >= 6, `Expected total >= 6, got ${result.total}`);
      assert(result.patterns['fade-up'] > 0, 'fade-up should be detected');
      assert(result.patterns['scale-in'] > 0, 'scale-in should be detected');
      assert(result.patterns['slide-x'] > 0, 'slide-x should be detected');
      assert(result.patterns['pulse'] > 0, 'pulse should be detected');
      assert(result.patterns['rotate'] > 0, 'rotate should be detected');
      assert(result.patterns['bounce'] > 0, 'bounce should be detected');
    });
    console.log();

    console.log('6. Testing assessPerformance...');
    test('assessPerformance returns correct type', () => {
      const result = analyzer.assessPerformance(createPerformanceTestAnimations());
      assertType(result, 'object', 'assessPerformance should return object');
      assertType(result.gpuAccelerated, 'object', 'gpuAccelerated should be object');
      assertType(result.layoutTriggering, 'object', 'layoutTriggering should be object');
      assertType(result.willChangeCount, 'number', 'willChangeCount should be number');
      assertType(result.score, 'string', 'score should be string');
    });

    test('assessPerformance detects GPU accelerated animations', () => {
      const result = analyzer.assessPerformance({
        css: [{
          name: 'gpu',
          keyframes: [
            { keyText: '0%', properties: [{ property: 'transform', value: 'translateX(0)' }] },
            { keyText: '100%', properties: [{ property: 'transform', value: 'translateX(100px)' }] }
          ]
        }],
        transitions: [],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.gpuAccelerated.count > 0, 'GPU accelerated count should be > 0');
      assert(result.gpuAccelerated.percentage > 0, 'GPU percentage should be > 0');
    });

    test('assessPerformance detects layout-triggering animations', () => {
      const result = analyzer.assessPerformance({
        css: [{
          name: 'layout',
          keyframes: [
            { keyText: '0%', properties: [{ property: 'width', value: '100px' }] },
            { keyText: '100%', properties: [{ property: 'width', value: '200px' }] }
          ]
        }],
        transitions: [],
        gsap: [],
        framerMotion: [],
        scroll: []
      });
      assert(result.layoutTriggering.count > 0, 'Layout triggering count should be > 0');
      assert(result.layoutTriggering.percentage > 0, 'Layout percentage should be > 0');
    });

    test('assessPerformance with GPU vs layout-triggering animations', () => {
      const result = analyzer.assessPerformance(createPerformanceTestAnimations());
      assert(result.gpuAccelerated.count > 0, 'Should detect GPU animations');
      assert(result.layoutTriggering.count > 0, 'Should detect layout animations');
      assert(['good', 'fair', 'poor'].includes(result.score), `Invalid score: ${result.score}`);
    });
    console.log();

    console.log('7. Testing toDesignSection...');
    test('toDesignSection returns non-empty markdown string', () => {
      const profile = analyzer.analyze(createMixedAnimations());
      const markdown = analyzer.toDesignSection(profile);
      assertType(markdown, 'string', 'toDesignSection should return string');
      assert(markdown.length > 0, 'Markdown should not be empty');
      assert(markdown.includes('## 15.'), 'Should include Section 15 header');
    });

    test('toDesignSection includes all required sections', () => {
      const profile = analyzer.analyze(createMixedAnimations());
      const markdown = analyzer.toDesignSection(profile);
      assert(markdown.includes('Motion Language Profile'), 'Should include Motion Language Profile');
      assert(markdown.includes('Duration Buckets'), 'Should include Duration Buckets');
      assert(markdown.includes('Easing Families'), 'Should include Easing Families');
      assert(markdown.includes('Keyframe Patterns'), 'Should include Keyframe Patterns');
      assert(markdown.includes('Animation Sequences'), 'Should include Animation Sequences');
      assert(markdown.includes('Scroll-Linked Animations'), 'Should include Scroll-Linked Animations');
      assert(markdown.includes('Performance Classification'), 'Should include Performance Classification');
    });
    console.log();

    console.log('8. Testing analyze main entry point...');
    test('analyze returns combined profile object', () => {
      const result = analyzer.analyze(createMixedAnimations());
      assertType(result, 'object', 'analyze should return object');
      assert(result.feel !== undefined, 'Should include feel');
      assert(result.durations !== undefined, 'Should include durations');
      assert(result.easings !== undefined, 'Should include easings');
      assert(result.patterns !== undefined, 'Should include patterns');
      assert(result.performance !== undefined, 'Should include performance');
      assert(result.sequences !== undefined, 'Should include sequences');
      assert(result.summary !== undefined, 'Should include summary');
    });

    test('analyze handles empty animations', () => {
      const result = analyzer.analyze(createEmptyAnimations());
      assertType(result, 'object', 'analyze should return object for empty input');
      assert(result.feel.feel === 'static', 'Empty input should yield static feel');
    });
    console.log();

    console.log('9. Testing parseDuration helper...');
    test('parseDuration handles "0.3s"', () => {
      assert(analyzer.parseDuration('0.3s') === 300, '0.3s should be 300ms');
    });
    test('parseDuration handles "300ms"', () => {
      assert(analyzer.parseDuration('300ms') === 300, '300ms should be 300ms');
    });
    test('parseDuration handles "0.5" (no unit)', () => {
      assert(analyzer.parseDuration('0.5') === 500, '0.5 should be 500ms');
    });
    test('parseDuration handles number input', () => {
      assert(analyzer.parseDuration(300) === 300, '300 should be 300ms');
      assert(analyzer.parseDuration(0.3) === 300, '0.3 should be 300ms');
    });
    console.log();

  } catch (error) {
    console.error(`\nUnexpected error during validation: ${error.message}`);
    console.error(error.stack);
    success = false;
  }

  console.log('=== Validation Summary ===');
  console.log(`Tests Passed: ${testsPassed}`);
  console.log(`Tests Failed: ${testsFailed}`);
  console.log(`Status: ${success ? 'PASSED' : 'FAILED'}`);
  console.log();

  if (success) {
    console.log('EnhancedAnimationAnalyzer validation PASSED');
    console.log('\nAll methods verified:');
    console.log('  ✅ classifyFeel - Motion feel classification');
    console.log('  ✅ bucketDurations - Duration distribution analysis');
    console.log('  ✅ classifyEasings - Easing family grouping');
    console.log('  ✅ identifyPatterns - Keyframe pattern detection');
    console.log('  ✅ assessPerformance - GPU/layout performance scoring');
    console.log('  ✅ toDesignSection - DESIGN.md markdown generation');
    console.log('  ✅ analyze - Main entry point');
    console.log('\nEnhancedAnimationAnalyzer ready for integration.');
    process.exit(0);
  } else {
    console.log('EnhancedAnimationAnalyzer validation FAILED');
    process.exit(1);
  }
}

runValidation();
