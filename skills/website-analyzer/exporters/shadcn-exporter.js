/**
 * shadcn/ui Theme Exporter
 * Produces globals.css with CSS custom properties in HSL format.
 * 
 * @see https://ui.shadcn.com/docs/theming
 */
const { hslString } = require('./utils');

/**
 * Default shadcn CSS variable names.
 */
const SHADCN_VARIABLES = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--radius'
];

/**
 * Map design data color roles to shadcn variable names.
 * Falls back to sensible defaults for missing colors.
 */
function mapColorsToShadcn(colors) {
  const mapping = {
    'background': ['background', 'bg', 'surface', 'page-bg'],
    'foreground': ['foreground', 'text', 'text-primary', 'on-background'],
    'card': ['card', 'surface', 'container'],
    'card-foreground': ['card-foreground', 'on-card', 'on-surface'],
    'popover': ['popover', 'overlay', 'tooltip'],
    'popover-foreground': ['popover-foreground', 'on-popover', 'on-overlay'],
    'primary': ['primary', 'brand-primary', 'brand', 'main'],
    'primary-foreground': ['primary-foreground', 'on-primary', 'primary-text'],
    'secondary': ['secondary', 'brand-secondary', 'accent-secondary'],
    'secondary-foreground': ['secondary-foreground', 'on-secondary', 'secondary-text'],
    'muted': ['muted', 'neutral-muted', 'gray-muted', 'subtle'],
    'muted-foreground': ['muted-foreground', 'on-muted', 'muted-text'],
    'accent': ['accent', 'brand-accent', 'highlight'],
    'accent-foreground': ['accent-foreground', 'on-accent', 'accent-text'],
    'destructive': ['destructive', 'danger', 'error', 'red'],
    'destructive-foreground': ['destructive-foreground', 'on-destructive', 'on-error'],
    'border': ['border', 'outline', 'divider'],
    'input': ['input', 'input-bg', 'field'],
    'ring': ['ring', 'focus-ring', 'focus']
  };

  const resolved = {};

  for (const [varName, candidateKeys] of Object.entries(mapping)) {
    let value = null;
    for (const key of candidateKeys) {
      if (colors[key]) {
        value = colors[key];
        break;
      }
      // Also try kebab-case and prefixed versions
      const kebab = key.replace(/_/g, '-');
      if (colors[kebab]) {
        value = colors[kebab];
        break;
      }
    }
    if (value && typeof value === 'string') {
      resolved[varName] = value;
    }
  }

  // Handle radius separately (not a color)
  return resolved;
}

/**
 * Resolve a color for a shadcn variable with sensible defaults.
 */
function resolveColor(resolved, key, defaultHex) {
  return resolved[key] || defaultHex;
}

/**
 * Build CSS custom property lines for a given set of colors.
 * @param {Object} colors - Resolved color hex values
 * @returns {string[]} CSS property lines
 */
function buildCssProperties(colors) {
  const lines = [];

  // Color variables
  const colorVars = SHADCN_VARIABLES.filter(v => v !== '--radius');
  for (const varName of colorVars) {
    const key = varName.replace(/^--/, '');
    const hex = colors[key];
    if (hex && hex !== 'none') {
      const hsl = hslString(hex);
      lines.push(`    ${varName}: ${hsl};`);
    }
  }

  // Radius
  const radius = colors['radius'] || '0.5rem';
  lines.push(`    --radius: ${radius};`);

  return lines;
}

/**
 * Generate dark mode color variants.
 * If no explicit dark colors are provided, auto-generate by adjusting lightness.
 */
function buildDarkProperties(lightColors) {
  const lines = [];

  // For dark mode, we typically want:
  // - background: very dark
  // - foreground: light
  // - card: slightly lighter than background
  // Colors that should be light in dark mode
  const lightRoles = ['primary', 'accent', 'ring'];
  // Colors that should be dark/muted in dark mode
  const darkRoles = ['background', 'card', 'popover', 'muted'];

  const colorVars = SHADCN_VARIABLES.filter(v => v !== '--radius');

  for (const varName of colorVars) {
    const key = varName.replace(/^--/, '');
    const hex = lightColors[key];
    
    if (!hex || hex === 'none') continue;

    // Check if hex looks like it could be a dark variant already
    const isForeground = key.includes('foreground') || key === 'foreground';
    const baseKey = key.replace('-foreground', '');
    const isPrimaryBase = lightRoles.includes(baseKey);
    const isDarkBase = darkRoles.includes(baseKey);

    if (isForeground) {
      // Foreground colors: swap with background logic
      if (key === 'destructive-foreground') {
        // Keep destructive foreground bright
        lines.push(`    ${varName}: ${hslString('#fca5a5')};`);
      } else {
        // Foreground in dark mode should be light
        lines.push(`    ${varName}: 210 40% 98%;`);
      }
    } else if (isDarkBase) {
      // Background/surface colors should be very dark
      lines.push(`    ${varName}: 222.2 84% 4.9%;`);
    } else {
      // Use the hex value as-is (adjusted might be needed, but keep hex if it's a typical color)
      lines.push(`    ${varName}: ${hslString(hex)};`);
    }
  }

  lines.push(`    --radius: ${lightColors['radius'] || '0.5rem'};`);
  return lines;
}

/**
 * Convert design data to shadcn/ui theme CSS string.
 * @param {Object} designData - Full analysis data with colors, typography, animations, theme
 * @returns {string} CSS string for globals.css
 */
function toShadcnTheme(designData) {
  const data = designData || {};
  const colors = data.colors || {};
  const resolved = mapColorsToShadcn(colors);

  const lightProps = buildCssProperties(resolved);
  const darkProps = buildDarkProperties(resolved);

  const hasDarkMode = data.theme && (
    data.theme.darkMode || 
    data.theme.hasDarkMode || 
    (data.theme.modes && data.theme.modes.includes('dark'))
  );

  let css = '@layer base {\n';
  css += '  :root {\n';
  css += lightProps.join('\n');
  css += '\n  }\n';

  if (hasDarkMode) {
    css += '\n  .dark {\n';
    css += darkProps.join('\n');
    css += '\n  }\n';
  }

  css += '}\n';

  return css;
}

module.exports = { toShadcnTheme };
