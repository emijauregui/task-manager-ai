const VERSION = 'v2';
const GENERATED_FROM = 'scoring_engine_v2';

const MODE_CONFIG = {
  safe: {
    minLegs: 2,
    maxLegs: 3,
    minScore: 70,
    allowStale: false,
    allowHighVolatility: false,
    allowLowValue: false,
    allowCorrelation: false,
  },
  emi: {
    minLegs: 2,
    maxLegs: 4,
    minScore: 55,
    allowStale: true,
    allowHighVolatility: false,
    allowLowValue: false,
    allowCorrelation: true,
  },
  free_bet: {
    minLegs: 3,
    maxLegs: 5,
    minScore: 40,
    allowStale: true,
    allowHighVolatility: true,
    allowLowValue: true,
    allowCorrelation: true,
  },
};

function uniqueStrings(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function hasRisk(candidate = {}, tag) {
  return Array.isArray(candidate.riskTags) && candidate.riskTags.includes(tag);
}

function roundNumber(value, digits = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Number(parsed.toFixed(digits));
}

function normalizeMode(mode) {
  return MODE_CONFIG[mode] ? mode : 'safe';
}

function isTimingBlocked(candidate = {}) {
  return hasRisk(candidate, 'timing_blocked')
    || (Array.isArray(candidate.rejectionReasons)
      && candidate.rejectionReasons.some((reason) => String(reason).startsWith('timing_')));
}

function getBaseRejectionReasons(candidates = [], eligible = [], config = {}) {
  const reasons = [];
  const safeCandidates = Array.isArray(candidates) ? candidates : [];

  if (eligible.length < config.minLegs) {
    reasons.push('not_enough_candidates');
  }

  if (safeCandidates.length > 0 && safeCandidates.every((candidate) => hasRisk(candidate, 'stale_odds'))) {
    reasons.push('all_candidates_stale');
  }

  if (safeCandidates.some((candidate) => isTimingBlocked(candidate))) {
    reasons.push('timing_gate_blocked_games');
  }

  if (!safeCandidates.some((candidate) => candidate.score >= config.minScore)) {
    reasons.push('score_threshold_not_met');
  }

  return uniqueStrings(reasons);
}

function isEligibleForMode(candidate = {}, mode = 'safe') {
  const config = MODE_CONFIG[normalizeMode(mode)];

  if (candidate.candidateStatus !== 'candidate') {
    return false;
  }

  if (isTimingBlocked(candidate)) {
    return false;
  }

  if (!Number.isFinite(Number(candidate.score)) || Number(candidate.score) < config.minScore) {
    return false;
  }

  if (!Number.isFinite(Number(candidate.decimalOdds)) || Number(candidate.decimalOdds) <= 1) {
    return false;
  }

  if (!config.allowStale && hasRisk(candidate, 'stale_odds')) {
    return false;
  }

  if (!config.allowHighVolatility && hasRisk(candidate, 'high_volatility_market')) {
    return false;
  }

  if (!config.allowLowValue && hasRisk(candidate, 'low_value_odds')) {
    return false;
  }

  return true;
}

function isTeamMoneyline(leg = {}) {
  return leg.marketType === 'team_moneyline' || leg.marketKey === 'h2h';
}

function isPlayerProp(leg = {}) {
  return String(leg.marketType || '').includes('prop') && Boolean(leg.playerName);
}

function isGameTotal(leg = {}) {
  return leg.marketType === 'game_total' || leg.marketKey === 'totals';
}

function detectBasicCorrelation(legs = []) {
  const safeLegs = Array.isArray(legs) ? legs : [];
  const warnings = [];
  const details = [];
  let correlationScore = 0;

  for (let leftIndex = 0; leftIndex < safeLegs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < safeLegs.length; rightIndex += 1) {
      const left = safeLegs[leftIndex];
      const right = safeLegs[rightIndex];

      if (left.eventId && left.eventId === right.eventId) {
        warnings.push('same_game_correlation');
        correlationScore += 2;
        details.push({
          type: 'same_game_correlation',
          eventId: left.eventId,
          legs: [left.candidateId, right.candidateId],
        });
      }

      if (left.teamName && right.teamName && left.teamName === right.teamName) {
        warnings.push('same_team_exposure');
        correlationScore += 1;
        details.push({
          type: 'same_team_exposure',
          teamName: left.teamName,
          legs: [left.candidateId, right.candidateId],
        });
      }

      if (left.playerName && right.playerName && left.playerName === right.playerName) {
        warnings.push('same_player_exposure');
        correlationScore += 2;
        details.push({
          type: 'same_player_exposure',
          playerName: left.playerName,
          legs: [left.candidateId, right.candidateId],
        });
      }

      const moneylinePlayerPair = (isTeamMoneyline(left) && isPlayerProp(right))
        || (isTeamMoneyline(right) && isPlayerProp(left));
      if (moneylinePlayerPair
        && left.eventId
        && left.eventId === right.eventId
        && left.teamName
        && right.teamName
        && left.teamName === right.teamName) {
        warnings.push('same_team_exposure');
        correlationScore += 1;
      }

      const totalBatterPair = (isGameTotal(left) && isPlayerProp(right))
        || (isGameTotal(right) && isPlayerProp(left));
      if (totalBatterPair && left.eventId && left.eventId === right.eventId) {
        warnings.push('same_game_correlation');
        correlationScore += 1;
      }
    }
  }

  return {
    correlationScore,
    warnings: uniqueStrings(warnings),
    details,
  };
}

function toTicketLeg(candidate = {}) {
  return {
    candidateId: candidate.id,
    eventId: candidate.eventId || '',
    gameLabel: candidate.gameLabel || '',
    marketKey: candidate.marketKey || '',
    marketType: candidate.marketType || '',
    selectionName: candidate.selectionName || '',
    playerName: candidate.playerName || '',
    teamName: candidate.teamName || '',
    line: candidate.line ?? null,
    decimalOdds: candidate.decimalOdds ?? null,
    bookmakerTitle: candidate.bookmakerTitle || '',
    score: candidate.score ?? 0,
    confidenceTier: candidate.confidenceTier || 'F',
    riskTags: Array.isArray(candidate.riskTags) ? candidate.riskTags : [],
  };
}

function sortCandidates(candidates = []) {
  return [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return Number(left.decimalOdds || 999) - Number(right.decimalOdds || 999);
  });
}

function selectLegsForMode(candidates = [], mode = 'safe') {
  const config = MODE_CONFIG[normalizeMode(mode)];
  const selected = [];
  const eligible = sortCandidates(candidates.filter((candidate) => isEligibleForMode(candidate, mode)));

  for (const candidate of eligible) {
    const candidateLeg = toTicketLeg(candidate);
    const nextLegs = [...selected, candidateLeg];
    const correlation = detectBasicCorrelation(nextLegs);

    if (!config.allowCorrelation && correlation.correlationScore > 0) {
      continue;
    }

    selected.push(candidateLeg);

    if (selected.length >= config.maxLegs) {
      break;
    }
  }

  return {
    eligible,
    selected,
  };
}

function calculateTotalOdds(legs = []) {
  if (!legs.length) {
    return null;
  }

  const total = legs.reduce((product, leg) => product * Number(leg.decimalOdds || 1), 1);
  return roundNumber(total, 3);
}

function evaluateTicketRisk(legs = [], mode = 'safe') {
  const correlation = detectBasicCorrelation(legs);
  const tags = legs.flatMap((leg) => Array.isArray(leg.riskTags) ? leg.riskTags : []);

  if (tags.includes('timing_blocked')) {
    return 'blocked';
  }

  if (mode === 'free_bet'
    || tags.includes('high_volatility_market')
    || tags.includes('low_value_odds')
    || tags.includes('stale_odds')
    || correlation.correlationScore >= 3) {
    return 'high';
  }

  if (mode === 'emi'
    || tags.includes('lineup_required')
    || tags.includes('pitcher_k_line')
    || tags.includes('batter_hit_prop')
    || tags.includes('total_bases_prop')
    || correlation.correlationScore > 0) {
    return 'medium';
  }

  return 'low';
}

function buildNoTicket(mode, candidates = [], eligible = [], extraReasons = []) {
  const config = MODE_CONFIG[normalizeMode(mode)];

  return {
    ticketBuilderVersion: VERSION,
    mode,
    status: 'no_ticket',
    legs: [],
    totalDecimalOdds: null,
    estimatedMultiplier: null,
    riskLevel: 'blocked',
    correlationScore: 0,
    warnings: [],
    rejectionReasons: uniqueStrings([
      ...getBaseRejectionReasons(candidates, eligible, config),
      ...extraReasons,
    ]),
    metadata: {
      cacheOnly: true,
      generatedFrom: GENERATED_FROM,
      totalCandidatesConsidered: candidates.length,
      eligibleCandidates: eligible.length,
      rejectedCandidates: candidates.filter((candidate) => candidate.candidateStatus === 'rejected').length,
    },
  };
}

function buildTicketForMode(scoredCandidates = [], mode = 'safe', options = {}) {
  const normalizedMode = normalizeMode(mode);
  const config = MODE_CONFIG[normalizedMode];
  const candidates = Array.isArray(scoredCandidates) ? scoredCandidates : [];
  const { eligible, selected } = selectLegsForMode(candidates, normalizedMode);

  if (selected.length < config.minLegs) {
    return buildNoTicket(normalizedMode, candidates, eligible);
  }

  const correlation = detectBasicCorrelation(selected);
  if (!config.allowCorrelation && correlation.correlationScore > 0) {
    return buildNoTicket(normalizedMode, candidates, eligible, ['same_game_correlation']);
  }

  const warnings = [...correlation.warnings];
  if (selected.some((leg) => leg.riskTags.includes('stale_odds'))) {
    warnings.push('stale_odds_present');
  }

  if (selected.some((leg) => leg.riskTags.includes('lineup_required'))) {
    warnings.push('lineup_required');
  }

  const totalDecimalOdds = calculateTotalOdds(selected);

  return {
    ticketBuilderVersion: VERSION,
    mode: normalizedMode,
    status: 'ticket_candidate',
    legs: selected,
    totalDecimalOdds,
    estimatedMultiplier: totalDecimalOdds,
    riskLevel: evaluateTicketRisk(selected, normalizedMode),
    correlationScore: correlation.correlationScore,
    warnings: uniqueStrings(warnings),
    rejectionReasons: [],
    metadata: {
      cacheOnly: true,
      generatedFrom: GENERATED_FROM,
      totalCandidatesConsidered: candidates.length,
      eligibleCandidates: eligible.length,
      rejectedCandidates: candidates.filter((candidate) => candidate.candidateStatus === 'rejected').length,
      maxLegs: options.maxLegs || config.maxLegs,
      correlationDetails: correlation.details.slice(0, 12),
    },
  };
}

function buildTicketsFromScoredCandidates(scoredCandidates = [], options = {}) {
  const modes = {
    safe: buildTicketForMode(scoredCandidates, 'safe', options),
    emi: buildTicketForMode(scoredCandidates, 'emi', options),
    free_bet: buildTicketForMode(scoredCandidates, 'free_bet', options),
  };
  const result = {
    version: VERSION,
    cacheOnly: true,
    modes,
    warnings: uniqueStrings(Object.values(modes).flatMap((ticket) => ticket.warnings || [])),
  };

  return {
    ...result,
    summary: buildTicketBuilderSummary(result),
  };
}

function increment(target, key, amount = 1) {
  const safeKey = key || 'unknown';
  target[safeKey] = (target[safeKey] || 0) + amount;
}

function buildTicketBuilderSummary(result = {}) {
  const tickets = Object.values(result.modes || {});
  const byStatus = {};
  const byRiskLevel = {};
  const rejectionReasons = {};
  const warnings = {};

  tickets.forEach((ticket) => {
    increment(byStatus, ticket.status);
    increment(byRiskLevel, ticket.riskLevel);
    (ticket.rejectionReasons || []).forEach((reason) => increment(rejectionReasons, reason));
    (ticket.warnings || []).forEach((warning) => increment(warnings, warning));
  });

  return {
    totalModes: tickets.length,
    ticketCandidates: tickets.filter((ticket) => ticket.status === 'ticket_candidate').length,
    noTicket: tickets.filter((ticket) => ticket.status === 'no_ticket').length,
    byStatus,
    byRiskLevel,
    rejectionReasons,
    warnings,
  };
}

module.exports = {
  VERSION,
  buildTicketBuilderSummary,
  buildTicketForMode,
  buildTicketsFromScoredCandidates,
  detectBasicCorrelation,
  evaluateTicketRisk,
};
