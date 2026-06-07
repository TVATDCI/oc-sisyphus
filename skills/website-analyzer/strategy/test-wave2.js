const fs = require('fs');
const path = require('path');
const { Section22Generator, generateAndAppendStrategyRecommendation } = require('./section-22-generator');

const TEST_DIR = path.join(__dirname, '..', 'test-strategy-wave2-tmp');

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

console.log('=== Wave 2 Strategy Output Tests ===\n');

const generator = new Section22Generator();
console.log('Test Suite 1: Normal Strategy Result');

const normalResult = {
  strategy: 'full_rebuild',
  confidence: 'HIGH',
  scores: { full_rebuild: 18, design_capture: 3, component_extract: 1, content_migrate: 0, static_export: -2 },
  sortedScores: [
    { name: 'full_rebuild', score: 18 },
    { name: 'design_capture', score: 3 },
    { name: 'component_extract', score: 1 },
    { name: 'content_migrate', score: 0 },
    { name: 'static_export', score: -2 }
  ],
  rationale: [
    { signal: 'is_spa', value: 1, weight: 3, contribution: 3 },
    { signal: 'has_3d', value: 1, weight: 3, contribution: 3 },
    { signal: 'has_animations', value: 1, weight: 2, contribution: 2 }
  ],
  effortEstimate: 'Large'
};

const md = generator.generate(normalResult);
assert(md.includes('## 22. Implementation Strategy Recommendation'), 'Section 22 header present');
assert(md.includes('### 22.1 Recommended Strategy'), '22.1 subsection present');
assert(md.includes('**Strategy:** Full Rebuild'), 'Strategy name correct');
assert(md.includes('**Confidence:** HIGH'), 'Confidence level correct');
assert(md.includes('### 22.2 Score Breakdown'), '22.2 subsection present');
assert(md.includes('| 1 | Full Rebuild | 18.0 |'), 'Score table has top entry');
assert(md.includes('### 22.3 Rationale'), '22.3 subsection present');
assert(md.includes('is_spa'), 'Rationale includes signal names');
assert(md.includes('### 22.4 Effort Estimate'), '22.4 subsection present');
assert(md.includes('**Label:** Large'), 'Effort label correct');
assert(md.includes('### 22.5 Risk Factors'), '22.5 subsection present');
assert(md.includes('### 22.6 Implementation Wave Suggestion'), '22.6 subsection present');
assert(md.includes('Wave 1: Framework setup + routing'), 'Wave suggestion present');
console.log();
console.log('Test Suite 2: Zero-Signal Edge Case');

const zeroResult = {
  strategy: null,
  confidence: 'NONE',
  scores: { full_rebuild: 0, design_capture: 0, component_extract: 0, content_migrate: 0, static_export: 0 },
  sortedScores: [
    { name: 'full_rebuild', score: 0 },
    { name: 'design_capture', score: 0 },
    { name: 'component_extract', score: 0 },
    { name: 'content_migrate', score: 0 },
    { name: 'static_export', score: 0 }
  ],
  rationale: [],
  effortEstimate: 'Small'
};

const zeroMd = generator.generate(zeroResult);
assert(zeroMd.includes('## 22. Implementation Strategy Recommendation'), 'Section 22 header present for zero case');
assert(zeroMd.includes('Insufficient data for strategy recommendation'), 'Shows insufficient data message');
assert(!zeroMd.includes('### 22.1'), 'No numbered subsections for zero case');
assert(!zeroMd.includes('### 22.2'), 'No score breakdown for zero case');
console.log();
console.log('Test Suite 3: Ambiguous Confidence');

const ambiguousResult = {
  strategy: 'full_rebuild',
  confidence: 'AMBIGUOUS',
  scores: { full_rebuild: 6, design_capture: 5, component_extract: 1, content_migrate: 0, static_export: -1 },
  sortedScores: [
    { name: 'full_rebuild', score: 6 },
    { name: 'design_capture', score: 5 },
    { name: 'component_extract', score: 1 },
    { name: 'content_migrate', score: 0 },
    { name: 'static_export', score: -1 }
  ],
  rationale: [
    { signal: 'is_spa', value: 1, weight: 3, contribution: 3 }
  ],
  effortEstimate: 'Medium'
};

const ambigMd = generator.generate(ambiguousResult);
assert(ambigMd.includes('**Confidence:** AMBIGUOUS'), 'Ambiguous confidence shown');
assert(ambigMd.includes('Design Capture'), 'Runner-up strategy mentioned');
assert(ambigMd.includes('Ambiguity note'), 'Ambiguity note present');
console.log();
console.log('Test Suite 4: All Strategy Categories');

const strategies = ['full_rebuild', 'design_capture', 'component_extract', 'content_migrate', 'static_export'];
for (const strat of strategies) {
  const result = {
    strategy: strat,
    confidence: 'HIGH',
    scores: Object.fromEntries(strategies.map(s => [s, s === strat ? 15 : 0])),
    sortedScores: strategies.map(s => ({ name: s, score: s === strat ? 15 : 0 })),
    rationale: [{ signal: 'test', value: 1, weight: 15, contribution: 15 }],
    effortEstimate: 'Medium'
  };
  const mdStr = generator.generate(result);
  assert(mdStr.includes(`**Strategy:** ${strat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`) ||
         mdStr.includes(`**Strategy:** ${strat === 'full_rebuild' ? 'Full Rebuild' : strat === 'design_capture' ? 'Design Capture' : strat === 'component_extract' ? 'Component Extract' : strat === 'content_migrate' ? 'Content Migrate' : 'Static Export'}`),
    `${strat} generates correct display name`);
}
console.log();
console.log('Test Suite 5: Score Table Sorting');

const sortedResult = {
  strategy: 'static_export',
  confidence: 'HIGH',
  scores: { static_export: 12, full_rebuild: -5, design_capture: -2, component_extract: 0, content_migrate: 1 },
  sortedScores: [
    { name: 'static_export', score: 12 },
    { name: 'content_migrate', score: 1 },
    { name: 'component_extract', score: 0 },
    { name: 'design_capture', score: -2 },
    { name: 'full_rebuild', score: -5 }
  ],
  rationale: [],
  effortEstimate: 'Medium'
};

const sortedMd = generator.generate(sortedResult);
const lines = sortedMd.split('\n');
const tableStart = lines.findIndex(l => l.includes('| Rank | Strategy | Score'));
assert(tableStart > 0, 'Score table found');
assert(lines[tableStart + 2].includes('Static Export'), 'Top score is Static Export');
assert(lines[tableStart + 3].includes('Content Migrate'), 'Second score is Content Migrate');
assert(lines[tableStart + 6].includes('Full Rebuild'), 'Last score is Full Rebuild');
console.log();
console.log('Test Suite 6: Score Match Levels');

const matchResult = {
  strategy: 'full_rebuild',
  confidence: 'HIGH',
  scores: { full_rebuild: 20, design_capture: 8, component_extract: -2, content_migrate: -10, static_export: -25 },
  sortedScores: [
    { name: 'full_rebuild', score: 20 },
    { name: 'design_capture', score: 8 },
    { name: 'component_extract', score: -2 },
    { name: 'content_migrate', score: -10 },
    { name: 'static_export', score: -25 }
  ],
  rationale: [],
  effortEstimate: 'Large'
};

const matchMd = generator.generate(matchResult);
assert(matchMd.includes('Strong Match'), '20 = Strong Match');
assert(matchMd.includes('Moderate Match'), '8 = Moderate Match');
assert(matchMd.includes('Neutral'), '-2 = Neutral');
assert(matchMd.includes('Weak Match'), '-10 = Weak Match');
assert(matchMd.includes('Strong Mismatch'), '-25 = Strong Mismatch');
console.log();
console.log('Test Suite 7: Full Pipeline Integration');
setupTestDir();

writeJson('tech-detections.json', {
  detections: [
    { category: 'framework', technology: 'React', confidence: 'EXTRACTED' }
  ],
  css_architecture: { important_count: 5, css_layers: 1, z_index_values: 2 }
});

writeJson('content-inventory.json', {
  sections: Array(5).fill({}),
  projects: Array(3).fill({}),
  navigation: [{ items: Array(4).fill({ label: 'Link', href: '/x' }) }]
});

writeFile('DESIGN.md', '# Design System: Test\n\n## 1. Overview\n\nTest design doc.\n');
writeFile('analysis-summary.md', '# Analysis Summary\n\nTest summary.\n');

const pipelineResult = generateAndAppendStrategyRecommendation(TEST_DIR);

assert(pipelineResult.designMdUpdated === true, 'DESIGN.md was updated');
assert(pipelineResult.summaryMdUpdated === true, 'analysis-summary.md was updated');

const updatedDesign = fs.readFileSync(path.join(TEST_DIR, 'DESIGN.md'), 'utf-8');
assert(updatedDesign.includes('## 22. Implementation Strategy Recommendation'), 'Section 22 appended to DESIGN.md');

const updatedSummary = fs.readFileSync(path.join(TEST_DIR, 'analysis-summary.md'), 'utf-8');
assert(updatedSummary.includes('**Strategy:**'), 'Strategy line appended to analysis-summary.md');
assert(updatedSummary.includes('confidence:'), 'Confidence included in summary');

cleanupTestDir();
console.log();
console.log('Test Suite 8: Idempotent Append');
setupTestDir();

writeJson('tech-detections.json', { detections: [], css_architecture: {} });
writeJson('content-inventory.json', { sections: [], projects: [], navigation: [] });
writeFile('DESIGN.md', '# Design\n');
writeFile('analysis-summary.md', '# Summary\n');

generateAndAppendStrategyRecommendation(TEST_DIR);
const design1 = fs.readFileSync(path.join(TEST_DIR, 'DESIGN.md'), 'utf-8');
const summary1 = fs.readFileSync(path.join(TEST_DIR, 'analysis-summary.md'), 'utf-8');

generateAndAppendStrategyRecommendation(TEST_DIR);
const design2 = fs.readFileSync(path.join(TEST_DIR, 'DESIGN.md'), 'utf-8');
const summary2 = fs.readFileSync(path.join(TEST_DIR, 'analysis-summary.md'), 'utf-8');

assert(design1 === design2, 'DESIGN.md not duplicated on second run');
assert(summary1 === summary2, 'analysis-summary.md not duplicated on second run');

cleanupTestDir();
console.log();
console.log('Test Suite 9: Zero-Signal Pipeline');
setupTestDir();

const zeroPipeline = generateAndAppendStrategyRecommendation(TEST_DIR);
assert(zeroPipeline.result.strategy === null, 'Zero signals → null strategy');
assert(zeroPipeline.result.confidence === 'NONE', 'Zero signals → NONE confidence');
assert(Object.entries(zeroPipeline.signals).filter(([k]) => !k.startsWith('_')).every(([, v]) => v === 0), 'All signals are 0');

cleanupTestDir();
console.log();
console.log('Test Suite 10: Missing Input Files');
setupTestDir();

writeFile('DESIGN.md', '# Design\n');
writeFile('analysis-summary.md', '# Summary\n');

const missingPipeline = generateAndAppendStrategyRecommendation(TEST_DIR);
const missingDesign = fs.readFileSync(path.join(TEST_DIR, 'DESIGN.md'), 'utf-8');
assert(missingDesign.includes('## 22. Implementation Strategy Recommendation'), 'Missing files still append Section 22');

cleanupTestDir();
console.log();
console.log('=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Status: ${failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

process.exit(failed > 0 ? 1 : 0);
