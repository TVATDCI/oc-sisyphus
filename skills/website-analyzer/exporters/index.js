/**
 * Multi-Format Design Exporter
 * 
 * Converts website-analyzer design data into 5 industry-standard formats:
 * 1. W3C Design Tokens (tokens.json)
 * 2. Tailwind CSS Config (tailwind.config.js)
 * 3. Figma Variables (figma-variables.json)
 * 4. shadcn/ui Theme (globals.css)
 * 5. React Theme Object (theme.js)
 * 
 * Color conversion utilities included as static helpers.
 * Uses only Node.js built-in fs/path — no external dependencies.
 */
const fs = require('fs');
const path = require('path');
const { hexToRgb, hexToHsl, hexToRgbString, hslString } = require('./utils');
const { toW3CTokens } = require('./w3c-exporter');
const { toTailwindConfig } = require('./tailwind-exporter');
const { toFigmaVariables } = require('./figma-exporter');
const { toShadcnTheme } = require('./shadcn-exporter');
const { toReactTheme } = require('./react-exporter');

class DesignExporter {
  /**
   * @param {Object} designData - Full analysis data object
   * @param {Object} [designData.colors] - Color palette { primary: '#hex', secondary: '#hex', ... }
   * @param {Object} [designData.typography] - Typography data { headings, body, mono, scale }
   * @param {Object} [designData.animations] - Animation data from AnimationRecorder.capture()
   * @param {Object} [designData.theme] - Theme info { darkMode, modes, hasDarkMode }
   */
  constructor(designData) {
    this.data = designData || {};
  }

  // ── Color Conversion Utilities ────────────────────────────────────

  /**
   * Convert hex color to RGB object with 0-1 range (for Figma).
   * @param {string} hex - e.g. '#6a9fcc'
   * @returns {{ r: number, g: number, b: number, a: number }}
   */
  static hexToRgb(hex) { return hexToRgb(hex); }

  /**
   * Convert hex color to HSL object.
   * @param {string} hex
   * @returns {{ h: number, s: number, l: number }}
   */
  static hexToHsl(hex) { return hexToHsl(hex); }

  /**
   * Convert hex color to rgb() string (for W3C $value).
   * @param {string} hex
   * @returns {string} e.g. "rgb(106, 159, 204)"
   */
  static hexToRgbString(hex) { return hexToRgbString(hex); }

  /**
   * Convert hex color to HSL CSS string (for shadcn/ui).
   * @param {string} hex
   * @returns {string} e.g. "217.2 91.2% 59.8%"
   */
  static hslString(hex) { return hslString(hex); }

  // ── Export Methods ─────────────────────────────────────────────────

  /**
   * Export to W3C Design Tokens format.
   * @returns {Object} W3C-compliant tokens with $schema, $type, $value
   */
  toW3CTokens() {
    return toW3CTokens(this.data);
  }

  /**
   * Export to Tailwind CSS config format.
   * @returns {Object} { theme: { extend: { colors, fontFamily, animation, keyframes } } }
   */
  toTailwindConfig() {
    return toTailwindConfig(this.data);
  }

  /**
   * Export to Figma Variables format.
   * @returns {Object} { variables: [{ name, type, value }], modes: ['light', 'dark'] }
   */
  toFigmaVariables() {
    return toFigmaVariables(this.data);
  }

  /**
   * Export to shadcn/ui theme CSS string.
   * @returns {string} CSS with @layer base { :root { ... } .dark { ... } }
   */
  toShadcnTheme() {
    return toShadcnTheme(this.data);
  }

  /**
   * Export to React theme object.
   * @returns {Object} { colors, fonts, animations: { durations, easings } }
   */
  toReactTheme() {
    return toReactTheme(this.data);
  }

  // ── Batch Export ───────────────────────────────────────────────────

  /**
   * Write all 5 export formats to files in the output directory.
   * Skips existing files (does not overwrite).
   * 
   * @param {string} outputDir - Directory to write files to (created if needed)
   * @returns {string[]} List of filenames that were written
   */
  exportAll(outputDir) {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const formats = {
      'tokens.json':        () => JSON.stringify(this.toW3CTokens(), null, 2),
      'tailwind.config.js': () => this._serializeTailwindConfig(this.toTailwindConfig()),
      'figma-variables.json': () => JSON.stringify(this.toFigmaVariables(), null, 2),
      'globals.css':        () => this.toShadcnTheme(),
      'theme.js':           () => this._serializeReactTheme(this.toReactTheme())
    };

    const written = [];

    for (const [filename, contentFn] of Object.entries(formats)) {
      const filePath = path.join(outputDir, filename);

      if (fs.existsSync(filePath)) {
        // File already exists — skip with warning
        console.warn(`[DesignExporter] Skipping existing file: ${filename}`);
        continue;
      }

      const content = contentFn();
      fs.writeFileSync(filePath, content, 'utf-8');
      written.push(filename);
    }

    return written;
  }

  /**
   * Serialize Tailwind config object to valid JavaScript module.exports string.
   * @param {Object} config - Tailwind config object
   * @returns {string} JS module source
   */
  _serializeTailwindConfig(config) {
    const json = JSON.stringify(config, null, 2);
    return `module.exports = ${json};\n`;
  }

  /**
   * Serialize React theme object to valid JavaScript export string.
   * @param {Object} theme - React theme object
   * @returns {string} JS module source
   */
  _serializeReactTheme(theme) {
    const json = JSON.stringify(theme, null, 2);
    return `export const theme = ${json};\n`;
  }
}

module.exports = { DesignExporter };
