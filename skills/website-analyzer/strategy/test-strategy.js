const fs = require('fs');
const path = require('path');
const { SignalAggregator } = require('./signal-aggregator');
const { ScoringEngine } = require('./scoring-engine');

const TEST_DIR = path.join(__dirname, '..', 'test-strategy-tmp');

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

console.log('=== Strategy Module Tests ===\n');

console.log('Test Suite 1: Signal Aggregation');
setupTestDir();

writeJson('tech-detections.json', {
  detections: [
    { category: 'framework', technology: 'React', confidence: 'EXTRACTED' },
    { category: 'graphics', technology: 'Three.js', confidence: 'EXTRACTED' }
  ],
  css_architecture: { important_count: 15, css_layers: 3, z_index_values: 5 }
});

writeJson('content-inventory.json', {
  sections: Array(10).fill({}),
  projects: Array(15).fill({}),
  navigation: [{ items: Array(10).fill({ label: 'Link', href: '/x' }) }]
});

writeFile('DESIGN.md', `
## 15. Animation Inventory

### Keyframe Patterns
| Pattern | Count |
|---------|-------|
| fadeIn | 5 |

### Performance Classification
| Classification | Count |
|---------------|-------|
| GPU Accelerated | 3 |

## 16. 3D Scene Specification

### Renderer Setup
- **Library:** Three.js

## 17. State Management Architecture

### Store Inventory
#### Store 1: themeStore
- **Library:** Zustand

## 18. Route Map & Navigation

| Path | Component |
|------|-----------|
| / | Home |
| /about | About |
| /projects | Projects |

## 10. CSS Architecture Analysis

### Specificity & Cascade
- **!important Count:** 15 declarations
- **CSS Layers:** 3 @layer declarations

## 19. Interaction Patterns

### Event Handlers
- **Total Registered:** 25
`);

const aggregator = new SignalAggregator(TEST_DIR);
const signals = aggregator.aggregate();

assert(Object.keys(signals).filter(k => !k.startsWith('_')).length >= 8, 'Contains at least 8 signal keys');
assert(signals.is_spa === 1, 'Detects SPA framework');
assert(signals.is_static_html === 0, 'Static HTML is inverse of SPA');
assert(signals.has_3d === 1, 'Detects 3D from tech stack');
assert(signals.has_state_management === 1, 'Detects state management');
assert(signals.route_count_high === 1, 'Detects high route count');
assert(signals.css_complexity_high === 1, 'Detects high CSS complexity');
assert(signals.content_volume_high === 1, 'Detects high content volume');
assert(signals.has_animations === 1, 'Detects animations');
assert(signals.no_animations === 0, 'No animations is inverse');
assert(signals.has_auth === 0, 'Auth signal is 0 (deferred)');

aggregator.writeSignals();
assert(fs.existsSync(path.join(TEST_DIR, 'strategy-signals.json')), 'strategy-signals.json is written');

cleanupTestDir();
console.log();

console.log('Test Suite 2: Missing Files Handling');
setupTestDir();

const aggregator2 = new SignalAggregator(TEST_DIR);
const signals2 = aggregator2.aggregate();

assert(signals2.is_spa === 0, 'Defaults is_spa to 0 when files missing');
assert(signals2._meta.warnings.length > 0, 'Logs warnings for missing files');
assert(!signals2._meta.warnings.some(w => w.includes('crash')), 'Does not crash on missing files');

cleanupTestDir();
console.log();

console.log('Test Suite 3: Scoring Engine');

const engine = new ScoringEngine();

const testSignals = {
  is_spa: 1,
  is_static_html: 0,
  has_3d: 1,
  has_state_management: 1,
  route_count_high: 0,
  css_complexity_high: 1,
  content_volume_high: 0,
  has_animations: 1,
  no_animations: 0,
  has_auth: 0
};

const result = engine.score(testSignals);

assert(Object.keys(result.scores).length === 5, 'All 5 categories receive a score');
assert(result.strategy !== null, 'Top strategy is selected');
assert(['HIGH', 'MEDIUM', 'AMBIGUOUS'].includes(result.confidence), 'Confidence is computed');
assert(result.rationale.length > 0, 'Rationale contains top contributing signals');
assert(['Small', 'Medium', 'Large'].includes(result.effortEstimate), 'Effort estimate is computed');

cleanupTestDir();
console.log();

console.log('Test Suite 4: Tie-Breaking');

const tieSignals = {
  is_spa: 0,
  is_static_html: 0,
  has_3d: 1,
  has_state_management: 0,
  route_count_high: 0,
  css_complexity_high: 1,
  content_volume_high: 0,
  has_animations: 0,
  no_animations: 0,
  has_auth: 0
};

const tieResult = engine.score(tieSignals);
assert(tieResult.strategy === 'full_rebuild', 'Tie broken with rebuild-first priority');

cleanupTestDir();
console.log();

console.log('Test Suite 5: Zero-Signal Edge Case');

const zeroSignals = {
  is_spa: 0,
  is_static_html: 0,
  has_3d: 0,
  has_state_management: 0,
  route_count_high: 0,
  css_complexity_high: 0,
  content_volume_high: 0,
  has_animations: 0,
  no_animations: 0,
  has_auth: 0
};

const zeroResult = engine.score(zeroSignals);
assert(zeroResult.strategy === null, 'Zero signals → null strategy');
assert(zeroResult.confidence === 'NONE', 'Zero signals → NONE confidence');

cleanupTestDir();
console.log();

console.log('Test Suite 6: Determinism');

const deterministicSignals = {
  is_spa: 1,
  is_static_html: 0,
  has_3d: 1,
  has_state_management: 1,
  route_count_high: 1,
  css_complexity_high: 1,
  content_volume_high: 1,
  has_animations: 1,
  no_animations: 0,
  has_auth: 0
};

const results = [];
for (let i = 0; i < 10; i++) {
  const r = engine.score(deterministicSignals);
  results.push({ strategy: r.strategy, confidence: r.confidence });
}

const allSame = results.every(r => r.strategy === results[0].strategy && r.confidence === results[0].confidence);
assert(allSame, 'Deterministic across 10 consecutive runs');

cleanupTestDir();
console.log();

console.log('Test Suite 7: Confidence Thresholds');

const highConfSignals = {
  is_spa: 1,
  is_static_html: 0,
  has_3d: 1,
  has_state_management: 1,
  route_count_high: 0,
  css_complexity_high: 0,
  content_volume_high: 0,
  has_animations: 1,
  no_animations: 0,
  has_auth: 0
};

const highResult = engine.score(highConfSignals);
assert(highResult.confidence === 'HIGH', 'Strong signals produce HIGH confidence');

cleanupTestDir();
console.log();

console.log('Test Suite 8: Weight Config Loading');
setupTestDir();

const weightsPath = path.join(TEST_DIR, 'strategy-weights.json');
fs.writeFileSync(weightsPath, JSON.stringify({
  schema_version: '1.0',
  meta: { tie_breaker: 'ambitious' },
  signals: [
    { key: 'is_spa', weights: { full_rebuild: 10, design_capture: 0, component_extract: 0, content_migrate: 0, static_export: 0 } }
  ]
}, null, 2));

const customEngine = new ScoringEngine({ weightsPath });
customEngine.loadWeights();
const customResult = customEngine.score({ is_spa: 1 });
assert(customResult.scores.full_rebuild === 10, 'Custom weights are applied');

cleanupTestDir();
console.log();

console.log('Test Suite 9: Schema Version Validation');
setupTestDir();

const badWeightsPath = path.join(TEST_DIR, 'bad-weights.json');
fs.writeFileSync(badWeightsPath, JSON.stringify({ signals: [] }, null, 2));

const badEngine = new ScoringEngine({ weightsPath: badWeightsPath });
try {
  badEngine.loadWeights();
  assert(false, 'Throws on missing schema_version');
} catch (err) {
  assert(err.message.includes('schema_version'), 'Error mentions schema_version');
}

cleanupTestDir();
console.log();

console.log('=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Status: ${failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

process.exit(failed > 0 ? 1 : 0);
