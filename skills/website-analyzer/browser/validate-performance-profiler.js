/**
 * Performance Profiler Validation Script
 * Tests PerformanceProfiler class without requiring a live browser
 */

const { PerformanceProfiler } = require('./performance-profiler');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function runTests() {
  console.log('=== PerformanceProfiler Validation ===\n');
  let success = true;

  try {
    // 1. Test instantiation
    console.log('1. Testing instantiation...');
    const profiler = new PerformanceProfiler();
    assert(profiler instanceof PerformanceProfiler, 'Should be instance of PerformanceProfiler');
    assert(profiler.metrics === null, 'Initial metrics should be null');
    console.log('   PASSED\n');

    // 2. Test method existence
    console.log('2. Testing method existence...');
    assert(typeof profiler.profile === 'function', 'profile should be a function');
    assert(typeof profiler.measureFPS === 'function', 'measureFPS should be a function');
    assert(typeof profiler.captureWebGLStats === 'function', 'captureWebGLStats should be a function');
    assert(typeof profiler.analyzeResources === 'function', 'analyzeResources should be a function');
    assert(typeof profiler.detectBottlenecks === 'function', 'detectBottlenecks should be a function');
    assert(typeof profiler.toDesignSection === 'function', 'toDesignSection should be a function');
    console.log('   PASSED\n');

    // 3. Test detectBottlenecks — low FPS + layout thrashing
    console.log('3. Testing detectBottlenecks — layout thrashing scenario...');
    const layoutThrashingMetrics = {
      fps: { fps: 24, duration: 1000, frameCount: 24, rating: 'poor' },
      resources: {
        hasLayoutAnimations: true,
        totalImageSizeKB: 200,
        domNodes: 1500,
        eventListenerCount: 40,
        cssFiles: 3,
        jsHeapUsedMB: 50
      },
      webgl: { present: false }
    };
    let result = profiler.detectBottlenecks(layoutThrashingMetrics);
    assert(Array.isArray(result.bottlenecks), 'bottlenecks should be an array');
    assert(result.bottlenecks.some(b => b.type === 'layout-thrashing'), 'Should detect layout thrashing');
    assert(result.bottlenecks.some(b => b.severity === 'high'), 'Should have high severity');
    assert(result.optimizationOpportunities.some(o => o.includes('transform')), 'Should recommend transform/opacity');
    console.log('   PASSED\n');

    // 4. Test detectBottlenecks — large images
    console.log('4. Testing detectBottlenecks — large images scenario...');
    const largeImageMetrics = {
      fps: { fps: 50, duration: 1000, frameCount: 50, rating: 'good' },
      resources: {
        hasLayoutAnimations: false,
        totalImageSizeKB: 2500,
        domNodes: 2000,
        eventListenerCount: 20,
        cssFiles: 2,
        jsHeapUsedMB: 60
      },
      webgl: { present: false }
    };
    result = profiler.detectBottlenecks(largeImageMetrics);
    assert(result.bottlenecks.some(b => b.type === 'large-images'), 'Should detect large images');
    assert(result.bottlenecks.find(b => b.type === 'large-images').severity === 'high', 'Large images should be high severity');
    assert(result.optimizationOpportunities.some(o => o.includes('WebP') || o.includes('AVIF')), 'Should recommend image optimization');
    console.log('   PASSED\n');

    // 5. Test detectBottlenecks — excessive DOM nodes
    console.log('5. Testing detectBottlenecks — excessive DOM scenario...');
    const excessiveDomMetrics = {
      fps: { fps: 40, duration: 1000, frameCount: 40, rating: 'fair' },
      resources: {
        hasLayoutAnimations: false,
        totalImageSizeKB: 100,
        domNodes: 6000,
        eventListenerCount: 150,
        cssFiles: 8,
        jsHeapUsedMB: 120
      },
      webgl: { present: false }
    };
    result = profiler.detectBottlenecks(excessiveDomMetrics);
    assert(result.bottlenecks.some(b => b.type === 'excessive-dom'), 'Should detect excessive DOM');
    assert(result.bottlenecks.some(b => b.type === 'excessive-event-listeners'), 'Should detect excessive event listeners');
    assert(result.bottlenecks.some(b => b.type === 'unused-css'), 'Should detect unused CSS potential');
    assert(result.bottlenecks.some(b => b.type === 'high-memory'), 'Should detect high memory');
    console.log('   PASSED\n');

    // 6. Test detectBottlenecks — WebGL performance
    console.log('6. Testing detectBottlenecks — WebGL bottleneck scenario...');
    const webglMetrics = {
      fps: { fps: 35, duration: 1000, frameCount: 35, rating: 'fair' },
      resources: {
        hasLayoutAnimations: false,
        totalImageSizeKB: 100,
        domNodes: 800,
        eventListenerCount: 10,
        cssFiles: 1,
        jsHeapUsedMB: 40
      },
      webgl: {
        present: true,
        drawCalls: 400,
        triangles: 800000,
        geometries: 50,
        textures: 30,
        memoryMB: 15.5
      }
    };
    result = profiler.detectBottlenecks(webglMetrics);
    assert(result.bottlenecks.some(b => b.type === 'webgl-draw-calls'), 'Should detect high draw calls');
    assert(result.bottlenecks.some(b => b.type === 'webgl-geometry'), 'Should detect high triangle count');
    assert(result.optimizationOpportunities.some(o => o.includes('instancing')), 'Should recommend instancing');
    console.log('   PASSED\n');

    // 7. Test detectBottlenecks — no bottlenecks (healthy site)
    console.log('7. Testing detectBottlenecks — healthy site scenario...');
    const healthyMetrics = {
      fps: { fps: 60, duration: 1000, frameCount: 60, rating: 'excellent' },
      resources: {
        hasLayoutAnimations: false,
        totalImageSizeKB: 150,
        domNodes: 1200,
        eventListenerCount: 25,
        cssFiles: 2,
        jsHeapUsedMB: 45
      },
      webgl: { present: false }
    };
    result = profiler.detectBottlenecks(healthyMetrics);
    assert(result.bottlenecks.length === 0, 'Healthy site should have no bottlenecks');
    assert(result.optimizationOpportunities.length === 0, 'Healthy site should have no optimization opportunities');
    console.log('   PASSED\n');

    // 8. Test toDesignSection returns markdown
    console.log('8. Testing toDesignSection output...');
    const fullMetrics = {
      fps: { fps: 30, duration: 1000, frameCount: 30, rating: 'fair' },
      resources: {
        jsHeapSizeMB: 128.5,
        jsHeapUsedMB: 85.2,
        imageCount: 24,
        totalImageSizeKB: 1200,
        cssFiles: 5,
        jsFiles: 12,
        totalResources: 48,
        domNodes: 4500,
        eventListenerCount: 180,
        hasLayoutAnimations: true
      },
      webgl: {
        present: true,
        drawCalls: 50,
        triangles: 25000,
        geometries: 12,
        textures: 8,
        memoryMB: 3.2
      },
      timestamp: '2024-01-01T00:00:00.000Z'
    };
    const analysis = profiler.detectBottlenecks(fullMetrics);
    fullMetrics.bottlenecks = analysis.bottlenecks;
    fullMetrics.optimizationOpportunities = analysis.optimizationOpportunities;

    const markdown = profiler.toDesignSection(fullMetrics);
    assert(typeof markdown === 'string', 'toDesignSection should return a string');
    assert(markdown.length > 0, 'Markdown should not be empty');
    assert(markdown.includes('## 13.5. Performance Profile'), 'Should include Section 13.5 header');
    assert(markdown.includes('### Rendering Performance'), 'Should include Rendering Performance subsection');
    assert(markdown.includes('### WebGL Stats'), 'Should include WebGL Stats subsection');
    assert(markdown.includes('### Memory Usage'), 'Should include Memory Usage subsection');
    assert(markdown.includes('### Bundle Analysis'), 'Should include Bundle Analysis subsection');
    assert(markdown.includes('### Bottlenecks'), 'Should include Bottlenecks subsection');
    assert(markdown.includes('### Optimization Opportunities'), 'Should include Optimization Opportunities subsection');
    console.log('   PASSED\n');

    // 9. Test toDesignSection with null metrics
    console.log('9. Testing toDesignSection with null metrics...');
    const nullMarkdown = profiler.toDesignSection(null);
    assert(typeof nullMarkdown === 'string', 'Should return string for null metrics');
    assert(nullMarkdown.includes('## 13.5. Performance Profile'), 'Should still include header');
    assert(nullMarkdown.includes('No performance data available'), 'Should indicate no data');
    console.log('   PASSED\n');

    // 10. Test toDesignSection without bottlenecks
    console.log('10. Testing toDesignSection without bottlenecks...');
    const cleanMetrics = {
      fps: { fps: 60, duration: 1000, frameCount: 60, rating: 'excellent' },
      resources: {
        jsHeapSizeMB: 64,
        jsHeapUsedMB: 32,
        imageCount: 5,
        totalImageSizeKB: 100,
        cssFiles: 1,
        jsFiles: 3,
        totalResources: 10,
        domNodes: 800,
        eventListenerCount: 15,
        hasLayoutAnimations: false
      },
      webgl: { present: false },
      bottlenecks: [],
      optimizationOpportunities: [],
      timestamp: '2024-01-01T00:00:00.000Z'
    };
    const cleanMarkdown = profiler.toDesignSection(cleanMetrics);
    assert(cleanMarkdown.includes('*No significant bottlenecks detected.*'), 'Should show no bottlenecks message');
    assert(cleanMarkdown.includes('*No optimization opportunities identified.*'), 'Should show no opportunities message');
    console.log('   PASSED\n');

    // 11. Test partial metrics (missing fps/resources/webgl)
    console.log('11. Testing toDesignSection with partial metrics...');
    const partialMetrics = {
      fps: null,
      resources: null,
      webgl: null,
      timestamp: '2024-01-01T00:00:00.000Z'
    };
    const partialMarkdown = profiler.toDesignSection(partialMetrics);
    assert(partialMarkdown.includes('*No FPS data captured.*'), 'Should handle missing FPS');
    assert(partialMarkdown.includes('*No WebGL data captured.*'), 'Should handle missing WebGL');
    assert(partialMarkdown.includes('*No memory data captured.*'), 'Should handle missing memory');
    console.log('   PASSED\n');

    console.log('=== Validation Summary ===');
    console.log('Status: PASSED');
    console.log('\nPerformanceProfiler v1.3.0 Implementation:');
    console.log('  ✅ measureFPS — 1-second requestAnimationFrame loop');
    console.log('  ✅ captureWebGLStats — Three.js renderer.info extraction');
    console.log('  ✅ analyzeResources — Memory, images, CSS, JS analysis');
    console.log('  ✅ detectBottlenecks — Layout thrashing, images, DOM, events, CSS, memory, WebGL');
    console.log('  ✅ toDesignSection — DESIGN.md Section 13.5 markdown generation');
    console.log('  ✅ profile — Main entry point orchestrating all measurements');
    console.log('\nBottleneck Detection Coverage:');
    console.log('  - layout-thrashing (high severity)');
    console.log('  - large-images (medium/high severity)');
    console.log('  - excessive-dom (medium/high severity)');
    console.log('  - excessive-event-listeners (medium/high severity)');
    console.log('  - unused-css (low severity)');
    console.log('  - high-memory (medium/high severity)');
    console.log('  - webgl-draw-calls (medium/high severity)');
    console.log('  - webgl-geometry (medium/high severity)');
    console.log('\nPerformanceProfiler validation PASSED');

    process.exit(0);
  } catch (error) {
    console.log(`\n=== Validation Summary ===`);
    console.log(`Status: FAILED`);
    console.log(`Error: ${error.message}`);
    console.log(`\nStack trace:\n${error.stack}`);
    process.exit(1);
  }
}

runTests();
