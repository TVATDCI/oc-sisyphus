/**
 * Color conversion utilities shared by all exporters.
 * No external dependencies — pure JavaScript math.
 */

/**
 * Convert hex color to RGB object with 0-1 range (for Figma).
 * @param {string} hex - Hex color string (e.g. '#6a9fcc' or '#abc')
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const num = parseInt(hex, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
    a: 1
  };
}

/**
 * Convert hex color to HSL object.
 * @param {string} hex - Hex color string
 * @returns {{ h: number, s: number, l: number }}
 */
function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Convert hex color to CSS rgb() string (for W3C $value).
 * @param {string} hex - Hex color string
 * @returns {string} e.g. "rgb(106, 159, 204)"
 */
function hexToRgbString(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/**
 * Convert hex color to HSL CSS string (for shadcn).
 * @param {string} hex - Hex color string
 * @returns {string} e.g. "217.2 91.2% 59.8%"
 */
function hslString(hex) {
  const { h, s, l } = hexToHsl(hex);
  return `${h} ${s}% ${l}%`;
}

module.exports = { hexToRgb, hexToHsl, hexToRgbString, hslString };
