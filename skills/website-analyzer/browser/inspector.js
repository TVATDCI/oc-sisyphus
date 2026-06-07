const { Injector } = require('./injector');
const { AnimationRecorder } = require('./animation-recorder');
const { ThreeInspector } = require('./three-inspector');
const { StateExtractor } = require('./state-extractor');
const { RouteMapper } = require('./route-mapper');
const { EnhancedAnimationAnalyzer } = require('./enhanced-animation-analyzer');
const { PerformanceProfiler } = require('./performance-profiler');
const { DesignExporter } = require('../exporters');

class BrowserInspector {
  constructor(page, options = {}) {
    this.page = page;
    this.options = {
      screenshotDir: options.screenshotDir || '/tmp/website-analyzer',
      waitForLoad: options.waitForLoad !== false,
      injectTimeout: options.injectTimeout || 30000,
      exportDir: options.exportDir || null,
      ...options
    };
    this.injector = new Injector(page);
    this.results = {
      url: null,
      timestamp: null,
      animations: null,
      threeJs: null,
      state: null,
      routes: null,
      interactions: null,
      screenshots: [],
      enhancedAnimations: null,
      performance: null,
      exportedFiles: null
    };
  }

  async initialize(url) {
    this.results.url = url;
    this.results.timestamp = new Date().toISOString();
    
    if (this.options.waitForLoad) {
      await this.page.waitForLoadState('networkidle');
    }
    
    return this;
  }

  async captureScreenshot(name = 'full-page') {
    const screenshot = await this.page.screenshot({
      fullPage: true,
      type: 'png'
    });
    
    this.results.screenshots.push({
      name,
      timestamp: new Date().toISOString(),
      buffer: screenshot
    });
    
    return screenshot;
  }

  async recordAnimations() {
    const recorder = new AnimationRecorder(this.page, this.injector);
    this.results.animations = await recorder.capture();
    return this.results.animations;
  }

  async inspectThreeJS() {
    const inspector = new ThreeInspector(this.page, this.injector);
    this.results.threeJs = await inspector.inspect();
    return this.results.threeJs;
  }

  async extractState() {
    const extractor = new StateExtractor(this.page, this.injector);
    this.results.state = await extractor.extract();
    this.results.stateExtractor = extractor;
    return this.results.state;
  }

  async mapRoutes() {
    const mapper = new RouteMapper(this.page, this.injector);
    this.results.routes = await mapper.map();
    this.results.routeMapper = mapper;
    return this.results.routes;
  }

  async recordInteractions() {
    const interactions = await this.page.evaluate(() => {
      if (!window.__EVENT_CAPTURE__) {
        window.__EVENT_CAPTURE__ = {
          events: [],
          originalAddEventListener: EventTarget.prototype.addEventListener
        };
        
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          window.__EVENT_CAPTURE__.events.push({
            type,
            target: this.tagName || this.constructor?.name || 'unknown',
            timestamp: Date.now()
          });
          return window.__EVENT_CAPTURE__.originalAddEventListener.call(this, type, listener, options);
        };
      }
      
      return {
        eventCount: window.__EVENT_CAPTURE__.events.length,
        eventTypes: [...new Set(window.__EVENT_CAPTURE__.events.map(e => e.type))],
        recentEvents: window.__EVENT_CAPTURE__.events.slice(-20)
      };
    });
    
    this.results.interactions = interactions;
    return interactions;
  }

  async runFullAnalysis() {
    await this.captureScreenshot('initial-state');
    
    await Promise.all([
      this.recordAnimations().catch(err => ({ error: err.message })),
      this.inspectThreeJS().catch(err => ({ error: err.message })),
      this.extractState().catch(err => ({ error: err.message })),
      this.mapRoutes().catch(err => ({ error: err.message })),
      this.recordInteractions().catch(err => ({ error: err.message }))
    ]);

    await this.analyzeEnhancedAnimations().catch(err => ({ error: err.message }));
    await this.capturePerformance().catch(err => ({ error: err.message }));

    await this.captureScreenshot('post-interaction');

    await this.exportDesignFiles().catch(err => ({ error: err.message }));
    
    return this.results;
  }

  async analyzeEnhancedAnimations() {
    const analyzer = new EnhancedAnimationAnalyzer();
    this.results.enhancedAnimations = analyzer.analyzeMotionProfile(this.results.animations);
    return this.results.enhancedAnimations;
  }

  async capturePerformance() {
    const profiler = new PerformanceProfiler(this.page);
    this.results.performance = await profiler.captureMetrics();
    return this.results.performance;
  }

  async exportDesignFiles() {
    if (!this.options.exportDir) return null;
    const exporter = new DesignExporter(this.results);
    this.results.exportedFiles = exporter.exportAll(this.options.exportDir);
    return this.results.exportedFiles;
  }

  generateDesignSections() {
    const sections = [];
    
    if (this.results.animations) {
      const recorder = new AnimationRecorder(this.page, this.injector);
      Object.assign(recorder.capturedAnimations, this.results.animations);
      sections.push(recorder.toDesignSection());
    }

    if (this.results.enhancedAnimations) {
      const analyzer = new EnhancedAnimationAnalyzer();
      sections.push(analyzer.toDesignSection(this.results.enhancedAnimations));
    }

    if (this.results.threeJs) {
      const threeInspector = new ThreeInspector(this.page, this.injector);
      if (this.results.threeJs.present) {
        threeInspector.sceneData = this.results.threeJs;
      }
      sections.push(threeInspector.toDesignSection());
    }

    if (this.results.performance) {
      const profiler = new PerformanceProfiler(this.page);
      sections.push(profiler.toDesignSection(this.results.performance));
    }
    
    if (this.results.state && this.results.stateExtractor) {
      sections.push(this.results.stateExtractor.toDesignSection());
    }
    
    if (this.results.routes && this.results.routeMapper) {
      sections.push(this.results.routeMapper.toDesignSection());
    }
    
    if (this.results.interactions) {
      sections.push(this.formatInteractionSection());
    }
    
    return sections.join('\n\n');
  }

  formatInteractionSection() {
    const { interactions } = this.results;
    return `## 19. Interaction Patterns

### Event Handlers
- **Total Registered:** ${interactions.eventCount || 0}
- **Event Types:** ${interactions.eventTypes?.join(', ') || 'N/A'}

### Detected Patterns
${interactions.recentEvents?.map(e => `- **${e.type}** on \`${e.target}\` @ ${new Date(e.timestamp).toISOString()}`).join('\n') || 'No events captured'}

**Confidence:** ${interactions.eventCount > 0 ? 'EXTRACTED' : 'AMBIGUOUS'}`;
  }
}

module.exports = { BrowserInspector };
