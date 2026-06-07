/**
 * Animation Recorder - Capture animation systems from live websites
 * Records CSS animations, Framer Motion, GSAP, scroll-linked animations
 * 
 * Part of website-analyzer v1.2.0 runtime analysis (Section 15)
 */

class AnimationRecorder {
  constructor(page, injector) {
    this.page = page;
    this.injector = injector;
    this.capturedAnimations = {
      css: [],
      js: [],
      scroll: [],
      framerMotion: [],
      gsap: [],
      transitions: [],
      triggers: {
        hover: [],
        scroll: [],
        mount: [],
        click: [],
        focus: []
      }
    };
  }

  /**
   * Main entry point: Capture all animation systems
   * @returns {Promise<Object>} Complete animation inventory
   */
  async capture(options = {}) {
    await this.setupHooks();
    
    await this.captureCSSAnimations();
    await this.captureFramerMotion();
    await this.captureGSAP();
    await this.captureScrollAnimations();
    await this.captureTransitions();
    await this.captureTriggers();
    
    if (options.interactive) {
      await this.captureInteractiveAnimations(options.duration || 5000);
    }

    return {
      css: this.capturedAnimations.css,
      js: this.capturedAnimations.js,
      scroll: this.capturedAnimations.scroll,
      framerMotion: this.capturedAnimations.framerMotion,
      gsap: this.capturedAnimations.gsap,
      transitions: this.capturedAnimations.transitions,
      triggers: this.capturedAnimations.triggers,
      totalCount: this.getTotalCount(),
      gpuAccelerated: this.getGPUAcceleratedCount(),
      hasFramerMotion: this.capturedAnimations.framerMotion.length > 0,
      hasGSAP: this.capturedAnimations.gsap.length > 0
    };
  }

  /**
   * Setup global hooks for capturing animation calls
   */
  async setupHooks() {
    await this.page.evaluate(() => {
      window.__ANIMATION_CAPTURE__ = {
        framerMotion: [],
        gsap: [],
        css: [],
        mutations: [],
        capturesActive: true
      };

      // Hook Framer Motion via MutationObserver
      const originalMotion = window.Motion || window.motion;
      if (originalMotion) {
        window.__ANIMATION_CAPTURE__.framerMotion.push({
          type: 'library',
          name: 'Framer Motion',
          detectedVia: 'globals'
        });
      }

      // Monitor for dynamically added motion elements
      const observer = new MutationObserver((mutations) => {
        if (!window.__ANIMATION_CAPTURE__.capturesActive) return;
        
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for Framer Motion specific attributes
              if (node.hasAttribute('data-framer-motion')) {
                window.__ANIMATION_CAPTURE__.mutations.push({
                  type: 'framer-motion-element',
                  tag: node.tagName,
                  className: node.className,
                  timestamp: Date.now()
                });
              }
              
              // Check for inline animation styles
              const style = node.getAttribute('style');
              if (style && (style.includes('transform') || style.includes('opacity'))) {
                window.__ANIMATION_CAPTURE__.mutations.push({
                  type: 'animated-element',
                  tag: node.tagName,
                  style: style,
                  timestamp: Date.now()
                });
              }
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'data-anim']
      });

      window.__ANIMATION_OBSERVER__ = observer;
    });
  }

  /**
   * Extract CSS @keyframes and animation properties from stylesheets
   */
  async captureCSSAnimations() {
    const cssResult = await this.page.evaluate(() => {
      const result = {
        keyframes: [],
        applied: [],
        inlineAnimations: []
      };
      
      // Extract @keyframes from all stylesheets
      const stylesheets = Array.from(document.styleSheets);
      stylesheets.forEach(sheet => {
        try {
          const rules = Array.from(sheet.cssRules || sheet.rules || []);
          rules.forEach(rule => {
            if (rule.type === CSSRule.KEYFRAMES_RULE || rule.type === 7) {
              const keyframes = [];
              Array.from(rule.cssRules).forEach(keyRule => {
                const properties = Array.from(keyRule.style).map(prop => ({
                  property,
                  value: keyRule.style.getPropertyValue(prop),
                  priority: keyRule.style.getPropertyPriority(prop)
                }));
                
                keyframes.push({
                  keyText: keyRule.keyText,
                  properties
                });
              });
              
              result.keyframes.push({
                name: rule.name,
                type: 'keyframes',
                keyframeCount: keyframes.length,
                keyframes
              });
            }
          });
        } catch (e) {
          // Cross-origin stylesheet - skip
        }
      });

      // Capture computed animations on all elements
      const animatedElements = document.querySelectorAll('*');
      animatedElements.forEach(el => {
        const computed = window.getComputedStyle(el);
        const animationName = computed.animationName;
        
        if (animationName && animationName !== 'none') {
          const names = animationName.split(',').map(n => n.trim());
          names.forEach(name => {
            result.applied.push({
              element: el.tagName + (el.className ? '.' + el.className.split(' ').join('.').substring(0, 50) : ''),
              animationName: name,
              duration: computed.animationDuration,
              timingFunction: computed.animationTimingFunction,
              delay: computed.animationDelay,
              iterationCount: computed.animationIterationCount,
              direction: computed.animationDirection,
              fillMode: computed.animationFillMode,
              playState: computed.animationPlayState,
              willChange: computed.willChange
            });
          });
        }
      });

      // Inline animation: styles
      const animatedInline = document.querySelectorAll('[style*="animation"], [style*="transition"]');
      animatedInline.forEach(el => {
        result.inlineAnimations.push({
          tag: el.tagName,
          className: el.className,
          style: el.getAttribute('style')
        });
      });

      return result;
    });

    this.capturedAnimations.css = cssResult.keyframes;
    this.capturedAnimations.js.push(...cssResult.applied);
  }

  /**
   * Hook and capture Framer Motion variants via Proxy
   */
  async captureFramerMotion() {
    await this.page.evaluate(() => {
      // Setup Framer Motion capture
      window.__FRAMER_CAPTURE__ = {
        variants: [],
        springs: [],
        transitions: [],
        components: []
      };

      // Hook motion.div, motion.span, etc. by intercepting JSX-like calls
      if (typeof window.Motion === 'object') {
        const motionKeys = Object.keys(window.Motion);
        window.__FRAMER_CAPTURE__.components = motionKeys.filter(k => 
          typeof window.Motion[k] === 'function' || typeof window.Motion[k] === 'object'
        );
      }

      // Try to find motion components in DOM
      const allElements = document.querySelectorAll('[style*="transform"], [style*="opacity"]');
      allElements.forEach(el => {
        if (el.style.transform || el.style.opacity) {
          window.__FRAMER_CAPTURE__.variants.push({
            element: el.tagName + '.' + el.className.split(' ').join('.'),
            initial: el.getAttribute('data-initial'),
            animate: el.getAttribute('data-animate'),
            exit: el.getAttribute('data-exit'),
            style: {
              transform: el.style.transform,
              opacity: el.style.opacity
            }
          });
        }
      });

      // Check for common Framer Motion patterns in class names
      const motionElements = document.querySelectorAll('[class*="motion"], [class*="framer"]');
      motionElements.forEach(el => {
        window.__FRAMER_CAPTURE__.components.push({
          tag: el.tagName,
          className: el.className,
          attributes: Array.from(el.attributes).map(a => a.name)
        });
      });
    });

    const framerData = await this.page.evaluate(() => window.__FRAMER_CAPTURE__);
    
    if (framerData && (framerData.variants.length > 0 || framerData.components.length > 0)) {
      this.capturedAnimations.framerMotion = framerData.variants;
      
      // Also record setup data
      this.capturedAnimations.framerMotion._meta = {
        components: framerData.components,
        springs: framerData.springs,
        transitions: framerData.transitions,
        detectedVia: 'dom-analysis'
      };
    }
  }

  /**
   * Hook and capture GSAP timelines and tweens with full parameter extraction
   */
  async captureGSAP() {
    // Inject hooks to capture GSAP calls
    await this.page.evaluate(() => {
      window.__GSAP_CAPTURE__ = {
        timelines: [],
        tweens: [],
        plugins: [],
        present: false
      };

      if (typeof window.gsap === 'undefined') return;

      window.__GSAP_CAPTURE__.present = true;

      // Hook gsap.to
      const originalTo = window.gsap.to;
      window.gsap.to = function(targets, vars) {
        window.__GSAP_CAPTURE__.tweens.push({
          type: 'to',
          targets: typeof targets === 'string' ? targets : targets?.tagName || 'DOM',
          vars: vars ? Object.keys(vars) : [],
          duration: vars?.duration || 0.5,
          ease: vars?.ease || 'none',
          delay: vars?.delay || 0,
          timestamp: Date.now()
        });
        return originalTo.apply(this, arguments);
      };

      // Hook gsap.from
      const originalFrom = window.gsap.from;
      window.gsap.from = function(targets, vars) {
        window.__GSAP_CAPTURE__.tweens.push({
          type: 'from',
          targets: typeof targets === 'string' ? targets : targets?.tagName || 'DOM',
          vars: vars ? Object.keys(vars) : [],
          duration: vars?.duration || 0.5,
          ease: vars?.ease || 'none',
          timestamp: Date.now()
        });
        return originalFrom.apply(this, arguments);
      };

      // Hook gsap.timeline
      const originalTimeline = window.gsap.timeline;
      window.gsap.timeline = function(vars) {
        const tl = originalTimeline.apply(this, arguments);
        
        window.__GSAP_CAPTURE__.timelines.push({
          id: tl.vars?.id || 'anonymous',
          duration: tl.duration(),
          labels: tl.labels ? Object.keys(tl.labels) : [],
          childCount: tl.getChildren ? tl.getChildren(true).length : 0,
          vars: vars ? Object.keys(vars) : [],
          timestamp: Date.now()
        });

        // Hook timeline.add to capture child tweens
        const originalAdd = tl.add;
        tl.add = function(child, position) {
          if (child && child.vars) {
            window.__GSAP_CAPTURE__.tweens.push({
              type: 'timeline-child',
              parent: tl.vars?.id || 'anonymous',
              position: position || '+=0',
              vars: Object.keys(child.vars),
              duration: child.duration()
            });
          }
          return originalAdd.apply(this, arguments);
        };

        return tl;
      };

      // Capture ScrollTrigger if present
      if (typeof window.ScrollTrigger !== 'undefined') {
        const triggers = window.ScrollTrigger.getAll ? window.ScrollTrigger.getAll() : [];
        triggers.forEach(t => {
          window.__GSAP_CAPTURE__.plugins.push({
            type: 'ScrollTrigger',
            trigger: t.vars?.trigger,
            start: t.vars?.start,
            end: t.vars?.end,
            scrub: t.vars?.scrub,
            pin: t.vars?.pin,
            markers: t.vars?.markers
          });
        });
      }
    });

    const gsapData = await this.page.evaluate(() => window.__GSAP_CAPTURE__);
    
    if (gsapData && (gsapData.tweens.length > 0 || gsapData.timelines.length > 0)) {
      this.capturedAnimations.gsap = gsapData.tweens;
      this.capturedAnimations.gsap._meta = {
        timelines: gsapData.timelines,
        plugins: gsapData.plugins,
        present: gsapData.present,
        detectedVia: 'hook-injection'
      };
    }
  }

  /**
   * Capture scroll-linked animations (ScrollTrigger, IntersectionObserver)
   */
  async captureScrollAnimations() {
    const scrollData = await this.page.evaluate(() => {
      const data = [];
      
      // Check for GSAP ScrollTrigger
      if (typeof window.ScrollTrigger !== 'undefined') {
        const triggers = window.ScrollTrigger.getAll ? window.ScrollTrigger.getAll() : [];
        data.push(...triggers.map(t => ({
          library: 'GSAP ScrollTrigger',
          trigger: t.vars?.trigger,
          start: t.vars?.start,
          end: t.vars?.end,
          scrub: t.vars?.scrub,
          pin: t.vars?.pin,
          toggleActions: t.vars?.toggleActions,
          animationVars: t.vars?.animation ? Object.keys(t.vars.animation) : []
        })));
      }
      
      // Check for IntersectionObserver-based animations
      const observerElements = document.querySelectorAll(
        '[data-animate-on-scroll], .animate-on-scroll, [data-aos], [data-sal]'
      );
      if (observerElements.length > 0) {
        data.push({
          library: 'IntersectionObserver (generic)',
          elementCount: observerElements.length,
          selectors: ['[data-animate-on-scroll]', '[data-aos]', '[data-sal]']
        });
      }

      // Check for scroll listener patterns
      const scrollHandlers = window.__EVENT_CAPTURE__?.events?.filter(e => e.type === 'scroll') || [];
      if (scrollHandlers.length > 0) {
        data.push({
          library: 'Native scroll events',
          handlerCount: scrollHandlers.length,
          elements: [...new Set(scrollHandlers.map(h => h.target))]
        });
      }

      return data;
    });

    this.capturedAnimations.scroll = scrollData;
  }

  /**
   * Capture CSS transitions on interactive elements
   */
  async captureTransitions() {
    const transitions = await this.page.evaluate(() => {
      const interactive = document.querySelectorAll(
        'button, a, input, select, textarea, [role="button"], [tabindex]'
      );
      const captured = [];
      
      interactive.forEach(el => {
        const computed = window.getComputedStyle(el);
        const transitionProperty = computed.transitionProperty;
        
        if (transitionProperty && transitionProperty !== 'all' && transitionProperty !== 'none') {
          captured.push({
            element: el.tagName + (el.id ? '#' + el.id : '') + 
                    (el.className ? '.' + el.className.split(' ').join('.').substring(0, 50) : ''),
            transitionProperty: computed.transitionProperty,
            transitionDuration: computed.transitionDuration,
            transitionTimingFunction: computed.transitionTimingFunction,
            transitionDelay: computed.transitionDelay,
            willChange: computed.willChange
          });
        }
      });

      return captured;
    });

    this.capturedAnimations.transitions = transitions;
  }

  /**
   * Capture animation triggers (hover, click, scroll, etc.)
   */
  async captureTriggers() {
    const triggers = await this.page.evaluate(() => {
      const result = {
        hover: [],
        click: [],
        scroll: [],
        mount: [],
        focus: []
      };

      // Find hover-triggered animations (elements with transition)
      const hoverCandidates = document.querySelectorAll('button, a, [class*="card"], [class*="btn"]');
      hoverCandidates.forEach(el => {
        const computed = window.getComputedStyle(el);
        if (computed.transitionDuration !== '0s') {
          result.hover.push({
            trigger: 'hover',
            element: el.tagName + (el.className ? '.' + el.className.split(' ').join('.').substring(0, 50) : ''),
            transition: `${computed.transitionProperty} ${computed.transitionDuration}`
          });
        }
      });

      // Find scroll-triggered animations (reveals)
      const revealElements = document.querySelectorAll(
        '[data-animate], [data-aos], [data-sal], [class*="reveal"], [class*="animated"]'
      );
      revealElements.forEach(el => {
        result.scroll.push({
          trigger: 'scroll-into-view',
          element: el.tagName + (el.className ? '.' + el.className.split(' ').join('.').substring(0, 50) : ''),
          dataset: Object.keys(el.dataset)
        });
      });

      // Find mount animations (animated elements on initial load)
      const mountElements = document.querySelectorAll('[style*="animation"]');
      mountElements.forEach(el => {
        result.mount.push({
          trigger: 'mount',
          element: el.tagName + (el.className ? '.' + el.className.split(' ').join('.').substring(0, 50) : ''),
          animation: el.style.animation
        });
      });

      return result;
    });

    this.capturedAnimations.triggers = triggers;
  }

  /**
   * Capture interactive animations by simulating user actions
   * @param {number} duration - How long to record in ms
   */
  async captureInteractiveAnimations(duration = 5000) {
    const startTime = Date.now();
    
    // Hover over interactive elements
    const buttons = await this.page.locator('button, a.btn, [role="button"]').all();
    for (const button of buttons.slice(0, 5)) { // Limit to avoid too many interactions
      try {
        await button.hover();
        await this.page.waitForTimeout(300);
      } catch (e) {
        // Element may not be visible or interactive
      }
    }

    // Capture mutations during interaction
    const mutations = await this.page.evaluate(() => {
      return window.__ANIMATION_CAPTURE__?.mutations || [];
    });

    // Cleanup
    await this.page.evaluate(() => {
      window.__ANIMATION_CAPTURE__.capturesActive = false;
      if (window.__ANIMATION_OBSERVER__) {
        window.__ANIMATION_OBSERVER__.disconnect();
      }
    });

    return {
      recordedDuration: Date.now() - startTime,
      mutationsDetected: mutations.length,
      mutations
    };
  }

  /**
   * Record animation in action (take screenshots during animation)
   */
  async recordKeyframes(elementSelector, duration = 2000) {
    const frames = [];
    const interval = 200;
    const count = Math.floor(duration / interval);
    
    for (let i = 0; i < count; i++) {
      await this.page.waitForTimeout(interval);
      const clippingBox = await this.page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        };
      }, elementSelector);
      
      if (clippingBox) {
        const screenshot = await this.page.screenshot({ 
          clip: clippingBox,
          type: 'png'
        });
        frames.push({
          timestamp: i * interval,
          imageSize: screenshot.length
        });
      }
    }

    return frames;
  }

  /**
   * Cleanup hooks and observers
   */
  async cleanup() {
    await this.page.evaluate(() => {
      window.__ANIMATION_CAPTURE__ = { capturesActive: false };
      if (window.__ANIMATION_OBSERVER__) {
        window.__ANIMATION_OBSERVER__.disconnect();
        delete window.__ANIMATION_OBSERVER__;
      }
      if (window.__FRAMER_CAPTURE__) delete window.__FRAMER_CAPTURE__;
      if (window.__GSAP_CAPTURE__) delete window.__GSAP_CAPTURE__;
    });
  }

  getTotalCount() {
    return this.capturedAnimations.css.length +
      this.capturedAnimations.framerMotion.length +
      (this.capturedAnimations.gsap._meta ? this.capturedAnimations.gsap._meta.timelines.length : 0) +
      this.capturedAnimations.scroll.length +
      this.capturedAnimations.transitions.length +
      Object.values(this.capturedAnimations.triggers).flat().length;
  }

  getGPUAcceleratedCount() {
    const cssGPU = this.capturedAnimations.css.filter(a => 
      a.keyframes.some(k => 
        k.properties.some(p => 
          ['transform', 'opacity', 'filter'].includes(p.property)
        )
      )
    ).length;
    
    const transitionsGPU = this.capturedAnimations.transitions.filter(t => {
      const props = t.transitionProperty.split(',').map(p => p.trim());
      return props.some(p => ['transform', 'opacity', 'filter'].includes(p));
    }).length;

    return cssGPU + transitionsGPU;
  }

  /**
   * Convert captured animations to DESIGN.md Section 15 format
   */
  toDesignSection() {
    const lines = [];
    lines.push('## 15. Animation Inventory');
    lines.push('');
    
    // CSS Animations
    lines.push('### CSS Animations');
    if (this.capturedAnimations.css.length > 0) {
      lines.push('| Animation | Keyframes | Duration | Easing | Elements |');
      lines.push('|-----------|-----------|----------|--------|----------|');
      this.capturedAnimations.css.forEach(anim => {
        lines.push(`| ${anim.name} | ${anim.keyframeCount} | — | — | — |`);
      });
    } else {
      lines.push('No CSS keyframe animations detected.');
    }
    lines.push('');
    
    // Framer Motion
    lines.push('### Framer Motion');
    if (this.capturedAnimations.framerMotion.length > 0) {
      lines.push('**Detected Components:**', this.capturedAnimations.framerMotion.map(v => 
        `- ${v.element}: ${v.animate || 'animated'}`
      ).join('\n'));
    } else if (this.capturedAnimations.framerMotion._meta?.components?.length > 0) {
      lines.push(`**Library detected** with ${this.capturedAnimations.framerMotion._meta.components.length} motion components`);
    } else {
      lines.push('Framer Motion not detected.');
    }
    lines.push('');
    
    // GSAP
    lines.push('### GSAP');
    if (this.capturedAnimations.gsap.length > 0 && this.capturedAnimations.gsap[0]?.type) {
      const tweens = this.capturedAnimations.gsap.filter(t => t.type);
      lines.push(`**Detected:** ${tweens.length} tweens, ${this.capturedAnimations.gsap._meta?.timelines?.length || 0} timelines`);
    } else if (this.capturedAnimations.gsap._meta?.present) {
      lines.push('GSAP library detected (no active tweens captured).');
    } else {
      lines.push('GSAP not detected.');
    }
    lines.push('');
    
    // Triggers
    lines.push('### Animation Triggers');
    const triggerCounts = Object.entries(this.capturedAnimations.triggers)
      .map(([type, items]) => `${type}: ${items.length}`)
      .join(', ');
    lines.push(triggerCounts);
    lines.push('');
    
    return lines.join('\n');
  }
}

module.exports = { AnimationRecorder };
