const confidenceEngine = require('./confidenceEngine');
const marketProtectionService = require('./marketProtectionService');
const outcomeLearningService = require('./outcomeLearningService');

function enrichCandidates(candidates = [], context = {}) {
  const withLearning = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => outcomeLearningService.attachOutcomeSignals(candidate, candidates, context));
  const protectedResult = marketProtectionService.applyMarketProtection(withLearning, context);
  const confidenceResult = confidenceEngine.applyConfidenceEngine(protectedResult.candidates, context);

  return {
    candidates: confidenceResult.candidates,
    diagnostics: {
      enabled: true,
      enrichedCandidates: confidenceResult.candidates.length,
      protectionSuggestedCount: protectedResult.diagnostics.protectionSuggestedCount,
      mlReplacedBySpreadCount: protectedResult.diagnostics.mlReplacedBySpreadCount,
      avgConfidence: confidenceResult.diagnostics.avgConfidence,
      historicalLearningEnabled: confidenceResult.diagnostics.historicalLearningEnabled === true,
      historicalPatternsApplied: confidenceResult.diagnostics.historicalPatternsApplied || 0,
      historicalRiskFlags: confidenceResult.diagnostics.historicalRiskFlags || [],
      topByConfidence: confidenceResult.diagnostics.topByConfidence,
      rejectedLowConfidence: 0,
    },
  };
}

module.exports = {
  enrichCandidates,
};
