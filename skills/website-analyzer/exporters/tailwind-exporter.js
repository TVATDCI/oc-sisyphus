/**
 * Tailwind Config Exporter
 * Produces a JS object suitable for module.exports in tailwind.config.js
 */
const { hexToRgbString } = require('./utils');

/**
 * Convert design data to a Tailwind CSS config theme extension.
 * @param {Object} designData - Full analysis data with colors, typography, animations, theme
 * @returns {Object} Tailwind theme.extend object
 */
function toTailwindConfig(designData) {
  const data = designData || {};
  const extend = {};

  // Colors
  if (data.colors && Object.keys(data.colors).length > 0) {
    extend.colors = {};
    for (const [name, value] of Object.entries(data.colors)) {
      if (typeof value === 'string') {
        // Convert kebab-case or snake_case to Tailwind-friendly keys
        const key = name.replace(/[_\s]+/g, '-').replace(/^color[-_]?/i, '');
        extend.colors[key] = value;
      }
    }
  }

  // Font families
  if (data.typography) {
    const typo = data.typography;
    extend.fontFamily = {};

    if (typo.headings && typo.headings.family) {
      const family = typo.headings.family;
      extend.fontFamily.serif = [family, 'Georgia', 'serif'];
    }
    if (typo.body && typo.body.family) {
      const family = typo.body.family;
      extend.fontFamily.sans = [family, 'system-ui', 'sans-serif'];
    }
    if (typo.mono && typo.mono.family) {
      const family = typo.mono.family;
      extend.fontFamily.mono = [family, 'SFMono-Regular', 'monospace'];
    }

    if (Object.keys(extend.fontFamily).length === 0) {
      delete extend.fontFamily;
    }
  }

  // Animations and keyframes
  if (data.animations) {
    const anim = data.animations;
    const animationDefs = {};
    const keyframeDefs = {};

    // Extract CSS keyframes
    if (anim.css && Array.isArray(anim.css)) {
      anim.css.forEach(kf => {
        if (!kf || !kf.name) return;
        const name = kf.name.replace(/[^a-zA-Z0-9-]/g, '-');
        const keyframeObj = {};

        if (kf.keyframes && Array.isArray(kf.keyframes)) {
          kf.keyframes.forEach(frame => {
            if (frame.keyText && frame.properties) {
              const props = {};
              frame.properties.forEach(p => {
                props[p.property] = p.value;
              });
              keyframeObj[frame.keyText] = props;
            }
          });
        }

        if (Object.keys(keyframeObj).length > 0) {
          keyframeDefs[name] = keyframeObj;
        }
      });
    }

    // Extract CSS applied animations for animation shorthand
    if (anim.js && Array.isArray(anim.js)) {
      anim.js.forEach(applied => {
        if (!applied || !applied.animationName || applied.animationName === 'none') return;
        const names = applied.animationName.split(',').map(n => n.trim());
        names.forEach(name => {
          if (name === 'none') return;
          const cleanName = name.replace(/[^a-zA-Z0-9-]/g, '-');
          const duration = applied.animationDuration || '0.5s';
          const timing = applied.animationTimingFunction || 'ease';
          animationDefs[cleanName] = `${cleanName} ${duration} ${timing}`;
        });
      });
    }

    if (Object.keys(animationDefs).length > 0) {
      extend.animation = animationDefs;
    }
    if (Object.keys(keyframeDefs).length > 0) {
      extend.keyframes = keyframeDefs;
    }
  }

  return {
    theme: {
      extend
    }
  };
}

module.exports = { toTailwindConfig };
