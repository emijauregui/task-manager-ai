const eventTimingFilterService = require('./eventTimingFilterService');
const lineupGateService = require('./lineupGateService');

const VERSION = 'v2';
const SOURCE = 'odds_ingestion_cache';
const SPORT = 'MLB';

const MARKET_TYPES = {
  h2h: 'team_moneyline',
  spreads: 'team_spread',
  totals: 'game_total',
  pitcher_strikeouts: 'pitcher_prop',
  batter_hits: 'batter_prop',
  batter_total_bases: 'batter_prop',
  batter_hits_runs_rbis: 'batter_prop',
  batter_rbis: 'batter_prop',
  batter_runs_scored: 'batter_prop',
  batter_home_runs: 'batter_prop',
};

const LINE_REQUIRED_MARKETS = new Set([
  'spreads',
  'totals',
  'pitcher_strikeouts',
  'batter_hits',
  'batter_total_bases',
  'batter_hits_runs_rbis',
  'batter_rbis',
  'batter_runs_scored',
  'batter_home_runs',
]);

const BATTER_PROP_MARKETS = new Set([
  'batter_hits',
  'batter_total_bases',
  'batter_hits_runs_rbis',
  'batter_rbis',
  'batter_runs_scored',
  'batter_home_runs',
]);

function uniqueStrings(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyCandidateMarket(odd = {}) {
  return MARKET_TYPES[odd.marketKey] || 'unsupported_market';
}

function buildGameLabel(odd = {}) {
  return [
    odd.awayTeam,
    odd.homeTeam,
  ].filter(Boolean).join(' vs ');
}

function buildCandidateId(odd = {}) {
  return [
    SOURCE,
    odd.id,
    odd.eventId,
    odd.marketKey,
    odd.bookmaker,
    odd.selectionName,
    odd.playerName,
    odd.line,
    odd.decimalOdds,
  ].map(normalizeKey).filter(Boolean).join('__');
}

function calculateImpliedProbability(decimalOdds) {
  const parsed = parseFiniteNumber(decimalOdds);
  if (!parsed || parsed <= 1) {
    return null;
  }

  return Number((1 / parsed).toFixed(4));
}

function buildCorrelationKey(odd = {}) {
  if (!odd.eventId) {
    return '';
  }

  return `event:${odd.eventId}`;
}

function buildBaseCandidate(odd = {}) {
  const decimalOdds = parseFiniteNumber(odd.decimalOdds);
  const price = parseFiniteNumber(odd.price);
  const marketType = classifyCandidateMarket(odd);

  return {
    id: buildCandidateId(odd),
    candidateVersion: VERSION,
    source: SOURCE,
    sport: odd.sport || SPORT,
    eventId: odd.eventId || '',
    gameLabel: buildGameLabel(odd),
    homeTeam: odd.homeTeam || '',
    awayTeam: odd.awayTeam || '',
    commenceTime: odd.commenceTime || '',
    marketKey: odd.marketKey || '',
    marketType,
    selectionName: odd.selectionName || '',
    playerName: odd.playerName || '',
    teamName: odd.teamName || '',
    line: odd.line ?? null,
    price,
    decimalOdds,
    bookmaker: odd.bookmaker || '',
    bookmakerTitle: odd.bookmakerTitle || odd.bookmaker || '',
    impliedProbability: calculateImpliedProbability(decimalOdds),
    freshness: odd.freshness || {
      lastUpdate: '',
      ageMinutes: null,
      status: 'unknown',
    },
    dataQuality: odd.dataQuality || {
      warnings: [],
    },
    riskTags: [],
    correlationKey: buildCorrelationKey(odd),
    candidateStatus: 'candidate',
    rejectionReasons: [],
    notes: [],
  };
}

function buildCandidateRiskTags(candidate = {}) {
  const tags = [];
  const marketKey = candidate.marketKey;
  const freshnessStatus = candidate.freshness?.status || 'unknown';
  const dataQualityWarnings = Array.isArray(candidate.dataQuality?.warnings)
    ? candidate.dataQuality.warnings
    : [];

  if (freshnessStatus === 'stale') {
    tags.push('stale_odds');
  }

  if (freshnessStatus === 'unknown') {
    tags.push('unknown_freshness');
  }

  if (LINE_REQUIRED_MARKETS.has(marketKey) && candidate.line === null) {
    tags.push('missing_line');
  }

  if (candidate.decimalOdds === null || candidate.price === null) {
    tags.push('missing_price');
  }

  if (!candidate.bookmaker) {
    tags.push('missing_bookmaker');
  }

  if (!candidate.eventId) {
    tags.push('missing_event_id');
  }

  if (candidate.decimalOdds !== null && candidate.decimalOdds < 1.1) {
    tags.push('low_value_odds');
  }

  if (marketKey === 'batter_home_runs') {
    tags.push('high_volatility_market');
  }

  if (marketKey === 'pitcher_strikeouts') {
    tags.push('pitcher_k_line');
  }

  if (marketKey === 'batter_hits') {
    tags.push('batter_hit_prop');
  }

  if (marketKey === 'batter_total_bases') {
    tags.push('total_bases_prop');
  }

  if (marketKey === 'totals') {
    tags.push('game_total_market');
  }

  if (marketKey === 'spreads') {
    tags.push('spread_market');
  }

  if (marketKey === 'h2h') {
    tags.push('moneyline_market');
  }

  dataQualityWarnings.forEach((warning) => {
    if (warning === 'missing_line'
      || warning === 'missing_price'
      || warning === 'missing_bookmaker'
      || warning === 'missing_event_id'
      || warning === 'stale_odds'
      || warning === 'unknown_freshness') {
      tags.push(warning);
    }
  });

  return uniqueStrings(tags);
}

function applyLineupGate(candidate = {}, options = {}) {
  const lineupGate = lineupGateService.evaluateLineupForCandidate(candidate, {
    lineupContext: options.lineupContext || {},
  });
  const lineupRiskTag = lineupGate.status === 'not_applicable'
    ? 'lineup_not_applicable'
    : lineupGate.status;

  candidate.lineupGate = lineupGate;
  candidate.riskTags = uniqueStrings([
    ...candidate.riskTags,
    lineupRiskTag,
    ...(lineupGate.status === 'lineup_unknown' || lineupGate.status === 'lineup_projected'
      ? ['lineup_required']
      : []),
  ]);

  return candidate;
}

function applySoftRejections(candidate = {}) {
  const reasons = [];

  if (!candidate.eventId) {
    reasons.push('missing_event_id');
  }

  if (!candidate.marketKey) {
    reasons.push('missing_market_key');
  }

  if (candidate.marketType === 'unsupported_market') {
    reasons.push('unsupported_market');
  }

  if (candidate.price === null || candidate.decimalOdds === null) {
    reasons.push('missing_price');
  } else if (candidate.decimalOdds <= 1) {
    reasons.push('invalid_decimal_odds');
  }

  if (reasons.length) {
    candidate.candidateStatus = 'rejected';
    candidate.rejectionReasons = uniqueStrings([
      ...candidate.rejectionReasons,
      ...reasons,
    ]);
  }

  return candidate;
}

function evaluateCandidateTiming(candidate = {}, options = {}) {
  if (options.applyTiming === false || !candidate.commenceTime) {
    return candidate;
  }

  const timingGate = eventTimingFilterService.evaluateGameTiming({
    eventId: candidate.eventId,
    gameId: candidate.eventId,
    game: candidate.gameLabel,
    awayTeam: candidate.awayTeam,
    homeTeam: candidate.homeTeam,
    commenceTime: candidate.commenceTime,
  }, {
    mode: options.timingMode || 'safe',
    now: options.now,
    timeZone: options.timeZone,
  });

  candidate.timingGate = timingGate;

  if (timingGate.allowed !== true) {
    candidate.candidateStatus = 'rejected';
    candidate.riskTags = uniqueStrings([
      ...candidate.riskTags,
      'timing_blocked',
    ]);
    candidate.rejectionReasons = uniqueStrings([
      ...candidate.rejectionReasons,
      ...timingGate.reasons.map((reason) => `timing_${reason}`),
    ]);
  } else if (timingGate.warnings.length) {
    candidate.riskTags = uniqueStrings([
      ...candidate.riskTags,
      'timing_warning',
    ]);
  }

  return candidate;
}

function generatePickCandidatesFromOdds(normalizedOdds = [], options = {}) {
  return (Array.isArray(normalizedOdds) ? normalizedOdds : []).map((odd) => {
    const candidate = buildBaseCandidate(odd);

    candidate.riskTags = buildCandidateRiskTags(candidate);
    applySoftRejections(candidate);
    evaluateCandidateTiming(candidate, options);
    applyLineupGate(candidate, options);

    if (candidate.riskTags.includes('stale_odds')) {
      candidate.notes.push('Cache odds are stale; candidate is diagnostic only.');
    }

    if (candidate.riskTags.includes('lineup_required')) {
      candidate.notes.push('Player prop needs lineup confirmation before ticket use.');
    }

    if (candidate.riskTags.includes('pitcher_k_line')) {
      candidate.notes.push('Pitcher strikeout line needs matchup and lineup context.');
    }

    return candidate;
  });
}

function increment(target, key, amount = 1) {
  const safeKey = key || 'unknown';
  target[safeKey] = (target[safeKey] || 0) + amount;
}

function buildCandidateSummary(candidates = [], options = {}) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const sampleLimit = Math.max(0, Math.min(20, Number(options.sampleLimit ?? 20)));
  const byMarketType = {};
  const byRiskTag = {};
  const freshness = {
    fresh: 0,
    stale: 0,
    unknown: 0,
  };
  const rejectionReasons = {};

  safeCandidates.forEach((candidate) => {
    increment(byMarketType, candidate.marketType);
    increment(freshness, candidate.freshness?.status || 'unknown');
    candidate.riskTags.forEach((tag) => increment(byRiskTag, tag));
    candidate.rejectionReasons.forEach((reason) => increment(rejectionReasons, reason));
  });

  return {
    version: VERSION,
    cacheOnly: true,
    totalCandidates: safeCandidates.length,
    activeCandidates: safeCandidates.filter((candidate) => candidate.candidateStatus === 'candidate').length,
    rejectedCandidates: safeCandidates.filter((candidate) => candidate.candidateStatus === 'rejected').length,
    byMarketType,
    byRiskTag,
    freshness,
    rejectionReasons,
    samples: safeCandidates.slice(0, sampleLimit),
  };
}

module.exports = {
  VERSION,
  buildCandidateRiskTags,
  buildCandidateSummary,
  classifyCandidateMarket,
  generatePickCandidatesFromOdds,
};
