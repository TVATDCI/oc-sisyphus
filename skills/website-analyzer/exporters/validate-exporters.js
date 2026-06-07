/**
 * Exporter Validation Script
 * Website-analyzer v1.3.0 - Multi-Format Export System
 *
 * Validates that all exporters generate correct output files and content.
 * Run with: node validate-exporters.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DesignExporter } = require('./index');

/**
 * Sample design data for validation
 * @type {Object}
 */
const sampleDesignData = {
  colors: {
    primary: "#3b82f6",
    secondary: "#8b5cf6",
    accent: "#f59e0b",
    neutral: {
      text: "#1f2937",
      bg: "#ffffff",
      border: "#e5e7eb"
    },
    semantic: {
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444"
    }
  },
  fonts: {
    heading: "Inter",
    body: "Inter",
    mono: "JetBrains Mono"
  },
  spacing: {
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px"
  },
  shadows: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px rgba(0,0,0,0.1)",
    lg: "0 10px 15px rgba(0,0,0,0.1)"
  },
  breakpoints: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px"
  },
  animations: {
    defaultDuration: "200ms",
    defaultEasing: "ease-out"
  }
};

/**
 * Expected output files and their content validators
 * @type {Array<Object>}
 */
const expectedFiles = [
  {
    filename: 'tokens.json',
    validators: [
      (content) => content.includes('"$schema"'),
      (content) => content.includes('"tokens"'),
      (content) => content.includes('"color"'),
      (content) => content.includes('"fontFamily"'),
      (content) => content.includes('"spacing"')
    ]
  },
  {
    filename: 'tailwind.config.js',
    validators: [
      (content) => content.includes('theme.extend'),
      (content) => content.includes('colors'),
      (content) => content.includes('fontFamily'),
      (content) => content.includes('module.exports')
    ]
  },
  {
    filename: 'figma-variables.json',
    validators: [
      (content) => content.includes('"meta"'),
      (content) => content.includes('"variables"'),
      (content) => content.includes('"COLOR"'),
      (content) => content.includes('"valuesByMode"')
    ]
  },
  {
    filename: 'globals.css',
    validators: [
      (content) => content.includes('@layer base'),
      (content) => content.includes('@layer components'),
      (content) => content.includes('@layer utilities'),
      (content) => content.includes(':root'),
      (content) => content.includes('.dark') || content.includes('[data-theme="dark"]'),
      (content) => content.includes('--background'),
      (content) => content.includes('--primary'),
      (content) => content.includes('--radius')
    ]
  },
  {
    filename: 'theme.js',
    validators: [
      (content) => content.includes('module.exports'),
      (content) => content.includes('colors'),
      (content) => content.includes('fonts'),
      (content) => content.includes('spacing'),
      (content) => content.includes('shadows'),
      (content) => content.includes('breakpoints'),
      (content) => content.includes('animations')
    ]
  }
];

/**
 * Main validation function
 * @returns {number} Exit code (0 for success, 1 for failure)
 */
function validateExporters() {
  console.log('Starting exporter validation...\n');

  // Create temp output directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-analyzer-export-'));
  console.log(`Created temp directory: ${tempDir}\n`);

  try {
    // Run exportAll with sample data
    const exporter = new DesignExporter();
    const result = exporter.exportAll(tempDir, sampleDesignData);

    console.log(`Export completed. Files generated: ${result.files.length}`);
    if (result.errors.length > 0) {
      console.error(`Errors encountered: ${result.errors.length}`);
      for (const err of result.errors) {
        console.error(`  - ${err.format}: ${err.error}`);
      }
    }
    console.log();

    // Verify all expected files exist and have correct content
    let allPassed = true;

    for (const expected of expectedFiles) {
      const filePath = path.join(tempDir, expected.filename);
      const exists = fs.existsSync(filePath);

      if (!exists) {
        console.error(`FAIL: ${expected.filename} was not created`);
        allPassed = false;
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      let filePassed = true;

      for (const validator of expected.validators) {
        if (!validator(content)) {
          console.error(`FAIL: ${expected.filename} failed content validation`);
          filePassed = false;
          allPassed = false;
          break;
        }
      }

      if (filePassed) {
        console.log(`PASS: ${expected.filename} created and validated`);
      }
    }

    // Check for unexpected files
    const actualFiles = fs.readdirSync(tempDir);
    const expectedFilenames = expectedFiles.map(e => e.filename);
    for (const file of actualFiles) {
      if (!expectedFilenames.includes(file)) {
        console.warn(`WARN: Unexpected file found: ${file}`);
      }
    }

    console.log();

    if (allPassed) {
      console.log('Exporter validation PASSED: all 5 formats generated');
      return 0;
    } else {
      console.error('Exporter validation FAILED: some formats did not pass validation');
      return 1;
    }
  } finally {
    // Clean up temp directory
    try {
      for (const file of fs.readdirSync(tempDir)) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
      console.log(`\nCleaned up temp directory: ${tempDir}`);
    } catch (cleanupErr) {
      console.error(`Warning: failed to clean up temp directory: ${cleanupErr.message}`);
    }
  }
}

// Run validation if executed directly
if (require.main === module) {
  const exitCode = validateExporters();
  process.exit(exitCode);
}

module.exports = { validateExporters, sampleDesignData };
