/**
 * Performance Profiler — Capture FPS, memory, WebGL, resource and bottleneck metrics
 * for website-analyzer v1.3.0
 */

class PerformanceProfiler {
  constructor(page) {
    this.page = page;
  }

  /**
   * Capture all performance metrics.
   */
  async captureMetrics() {
    const metrics = {};

    try {
      metrics.fps = await this.measureFPS();
    } catch (e) {
      metrics.fps = { average: 'N/A', min: 'N/A', max: 'N/A', droppedFrames: 'N/A', error: e.message };
    }

    try {
      metrics.memory = await this.captureMemoryStats();
    } catch (e) {
      metrics.memory = { jsHeap: 'N/A', totalJS: 'N/A', gpuMemory: 'N/A', error: e.message };
    }

    try {
      metrics.webgl = await this.captureWebGLStats();
    } catch (e) {
      metrics.webgl = null;
    }

    try {
      metrics.resources = await this.analyzeResources();
    } catch (e) {
      metrics.resources = { totalSize: 'N/A', jsSize: 'N/A', cssSize: 'N/A', imageSize: 'N/A', fontCount: 'N/A', largeImages: [], error: e.message };
    }

    try {
      metrics.bottlenecks = await this.detectBottlenecks();
    } catch (e) {
      metrics.bottlenecks = [{ type: 'Profiling Error', description: e.message, severity: 'low' }];
    }

    return metrics;
  }

  /**
   * Measure FPS over 3 one-second samples.
   */
  async measureFPS() {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const frames = await this.page.evaluate(() => {
        return new Promise((resolve) => {
          let frameCount = 0;
          const start = performance.now();
          const tick = () => {
            frameCount++;
            if (performance.now() - start < 1000) {
              requestAnimationFrame(tick);
            } else {
              resolve(frameCount);
            }
          };
          requestAnimationFrame(tick);
        });
      });
      samples.push(frames);
    }

    const average = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const expected = 60 * samples.length;
    const total = samples.reduce((a, b) => a + b, 0);
    const droppedFrames = Math.max(0, expected - total);

    return { average, min, max, droppedFrames };
  }

  /**
   * Capture memory stats (Chrome-only).
   */
  async captureMemoryStats() {
    return await this.page.evaluate(() => {
      const mem = performance.memory;
      if (!mem) {
        return { jsHeap: null, totalJS: null, gpuMemory: null, note: 'performance.memory not available in this environment' };
      }
      // Estimate GPU memory if Three.js is present
      let gpuMemory = null;
      if (window.__THREE__ && window.__THREE__.renderer) {
        const info = window.__THREE__.renderer.info;
        if (info && info.memory && info.memory.textures) {
          // Rough estimate: 5MB per texture average
          gpuMemory = info.memory.textures * 5 * 1024 * 1024;
        }
      }
      return {
        jsHeap: mem.usedJSHeapSize,
        totalJS: mem.totalJSHeapSize,
        gpuMemory,
      };
    });
  }

  /**
   * Capture WebGL stats if Three.js is present.
   */
  async captureWebGLStats() {
    return await this.page.evaluate(() => {
      const three = window.__THREE__ || (window.THREE ? { renderer: window.THREE.renderer } : null);
      if (!three || !three.renderer) return null;

      const info = three.renderer.info;
      if (!info) return null;

      return {
        drawCalls: info.render?.calls || 0,
        triangles: info.render?.triangles || 0,
        geometries: info.memory?.geometries || 0,
        textures: info.memory?.textures || 0,
        shaders: info.programs?.length || 0,
      };
    });
  }

  /**
   * Analyze loaded resources.
   */
  async analyzeResources() {
    return await this.page.evaluate(() => {
      const entries = performance.getEntriesByType('resource');
      let totalSize = 0;
      let jsSize = 0;
      let cssSize = 0;
      let imageSize = 0;
      const fontUrls = new Set();
      const largeImages = [];

      for (const r of entries) {
        const size = r.transferSize || 0;
        totalSize += size;

        const type = r.initiatorType || '';
        const url = r.name || '';

        if (type === 'script' || url.endsWith('.js')) {
          jsSize += size;
        } else if (type === 'link' || type === 'css' || url.endsWith('.css')) {
          cssSize += size;
        } else if (type === 'img' || url.match(/\.(png|jpe?g|gif|webp|svg|avif)$/i)) {
          imageSize += size;
          if (size > 500 * 1024) {
            largeImages.push({ url, size: Math.round(size / 1024) });
          }
        } else if (type === 'css' || url.match(/\.(woff2?|ttf|otf)$/i)) {
          fontUrls.add(url);
        }
      }

      return {
        totalSize: Math.round(totalSize / 1024), // KB
        jsSize: Math.round(jsSize / 1024),
        cssSize: Math.round(cssSize / 1024),
        imageSize: Math.round(imageSize / 1024),
        fontCount: fontUrls.size,
        largeImages,
      };
    });
  }

  /**
   * Detect performance bottlenecks.
   */
  async detectBottlenecks(animations) {
    const bottlenecks = [];

    // Layout thrashing from animations
    if (animations) {
      const layoutProps = ['top', 'left', 'right', 'bottom', 'width', 'height', 'margin', 'padding'];
      let layoutCount = 0;

      if (animations.css) {
        for (const anim of animations.css) {
          if (!anim.keyframes) continue;
          for (const kf of anim.keyframes) {
            for (const p of kf.properties || []) {
              if (layoutProps.some((lp) => p.property.includes(lp))) layoutCount++;
            }
          }
        }
      }

      if (animations.transitions) {
        for (const t of animations.transitions) {
          const props = (t.transitionProperty || '').split(',').map((s) => s.trim());
          if (props.some((p) => layoutProps.includes(p))) layoutCount++;
        }
      }

      if (layoutCount > 0) {
        bottlenecks.push({
          type: 'Layout Thrashing',
          description: `${layoutCount} animations using top/left/width/height instead of transform`,
          severity: 'high',
        });
      }
    }

    // Large images
    try {
      const resources = await this.analyzeResources();
      if (resources.largeImages && resources.largeImages.length > 0) {
        bottlenecks.push({
          type: 'Large Images',
          description: `${resources.largeImages.length} images > 500KB`,
          severity: 'medium',
        });
      }
    } catch (e) {
      // ignore
    }

    // Missing lazy loading
    try {
      const lazyLoadIssues = await this.page.evaluate(() => {
        const images = document.querySelectorAll('img');
        let missing = 0;
        const viewportHeight = window.innerHeight;
        images.forEach((img) => {
          const rect = img.getBoundingClientRect();
          if (rect.top > viewportHeight && !img.hasAttribute('loading')) {
            missing++;
          }
        });
        return missing;
      });
      if (lazyLoadIssues > 0) {
        bottlenecks.push({
          type: 'Missing Lazy Loading',
          description: `${lazyLoadIssues} below-fold images without loading="lazy"`,
          severity: 'medium',
        });
      }
    } catch (e) {
      // ignore
    }

    // Unused CSS heuristic
    try {
      const unusedCSS = await this.page.evaluate(() => {
        const sheets = document.styleSheets;
        let ruleCount = 0;
        for (const sheet of sheets) {
          try {
            ruleCount += sheet.cssRules?.length || 0;
          } catch (e) {
            // cross-origin
          }
        }
        const elementCount = document.querySelectorAll('*').length;
        // Very rough heuristic: if rules vastly outnumber elements, flag it
        return ruleCount > elementCount * 3 ? { ruleCount, elementCount } : null;
      });
      if (unusedCSS) {
        bottlenecks.push({
          type: 'Unused CSS',
          description: `${unusedCSS.ruleCount} CSS rules for ${unusedCSS.elementCount} elements — possible unused styles`,
          severity: 'low',
        });
      }
    } catch (e) {
      // ignore
    }

    if (bottlenecks.length === 0) {
      bottlenecks.push({ type: 'None Detected', description: 'No significant bottlenecks found', severity: 'low' });
    }

    return bottlenecks;
  }

  /**
   * Convert metrics to DESIGN.md markdown section.
   */
  toDesignSection(metrics) {
    const lines = [];
    lines.push('## 13.5 Performance Profile');
    lines.push('');

    // Rendering Performance
    lines.push('### Rendering Performance');
    if (metrics.fps && metrics.fps.average !== 'N/A') {
      lines.push(`- **Frame Rate:** ${metrics.fps.average} FPS`);
      lines.push(`- **Frame Time:** ${metrics.fps.average > 0 ? (1000 / metrics.fps.average).toFixed(2) : 'N/A'}ms average`);
      lines.push(`- **Dropped Frames:** ${metrics.fps.droppedFrames} total`);
    } else {
      lines.push('- **Frame Rate:** N/A (could not measure)');
    }
    lines.push('');

    // WebGL Stats
    if (metrics.webgl) {
      lines.push('### WebGL Stats (Three.js)');
      lines.push(`- **Draw Calls:** ${metrics.webgl.drawCalls} per frame`);
      lines.push(`- **Triangles:** ${metrics.webgl.triangles.toLocaleString()}`);
      lines.push(`- **Geometries:** ${metrics.webgl.geometries}`);
      lines.push(`- **Textures:** ${metrics.webgl.textures}`);
      lines.push(`- **Shaders:** ${metrics.webgl.shaders} compiled`);
      lines.push('');
    }

    // Memory Usage
    lines.push('### Memory Usage');
    if (metrics.memory && metrics.memory.jsHeap !== 'N/A' && metrics.memory.jsHeap !== null) {
      const toMB = (bytes) => bytes ? Math.round(bytes / (1024 * 1024)) : 'N/A';
      lines.push(`- **JavaScript Heap:** ${toMB(metrics.memory.jsHeap)}MB`);
      lines.push(`- **Total JS Heap Size:** ${toMB(metrics.memory.totalJS)}MB`);
      if (metrics.memory.gpuMemory) {
        lines.push(`- **GPU Memory (estimated):** ${toMB(metrics.memory.gpuMemory)}MB`);
      }
    } else {
      lines.push('- **JavaScript Heap:** N/A (performance.memory unavailable)');
    }
    lines.push('');

    // Bundle Analysis
    lines.push('### Bundle Analysis');
    if (metrics.resources && metrics.resources.totalSize !== 'N/A') {
      lines.push(`- **Total Transfer Size:** ${metrics.resources.totalSize}KB`);
      lines.push(`- **JavaScript:** ${metrics.resources.jsSize}KB`);
      lines.push(`- **CSS:** ${metrics.resources.cssSize}KB`);
      lines.push(`- **Images:** ${metrics.resources.imageSize}KB`);
      lines.push(`- **Fonts:** ${metrics.resources.fontCount} files`);
      if (metrics.resources.largeImages.length > 0) {
        lines.push(`- **Large Images:** ${metrics.resources.largeImages.length} files > 500KB`);
      }
    } else {
      lines.push('- Resource metrics unavailable');
    }
    lines.push('');

    // Bottlenecks
    lines.push('### Bottlenecks');
    for (const b of metrics.bottlenecks) {
      const icon = b.severity === 'high' ? '⚠️' : b.severity === 'medium' ? '⚡' : 'ℹ️';
      lines.push(`${icon} **${b.type}:** ${b.description}`);
    }
    lines.push('');

    // Optimization Opportunities
    lines.push('### Optimization Opportunities');
    const ops = [];
    if (metrics.bottlenecks.some((b) => b.type === 'Layout Thrashing')) {
      ops.push('1. Replace top/left animations with transform for GPU acceleration');
    }
    if (metrics.bottlenecks.some((b) => b.type === 'Large Images')) {
      ops.push('2. Compress or lazy-load large images');
    }
    if (metrics.bottlenecks.some((b) => b.type === 'Missing Lazy Loading')) {
      ops.push('3. Add loading="lazy" to below-fold images');
    }
    if (metrics.bottlenecks.some((b) => b.type === 'Unused CSS')) {
      ops.push('4. Audit and remove unused CSS rules');
    }
    if (ops.length === 0) {
      ops.push('1. No major optimizations detected — performance looks good');
    }
    for (const op of ops) {
      lines.push(op);
    }
    lines.push('');

    return lines.join('\n');
  }
}

module.exports = { PerformanceProfiler };
