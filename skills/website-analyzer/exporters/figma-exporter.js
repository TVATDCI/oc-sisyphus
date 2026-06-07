/**
 * Figma Variables Exporter
 * Produces figma-variables.json with variables in Figma-compatible format.
 * RGB values are in 0-1 range.
 */
const { hexToRgb } = require('./utils');

/**
 * Convert design data to Figma Variables format.
 * @param {Object} designData - Full analysis data with colors, typography, animations, theme
 * @returns {Object} Figma variables object with variables array and modes
 */
function toFigmaVariables(designData) {
  const data = designData || {};
  const variables = [];

  // Colors → Figma COLOR variables
  if (data.colors && Object.keys(data.colors).length > 0) {
    for (const [name, value] of Object.entries(data.colors)) {
      if (typeof value === 'string') {
        const rgb = hexToRgb(value);
        variables.push({
          name: `colors/${name.replace(/[_\s]+/g, '-')}`,
          type: 'COLOR',
          value: { r: rgb.r, g: rgb.g, b: rgb.b, a: rgb.a }
        });
      }
    }
  }

  // Typography → Figma font variables
  if (data.typography) {
    const typo = data.typography;

    if (typo.headings && typo.headings.family) {
      variables.push({
        name: 'typography/heading/family',
        type: 'STRING',
        value: typo.headings.family
      });
      if (typo.headings.weights && typo.headings.weights.length > 0) {
        variables.push({
          name: 'typography/heading/weight',
          type: 'FLOAT',
          value: typo.headings.weights[0]
        });
      }
    }

    if (typo.body && typo.body.family) {
      variables.push({
        name: 'typography/body/family',
        type: 'STRING',
        value: typo.body.family
      });
    }

    if (typo.mono && typo.mono.family) {
      variables.push({
        name: 'typography/mono/family',
        type: 'STRING',
        value: typo.mono.family
      });
    }

    // Type scale → Figma dimension variables
    if (typo.scale) {
      for (const [level, spec] of Object.entries(typo.scale)) {
        if (spec && spec.size) {
          // Parse pixel value to number
          const pxValue = parseFloat(spec.size);
          if (!isNaN(pxValue)) {
            variables.push({
              name: `typography/scale/${level}/size`,
              type: 'FLOAT',
              value: pxValue
            });
          }
        }
        if (spec && spec.lineHeight) {
          const lhValue = parseFloat(spec.lineHeight);
          if (!isNaN(lhValue)) {
            variables.push({
              name: `typography/scale/${level}/lineHeight`,
              type: 'FLOAT',
              value: lhValue
            });
          }
        }
      }
    }
  }

  // Animation durations
  if (data.animations && data.animations.transitions && data.animations.transitions.length > 0) {
    const durations = new Set();
    data.animations.transitions.forEach(t => {
      if (t.transitionDuration && t.transitionDuration !== '0s') {
        const ms = parseFloat(t.transitionDuration);
        if (!isNaN(ms)) durations.add(ms);
      }
    });
    [...durations].slice(0, 6).forEach((d, i) => {
      variables.push({
        name: `animation/duration/${i + 1}`,
        type: 'FLOAT',
        value: d
      });
    });
  }

  // Determine modes
  const modes = [];
  if (data.theme) {
    if (data.theme.darkMode || data.theme.hasDarkMode || 
        (data.theme.modes && data.theme.modes.includes('dark'))) {
      modes.push('light', 'dark');
    } else {
      modes.push('light');
    }
  } else {
    // Default: try to detect from colors
    const hasDarkBg = data.colors && (
      data.colors['dark-background'] || 
      data.colors['background-dark'] ||
      data.colors['bg-dark']
    );
    modes.push(hasDarkBg ? 'light' : 'light');
    if (hasDarkBg) modes.push('dark');
  }

  return { variables, modes };
}

module.exports = { toFigmaVariables };
