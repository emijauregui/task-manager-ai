const VERSION = 'v2';
const BASE_SCORE = 70;

const CONFIDENCE_TIERS = [
  { tier: 'A', min: 85 },
  { tier: 'B', min: 70 },
  { tier: 'C', min: 55 },
  { tier: 'D', min: 35 },
  { tier: 'F', min: 0 },
];

function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function hasRisk(candidate = {}, tag) {
  return Array.isArray(candidate.riskTags) && candidate.riskTags.includes(tag);
}

function getConfidenceTier(score, candidate = {}) {
  if (hasRisk(candidate, 'timing_blocked') || hasRisk(candidate, 'player_not_starting')) {
    return 'F';
  }

  const rawTier = CONFIDENCE_TIERS.find((tier) => score >= tier.min)?.tier || 'F';

  if (hasRisk(candidate, 'stale_odds')) {
    const order = ['F', 'D', 'C', 'B', 'A'];
    return order.indexOf(rawTier) > order.indexOf('C') ? 'C' : rawTier;
  }

  return rawTier;
}

function getValueTier(candidate = {}) {
  const decimalOdds = Number(candidate.decimalOdds);

  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    return 'unknown';
  }

  if (decimalOdds < 1.1) {
    return 'poor';
  }

  if (decimalOdds <= 1.3) {
    return 'poor';
  }

  if (decimalOdds <= 1.7) {
    return 'fair';
  }

  if (decimalOdds <= 2.1) {
    return 'good';
  }

  return 'fair';
}

function getPriceScore(candidate = {}) {
  const decimalOdds = Number(candidate.decimalOdds);

  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    return 0;
  }

  if (decimalOdds < 1.1) {
    return -10;
  }

  if (decimalOdds <= 1.3) {
    return -6;
  }

  if (decimalOdds <= 1.7) {
    return 0;
  }

  if (decimalOdds <= 2.1) {
    return 3;
  }

  return -8;
}

function getRiskLevel(candidate = {}) {
  const decimalOdds = Number(candidate.decimalOdds);

  if (candidate.candidateStatus === 'rejected' || hasRisk(candidate, 'timing_blocked')) {
    return 'blocked';
  }

  if (hasRisk(candidate, 'player_not_starting')) {
    return 'blocked';
  }

  if (hasRisk(candidate, 'stale_odds')
    || hasRisk(candidate, 'unknown_freshness')
    || hasRisk(candidate, 'high_volatility_market')
    || hasRisk(candidate, 'lineup_unknown')
    || hasRisk(candidate, 'missing_line')
    || hasRisk(candidate, 'missing_price')
    || hasRisk(candidate, 'missing_bookmaker')
    || (Number.isFinite(decimalOdds) && decimalOdds > 2.1)) {
    return 'high';
  }

  if (hasRisk(candidate, 'lineup_required')
    || hasRisk(candidate, 'pitcher_unknown')
    || hasRisk(candidate, 'pitcher_k_line')
    || hasRisk(candidate, 'batter_hit_prop')
    || hasRisk(candidate, 'total_bases_prop')
    || hasRisk(candidate, 'spread_market')
    || hasRisk(candidate, 'game_total_market')) {
    return 'medium';
  }

  return 'low';
}

function buildPenaltyBreakdown(candidate = {}) {
  const freshnessPenalty = (hasRisk(candidate, 'stale_odds') ? -25 : 0)
    + (hasRisk(candidate, 'unknown_freshness') ? -15 : 0);
  const dataQualityPenalty = (hasRisk(candidate, 'missing_line') ? -10 : 0)
    + (hasRisk(candidate, 'missing_bookmaker') ? -8 : 0)
    + (hasRisk(candidate, 'missing_price') ? -30 : 0)
    + (hasRisk(candidate, 'missing_event_id') ? -25 : 0);
  const marketRiskPenalty = (hasRisk(candidate, 'pitcher_k_line') ? -8 : 0)
    + (hasRisk(candidate, 'batter_hit_prop') ? -6 : 0)
    + (hasRisk(candidate, 'total_bases_prop') ? -6 : 0)
    + (hasRisk(candidate, 'lineup_required') ? -10 : 0)
    + (hasRisk(candidate, 'moneyline_market') ? 3 : 0)
    + (hasRisk(candidate, 'spread_market') ? -3 : 0)
    + (hasRisk(candidate, 'game_total_market') ? -5 : 0);
  const timingPenalty = hasRisk(candidate, 'timing_blocked') ? -60 : 0;
  const volatilityPenalty = hasRisk(candidate, 'high_volatility_market') ? -18 : 0;
  const lowValuePenalty = hasRisk(candidate, 'low_value_odds') ? -20 : 0;
  const lineupPenalty = (hasRisk(candidate, 'lineup_confirmed') ? 5 : 0)
    + (hasRisk(candidate, 'lineup_unknown') ? -15 : 0)
    + (hasRisk(candidate, 'player_not_starting') ? -60 : 0)
    + (hasRisk(candidate, 'pitcher_confirmed') ? 4 : 0)
    + (hasRisk(candidate, 'pitcher_unknown') ? -10 : 0);

  return {
    priceScore: getPriceScore(candidate),
    freshnessPenalty,
    dataQualityPenalty,
    marketRiskPenalty,
    timingPenalty,
    volatilityPenalty,
    lowValuePenalty,
    lineupPenalty,
  };
}

function buildScoringNotes(candidate = {}, scored = {}) {
  const notes = [];

  if (hasRisk(candidate, 'stale_odds')) {
    notes.push('Cache odds are stale; score is diagnostic only.');
  }

  if (hasRisk(candidate, 'timing_blocked')) {
    notes.push('Timing gate blocked this candidate.');
  }

  if (hasRisk(candidate, 'lineup_required')) {
    notes.push('Lineup confirmation required before ticket use.');
  }

  if (hasRisk(candidate, 'lineup_unknown')) {
    notes.push('Batter lineup is not confirmed in cache.');
  }

  if (hasRisk(candidate, 'player_not_starting')) {
    notes.push('Player is not in the confirmed lineup.');
  }

  if (hasRisk(candidate, 'pitcher_unknown')) {
    notes.push('Pitcher confirmation is unavailable in cache.');
  }

  if (hasRisk(candidate, 'pitcher_k_line')) {
    notes.push('Pitcher K prop needs matchup, workload, and lineup context.');
  }

  if (Number(candidate.decimalOdds) > 2.1) {
    notes.push('Higher odds imply higher variance; no real edge is inferred.');
  }

  if (scored.valueTier === 'poor') {
    notes.push('Price band has weak payout contribution.');
  }

  return notes;
}

function buildScoringWarnings(candidate = {}) {
  return [
    ...(Array.isArray(candidate.rejectionReasons) ? candidate.rejectionReasons : []),
    ...(Array.isArray(candidate.dataQuality?.warnings) ? candidate.dataQuality.warnings : []),
    ...(Array.isArray(candidate.lineupGate?.warnings) ? candidate.lineupGate.warnings : []),
  ].filter(Boolean);
}

function scoreCandidate(candidate = {}, options = {}) {
  const baseScore = Number.isFinite(Number(options.baseScore))
    ? Number(options.baseScore)
    : BASE_SCORE;
  const penalties = buildPenaltyBreakdown(candidate);
  const rawScore = baseScore
    + penalties.priceScore
    + penalties.freshnessPenalty
    + penalties.dataQualityPenalty
    + penalties.marketRiskPenalty
    + penalties.timingPenalty
    + penalties.volatilityPenalty
    + penalties.lowValuePenalty
    + penalties.lineupPenalty;
  let finalScore = clampScore(rawScore);

  if (candidate.candidateStatus === 'rejected') {
    finalScore = Math.min(finalScore, 20);
  }

  if (hasRisk(candidate, 'timing_blocked')) {
    finalScore = Math.min(finalScore, 10);
  }

  if (hasRisk(candidate, 'player_not_starting')) {
    finalScore = Math.min(finalScore, 10);
  }

  const valueTier = getValueTier(candidate);
  const scored = {
    ...candidate,
    scoringVersion: VERSION,
    score: finalScore,
    confidenceTier: getConfidenceTier(finalScore, candidate),
    valueTier,
    riskLevel: getRiskLevel(candidate),
    scoringBreakdown: {
      baseScore,
      priceScore: penalties.priceScore,
      freshnessPenalty: penalties.freshnessPenalty,
      dataQualityPenalty: penalties.dataQualityPenalty,
      marketRiskPenalty: penalties.marketRiskPenalty,
      timingPenalty: penalties.timingPenalty,
      volatilityPenalty: penalties.volatilityPenalty,
      lowValuePenalty: penalties.lowValuePenalty,
      lineupPenalty: penalties.lineupPenalty,
      finalScore,
    },
    scoringNotes: [],
    scoringWarnings: [],
  };

  scored.scoringNotes = buildScoringNotes(candidate, scored);
  scored.scoringWarnings = Array.from(new Set(buildScoringWarnings(candidate)));

  return scored;
}

function scoreCandidates(candidates = [], options = {}) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => scoreCandidate(candidate, options));
}

function increment(target, key, amount = 1) {
  const safeKey = key || 'unknown';
  target[safeKey] = (target[safeKey] || 0) + amount;
}

function buildScoringSummary(scoredCandidates = [], options = {}) {
  const safeCandidates = Array.isArray(scoredCandidates) ? scoredCandidates : [];
  const sampleLimit = Math.max(0, Math.min(20, Number(options.sampleLimit ?? 20)));
  const byConfidenceTier = {};
  const byRiskLevel = {};
  const byMarketType = {};
  const byValueTier = {};
  const warnings = {};

  safeCandidates.forEach((candidate) => {
    increment(byConfidenceTier, candidate.confidenceTier);
    increment(byRiskLevel, candidate.riskLevel);
    increment(byMarketType, candidate.marketType);
    increment(byValueTier, candidate.valueTier);
    candidate.scoringWarnings.forEach((warning) => increment(warnings, warning));
  });

  const sorted = [...safeCandidates].sort((a, b) => b.score - a.score);
  const rejected = safeCandidates
    .filter((candidate) => candidate.candidateStatus === 'rejected' || candidate.riskLevel === 'blocked')
    .sort((a, b) => a.score - b.score);

  return {
    version: VERSION,
    cacheOnly: true,
    totalScored: safeCandidates.length,
    byConfidenceTier,
    byRiskLevel,
    byMarketType,
    byValueTier,
    topSamples: sorted.slice(0, sampleLimit),
    rejectedSamples: rejected.slice(0, sampleLimit),
    warnings: Object.keys(warnings),
    warningCounts: warnings,
  };
}

module.exports = {
  VERSION,
  buildScoringSummary,
  getConfidenceTier,
  getRiskLevel,
  scoreCandidate,
  scoreCandidates,
};
