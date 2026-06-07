/**
 * W3C Design Tokens Exporter
 * Produces tokens.json in W3C Design Tokens Community Group format.
 * 
 * @see https://designtokens.org/
 */
const { hexToRgbString } = require('./utils');

/**
 * Convert design data to W3C Design Tokens format.
 * @param {Object} designData - Full analysis data with colors, typography, animations, theme
 * @returns {Object} W3C-compliant tokens object
 */
function toW3CTokens(designData) {
  const tokens = {
    $schema: 'https://designtokens.org/schema.json'
  };

  const data = designData || {};

  // Colors group
  if (data.colors && Object.keys(data.colors).length > 0) {
    tokens.colors = {};
    for (const [name, value] of Object.entries(data.colors)) {
      if (typeof value === 'string') {
        tokens.colors[name] = {
          $type: 'color',
          $value: value
        };
      }
    }
  }

  // Typography / fonts group
  if (data.typography) {
    const typo = data.typography;

    // Font families
    const fonts = {};
    if (typo.headings && typo.headings.family) {
      fonts.heading = { $type: 'fontFamily', $value: typo.headings.family };
    }
    if (typo.body && typo.body.family) {
      fonts.body = { $type: 'fontFamily', $value: typo.body.family };
    }
    if (typo.mono && typo.mono.family) {
      fonts.mono = { $type: 'fontFamily', $value: typo.mono.family };
    }
    if (Object.keys(fonts).length > 0) {
      tokens.fonts = fonts;
    }

    // Font sizes (type scale)
    if (typo.scale && Object.keys(typo.scale).length > 0) {
      tokens.fontSize = {};
      for (const [level, spec] of Object.entries(typo.scale)) {
        if (spec && spec.size) {
          tokens.fontSize[level] = {
            $type: 'dimension',
            $value: spec.size
          };
        }
      }
    }

    // Font weights
    const weights = {};
    const addWeights = (source, key) => {
      if (source && source.weights && Array.isArray(source.weights) && source.weights.length > 0) {
        weights[key] = {
          $type: 'fontWeight',
          $value: source.weights[0]
        };
      }
    };
    addWeights(typo.headings, 'heading');
    addWeights(typo.body, 'body');
    addWeights(typo.mono, 'mono');
    if (Object.keys(weights).length > 0) {
      tokens.fontWeight = weights;
    }

    // Line heights
    if (typo.scale) {
      tokens.lineHeight = {};
      let hasLineHeight = false;
      for (const [level, spec] of Object.entries(typo.scale)) {
        if (spec && spec.lineHeight) {
          tokens.lineHeight[level] = {
            $type: 'dimension',
            $value: spec.lineHeight
          };
          hasLineHeight = true;
        }
      }
      if (!hasLineHeight) delete tokens.lineHeight;
    }
  }

  // Spacing (from animations/transitions — extract common durations)
  if (data.animations && data.animations.transitions && data.animations.transitions.length > 0) {
    const durations = new Set();
    data.animations.transitions.forEach(t => {
      const d = t.transitionDuration;
      if (d && d !== '0s') durations.add(d);
    });
    if (durations.size > 0) {
      tokens.spacing = {};
      [...durations].forEach((d, i) => {
        tokens.spacing[`duration-${i + 1}`] = {
          $type: 'dimension',
          $value: d
        };
      });
    }
  }

  return tokens;
}

module.exports = { toW3CTokens };
