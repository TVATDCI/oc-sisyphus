const fs = require('fs');
const path = require('path');

/**
 * Signal Aggregator
 * Reads existing analysis outputs and produces a normalized signal vector.
 * 
 * Sources:
 * - tech-detections.json: framework, CSS complexity
 * - content-inventory.json: content volume, navigation/routes
 * - DESIGN.md sections 10, 15-19: animations, 3D, state, routes, interactions
 * 
 * Output: strategy-signals.json with signal keys normalized to range [-3, +3]
 */

class SignalAggregator {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.signals = {};
    this.warnings = [];
  }

  /**
   * Main entry point. Reads all source files and produces normalized signals.
   * @returns {Object} Normalized signal vector
   */
  aggregate() {
    const techDetections = this._readJson('tech-detections.json');
    const contentInventory = this._readJson('content-inventory.json');
    const designMd = this._readFile('DESIGN.md');

    const rawSignals = this._mergeSignals([
      this._extractFromTechDetections(techDetections),
      this._extractFromContentInventory(contentInventory),
      this._extractFromDesignMd(designMd)
    ]);

    this.signals = this._normalizeSignals(rawSignals);

    const expectedKeys = [
      'is_spa', 'is_static_html', 'has_3d', 'has_state_management',
      'route_count_high', 'css_complexity_high', 'content_volume_high',
      'has_animations', 'no_animations', 'has_auth'
    ];

    for (const key of expectedKeys) {
      if (!(key in this.signals)) {
        this.signals[key] = 0;
      }
    }

    this.signals._meta = {
      aggregated_at: new Date().toISOString(),
      source_mapping: this._buildSourceMapping(),
      warnings: this.warnings,
      signal_count: Object.keys(this.signals).filter(k => !k.startsWith('_')).length
    };

    return this.signals;
  }

  /**
   * Write strategy-signals.json to the output directory.
   */
  writeSignals() {
    const outputPath = path.join(this.outputDir, 'strategy-signals.json');
    fs.writeFileSync(outputPath, JSON.stringify(this.signals, null, 2), 'utf-8');
    return outputPath;
  }

  _extractFromTechDetections(techDetections) {
    const signals = {};
    if (!techDetections) {
      this.warnings.push('tech-detections.json not found or empty');
      return signals;
    }

    const detections = techDetections.detections || [];
    const cssArch = techDetections.css_architecture || {};

    const frameworkDetection = detections.find(d => d.category === 'framework');
    if (frameworkDetection) {
      const tech = frameworkDetection.technology?.toLowerCase() || '';
      const spaFrameworks = ['react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt', 'gatsby'];
      const isSpa = spaFrameworks.some(f => tech.includes(f));
      signals.is_spa = isSpa ? 1 : 0;
      signals.is_static_html = isSpa ? 0 : 1;
    } else {
      signals.is_spa = 0;
      signals.is_static_html = 0;
    }

    const importantCount = cssArch.important_count || 0;
    const cssLayers = cssArch.css_layers || 0;
    const zIndexValues = cssArch.z_index_values || 0;
    const cssScore = importantCount + cssLayers * 2 + zIndexValues;
    signals.css_complexity_high = cssScore > 10 ? 1 : 0;

    const has3d = detections.some(d => 
      d.category === 'graphics' || 
      d.technology?.toLowerCase().includes('three') ||
      d.technology?.toLowerCase().includes('webgl')
    );
    signals.has_3d = has3d ? 1 : 0;

    return signals;
  }

  _extractFromContentInventory(contentInventory) {
    const signals = {};
    if (!contentInventory) {
      this.warnings.push('content-inventory.json not found or empty');
      return signals;
    }

    const sectionCount = contentInventory.sections?.length || 0;
    const projectCount = contentInventory.projects?.length || 0;
    const navItems = contentInventory.navigation?.reduce((sum, nav) => sum + (nav.items?.length || 0), 0) || 0;
    const totalContent = sectionCount + projectCount + navItems;
    signals.content_volume_high = totalContent > 20 ? 1 : 0;

    signals.route_count_high = navItems > 8 ? 1 : 0;

    return signals;
  }

  _extractFromDesignMd(designMd) {
    const signals = {};
    if (!designMd) {
      this.warnings.push('DESIGN.md not found or empty');
      return signals;
    }

    const section15 = this._extractSection(designMd, '15. Animation Inventory');
    if (section15) {
      const hasAnimations = section15.includes('keyframes') || 
                            section15.includes('GPU Accelerated') ||
                            section15.includes('Animation Count');
      signals.has_animations = hasAnimations ? 1 : 0;
      signals.no_animations = hasAnimations ? 0 : 1;
    } else {
      signals.has_animations = 0;
      signals.no_animations = 0;
    }

    const section16 = this._extractSection(designMd, '16. 3D Scene Specification');
    if (section16) {
      const has3d = section16.includes('Three.js') || 
                    section16.includes('WebGL') ||
                    section16.includes('Renderer');
      signals.has_3d = signals.has_3d || has3d ? 1 : 0;
    }

    const section17 = this._extractSection(designMd, '17. State Management Architecture');
    if (section17) {
      const hasState = section17.includes('Store Inventory') || 
                       section17.includes('Zustand') ||
                       section17.includes('Redux') ||
                       section17.includes('MobX');
      signals.has_state_management = hasState ? 1 : 0;
    } else {
      signals.has_state_management = 0;
    }

    const section18 = this._extractSection(designMd, '18. Route Map');
    if (section18) {
      const routeMatches = section18.match(/\| \//g) || [];
      signals.route_count_high = signals.route_count_high || routeMatches.length > 8 ? 1 : 0;
    }

    const section10 = this._extractSection(designMd, '10. CSS Architecture');
    if (section10) {
      const importantMatch = section10.match(/!?important Count:?\s*\*?\*?\s*(\d+)/);
      const layerMatch = section10.match(/CSS Layers:?\s*\*?\*?\s*(\d+)/);
      const importantCount = importantMatch ? parseInt(importantMatch[1]) : 0;
      const cssLayers = layerMatch ? parseInt(layerMatch[1]) : 0;
      const cssScore = importantCount + cssLayers * 2;
      signals.css_complexity_high = signals.css_complexity_high || cssScore > 10 ? 1 : 0;
    }

    signals.has_auth = 0;

    return signals;
  }

  _readJson(filename) {
    const filePath = path.join(this.outputDir, filename);
    if (!fs.existsSync(filePath)) {
      this.warnings.push(`${filename} not found at ${filePath}`);
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      this.warnings.push(`Failed to parse ${filename}: ${err.message}`);
      return null;
    }
  }

  _readFile(filename) {
    const filePath = path.join(this.outputDir, filename);
    if (!fs.existsSync(filePath)) {
      this.warnings.push(`${filename} not found at ${filePath}`);
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  _extractSection(markdown, sectionHeader) {
    const lines = markdown.split('\n');
    let inSection = false;
    let sectionLines = [];
    
    for (const line of lines) {
      if (line.startsWith(`## ${sectionHeader}`) || line.startsWith(`## ${sectionHeader.split(' ')[0]}`)) {
        inSection = true;
        continue;
      }
      if (inSection && line.startsWith('## ')) {
        break;
      }
      if (inSection) {
        sectionLines.push(line);
      }
    }
    
    return sectionLines.length > 0 ? sectionLines.join('\n') : null;
  }

  _mergeSignals(sources) {
    const merged = {};
    for (const source of sources) {
      for (const [key, value] of Object.entries(source)) {
        if (!(key in merged)) {
          merged[key] = value;
        } else if (value !== 0) {
          merged[key] = Math.max(merged[key], value);
        }
      }
    }
    return merged;
  }

  _normalizeSignals(rawSignals) {
    const normalized = {};
    for (const [key, value] of Object.entries(rawSignals)) {
      normalized[key] = Math.max(-3, Math.min(3, value));
    }
    return normalized;
  }

  _buildSourceMapping() {
    return {
      is_spa: 'tech-detections.json (framework category)',
      is_static_html: 'tech-detections.json (framework category, inverse)',
      has_3d: 'tech-detections.json (graphics category) + DESIGN.md Section 16',
      has_state_management: 'DESIGN.md Section 17',
      route_count_high: 'content-inventory.json (navigation) + DESIGN.md Section 18',
      css_complexity_high: 'tech-detections.json (css_architecture) + DESIGN.md Section 10',
      content_volume_high: 'content-inventory.json (sections, projects, navigation)',
      has_animations: 'DESIGN.md Section 15',
      no_animations: 'DESIGN.md Section 15 (inverse)',
      has_auth: 'deferred to v2.1 (scored as 0)'
    };
  }
}

module.exports = { SignalAggregator };
