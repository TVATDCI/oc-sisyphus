/**
 * React Theme Exporter
 * Produces a plain JS theme object suitable for React/TypeScript projects.
 * Output format: export const theme = { colors: {}, fonts: {}, animations: { durations, easings } }
 */

/**
 * Convert design data to a React-compatible theme object.
 * @param {Object} designData - Full analysis data with colors, typography, animations, theme
 * @returns {Object} Theme object with colors, fonts, animations
 */
function toReactTheme(designData) {
  const data = designData || {};
  const theme = {
    colors: {},
    fonts: {},
    animations: {
      durations: {},
      easings: {}
    }
  };

  // Colors
  if (data.colors && Object.keys(data.colors).length > 0) {
    for (const [name, value] of Object.entries(data.colors)) {
      if (typeof value === 'string') {
        theme.colors[name] = value;
      }
    }
  }

  // Fonts
  if (data.typography) {
    const typo = data.typography;

    if (typo.headings && typo.headings.family) {
      theme.fonts.heading = typo.headings.family;
      if (typo.headings.weights && typo.headings.weights.length > 0) {
        theme.fonts.headingWeight = typo.headings.weights[0];
      }
    }

    if (typo.body && typo.body.family) {
      theme.fonts.body = typo.body.family;
      if (typo.body.weights && typo.body.weights.length > 0) {
        theme.fonts.bodyWeight = typo.body.weights[0];
      }
    }

    if (typo.mono && typo.mono.family) {
      theme.fonts.mono = typo.mono.family;
    }

    // Type scale
    if (typo.scale) {
      theme.fonts.scale = {};
      for (const [level, spec] of Object.entries(typo.scale)) {
        if (spec) {
          theme.fonts.scale[level] = {
            size: spec.size || undefined,
            weight: spec.weight || undefined,
            lineHeight: spec.lineHeight || undefined
          };
        }
      }
      if (Object.keys(theme.fonts.scale).length === 0) {
        delete theme.fonts.scale;
      }
    }
  }

  // Animations
  if (data.animations) {
    const anim = data.animations;

    // Extract durations from CSS animations and transitions
    const durations = {};

    // From CSS applied animations
    if (anim.js && Array.isArray(anim.js)) {
      anim.js.forEach(applied => {
        if (applied && applied.animationDuration && applied.animationDuration !== '0s') {
          const name = (applied.animationName || 'default').replace(/[^a-zA-Z0-9]/g, '-');
          if (name && name !== 'none') {
            durations[name] = applied.animationDuration;
          }
        }
      });
    }

    // From transitions (interactive elements)
    if (anim.transitions && Array.isArray(anim.transitions)) {
      anim.transitions.forEach(t => {
        if (t && t.transitionDuration && t.transitionDuration !== '0s') {
          const name = t.element ? t.element.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20) : 'transition';
          durations[name] = t.transitionDuration;
        }
      });
    }

    if (Object.keys(durations).length > 0) {
      theme.animations.durations = durations;
    }

    // Extract easings
    const easings = {};

    if (anim.js && Array.isArray(anim.js)) {
      anim.js.forEach(applied => {
        if (applied && applied.animationTimingFunction && applied.animationTimingFunction !== 'ease') {
          const name = (applied.animationName || 'default').replace(/[^a-zA-Z0-9]/g, '-');
          if (name && name !== 'none') {
            easings[name] = applied.animationTimingFunction;
          }
        }
      });
    }

    if (anim.transitions && Array.isArray(anim.transitions)) {
      anim.transitions.forEach(t => {
        if (t && t.transitionTimingFunction && t.transitionTimingFunction !== 'ease') {
          const name = t.element ? t.element.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20) : 'transition';
          easings[name] = t.transitionTimingFunction;
        }
      });
    }

    // From GSAP tweens
    if (anim.gsap && Array.isArray(anim.gsap)) {
      anim.gsap.forEach(tween => {
        if (tween && tween.ease && tween.ease !== 'none' && tween.ease !== 'ease') {
          easings[tween.type || 'tween'] = tween.ease;
        }
      });
    }

    if (Object.keys(easings).length > 0) {
      theme.animations.easings = easings;
    }

    // Clean up empty animation object
    if (Object.keys(theme.animations.durations).length === 0 && 
        Object.keys(theme.animations.easings).length === 0) {
      // Keep placeholder with defaults
      theme.animations = {
        durations: {
          instant: '50ms',
          xs: '150ms',
          sm: '250ms',
          md: '400ms'
        },
        easings: {
          default: 'cubic-bezier(0.4, 0, 0.2, 1)',
          spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }
      };
    }
  }

  return theme;
}

module.exports = { toReactTheme };
