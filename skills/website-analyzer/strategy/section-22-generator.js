const fs = require('fs');
const path = require('path');
const { SignalAggregator } = require('./signal-aggregator');
const { ScoringEngine } = require('./scoring-engine');

const STRATEGY_DISPLAY_NAMES = {
  full_rebuild: 'Full Rebuild',
  design_capture: 'Design Capture',
  component_extract: 'Component Extract',
  content_migrate: 'Content Migrate',
  static_export: 'Static Export'
};

const STRATEGY_RISKS = {
  full_rebuild: [
    'Complex state management may require significant architectural planning',
    '3D scene complexity requires WebGL expertise if present',
    'Animation-heavy sites need careful performance budgeting',
    'Custom routing logic must be replicated accurately',
    'Build time may exceed initial estimates for large SPAs'
  ],
  design_capture: [
    'Token extraction accuracy depends on runtime CSS analysis quality',
    'Custom easing and animation curves may not map cleanly to design tools',
    'WebGL/Canvas elements may not be capturable as static design tokens',
    'Dark mode or theme variants require manual verification',
    'Responsive breakpoint mapping requires human judgment'
  ],
  component_extract: [
    'Component interdependencies may create cascading extraction needs',
    'Styles scoped to parent contexts may break when isolated',
    'Custom hooks or utility functions may be deeply coupled',
    'Animation triggers tied to page-level state need re-wiring',
    'Third-party dependencies in extracted components need auditing'
  ],
  content_migrate: [
    'Data mapping between source and target CMS may require transformation scripts',
    'Rich media (videos, interactive embeds) may not transfer cleanly',
    'SEO metadata and structured data need manual verification',
    'URL redirect strategy must be planned to avoid broken links',
    'Content update workflows differ between static and dynamic platforms'
  ],
  static_export: [
    'Dynamic content (search, filters, user-generated content) will be lost or frozen',
    'Interactive elements require replacement with static equivalents',
    'Authentication-gated content is inaccessible to static export tools',
    'Large asset libraries may exceed static hosting limits',
    'Client-side routing must be replaced with static page generation'
  ]
};

const WAVE_SUGGESTIONS = {
  full_rebuild: [
    'Wave 1: Framework setup + routing',
    'Wave 2: Design tokens + global styles',
    'Wave 3: Core components + layout system',
    'Wave 4: Pages + content integration',
    'Wave 5: Animations + 3D + polish',
    'Wave 6: Performance + accessibility audit'
  ],
  design_capture: [
    'Wave 1: Design token audit + extraction',
    'Wave 2: Typography + color system mapping',
    'Wave 3: Component inventory + categorization',
    'Wave 4: Animation + motion specification',
    'Wave 5: Export to target format (Figma/Tailwind/etc.)',
    'Wave 6: Design system documentation'
  ],
  component_extract: [
    'Wave 1: Component inventory + dependency graph',
    'Wave 2: Isolate standalone components',
    'Wave 3: Extract styles + theming logic',
    'Wave 4: Port to target framework',
    'Wave 5: Storybook / documentation',
    'Wave 6: Test + publish to registry'
  ],
  content_migrate: [
    'Wave 1: Content audit + export from source',
    'Wave 2: Data transformation + cleanup',
    'Wave 3: Import to target CMS',
    'Wave 4: URL mapping + redirect setup',
    'Wave 5: Rich media migration',
    'Wave 6: SEO + metadata verification'
  ],
  static_export: [
    'Wave 1: Full site scrape + asset download',
    'Wave 2: Static template generation',
    'Wave 3: Asset optimization + compression',
    'Wave 4: Hosting setup + CDN configuration',
    'Wave 5: Link validation + broken link fixes',
    'Wave 6: Performance + cache strategy'
  ]
};

class Section22Generator {
  generate(result) {
    if (!result || result.strategy === null) {
      return this._generateInsufficientData();
    }

    const displayName = STRATEGY_DISPLAY_NAMES[result.strategy] || result.strategy;
    const lines = [];

    lines.push('## 22. Implementation Strategy Recommendation');
    lines.push('');

    lines.push(...this._generateRecommendedStrategy(result, displayName));
    lines.push(...this._generateScoreBreakdown(result));
    lines.push(...this._generateRationale(result));
    lines.push(...this._generateEffortEstimate(result));
    lines.push(...this._generateRiskFactors(result));
    lines.push(...this._generateWaveSuggestion(result));

    return lines.join('\n');
  }

  _generateInsufficientData() {
    return [
      '## 22. Implementation Strategy Recommendation',
      '',
      '> **Note:** Insufficient data for strategy recommendation.',
      '> The analyzer did not detect enough signals to make a confident recommendation.',
      '> Consider running a deeper analysis or manually reviewing the target site.',
      ''
    ].join('\n');
  }

  _generateRecommendedStrategy(result, displayName) {
    const lines = [
      '### 22.1 Recommended Strategy',
      '',
      `- **Strategy:** ${displayName}`,
      `- **Confidence:** ${result.confidence}`,
      ''
    ];

    if (result.confidence === 'AMBIGUOUS') {
      const runnerUp = result.sortedScores[1];
      if (runnerUp) {
        const runnerUpName = STRATEGY_DISPLAY_NAMES[runnerUp.name] || runnerUp.name;
        lines.push(`> The runner-up strategy is **${runnerUpName}** (score: ${runnerUp.score}), which is close behind. Consider whether a hybrid approach may be appropriate.`);
        lines.push('');
      }
    }

    return lines;
  }

  _generateScoreBreakdown(result) {
    const lines = [
      '### 22.2 Score Breakdown',
      '',
      '| Rank | Strategy | Score | Match Level |',
      '|------|----------|-------|-------------|'
    ];

    for (let i = 0; i < result.sortedScores.length; i++) {
      const item = result.sortedScores[i];
      const displayName = STRATEGY_DISPLAY_NAMES[item.name] || item.name;
      const matchLevel = this._scoreToMatchLevel(item.score);
      lines.push(`| ${i + 1} | ${displayName} | ${item.score.toFixed(1)} | ${matchLevel} |`);
    }

    lines.push('');
    return lines;
  }

  _scoreToMatchLevel(score) {
    if (score >= 15) return 'Strong Match';
    if (score >= 5) return 'Moderate Match';
    if (score >= -4) return 'Neutral';
    if (score >= -14) return 'Weak Match';
    return 'Strong Mismatch';
  }

  _generateRationale(result) {
    const lines = [
      '### 22.3 Rationale',
      ''
    ];

    if (result.rationale && result.rationale.length > 0) {
      lines.push('The following signals most influenced this recommendation:');
      lines.push('');

      for (const item of result.rationale) {
        lines.push(`- **${item.signal}** (value: ${item.value}, weight: ${item.weight}, contribution: ${item.contribution})`);
      }
    } else {
      lines.push('No individual signal strongly influenced this recommendation. The result is based on the overall signal profile.');
    }

    lines.push('');

    if (result.confidence === 'AMBIGUOUS') {
      const runnerUp = result.sortedScores[1];
      if (runnerUp) {
        const runnerUpName = STRATEGY_DISPLAY_NAMES[runnerUp.name] || runnerUp.name;
        lines.push(`> **Ambiguity note:** ${runnerUpName} (score: ${runnerUp.score.toFixed(1)}) is a close alternative. Review both strategies before deciding.`);
        lines.push('');
      }
    }

    return lines;
  }

  _generateEffortEstimate(result) {
    const totalComplexity = Object.values(result.scores).reduce((sum, s) => sum + Math.abs(s), 0);

    return [
      '### 22.4 Effort Estimate',
      '',
      `- **Label:** ${result.effortEstimate}`,
      `- **Justification:** Total complexity score is ${totalComplexity.toFixed(1)} across all strategies. ${this._effortJustification(result.effortEstimate)}`,
      ''
    ];
  }

  _effortJustification(effort) {
    if (effort === 'Large') return 'High signal diversity and strong strategy matches indicate significant implementation depth.';
    if (effort === 'Medium') return 'Moderate signal strength suggests a balanced implementation scope.';
    return 'Weak or neutral signals across the board indicate a focused, straightforward implementation.';
  }

  _generateRiskFactors(result) {
    const risks = STRATEGY_RISKS[result.strategy] || ['Review the target site manually for project-specific risks.'];

    const lines = [
      '### 22.5 Risk Factors',
      ''
    ];

    for (const risk of risks) {
      lines.push(`- ${risk}`);
    }

    lines.push('');
    return lines;
  }

  _generateWaveSuggestion(result) {
    const waves = WAVE_SUGGESTIONS[result.strategy] || ['Wave 1: Analysis', 'Wave 2: Implementation', 'Wave 3: Verification'];

    const lines = [
      '### 22.6 Implementation Wave Suggestion',
      '',
      `Suggested ordering for a **${STRATEGY_DISPLAY_NAMES[result.strategy] || result.strategy}** approach:`
    ];

    for (const wave of waves) {
      lines.push(`- ${wave}`);
    }

    lines.push('');
    return lines;
  }
}

function generateAndAppendStrategyRecommendation(outputDir, options = {}) {
  const aggregator = new SignalAggregator(outputDir);
  const signals = aggregator.aggregate();

  const weightsPath = options.weightsPath || path.join(outputDir, 'strategy-weights.json');
  const weightsExist = fs.existsSync(weightsPath);
  const engine = new ScoringEngine({ weightsPath: weightsExist ? weightsPath : null });
  if (weightsExist) {
    engine.loadWeights();
  }

  const result = engine.score(signals);

  const generator = new Section22Generator();
  const section22 = generator.generate(result);

  const designMdPath = path.join(outputDir, 'DESIGN.md');
  if (fs.existsSync(designMdPath)) {
    const existing = fs.readFileSync(designMdPath, 'utf-8');
    if (!existing.includes('## 22. Implementation Strategy Recommendation')) {
      fs.writeFileSync(designMdPath, existing.trimEnd() + '\n\n---\n\n' + section22, 'utf-8');
    }
  }

  const summaryMdPath = path.join(outputDir, 'analysis-summary.md');
  if (fs.existsSync(summaryMdPath)) {
    const existing = fs.readFileSync(summaryMdPath, 'utf-8');
    const strategyLine = result.strategy
      ? `**Strategy:** ${STRATEGY_DISPLAY_NAMES[result.strategy] || result.strategy} (confidence: ${result.confidence})`
      : '**Strategy:** Insufficient data for recommendation';

    if (!existing.includes('**Strategy:**')) {
      fs.writeFileSync(summaryMdPath, existing.trimEnd() + '\n\n' + strategyLine + '\n', 'utf-8');
    }
  }

  return {
    signals,
    result,
    section22,
    designMdUpdated: fs.existsSync(designMdPath),
    summaryMdUpdated: fs.existsSync(summaryMdPath)
  };
}

module.exports = {
  Section22Generator,
  generateAndAppendStrategyRecommendation,
  STRATEGY_DISPLAY_NAMES
};
