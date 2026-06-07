/**
 * Enhanced Animation Analyzer — Semantic motion insights for website-analyzer v1.3.0
 * Transforms raw animation capture data into a motion language profile.
 */

class EnhancedAnimationAnalyzer {
  /**
   * Main entry: produce a full motion profile from raw animation data.
   * @param {Object} animations — output from AnimationRecorder.capture()
   * @returns {Object} motion profile
   */
  analyzeMotionProfile(animations) {
    const profile = {
      feel: this.classifyFeel(animations),
      durations: this.bucketDurations(animations),
      easings: this.classifyEasings(animations),
      patterns: this.identifyPatterns(animations),
      performance: this.assessPerformance(animations),
      scrollLinked: this.detectScrollLinked(animations),
    };
    return profile;
  }

  /**
   * Classify the overall "feel" of the motion language.
   */
  classifyFeel(animations) {
    const allAnims = this._flattenAnimations(animations);
    if (allAnims.length === 0) return 'mixed';

    const springCount = allAnims.filter((a) =>
      a.ease && (a.ease.includes('spring') || a.type === 'spring')
    ).length;
    const easeOutCount = allAnims.filter((a) =>
      a.ease && (a.ease.includes('ease-out') || a.ease.includes('easeOut'))
    ).length;
    const tweenCount = allAnims.filter((a) => a.type === 'tween' || a.type === 'to' || a.type === 'from').length;
    const avgDuration = allAnims.reduce((s, a) => s + (a.duration || 0), 0) / allAnims.length;

    if (springCount / allAnims.length > 0.5) return 'springy';
    if (tweenCount / allAnims.length > 0.7 && easeOutCount / tweenCount > 0.5) return 'smooth';
    if (allAnims.length > 20 && avgDuration < 300) return 'energetic';
    return 'mixed';
  }

  /**
   * Bucket animation durations into semantic tokens.
   */
  bucketDurations(animations) {
    const allAnims = this._flattenAnimations(animations);
    const total = allAnims.length;

    const buckets = {
      instant: { range: [0, 100], count: 0, percentage: 0 },
      xs: { range: [100, 200], count: 0, percentage: 0 },
      sm: { range: [200, 300], count: 0, percentage: 0 },
      md: { range: [300, 500], count: 0, percentage: 0 },
      lg: { range: [500, 800], count: 0, percentage: 0 },
      xl: { range: [800, Infinity], count: 0, percentage: 0 },
    };

    for (const anim of allAnims) {
      const ms = this._parseDuration(anim.duration);
      for (const key of Object.keys(buckets)) {
        const b = buckets[key];
        if (ms >= b.range[0] && ms < b.range[1]) {
          b.count++;
          break;
        }
      }
    }

    for (const key of Object.keys(buckets)) {
      buckets[key].percentage = total > 0 ? Math.round((buckets[key].count / total) * 100) : 0;
    }

    return buckets;
  }

  /**
   * Classify easings into families with percentages.
   */
  classifyEasings(animations) {
    const allAnims = this._flattenAnimations(animations);
    const total = allAnims.length;
    if (total === 0) {
      return { families: [], dominant: 'none' };
    }

    const families = {
      'ease-out': 0,
      'ease-in': 0,
      'ease-in-out': 0,
      'spring-overshoot': 0,
      linear: 0,
      bounce: 0,
      other: 0,
    };

    for (const anim of allAnims) {
      const ease = (anim.ease || anim.timingFunction || '').toString().toLowerCase();
      if (ease.includes('spring') || this._isSpringOvershoot(ease)) {
        families['spring-overshoot']++;
      } else if (ease.includes('bounce') || ease.includes('elastic')) {
        families.bounce++;
      } else if (ease.includes('ease-out') || ease.includes('easeout')) {
        families['ease-out']++;
      } else if (ease.includes('ease-in-out') || ease.includes('easeinout')) {
        families['ease-in-out']++;
      } else if (ease.includes('ease-in') || ease.includes('easein')) {
        families['ease-in']++;
      } else if (ease.includes('linear')) {
        families.linear++;
      } else {
        families.other++;
      }
    }

    const familyArray = Object.entries(families)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const dominant = familyArray[0]?.name || 'none';

    return { families: familyArray, dominant };
  }

  /**
   * Identify common keyframe / animation patterns.
   */
  identifyPatterns(animations) {
    const patterns = { 'fade-up': 0, 'scale-in': 0, 'slide-x': 0, pulse: 0, rotate: 0 };

    // CSS keyframes
    if (animations.css) {
      for (const anim of animations.css) {
        if (!anim.keyframes) continue;
        const props = new Set();
        for (const kf of anim.keyframes) {
          for (const p of kf.properties || []) {
            props.add(p.property);
          }
        }
        const propsArr = Array.from(props);
        if (propsArr.some((p) => p.includes('translateY') || p.includes('y')) && propsArr.some((p) => p.includes('opacity'))) {
          patterns['fade-up']++;
        } else if (propsArr.some((p) => p.includes('scale'))) {
          patterns['scale-in']++;
        } else if (propsArr.some((p) => p.includes('translateX') || p.includes('x'))) {
          patterns['slide-x']++;
        } else if (propsArr.some((p) => p.includes('rotate'))) {
          patterns.rotate++;
        }
        if (anim.name && anim.name.toLowerCase().includes('pulse')) {
          patterns.pulse++;
        }
      }
    }

    // Transitions
    if (animations.transitions) {
      for (const t of animations.transitions) {
        const props = (t.transitionProperty || '').toLowerCase().split(',').map((s) => s.trim());
        if (props.some((p) => p.includes('transform')) && props.some((p) => p.includes('opacity'))) {
          patterns['fade-up']++;
        }
        if (props.some((p) => p.includes('scale'))) {
          patterns['scale-in']++;
        }
        if (props.some((p) => p.includes('rotate'))) {
          patterns.rotate++;
        }
      }
    }

    // GSAP
    if (animations.gsap && Array.isArray(animations.gsap)) {
      for (const g of animations.gsap) {
        const vars = g.vars || [];
        if (vars.includes('scale')) patterns['scale-in']++;
        if (vars.includes('y') && vars.includes('opacity')) patterns['fade-up']++;
        if (vars.includes('x')) patterns['slide-x']++;
        if (vars.includes('rotation') || vars.includes('rotate')) patterns.rotate++;
      }
    }

    // Framer Motion
    if (animations.framerMotion && Array.isArray(animations.framerMotion)) {
      for (const fm of animations.framerMotion) {
        const style = fm.style || {};
        const transform = (style.transform || '').toLowerCase();
        if (transform.includes('translatey') && style.opacity !== undefined) patterns['fade-up']++;
        if (transform.includes('scale')) patterns['scale-in']++;
        if (transform.includes('translatex')) patterns['slide-x']++;
        if (transform.includes('rotate')) patterns.rotate++;
      }
    }

    return patterns;
  }

  /**
   * Assess animation performance characteristics.
   */
  assessPerformance(animations) {
    let gpuAccelerated = 0;
    let layoutTriggering = 0;
    let willChangeCount = 0;

    const gpuProps = ['transform', 'opacity', 'filter'];
    const layoutProps = ['top', 'left', 'right', 'bottom', 'width', 'height', 'margin', 'padding'];

    // CSS keyframes
    if (animations.css) {
      for (const anim of animations.css) {
        if (!anim.keyframes) continue;
        for (const kf of anim.keyframes) {
          for (const p of kf.properties || []) {
            if (gpuProps.some((gp) => p.property.includes(gp))) gpuAccelerated++;
            if (layoutProps.some((lp) => p.property.includes(lp))) layoutTriggering++;
          }
        }
      }
    }

    // JS applied animations
    if (animations.js) {
      for (const a of animations.js) {
        if (a.willChange && a.willChange !== 'auto') willChangeCount++;
      }
    }

    // Transitions
    if (animations.transitions) {
      for (const t of animations.transitions) {
        const props = (t.transitionProperty || '').split(',').map((s) => s.trim());
        if (props.some((p) => gpuProps.includes(p))) gpuAccelerated++;
        if (props.some((p) => layoutProps.includes(p))) layoutTriggering++;
        if (t.willChange && t.willChange !== 'auto') willChangeCount++;
      }
    }

    return { gpuAccelerated, layoutTriggering, willChangeCount };
  }

  /**
   * Detect scroll-linked animation systems.
   */
  detectScrollLinked(animations) {
    const result = {
      library: null,
      triggers: 0,
      effects: [],
    };

    if (animations.scroll && animations.scroll.length > 0) {
      const libs = [...new Set(animations.scroll.map((s) => s.library).filter(Boolean))];
      result.library = libs.join(', ') || 'Generic';
      result.triggers = animations.scroll.length;
      result.effects = animations.scroll.map((s) => s.trigger || s.effect || 'scroll-trigger').filter(Boolean);
    }

    if (animations.gsap && animations.gsap._meta && animations.gsap._meta.plugins) {
      const scrollPlugins = animations.gsap._meta.plugins.filter((p) => p.type === 'ScrollTrigger');
      if (scrollPlugins.length > 0) {
        result.library = result.library ? `${result.library}, GSAP ScrollTrigger` : 'GSAP ScrollTrigger';
        result.triggers += scrollPlugins.length;
        result.effects.push(...scrollPlugins.map((p) => p.trigger || 'scroll').filter(Boolean));
      }
    }

    return result;
  }

  /**
   * Convert profile to DESIGN.md markdown section.
   */
  toDesignSection(profile) {
    const lines = [];
    lines.push('## 15. Animation Inventory (Enhanced)');
    lines.push('');

    // Motion Language Profile
    lines.push('### Motion Language Profile');
    lines.push(`- **Feel:** ${profile.feel}`);
    const totalAnims = Object.values(profile.durations).reduce((s, b) => s + b.count, 0);
    const avgDuration = totalAnims > 0
      ? Object.entries(profile.durations).reduce((s, [k, b]) => {
          const mid = k === 'instant' ? 50 : k === 'xs' ? 150 : k === 'sm' ? 250 : k === 'md' ? 400 : k === 'lg' ? 650 : 1000;
          return s + mid * b.count;
        }, 0) / totalAnims
      : 0;
    lines.push(`- **Responsiveness:** ${avgDuration < 200 ? 'high' : avgDuration < 400 ? 'medium' : 'low'} (${Math.round(avgDuration)}ms avg)`);
    lines.push(`- **Personality:** ${profile.feel === 'springy' ? 'playful, modern' : profile.feel === 'smooth' ? 'elegant, refined' : profile.feel === 'energetic' ? 'dynamic, bold' : 'balanced'}`);
    lines.push('');

    // Duration Buckets
    lines.push('### Duration Buckets (Semantic Tokens)');
    lines.push('| Token | Duration | Usage Count | Percentage |');
    lines.push('|-------|----------|-------------|------------|');
    const bucketMeta = {
      instant: '0-100ms',
      xs: '100-200ms',
      sm: '200-300ms',
      md: '300-500ms',
      lg: '500-800ms',
      xl: '800ms+',
    };
    for (const [key, bucket] of Object.entries(profile.durations)) {
      lines.push(`| ${key} | ${bucketMeta[key]} | ${bucket.count} | ${bucket.percentage}% |`);
    }
    lines.push('');

    // Easing Families
    lines.push('### Easing Families');
    for (const fam of profile.easings.families) {
      lines.push(`- **${fam.name}:** ${fam.percentage}% (${fam.count} animations)`);
    }
    lines.push('');

    // Keyframe Patterns
    lines.push('### Keyframe Patterns');
    const patternEntries = Object.entries(profile.patterns).filter(([, count]) => count > 0);
    if (patternEntries.length > 0) {
      lines.push('| Pattern | Count | Example |');
      lines.push('|---------|-------|---------|');
      const examples = {
        'fade-up': 'Hero entrance',
        'scale-in': 'Card reveals',
        'slide-x': 'Navigation',
        pulse: 'Loading states',
        rotate: 'Icons',
      };
      for (const [name, count] of patternEntries) {
        lines.push(`| ${name} | ${count} | ${examples[name] || 'Common'} |`);
      }
    } else {
      lines.push('No distinct patterns detected.');
    }
    lines.push('');

    // Animation Sequences (derived from triggers)
    lines.push('### Animation Sequences');
    lines.push('1. **Page Load:** Mount animations fire on initial render');
    lines.push('2. **Hover:** Interactive elements transition on mouse enter');
    lines.push('3. **Scroll:** Viewport-linked reveals and parallax');
    lines.push('');

    // Scroll-Linked
    lines.push('### Scroll-Linked Animations');
    if (profile.scrollLinked.library) {
      lines.push(`- **Library:** ${profile.scrollLinked.library}`);
      lines.push(`- **Triggers:** ${profile.scrollLinked.triggers} entries`);
      lines.push(`- **Effects:** ${profile.scrollLinked.effects.join(', ') || 'scroll-reveal'}`);
    } else {
      lines.push('No scroll-linked animations detected.');
    }
    lines.push('');

    // Performance Classification
    lines.push('### Performance Classification');
    const perf = profile.performance;
    const totalPerf = perf.gpuAccelerated + perf.layoutTriggering;
    const gpuPct = totalPerf > 0 ? Math.round((perf.gpuAccelerated / totalPerf) * 100) : 0;
    const layoutPct = totalPerf > 0 ? Math.round((perf.layoutTriggering / totalPerf) * 100) : 0;
    lines.push(`- **GPU Accelerated:** ${perf.gpuAccelerated}/${totalPerf} animations (${gpuPct}%)`);
    lines.push(`- **Layout Triggering:** ${perf.layoutTriggering}/${totalPerf} animations (${layoutPct}%) ${layoutPct > 10 ? '⚠️' : ''}`);
    lines.push(`- **will-change Usage:** ${perf.willChangeCount} elements`);
    lines.push('');

    return lines.join('\n');
  }

  // ─── Helpers ───

  _flattenAnimations(animations) {
    const out = [];

    // CSS keyframes (treat each keyframe rule as an animation)
    if (animations.css) {
      for (const anim of animations.css) {
        out.push({
          type: 'css',
          duration: 0, // unknown from keyframes alone
          ease: 'linear',
          properties: anim.keyframes ? anim.keyframes.flatMap((kf) => (kf.properties || []).map((p) => p.property)) : [],
        });
      }
    }

    // JS applied animations
    if (animations.js) {
      for (const a of animations.js) {
        out.push({
          type: 'css-applied',
          duration: this._parseDuration(a.duration),
          ease: a.timingFunction || 'ease',
          properties: [a.animationName || 'unknown'],
        });
      }
    }

    // Framer Motion
    if (animations.framerMotion && Array.isArray(animations.framerMotion)) {
      for (const fm of animations.framerMotion) {
        out.push({
          type: 'spring',
          duration: 300,
          ease: 'spring',
          properties: fm.style ? Object.keys(fm.style) : [],
        });
      }
    }

    // GSAP
    if (animations.gsap && Array.isArray(animations.gsap)) {
      for (const g of animations.gsap) {
        if (!g || typeof g !== 'object') continue;
        out.push({
          type: g.type || 'tween',
          duration: this._parseDuration(g.duration),
          ease: g.ease || 'power1.out',
          properties: Array.isArray(g.vars) ? g.vars : [],
        });
      }
    }

    // Transitions
    if (animations.transitions) {
      for (const t of animations.transitions) {
        out.push({
          type: 'transition',
          duration: this._parseDuration(t.transitionDuration),
          ease: t.transitionTimingFunction || 'ease',
          properties: (t.transitionProperty || '').split(',').map((s) => s.trim()),
        });
      }
    }

    return out;
  }

  _parseDuration(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    value = value.trim().toLowerCase();
    if (value === '0s' || value === '0ms' || value === '0') return 0;
    if (value.endsWith('ms')) return parseFloat(value);
    if (value.endsWith('s')) return parseFloat(value) * 1000;
    return parseFloat(value) || 0;
  }

  _isSpringOvershoot(easeStr) {
    // Detect cubic-bezier with overshoot: y > 1.0 in control points
    const m = easeStr.match(/cubic-bezier\(([^)]+)\)/);
    if (!m) return false;
    const nums = m[1].split(',').map((n) => parseFloat(n.trim()));
    if (nums.length !== 4) return false;
    // Overshoot if second or fourth control point y > 1.0
    return nums[1] > 1.0 || nums[3] > 1.0;
  }
}

module.exports = { EnhancedAnimationAnalyzer };
