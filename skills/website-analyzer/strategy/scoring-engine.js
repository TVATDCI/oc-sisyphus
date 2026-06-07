const fs = require('fs');
const path = require('path');

/**
 * Scoring Engine
 * Loads strategy-signals.json and strategy-weights.json, applies weighted matrix,
 * computes confidence, applies tie-breaking, and produces StrategyResult.
 */

class ScoringEngine {
  constructor(options = {}) {
    this.weightsPath = options.weightsPath || null;
    this.weights = null;
    this.priorityOrder = [
      'full_rebuild',
      'design_capture',
      'component_extract',
      'content_migrate',
      'static_export'
    ];
  }

  loadWeights(weightsPath) {
    const targetPath = weightsPath || this.weightsPath;
    if (!targetPath) {
      this.weights = this._defaultWeights();
      return this.weights;
    }

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Weights file not found: ${targetPath}`);
    }

    const raw = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));

    if (!raw.schema_version) {
      throw new Error('Weights file missing required field: schema_version');
    }

    this.weights = raw;

    if (raw.meta?.priority_order) {
      this.priorityOrder = raw.meta.priority_order;
    }

    return this.weights;
  }

  score(signals) {
    if (!this.weights) {
      this.loadWeights();
    }

    const categories = this.priorityOrder;
    const scores = {};

    for (const category of categories) {
      scores[category] = 0;
    }

    const signalEntries = Object.entries(signals).filter(([key]) => !key.startsWith('_'));

    if (signalEntries.length === 0 || signalEntries.every(([, v]) => v === 0)) {
      return {
        strategy: null,
        confidence: 'NONE',
        scores: Object.fromEntries(categories.map(c => [c, 0])),
        rationale: []
      };
    }

    for (const [signalKey, signalValue] of signalEntries) {
      const signalConfig = this.weights.signals?.find(s => s.key === signalKey);
      if (!signalConfig) continue;

      for (const category of categories) {
        const weight = signalConfig.weights?.[category] || 0;
        scores[category] += signalValue * weight;
      }
    }

    const sortedScores = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]);

    const topStrategy = this._applyTieBreaking(sortedScores);
    const confidence = this._computeConfidence(sortedScores);

    const rationale = this._buildRationale(signals, scores, sortedScores);

    return {
      strategy: topStrategy,
      confidence,
      scores,
      sortedScores: sortedScores.map(([name, score]) => ({ name, score: Math.round(score * 10) / 10 })),
      rationale,
      effortEstimate: this._estimateEffort(scores)
    };
  }

  _applyTieBreaking(sortedScores) {
    const maxScore = sortedScores[0][1];
    const tied = sortedScores.filter(([, score]) => score === maxScore);

    if (tied.length === 1) {
      return tied[0][0];
    }

    const tiedNames = tied.map(([name]) => name);
    for (const candidate of this.priorityOrder) {
      if (tiedNames.includes(candidate)) {
        return candidate;
      }
    }

    return tiedNames[0];
  }

  _computeConfidence(sortedScores) {
    if (sortedScores.length === 0) return 'NONE';
    if (sortedScores.length === 1) return 'HIGH';

    const maxScore = sortedScores[0][1];
    const secondMaxScore = sortedScores[1][1];

    if (secondMaxScore === 0) {
      return maxScore === 0 ? 'NONE' : 'HIGH';
    }

    const ratio = maxScore / secondMaxScore;

    if (ratio > 2.0) return 'HIGH';
    if (ratio >= 1.5) return 'MEDIUM';
    return 'AMBIGUOUS';
  }

  _buildRationale(signals, scores, sortedScores) {
    const contributions = [];

    for (const [signalKey, signalValue] of Object.entries(signals)) {
      if (signalKey.startsWith('_') || signalValue === 0) continue;

      const signalConfig = this.weights.signals?.find(s => s.key === signalKey);
      if (!signalConfig) continue;

      const topCategory = sortedScores[0][0];
      const weight = signalConfig.weights?.[topCategory] || 0;
      const contribution = signalValue * weight;

      if (contribution !== 0) {
        contributions.push({
          signal: signalKey,
          value: signalValue,
          weight,
          contribution: Math.round(contribution * 10) / 10
        });
      }
    }

    return contributions
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3);
  }

  _estimateEffort(scores) {
    const totalComplexity = Object.values(scores).reduce((sum, s) => sum + Math.abs(s), 0);

    if (totalComplexity > 30) return 'Large';
    if (totalComplexity > 15) return 'Medium';
    return 'Small';
  }

  _defaultWeights() {
    return {
      schema_version: '1.0',
      meta: {
        description: 'Website Analyzer Strategy Scoring Matrix',
        tie_breaker: 'ambitious',
        priority_order: this.priorityOrder
      },
      signals: [
        { key: 'is_spa', weights: { full_rebuild: 3, design_capture: 0, component_extract: 1, content_migrate: 0, static_export: -2 } },
        { key: 'is_static_html', weights: { full_rebuild: -2, design_capture: 1, component_extract: 1, content_migrate: 1, static_export: 3 } },
        { key: 'has_3d', weights: { full_rebuild: 3, design_capture: 1, component_extract: 0, content_migrate: 0, static_export: -1 } },
        { key: 'has_state_management', weights: { full_rebuild: 2, design_capture: 0, component_extract: 1, content_migrate: 0, static_export: 0 } },
        { key: 'route_count_high', weights: { full_rebuild: 1, design_capture: 0, component_extract: -1, content_migrate: 3, static_export: -1 } },
        { key: 'css_complexity_high', weights: { full_rebuild: 1, design_capture: 3, component_extract: 1, content_migrate: 0, static_export: 0 } },
        { key: 'content_volume_high', weights: { full_rebuild: 0, design_capture: 0, component_extract: -1, content_migrate: 3, static_export: 0 } },
        { key: 'has_animations', weights: { full_rebuild: 2, design_capture: 1, component_extract: 1, content_migrate: 0, static_export: -1 } },
        { key: 'no_animations', weights: { full_rebuild: -1, design_capture: 0, component_extract: 0, content_migrate: 0, static_export: 1 } },
        { key: 'has_auth', weights: { full_rebuild: 2, design_capture: -1, component_extract: -1, content_migrate: 0, static_export: -1 } }
      ]
    };
  }
}

module.exports = { ScoringEngine };
