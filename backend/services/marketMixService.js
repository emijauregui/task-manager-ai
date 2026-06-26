const MAX_MONEYLINES_BY_TICKET = {
  safe: 2,
  emi: 2,
  free_bet: 3,
};

const TICKET_MAX_COUNTS = {
  safe: 3,
  emi: 3,
  free_bet: 5,
};

const TICKET_MIN_COUNTS = {
  safe: 2,
  emi: 3,
  free_bet: 4,
};

const VOID_RANK = {
  low: 0,
  medium: 1,
  high: 2,
};

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function candidateKey(candidate) {
  return [
    normalizeKey(candidate?.game),
    normalizeKey(candidate?.pick),
    normalizeKey(candidate?.market),
  ].join('|');
}

function preferredMarketMatchesCategory(candidate) {
  const preferredMarket = String(candidate?.preferredMarket || '').toLowerCase();
  const category = String(candidate?.marketCategory || '').toLowerCase();

  if (!preferredMarket) {
    return true;
  }

  if (preferredMarket === 'h2h') {
    return category === 'moneyline';
  }

  if (preferredMarket === 'spread') {
    return category === 'spread';
  }

  return false;
}

function getGameKey(candidate) {
  return normalizeKey(candidate?.game);
}

function marketCategoryFromKey(market) {
  switch (String(market || '').toLowerCase()) {
    case 'h2h':
      return 'moneyline';
    case 'spreads':
      return 'spread';
    case 'totals':
      return 'total';
    case 'batter_hits':
      return 'player_hit';
    case 'batter_total_bases':
      return 'player_total_bases';
    case 'batter_runs_scored':
      return 'player_runs';
    case 'batter_rbis':
      return 'player_rbi';
    case 'batter_hits_runs_rbis':
      return 'player_hrr';
    case 'pitcher_strikeouts':
      return 'pitcher_strikeouts';
    case 'pitcher_hits_allowed':
      return 'pitcher_hits_allowed';
    default:
      return String(market || '').startsWith('batter_') || String(market || '').startsWith('pitcher_')
        ? 'other_player_prop'
        : 'other_player_prop';
  }
}

function isPlayerPropCategory(category) {
  return [
    'player_hit',
    'player_total_bases',
    'player_runs',
    'player_rbi',
    'player_hrr',
    'pitcher_strikeouts',
    'pitcher_hits_allowed',
    'other_player_prop',
  ].includes(category);
}

function getVolatilityLabel(score) {
  if (score >= 75) {
    return 'high';
  }

  if (score >= 45) {
    return 'medium';
  }

  return 'low';
}

function buildCorrelationGroup(candidate, category) {
  if (isPlayerPropCategory(category)) {
    return `player:${normalizeKey(candidate.candidateTeam || candidate.playerTeam || '')}`;
  }

  return `game:${getGameKey(candidate)}`;
}

function getBaseScoring(candidate, category) {
  const odds = Number(candidate.oddsDecimal);
  const lineupConfirmed = candidate.lineupConfidence === 'confirmed';
  const pickText = String(candidate.pick || '').toLowerCase();
  const plusOneFive = pickText.includes('+1.5') || pickText.includes('+ 1.5');
  const negativeOneFive = pickText.includes('-1.5') || pickText.includes('- 1.5');

  if (category === 'moneyline') {
    if (Number.isFinite(odds) && odds >= 1.7 && odds <= 2.1) {
      return {
        confidenceScore: 25,
        volatilityScore: 26,
        recommendedFor: ['safe', 'emi', 'free_bet'],
      };
    }

    if (Number.isFinite(odds) && odds > 2.1) {
      return {
        confidenceScore: 8,
        volatilityScore: 82,
        recommendedFor: ['emi', 'free_bet'],
      };
    }

    return {
      confidenceScore: 18,
      volatilityScore: 32,
      recommendedFor: ['safe', 'emi', 'free_bet'],
    };
  }

  if (category === 'spread') {
    if (plusOneFive) {
      return {
        confidenceScore: 20,
        volatilityScore: 34,
        recommendedFor: ['safe', 'emi', 'free_bet'],
      };
    }

    return {
      confidenceScore: negativeOneFive ? 8 : 14,
      volatilityScore: negativeOneFive ? 68 : 48,
      recommendedFor: negativeOneFive ? ['free_bet'] : ['emi', 'free_bet'],
    };
  }

  if (category === 'total') {
    return {
      confidenceScore: 10,
      volatilityScore: 52,
      recommendedFor: ['safe', 'emi', 'free_bet'],
    };
  }

  if (category === 'player_hit') {
    return {
      confidenceScore: lineupConfirmed ? 22 : 12,
      volatilityScore: lineupConfirmed ? 34 : 62,
      recommendedFor: lineupConfirmed ? ['safe', 'emi', 'free_bet'] : ['emi', 'free_bet'],
    };
  }

  if (category === 'player_total_bases') {
    return {
      confidenceScore: lineupConfirmed ? 20 : 11,
      volatilityScore: lineupConfirmed ? 42 : 68,
      recommendedFor: lineupConfirmed ? ['emi', 'free_bet'] : ['free_bet'],
    };
  }

  if (category === 'pitcher_strikeouts') {
    return {
      confidenceScore: 18,
      volatilityScore: 46,
      recommendedFor: ['emi', 'free_bet'],
    };
  }

  if (category === 'player_runs' || category === 'player_rbi') {
    return {
      confidenceScore: 9,
      volatilityScore: 74,
      recommendedFor: ['free_bet'],
    };
  }

  if (category === 'player_hrr') {
    return {
      confidenceScore: 5,
      volatilityScore: 90,
      recommendedFor: ['free_bet'],
    };
  }

  return {
    confidenceScore: 8,
    volatilityScore: 64,
    recommendedFor: isPlayerPropCategory(category) ? ['free_bet'] : ['emi', 'free_bet'],
  };
}

function annotateCandidate(candidate) {
  const marketCategory = marketCategoryFromKey(candidate.market);
  const base = getBaseScoring(candidate, marketCategory);

  return {
    ...candidate,
    marketCategory,
    confidenceScore: Number(candidate.confidenceScore ?? base.confidenceScore),
    valueScore: Number(candidate.valueScore ?? 50),
    volatilityScore: Number(candidate.volatilityScore ?? base.volatilityScore),
    volatilityLabel: getVolatilityLabel(Number(candidate.volatilityScore ?? base.volatilityScore)),
    lineupRequired: candidate.lineupRequired === true || isPlayerPropCategory(marketCategory),
    correlationGroup: buildCorrelationGroup(candidate, marketCategory),
    recommendedFor: Array.isArray(candidate.recommendedFor) && candidate.recommendedFor.length > 0
      ? candidate.recommendedFor
      : base.recommendedFor,
  };
}

function ticketPriorityBoost(ticketType, candidate) {
  const category = candidate.marketCategory;
  const odds = Number(candidate.oddsDecimal);
  const pickText = String(candidate.pick || '').toLowerCase();
  const plusOneFive = pickText.includes('+1.5') || pickText.includes('+ 1.5');
  const negativeOneFive = pickText.includes('-1.5') || pickText.includes('- 1.5');

  if (ticketType === 'safe') {
    if (candidate.preferredMarket === 'spread' && category === 'spread') {
      return 18;
    }

    if (candidate.preferredMarket === 'spread' && category === 'moneyline') {
      return -24;
    }

    if (category === 'moneyline' && odds <= 1.95) {
      return 28;
    }

    if (category === 'spread' && plusOneFive) {
      return 26;
    }

    if (category === 'total' && odds >= 1.75 && odds <= 1.95) {
      return 14;
    }

    if (category === 'spread' && negativeOneFive) {
      return -10;
    }

    if (category === 'moneyline' && odds > 2.05) {
      return -12;
    }
  }

  if (ticketType === 'emi') {
    if (candidate.preferredMarket === 'spread' && category === 'spread') {
      return 12;
    }

    if (candidate.preferredMarket === 'spread' && category === 'moneyline') {
      return -14;
    }

    if (category === 'moneyline' && odds >= 1.7 && odds <= 2.1) {
      return 24;
    }

    if (category === 'spread' && plusOneFive && odds >= 1.4 && odds <= 1.75) {
      return 24;
    }

    if (category === 'total' && odds >= 1.75 && odds <= 1.95) {
      return 16;
    }

    if (category === 'moneyline' && odds >= 1.9 && odds <= 2.25) {
      return 12;
    }
  }

  if (ticketType === 'free_bet') {
    if (candidate.preferredMarket === 'spread' && category === 'spread') {
      return 8;
    }

    if (isPlayerPropCategory(category)) {
      return 24;
    }

    if (category === 'moneyline' && odds >= 1.65 && odds <= 2.1) {
      return 16;
    }

    if (category === 'spread') {
      return 12;
    }

    if (category === 'total') {
      return 12;
    }

    if (category === 'moneyline' && odds > 2.1) {
      return 8;
    }
  }

  return 0;
}

function candidateScoreForTicket(ticketType, candidate) {
  return (candidate.confidenceScore || 0)
    + ticketPriorityBoost(ticketType, candidate)
    - ((candidate.volatilityScore || 0) / 6)
    + (candidate.voidRisk === 'low' ? 6 : candidate.voidRisk === 'medium' ? 2 : -4);
}

function compareCandidates(ticketType, left, right) {
  const leftScore = candidateScoreForTicket(ticketType, left);
  const rightScore = candidateScoreForTicket(ticketType, right);

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  const leftVoid = VOID_RANK[left.voidRisk] ?? 3;
  const rightVoid = VOID_RANK[right.voidRisk] ?? 3;
  if (leftVoid !== rightVoid) {
    return leftVoid - rightVoid;
  }

  return normalizeKey(left.pick).localeCompare(normalizeKey(right.pick));
}

function sortCandidatesForTicket(candidates, ticketType) {
  return [...candidates].sort((left, right) => compareCandidates(ticketType, left, right));
}

function createSelectionContext(ticketType) {
  return {
    ticketType,
    selected: [],
    usedGames: new Set(),
    usedKeys: new Set(),
    usedPropTeams: new Set(),
    moneylines: 0,
    categoryCounts: {},
    highVolatility: 0,
    mediumRiskSpreads: 0,
    rejectedLowConfidence: 0,
    rejectedCorrelations: [],
  };
}

function recordRejectedCorrelation(context, candidate, reason) {
  context.rejectedCorrelations.push({
    ticketType: context.ticketType,
    game: candidate.game,
    pick: candidate.pick,
    market: candidate.market,
    reason,
  });
}

function canUseCandidate(context, candidate) {
  if (context.ticketType === 'safe' && Number(candidate.confidenceScore || 0) < 60) {
    context.rejectedLowConfidence += 1;
    recordRejectedCorrelation(context, candidate, 'safe_low_confidence');
    return false;
  }

  if (context.ticketType === 'emi' && Number(candidate.confidenceScore || 0) < 58) {
    context.rejectedLowConfidence += 1;
    recordRejectedCorrelation(context, candidate, 'emi_low_confidence');
    return false;
  }

  if (context.ticketType === 'free_bet' && Number(candidate.confidenceScore || 0) < 50 && Number(candidate.valueScore || 0) < 62) {
    context.rejectedLowConfidence += 1;
    recordRejectedCorrelation(context, candidate, 'free_bet_low_confidence');
    return false;
  }

  if (context.ticketType === 'safe' && candidate.closeGameRisk === 'high') {
    recordRejectedCorrelation(context, candidate, 'safe_avoids_high_close_game_risk');
    return false;
  }

  const gameKey = getGameKey(candidate);
  if (context.usedGames.has(gameKey)) {
    recordRejectedCorrelation(context, candidate, 'one_pick_per_game');
    return false;
  }

  if (context.usedKeys.has(candidateKey(candidate))) {
    return false;
  }

  if (
    candidate.marketCategory === 'moneyline'
    && context.moneylines >= MAX_MONEYLINES_BY_TICKET[context.ticketType]
  ) {
    recordRejectedCorrelation(context, candidate, 'moneyline_limit');
    return false;
  }

  if (context.ticketType === 'safe' && candidate.volatilityLabel === 'high' && context.highVolatility >= 1) {
    recordRejectedCorrelation(context, candidate, 'high_volatility_limit');
    return false;
  }

  if (
    context.ticketType === 'safe'
    && candidate.marketCategory === 'spread'
    && candidate.voidRisk === 'medium'
    && context.mediumRiskSpreads >= 1
  ) {
    recordRejectedCorrelation(context, candidate, 'safe_medium_spread_limit');
    return false;
  }

  if (
    context.ticketType === 'safe'
    && candidate.marketCategory === 'total'
    && Number(context.categoryCounts.total || 0) >= 1
  ) {
    recordRejectedCorrelation(context, candidate, 'safe_total_limit');
    return false;
  }

  if (
    context.ticketType === 'safe'
    && candidate.candidateType === 'player_prop'
    && candidate.lineupConfidence !== 'confirmed'
  ) {
    recordRejectedCorrelation(context, candidate, 'safe_requires_lineup_confidence');
    return false;
  }

  if (
    context.ticketType === 'safe'
    && candidate.candidateType === 'player_prop'
    && candidate.voidRisk === 'high'
  ) {
    recordRejectedCorrelation(context, candidate, 'safe_avoids_high_risk_props');
    return false;
  }

  if (context.ticketType === 'safe' && candidate.marketCategory === 'moneyline' && candidate.preferredMarket === 'spread') {
    recordRejectedCorrelation(context, candidate, 'safe_prefers_protected_spread');
    return false;
  }

  if (
    context.ticketType === 'emi'
    && candidate.marketCategory === 'moneyline'
    && candidate.preferredMarket === 'spread'
    && Number(candidate.confidenceScore || 0) < 72
  ) {
    recordRejectedCorrelation(context, candidate, 'emi_prefers_spread_unless_high_confidence_ml');
    return false;
  }

  if (isPlayerPropCategory(candidate.marketCategory)) {
    const teamKey = normalizeKey(candidate.candidateTeam);
    if (teamKey && context.usedPropTeams.has(teamKey)) {
      recordRejectedCorrelation(context, candidate, 'same_team_player_prop');
      return false;
    }
  }

  return true;
}

function addCandidate(context, candidate) {
  context.selected.push(candidate);
  context.usedGames.add(getGameKey(candidate));
  context.usedKeys.add(candidateKey(candidate));
  context.categoryCounts[candidate.marketCategory] = (context.categoryCounts[candidate.marketCategory] || 0) + 1;

  if (candidate.marketCategory === 'moneyline') {
    context.moneylines += 1;
  }

  if (candidate.volatilityLabel === 'high') {
    context.highVolatility += 1;
  }

  if (candidate.marketCategory === 'spread' && candidate.voidRisk === 'medium') {
    context.mediumRiskSpreads += 1;
  }

  if (isPlayerPropCategory(candidate.marketCategory) && candidate.candidateTeam) {
    context.usedPropTeams.add(normalizeKey(candidate.candidateTeam));
  }
}

function pickBestByFilter(candidates, context, predicate) {
  const sorted = sortCandidatesForTicket(candidates, context.ticketType);

  for (const candidate of sorted) {
    if (!predicate(candidate)) {
      continue;
    }

    if (!canUseCandidate(context, candidate)) {
      continue;
    }

    addCandidate(context, candidate);
    return candidate;
  }

  return null;
}

function fillRemaining(candidates, context, limit) {
  const sorted = sortCandidatesForTicket(candidates, context.ticketType);

  for (const candidate of sorted) {
    if (context.selected.length >= limit) {
      break;
    }

    if (!canUseCandidate(context, candidate)) {
      continue;
    }

    addCandidate(context, candidate);
  }
}

function buildStructuredSelection(ticketType, candidates, propsAvailable) {
  const context = createSelectionContext(ticketType);
  const target = TICKET_MAX_COUNTS[ticketType];
  const reasonableProp = (candidate) => (
    isPlayerPropCategory(candidate.marketCategory)
    && ['pitcher_strikeouts', 'player_hit', 'player_total_bases'].includes(String(candidate.marketCategory || ''))
  );

  if (ticketType === 'safe') {
    pickBestByFilter(candidates, context, (candidate) => (
      candidate.marketCategory === 'spread'
      && candidate.preferredMarket === 'spread'
      && String(candidate.pick || '').includes('+1.5')
    ));
    pickBestByFilter(candidates, context, (candidate) => (
      candidate.marketCategory === 'moneyline'
      && Number(candidate.oddsDecimal) <= 1.95
      && candidate.preferredMarket !== 'spread'
    ));
    pickBestByFilter(candidates, context, (candidate) => (
      candidate.marketCategory === 'spread'
      && String(candidate.pick || '').includes('+1.5')
    ));
    pickBestByFilter(candidates, context, (candidate) => (
      candidate.marketCategory === 'total'
      || candidate.marketCategory === 'moneyline'
    ));
    fillRemaining(candidates, context, target);
    return context;
  }

  if (ticketType === 'emi') {
    if (propsAvailable) {
      pickBestByFilter(candidates, context, (candidate) => reasonableProp(candidate));
    } else {
      pickBestByFilter(candidates, context, (candidate) => (
        candidate.marketCategory === 'moneyline'
        && candidate.preferredMarket !== 'spread'
      ));
    }
    pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'spread');
    pickBestByFilter(candidates, context, (candidate) => (
      candidate.marketCategory === 'moneyline'
      && candidate.preferredMarket !== 'spread'
    ));
    if (propsAvailable) {
      pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'total');
    } else {
      pickBestByFilter(candidates, context, (candidate) => (
        candidate.marketCategory === 'total'
        || candidate.marketCategory === 'moneyline'
      ));
    }
    fillRemaining(candidates, context, target);
    return context;
  }

  if (propsAvailable) {
    pickBestByFilter(candidates, context, (candidate) => reasonableProp(candidate));
    pickBestByFilter(candidates, context, (candidate) => reasonableProp(candidate));
    pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'spread');
    pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'moneyline');
    pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'total');
  } else {
    pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'moneyline');
    pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'moneyline');
    pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'spread');
    pickBestByFilter(candidates, context, (candidate) => candidate.marketCategory === 'total');
  }
  fillRemaining(candidates, context, target);
  return context;
}

function buildCandidateIndex(candidates = []) {
  const index = new Map();
  candidates.forEach((candidate) => {
    index.set(candidateKey(candidate), candidate);
  });
  return index;
}

function buildRecommendedByTicket(candidates, propsAvailable) {
  const rejectedCorrelations = [];
  const diversity = {
    onePickPerGameApplied: true,
    maxMoneyLinesByTicket: { ...MAX_MONEYLINES_BY_TICKET },
    ticketCategoryMix: {
      safe: {},
      emi: {},
      free_bet: {},
    },
  };

  const recommendedByTicket = {
    safe: [],
    emi: [],
    free_bet: [],
  };

  ['safe', 'emi', 'free_bet'].forEach((ticketType) => {
    const context = buildStructuredSelection(ticketType, candidates, propsAvailable);
    recommendedByTicket[ticketType] = context.selected.map((candidate) => ({
      candidateId: candidate.candidateId || '',
      game: candidate.game,
      pick: candidate.pick,
      market: candidate.market,
      marketCategory: candidate.marketCategory,
    }));
    diversity.ticketCategoryMix[ticketType] = { ...context.categoryCounts };
    diversity[`${ticketType}RejectedLowConfidence`] = context.rejectedLowConfidence;
    rejectedCorrelations.push(...context.rejectedCorrelations);
  });

  return {
    recommendedByTicket,
    diversity,
    rejectedCorrelations,
  };
}

function buildDiagnostics(candidates) {
  const categoriesAvailable = {};
  const propsAvailable = candidates.some((candidate) => isPlayerPropCategory(candidate.marketCategory));

  candidates.forEach((candidate) => {
    categoriesAvailable[candidate.marketCategory] = (categoriesAvailable[candidate.marketCategory] || 0) + 1;
  });

  const structured = buildRecommendedByTicket(candidates, propsAvailable);

  return {
    categoriesAvailable,
    propsAvailable,
    recommendedByTicket: structured.recommendedByTicket,
    diversity: structured.diversity,
    rejectedCorrelations: structured.rejectedCorrelations.slice(0, 30),
    rejectedLowConfidence: (
      Number(structured.diversity.safeRejectedLowConfidence || 0)
      + Number(structured.diversity.emiRejectedLowConfidence || 0)
      + Number(structured.diversity.free_betRejectedLowConfidence || 0)
    ),
  };
}

function applyMarketMixStrategy(candidates = []) {
  const annotatedCandidates = candidates.map(annotateCandidate);

  return {
    candidates: annotatedCandidates,
    diagnostics: buildDiagnostics(annotatedCandidates),
  };
}

function findCandidateForLeg(leg, candidateIndex, candidates = []) {
  const key = [
    normalizeKey(leg?.game || leg?.g),
    normalizeKey(leg?.pick || leg?.p),
    normalizeKey(leg?.market || leg?.m),
  ].join('|');

  const exact = candidateIndex.get(key);
  if (exact) {
    return exact;
  }

  return candidates.find((candidate) => (
    normalizeKey(candidate.game) === normalizeKey(leg?.game || leg?.g)
    && normalizeKey(candidate.pick) === normalizeKey(leg?.pick || leg?.p)
    && normalizeKey(candidate.market) === normalizeKey(leg?.market || leg?.m)
  )) || null;
}

function addWarning(container, message) {
  if (!message) {
    return;
  }

  const warnings = new Set(Array.isArray(container.warnings) ? container.warnings : []);
  warnings.add(message);
  container.warnings = Array.from(warnings);
}

function buildLegFromCandidate(candidate, previousLeg = {}) {
  return {
    ...previousLeg,
    candidateId: candidate.candidateId || previousLeg.candidateId || previousLeg.id || '',
    game: candidate.game,
    pick: candidate.pick,
    market: candidate.market,
    odds: Number(candidate.oddsDecimal).toFixed(2),
    candidateType: candidate.candidateType,
    candidateTeam: candidate.candidateTeam || '',
    lineupRequired: candidate.lineupRequired === true,
    voidRisk: candidate.voidRisk || 'low',
    confidence: candidate.confidenceScore || 60,
    ruleWarnings: candidate.ruleWarnings || [],
    teamResolved: candidate.teamResolved === true,
    oddsVerified: candidate.oddsVerified !== false,
    protected: candidate.protectionSuggested === true,
    marketProtectionApplied: candidate.protectionSuggested === true,
    protectionReason: candidate.protectionSuggested === true ? (candidate.protectionReason || '') : '',
    historicalInfluenceApplied: candidate.historicalInfluenceApplied === true,
    historicalBoostApplied: candidate.historicalBoostApplied === true,
    historicalPenaltyApplied: candidate.historicalPenaltyApplied === true,
    historicalInfluenceReason: String(candidate.historicalInfluenceReason || '').trim(),
    historicalConfidenceDelta: Number(candidate.historicalConfidenceDelta || 0),
    historicalInfluenceWarnings: Array.isArray(candidate.historicalInfluenceWarnings)
      ? candidate.historicalInfluenceWarnings
      : [],
  };
}

function summarizeTicketState(ticketItem, candidates) {
  const candidateIndex = buildCandidateIndex(candidates);
  const entries = (ticketItem.legs || [])
    .map((leg) => ({
      leg,
      candidate: findCandidateForLeg(leg, candidateIndex, candidates),
    }))
    .filter((entry) => entry.candidate);

  const usedGames = new Set(entries.map((entry) => getGameKey(entry.candidate)));
  const usedKeys = new Set(entries.map((entry) => candidateKey(entry.candidate)));
  const usedPropTeams = new Set(entries
    .filter((entry) => isPlayerPropCategory(entry.candidate.marketCategory))
    .map((entry) => normalizeKey(entry.candidate.candidateTeam)));

  return {
    candidateIndex,
    entries,
    usedGames,
    usedKeys,
    usedPropTeams,
    moneylines: entries.filter((entry) => entry.candidate.marketCategory === 'moneyline').length,
  };
}

function enforceOnePickPerGame(ticketItem, candidates = []) {
  const candidateIndex = buildCandidateIndex(candidates);
  const groupedByGame = new Map();
  const warnings = new Set(Array.isArray(ticketItem.warnings) ? ticketItem.warnings : []);

  (ticketItem.legs || []).forEach((leg) => {
    const candidate = findCandidateForLeg(leg, candidateIndex, candidates);
    if (!candidate) {
      return;
    }

    const key = getGameKey(candidate);
    const current = groupedByGame.get(key) || [];
    current.push({ leg, candidate });
    groupedByGame.set(key, current);
  });

  const kept = [];
  groupedByGame.forEach((entries) => {
    entries.sort((left, right) => compareCandidates(ticketItem.type, left.candidate, right.candidate));
    kept.push(entries[0]);
    if (entries.length > 1) {
      warnings.add('Se elimino correlacion por juego repetido.');
    }
  });

  return {
    ...ticketItem,
    legs: kept.map((entry) => buildLegFromCandidate(entry.candidate, entry.leg)),
    warnings: Array.from(warnings),
  };
}

function pickReplacementCandidate(ticketType, candidates, state, predicate) {
  const sorted = sortCandidatesForTicket(candidates, ticketType);

  return sorted.find((candidate) => {
    if (!predicate(candidate)) {
      return false;
    }

    if (state.usedGames.has(getGameKey(candidate))) {
      return false;
    }

    if (state.usedKeys.has(candidateKey(candidate))) {
      return false;
    }

    if (
      candidate.marketCategory === 'moneyline'
      && state.moneylines >= MAX_MONEYLINES_BY_TICKET[ticketType]
    ) {
      return false;
    }

    if (ticketType === 'safe' && candidate.candidateType === 'player_prop' && candidate.lineupConfidence !== 'confirmed') {
      return false;
    }

    if (isPlayerPropCategory(candidate.marketCategory)) {
      const teamKey = normalizeKey(candidate.candidateTeam);
      if (teamKey && state.usedPropTeams.has(teamKey)) {
        return false;
      }
    }

    return true;
  }) || null;
}

function replaceWorstMatchingLeg(ticketItem, candidates, replacementPredicate, targetPredicate, warningText) {
  const state = summarizeTicketState(ticketItem, candidates);
  const matchingEntries = state.entries.filter((entry) => targetPredicate(entry.candidate));
  if (!matchingEntries.length) {
    return ticketItem;
  }

  const orderedEntries = [...matchingEntries]
    .sort((left, right) => compareCandidates(ticketItem.type, left.candidate, right.candidate))
    .reverse();

  for (const targetEntry of orderedEntries) {
    const otherEntries = state.entries.filter((entry) => entry !== targetEntry);
    const replacementState = {
      usedGames: new Set(otherEntries.map((entry) => getGameKey(entry.candidate))),
      usedKeys: new Set(otherEntries.map((entry) => candidateKey(entry.candidate))),
      usedPropTeams: new Set(otherEntries
        .filter((entry) => isPlayerPropCategory(entry.candidate.marketCategory))
        .map((entry) => normalizeKey(entry.candidate.candidateTeam))),
      moneylines: otherEntries.filter((entry) => entry.candidate.marketCategory === 'moneyline').length,
    };

    const replacement = pickReplacementCandidate(ticketItem.type, candidates, replacementState, (candidate) => (
      candidateKey(candidate) !== candidateKey(targetEntry.candidate)
      && replacementPredicate(candidate)
    ));

    if (!replacement) {
      continue;
    }

    const index = ticketItem.legs.findIndex((leg) => (
      normalizeKey(leg.game) === normalizeKey(targetEntry.leg.game)
      && normalizeKey(leg.pick) === normalizeKey(targetEntry.leg.pick)
      && normalizeKey(leg.market) === normalizeKey(targetEntry.leg.market)
    ));

    if (index === -1) {
      continue;
    }

    const nextItem = {
      ...ticketItem,
      legs: [...ticketItem.legs],
    };
    nextItem.legs[index] = buildLegFromCandidate(replacement, nextItem.legs[index]);
    addWarning(nextItem, warningText);
    return nextItem;
  }

  return ticketItem;
}

function fillTicketToMinimum(ticketItem, candidates, propsAvailable) {
  const minimum = TICKET_MIN_COUNTS[ticketItem.type] || 0;
  const maximum = TICKET_MAX_COUNTS[ticketItem.type] || minimum;

  if ((ticketItem.legs || []).length >= minimum) {
    return ticketItem;
  }

  const nextItem = {
    ...ticketItem,
    legs: Array.isArray(ticketItem.legs) ? [...ticketItem.legs] : [],
  };

  const selectionSteps = ticketItem.type === 'safe'
    ? [
      (candidate) => candidate.marketCategory === 'moneyline' && Number(candidate.oddsDecimal) <= 1.95,
      (candidate) => candidate.marketCategory === 'spread' && String(candidate.pick || '').includes('+1.5'),
      (candidate) => candidate.marketCategory === 'total' || candidate.marketCategory === 'moneyline',
    ]
    : ticketItem.type === 'emi'
      ? [
        (candidate) => candidate.marketCategory === 'moneyline',
        propsAvailable
          ? (candidate) => isPlayerPropCategory(candidate.marketCategory)
          : (candidate) => candidate.marketCategory === 'spread',
        propsAvailable
          ? (candidate) => candidate.marketCategory === 'spread' || candidate.marketCategory === 'total'
          : (candidate) => candidate.marketCategory === 'total' || candidate.marketCategory === 'moneyline',
      ]
      : propsAvailable
        ? [
          (candidate) => isPlayerPropCategory(candidate.marketCategory),
          (candidate) => isPlayerPropCategory(candidate.marketCategory),
          (candidate) => candidate.marketCategory === 'moneyline',
          (candidate) => candidate.marketCategory === 'spread' || candidate.marketCategory === 'total',
        ]
        : [
          (candidate) => candidate.marketCategory === 'moneyline',
          (candidate) => candidate.marketCategory === 'moneyline',
          (candidate) => candidate.marketCategory === 'spread',
          (candidate) => candidate.marketCategory === 'total',
        ];

  for (const predicate of selectionSteps) {
    if (nextItem.legs.length >= minimum || nextItem.legs.length >= maximum) {
      break;
    }

    const state = summarizeTicketState(nextItem, candidates);
    const candidate = pickReplacementCandidate(nextItem.type, candidates, state, predicate);
    if (!candidate) {
      continue;
    }

    nextItem.legs.push(buildLegFromCandidate(candidate));
  }

  while (nextItem.legs.length < minimum && nextItem.legs.length < maximum) {
    const state = summarizeTicketState(nextItem, candidates);
    const candidate = pickReplacementCandidate(nextItem.type, candidates, state, () => true);
    if (!candidate) {
      break;
    }

    nextItem.legs.push(buildLegFromCandidate(candidate));
  }

  return nextItem;
}

function diversifyTicket(ticketItem, candidates, propsAvailable) {
  if (ticketItem.available === false) {
    return ticketItem;
  }

  let normalized = enforceOnePickPerGame(ticketItem, candidates);
  normalized = fillTicketToMinimum(normalized, candidates, propsAvailable);

  const getState = () => summarizeTicketState(normalized, candidates);
  const countByCategory = (category) => getState().entries.filter((entry) => entry.candidate.marketCategory === category).length;
  const totalProps = () => getState().entries.filter((entry) => isPlayerPropCategory(entry.candidate.marketCategory)).length;

  if (normalized.type === 'safe') {
    const protectedSpread = replaceWorstMatchingLeg(
      normalized,
      candidates,
      (candidate) => candidate.marketCategory === 'spread' && candidate.preferredMarket === 'spread',
      (candidate) => candidate.marketCategory === 'moneyline' && candidate.preferredMarket === 'spread',
      'Ticket Seguro protegió un ML fragil con spread +1.5.'
    );
    if (protectedSpread !== normalized) {
      normalized = protectedSpread;
    }

    while (countByCategory('moneyline') > MAX_MONEYLINES_BY_TICKET.safe) {
      const updated = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => candidate.marketCategory === 'spread' || candidate.marketCategory === 'total',
        (candidate) => candidate.marketCategory === 'moneyline',
        'Ticket Seguro limito exceso de Money Lines.'
      );
      if (updated === normalized) {
        break;
      }
      normalized = updated;
    }
  }

  if (normalized.type === 'emi') {
    const mixedWithProtection = replaceWorstMatchingLeg(
      normalized,
      candidates,
      (candidate) => candidate.marketCategory === 'spread',
      (candidate) => candidate.marketCategory === 'moneyline' && candidate.preferredMarket === 'spread',
      'Estilo Emi protegió un ML fragil con spread.'
    );
    if (mixedWithProtection !== normalized) {
      normalized = mixedWithProtection;
    }

    if (propsAvailable && totalProps() === 0) {
      const updated = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => isPlayerPropCategory(candidate.marketCategory),
        (candidate) => !isPlayerPropCategory(candidate.marketCategory),
        'Estilo Emi agrego prop verificada del feed.'
      );
      if (updated !== normalized) {
        normalized = updated;
      }
    }

    if (!propsAvailable && countByCategory('moneyline') >= 3) {
      const withSpread = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => candidate.marketCategory === 'spread',
        (candidate) => candidate.marketCategory === 'moneyline',
        'Estilo Emi mezclo ML y spread por diversidad.'
      );
      if (withSpread !== normalized) {
        normalized = withSpread;
      }

      const withTotal = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => candidate.marketCategory === 'total',
        (candidate) => candidate.marketCategory === 'moneyline',
        'Estilo Emi mezclo ML y total por diversidad.'
      );
      if (withTotal !== normalized) {
        normalized = withTotal;
      }
    }

    if (propsAvailable && countByCategory('moneyline') >= 3) {
      const mixed = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => (
          isPlayerPropCategory(candidate.marketCategory)
          || candidate.marketCategory === 'spread'
          || candidate.marketCategory === 'total'
        ),
        (candidate) => candidate.marketCategory === 'moneyline',
        'Estilo Emi mezclo mercados para evitar puro ML.'
      );
      if (mixed !== normalized) {
        normalized = mixed;
      }
    }

    while (countByCategory('moneyline') > MAX_MONEYLINES_BY_TICKET.emi) {
      const updated = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => (
          candidate.marketCategory === 'spread'
          || candidate.marketCategory === 'total'
          || isPlayerPropCategory(candidate.marketCategory)
        ),
        (candidate) => candidate.marketCategory === 'moneyline',
        'Estilo Emi limito exceso de Money Lines.'
      );
      if (updated === normalized) {
        break;
      }
      normalized = updated;
    }
  }

  if (normalized.type === 'free_bet') {
    while (propsAvailable && totalProps() < 2) {
      const updated = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => isPlayerPropCategory(candidate.marketCategory),
        (candidate) => !isPlayerPropCategory(candidate.marketCategory),
        'Free Bet priorizo props disponibles del feed.'
      );
      if (updated === normalized) {
        break;
      }
      normalized = updated;
    }

    while (countByCategory('moneyline') > MAX_MONEYLINES_BY_TICKET.free_bet) {
      const updated = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => (
          candidate.marketCategory === 'spread'
          || candidate.marketCategory === 'total'
          || isPlayerPropCategory(candidate.marketCategory)
        ),
        (candidate) => candidate.marketCategory === 'moneyline',
        'Free Bet redujo exceso de Money Lines.'
      );
      if (updated === normalized) {
        break;
      }
      normalized = updated;
    }

    if (!propsAvailable && countByCategory('total') === 0) {
      const updated = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => candidate.marketCategory === 'total',
        (candidate) => candidate.marketCategory === 'moneyline',
        'Free Bet agrego total para mejor mezcla.'
      );
      if (updated !== normalized) {
        normalized = updated;
      }
    }

    if (!propsAvailable && countByCategory('spread') === 0) {
      const updated = replaceWorstMatchingLeg(
        normalized,
        candidates,
        (candidate) => candidate.marketCategory === 'spread',
        (candidate) => candidate.marketCategory === 'moneyline',
        'Free Bet agrego spread para mejor mezcla.'
      );
      if (updated !== normalized) {
        normalized = updated;
      }
    }
  }

  normalized = enforceOnePickPerGame(normalized, candidates);

  const finalState = getState();
  const allMoneyline = finalState.entries.length > 0
    && finalState.entries.every((entry) => entry.candidate.marketCategory === 'moneyline');

  if (!propsAvailable) {
    addWarning(normalized, 'Player props unavailable from odds feed; using game markets only.');
    if (allMoneyline) {
      addWarning(normalized, 'Only Money Line markets were usable after Draftea and correlation filters.');
    }
  }

  if ((normalized.legs || []).length === 0) {
    return {
      ...normalized,
      available: false,
      reason: 'Not enough valid picks available.',
    };
  }

  return normalized;
}

function preparePromptCandidates(candidates = [], limit = 12) {
  const annotated = candidates.map(annotateCandidate);
  const propsAvailable = annotated.some((candidate) => isPlayerPropCategory(candidate.marketCategory));
  const structured = buildRecommendedByTicket(annotated, propsAvailable);
  const candidateIndex = buildCandidateIndex(annotated);
  const selected = [];
  const usedGames = new Set();
  const usedKeys = new Set();
  const usedPropTeams = new Set();

  function resolveRecommendedCandidate(item) {
    return candidateIndex.get([
      normalizeKey(item.game),
      normalizeKey(item.pick),
      normalizeKey(item.market),
    ].join('|')) || null;
  }

  function canAddCandidate(candidate, options = {}) {
    const {
      allowSameGame = false,
    } = options;

    if (!candidate) {
      return false;
    }

    if (usedKeys.has(candidateKey(candidate))) {
      return false;
    }

    if (!allowSameGame && usedGames.has(getGameKey(candidate))) {
      return false;
    }

    if (isPlayerPropCategory(candidate.marketCategory)) {
      const teamKey = normalizeKey(candidate.candidateTeam);
      if (teamKey && usedPropTeams.has(teamKey)) {
        return false;
      }
    }

    return true;
  }

  function addCandidate(candidate, options = {}) {
    if (!canAddCandidate(candidate, options) || selected.length >= limit) {
      return false;
    }

    selected.push(candidate);
    usedKeys.add(candidateKey(candidate));
    usedGames.add(getGameKey(candidate));

    if (isPlayerPropCategory(candidate.marketCategory) && candidate.candidateTeam) {
      usedPropTeams.add(normalizeKey(candidate.candidateTeam));
    }

    return true;
  }

  const freeBetRecommended = structured.recommendedByTicket.free_bet
    .map(resolveRecommendedCandidate)
    .filter(Boolean);
  const emiRecommended = structured.recommendedByTicket.emi
    .map(resolveRecommendedCandidate)
    .filter(Boolean);
  const safeRecommended = structured.recommendedByTicket.safe
    .map(resolveRecommendedCandidate)
    .filter(Boolean);

  const propPriorityCategories = new Set([
    'pitcher_strikeouts',
    'player_hit',
    'player_total_bases',
    'player_runs',
    'player_rbi',
    'player_hrr',
  ]);
  const preferredPropPool = sortCandidatesForTicket(annotated, 'free_bet')
    .filter((candidate) => isPlayerPropCategory(candidate.marketCategory))
    .filter((candidate) => propPriorityCategories.has(candidate.marketCategory));
  const fallbackPropPool = sortCandidatesForTicket(annotated, 'free_bet')
    .filter((candidate) => isPlayerPropCategory(candidate.marketCategory))
    .filter((candidate) => !propPriorityCategories.has(candidate.marketCategory));
  const propPool = [
    ...freeBetRecommended.filter((candidate) => isPlayerPropCategory(candidate.marketCategory)),
    ...emiRecommended.filter((candidate) => isPlayerPropCategory(candidate.marketCategory)),
    ...preferredPropPool,
    ...fallbackPropPool,
  ];

  if (propsAvailable) {
    for (const candidate of propPool) {
      if (selected.filter((item) => isPlayerPropCategory(item.marketCategory)).length >= 2) {
        break;
      }

      addCandidate(candidate);
    }
  }

  [...safeRecommended, ...emiRecommended, ...freeBetRecommended].forEach((candidate) => {
    addCandidate(candidate);
  });

  for (const candidate of sortCandidatesForTicket(annotated, 'emi')) {
    if (selected.length >= limit) {
      break;
    }

    addCandidate(candidate);
  }

  const initialSelected = selected.slice(0, limit);
  return injectRequiredPropsIntoPromptCandidates(initialSelected, annotated, {
    limit,
    minProps: propsAvailable ? 2 : 0,
  });
}

function injectRequiredPropsIntoPromptCandidates(promptCandidates = [], marketMixCandidates = [], options = {}) {
  const {
    limit = 12,
    minProps = 0,
  } = options;

  const annotatedPrompt = promptCandidates.map(annotateCandidate);
  const annotatedPool = marketMixCandidates.map(annotateCandidate);
  const selected = [...annotatedPrompt];
  const usedKeys = new Set(selected.map((candidate) => candidateKey(candidate)));
  const usedGames = new Set(selected.map((candidate) => getGameKey(candidate)));
  const usedPropTeams = new Set(selected
    .filter((candidate) => isPlayerPropCategory(candidate.marketCategory))
    .map((candidate) => normalizeKey(candidate.candidateTeam)));
  const usedPropMarketKeys = new Set(selected
    .filter((candidate) => isPlayerPropCategory(candidate.marketCategory))
    .map((candidate) => `${normalizeKey(candidate.playerName)}|${normalizeKey(candidate.market)}|${normalizeKey(candidate.side || '')}`));

  const propPriority = {
    pitcher_strikeouts: 0,
    player_hit: 1,
    player_total_bases: 2,
    player_hrr: 3,
    player_rbi: 4,
    player_runs: 5,
  };

  const propCount = () => selected.filter((candidate) => isPlayerPropCategory(candidate.marketCategory)).length;

  const sortedPropPool = [...annotatedPool]
    .filter((candidate) => candidate.eligibleForTicket === true)
    .filter((candidate) => candidate.oddsVerified === true)
    .filter((candidate) => candidate.teamResolved === true)
    .filter((candidate) => candidate.candidateType === 'player_prop')
    .sort((left, right) => {
      const leftPriority = propPriority[left.marketCategory] ?? 99;
      const rightPriority = propPriority[right.marketCategory] ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return compareCandidates('free_bet', left, right);
    });

  const canAddProp = (candidate) => {
    if (!candidate || usedKeys.has(candidateKey(candidate))) {
      return false;
    }

    if (usedGames.has(getGameKey(candidate))) {
      return false;
    }

    const teamKey = normalizeKey(candidate.candidateTeam);
    if (teamKey && usedPropTeams.has(teamKey)) {
      return false;
    }

    const propMarketKey = `${normalizeKey(candidate.playerName)}|${normalizeKey(candidate.market)}|${normalizeKey(candidate.side || '')}`;
    if (usedPropMarketKeys.has(propMarketKey)) {
      return false;
    }

    return true;
  };

  const registerCandidate = (candidate) => {
    selected.push(candidate);
    usedKeys.add(candidateKey(candidate));
    usedGames.add(getGameKey(candidate));
    if (isPlayerPropCategory(candidate.marketCategory) && candidate.candidateTeam) {
      usedPropTeams.add(normalizeKey(candidate.candidateTeam));
    }
    if (isPlayerPropCategory(candidate.marketCategory)) {
      usedPropMarketKeys.add(`${normalizeKey(candidate.playerName)}|${normalizeKey(candidate.market)}|${normalizeKey(candidate.side || '')}`);
    }
  };

  const replaceableGameMarketIndex = () => {
    const ranked = selected
      .map((candidate, index) => ({ candidate, index }))
      .filter((entry) => !isPlayerPropCategory(entry.candidate.marketCategory))
      .sort((left, right) => compareCandidates('free_bet', left.candidate, right.candidate))
      .reverse();
    return ranked[0]?.index ?? -1;
  };

  for (const candidate of sortedPropPool) {
    if (propCount() >= minProps) {
      break;
    }

    if (!canAddProp(candidate)) {
      continue;
    }

    if (selected.length < limit) {
      registerCandidate(candidate);
      continue;
    }

    const replaceIndex = replaceableGameMarketIndex();
    if (replaceIndex === -1) {
      continue;
    }

    const removed = selected.splice(replaceIndex, 1)[0];
    usedKeys.delete(candidateKey(removed));
    usedGames.delete(getGameKey(removed));
    registerCandidate(candidate);
  }

  return selected.slice(0, limit);
}

function validateTicketMarketDiversity(ticket, candidates = []) {
  const annotated = candidates.map(annotateCandidate);
  const diagnostics = buildDiagnostics(annotated);
  const propsAvailable = diagnostics.propsAvailable;

  const corrected = {
    ...ticket,
    warnings: Array.isArray(ticket?.warnings) ? [...ticket.warnings] : [],
    tickets: Array.isArray(ticket?.tickets)
      ? ticket.tickets.map((item) => diversifyTicket({
        ...item,
        warnings: Array.isArray(item?.warnings) ? [...item.warnings] : [],
        legs: Array.isArray(item?.legs) ? [...item.legs] : [],
      }, annotated, propsAvailable))
      : [],
  };

  if (!propsAvailable) {
    addWarning(corrected, 'Player props unavailable from odds feed; using game markets only.');
    addWarning(corrected, 'Only game markets were available from the odds feed.');
  }

  return corrected;
}

module.exports = {
  applyMarketMixStrategy,
  enforceOnePickPerGame,
  injectRequiredPropsIntoPromptCandidates,
  preparePromptCandidates,
  validateMarketMix: validateTicketMarketDiversity,
  validateTicketMarketDiversity,
};
