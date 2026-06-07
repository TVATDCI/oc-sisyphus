const { SignalAggregator } = require('./signal-aggregator');
const { ScoringEngine } = require('./scoring-engine');
const { Section22Generator, generateAndAppendStrategyRecommendation } = require('./section-22-generator');

module.exports = {
  SignalAggregator,
  ScoringEngine,
  Section22Generator,
  generateAndAppendStrategyRecommendation
};
