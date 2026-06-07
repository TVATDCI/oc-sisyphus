const { DesignExporter } = require('/home/vladi/.config/opencode/skills/website-analyzer/exporters');
const fs = require('fs');

const designData = {
  colors: {
    primary: '#000000',
    secondary: '#ffffff',
    accent: '#0d6efd',
    neutral: '#6c757d',
    textPrimary: '#ffffff',
    textSecondary: '#212529',
    surface: '#000000',
    muted: '#343a40',
    success: '#198754',
    warning: '#ffc107',
    error: '#dc3545',
    info: '#0dcaf0'
  },
  fonts: {
    body: 'IBM Plex Mono, monospace',
    heading: 'IBM Plex Mono, monospace',
    mono: 'IBM Plex Mono, monospace'
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '3rem'
  },
  shadows: {
    sm: '0 0 0 .25rem rgba(13,110,253,.25)',
    md: 'var(--bs-box-shadow)',
    lg: 'var(--bs-box-shadow-lg)'
  },
  breakpoints: {
    sm: '576px',
    md: '768px',
    lg: '992px',
    xl: '1200px',
    xxl: '1400px'
  },
  animations: {
    hoverDuration: '0.5s',
    hoverEasing: 'cubic-bezier(.19,.91,.36,.99)',
    bootstrapDuration: '0.15s',
    placeholderDuration: '2s'
  }
};

const outputDir = '/home/vladi/developer/test-artifacts/website-analyzer-test/v1.3.0-aboutluca/exports';
fs.mkdirSync(outputDir, { recursive: true });

const exporter = new DesignExporter();
const result = exporter.exportAll(outputDir, designData);

console.log('Export complete.');
console.log('Files:', result.files.map(f => f.filePath || f.path || f.filename));
if (result.errors.length > 0) {
  console.log('Errors:', result.errors);
}
