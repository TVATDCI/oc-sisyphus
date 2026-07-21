const fs = require('fs');
const path = require('path');
const { generateAndAppendStrategyRecommendation, SignalAggregator, ScoringEngine } = require('./index');

const TEST_DIR = path.join(__dirname, '..', 'test-strategy-integration-tmp');

function setupTestDir() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function writeJson(filename, data) {
  fs.writeFileSync(path.join(TEST_DIR, filename), JSON.stringify(data, null, 2));
}

function writeFile(filename, content) {
  fs.writeFileSync(path.join(TEST_DIR, filename), content);
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
  }
}

function createMockInputs(profile) {
  const signals = profile.signals || {};
  const techDetections = {
    detections: [],
    css_architecture: { important_count: 0, css_layers: 0, z_index_values: 0 }
  };

  if (signals.is_spa) {
    techDetections.detections.push({ category: 'framework', technology: 'React', confidence: 'EXTRACTED' });
  } else if (signals.is_static_html) {
    techDetections.detections.push({ category: 'framework', technology: 'Static HTML', confidence: 'EXTRACTED' });
  }

  if (signals.has_3d) {
    techDetections.detections.push({ category: 'graphics', technology: 'Three.js', confidence: 'EXTRACTED' });
  }

  if (signals.css_complexity_high) {
    techDetections.css_architecture = { important_count: 20, css_layers: 5, z_index_values: 8 };
  }

  const contentInventory = {
    sections: Array(signals.content_volume_high ? 15 : 3).fill({}),
    projects: Array(signals.content_volume_high ? 10 : 2).fill({}),
    navigation: [{ items: Array(signals.route_count_high ? 12 : 4).fill({ label: 'Link', href: '/x' }) }]
  };

  const designMdLines = ['# Design System: Test', ''];

  if (signals.has_animations) {
    designMdLines.push('## 15. Animation Inventory');
    designMdLines.push('');
    designMdLines.push('### Keyframe Patterns');
    designMdLines.push('| Pattern | Count |');
    designMdLines.push('| fadeIn | 5 |');
    designMdLines.push('');
    designMdLines.push('### Performance Classification');
    designMdLines.push('| Classification | Count |');
    designMdLines.push('| GPU Accelerated | 3 |');
    designMdLines.push('');
  } else {
    designMdLines.push('## 15. Animation Inventory');
    designMdLines.push('');
    designMdLines.push('No animations detected.');
    designMdLines.push('');
  }

  if (signals.has_3d) {
    designMdLines.push('## 16. 3D Scene Specification');
    designMdLines.push('');
    designMdLines.push('### Renderer Setup');
    designMdLines.push('- **Library:** Three.js');
    designMdLines.push('');
  }

  if (signals.has_state_management) {
    designMdLines.push('## 17. State Management Architecture');
    designMdLines.push('');
    designMdLines.push('### Store Inventory');
    designMdLines.push('- **Library:** Zustand');
    designMdLines.push('');
  }

  designMdLines.push('## 18. Route Map & Navigation');
  designMdLines.push('');
  if (signals.route_count_high) {
    for (let i = 0; i < 12; i++) {
      designMdLines.push(`| /page-${i} | Page${i} |`);
    }
  } else {
    designMdLines.push('| / | Home |');
    designMdLines.push('| /about | About |');
  }
  designMdLines.push('');

  designMdLines.push('## 10. CSS Architecture Analysis');
  designMdLines.push('');
  if (signals.css_complexity_high) {
    designMdLines.push('- **!important Count:** 20 declarations');
    designMdLines.push('- **CSS Layers:** 5 @layer declarations');
  } else {
    designMdLines.push('- **!important Count:** 2 declarations');
    designMdLines.push('- **CSS Layers:** 0 @layer declarations');
  }
  designMdLines.push('');

  writeJson('tech-detections.json', techDetections);
  writeJson('content-inventory.json', contentInventory);
  writeFile('DESIGN.md', designMdLines.join('\n'));
  writeFile('analysis-summary.md', '# Analysis Summary\n\nTest target.\n');
}

console.log('=== Wave 3 Integration Tests ===\n');

const profiles = [
  {
    name: 'SPA + 3D + animations (example.vercel.app)',
    signals: {
      is_spa: 1, is_static_html: 0, has_3d: 1, has_state_management: 1,
      route_count_high: 0, css_complexity_high: 0, content_volume_high: 0,
      has_animations: 1, no_animations: 0, has_auth: 0
    },
    expectedStrategy: 'full_rebuild',
    expectedConfidence: 'HIGH'
  },
  {
    name: 'Static HTML brochure (sample-clone)',
    signals: {
      is_spa: 0, is_static_html: 1, has_3d: 0, has_state_management: 0,
      route_count_high: 0, css_complexity_high: 0, content_volume_high: 0,
      has_animations: 0, no_animations: 1, has_auth: 0
    },
    expectedStrategy: 'static_export',
    expectedConfidence: 'HIGH'
  },
  {
    name: 'Design-heavy portfolio',
    signals: {
      is_spa: 0, is_static_html: 0, has_3d: 0, has_state_management: 0,
      route_count_high: 0, css_complexity_high: 1, content_volume_high: 0,
      has_animations: 1, no_animations: 0, has_auth: 0
    },
    expectedStrategy: 'design_capture',
    expectedConfidence: 'AMBIGUOUS'
  },
  {
    name: 'Content-rich blog',
    signals: {
      is_spa: 0, is_static_html: 0, has_3d: 0, has_state_management: 0,
      route_count_high: 1, css_complexity_high: 0, content_volume_high: 1,
      has_animations: 0, no_animations: 1, has_auth: 0
    },
    expectedStrategy: 'content_migrate',
    expectedConfidence: 'HIGH'
  },
  {
    name: 'Hybrid SPA + content (Next.js with many routes)',
    signals: {
      is_spa: 1, is_static_html: 0, has_3d: 0, has_state_management: 0,
      route_count_high: 1, css_complexity_high: 0, content_volume_high: 0,
      has_animations: 0, no_animations: 0, has_auth: 0
    },
    expectedStrategy: 'full_rebuild',
    expectedConfidence: 'AMBIGUOUS'
  }
];

for (const profile of profiles) {
  console.log(`Test: ${profile.name}`);
  setupTestDir();
  createMockInputs(profile);

  const result = generateAndAppendStrategyRecommendation(TEST_DIR);

  assert(result.result.strategy === profile.expectedStrategy,
    `Expected strategy: ${profile.expectedStrategy || 'null'}, got: ${result.result.strategy || 'null'}`);
  assert(result.result.confidence === profile.expectedConfidence,
    `Expected confidence: ${profile.expectedConfidence}, got: ${result.result.confidence}`);

  const designMd = fs.readFileSync(path.join(TEST_DIR, 'DESIGN.md'), 'utf-8');
  assert(designMd.includes('## 22. Implementation Strategy Recommendation'),
    'Section 22 appended to DESIGN.md');

  const summaryMd = fs.readFileSync(path.join(TEST_DIR, 'analysis-summary.md'), 'utf-8');
  assert(summaryMd.includes('**Strategy:**'),
    'Strategy line appended to analysis-summary.md');

  cleanupTestDir();
  console.log();
}

console.log('Test: Zero-Signal Edge Case');
setupTestDir();
writeFile('DESIGN.md', '# Design\n');
writeFile('analysis-summary.md', '# Summary\n');
writeJson('tech-detections.json', { detections: [], css_architecture: {} });
writeJson('content-inventory.json', { sections: [], projects: [], navigation: [] });

const zeroResult = generateAndAppendStrategyRecommendation(TEST_DIR);
assert(zeroResult.result.strategy === null, 'Zero signals → null strategy');
assert(zeroResult.result.confidence === 'NONE', 'Zero signals → NONE confidence');

const zeroDesign = fs.readFileSync(path.join(TEST_DIR, 'DESIGN.md'), 'utf-8');
assert(zeroDesign.includes('Insufficient data for strategy recommendation'),
  'Zero-signal DESIGN.md shows insufficient data');

cleanupTestDir();
console.log();

console.log('Test: Single Entry Point');
assert(typeof generateAndAppendStrategyRecommendation === 'function',
  'generateAndAppendStrategyRecommendation exported from strategy/index.js');
console.log('  PASS: Single entry point available');
passed++;
console.log();

console.log('=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Status: ${failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

process.exit(failed > 0 ? 1 : 0);
