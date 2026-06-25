'use strict';

function asString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function asNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String)));
}

function buildNormalizedCandidate(input = {}) {
  return {
    sport: asString(input.sport),
    league: asString(input.league),
    gameId: asString(input.gameId),
    game: asString(input.game),
    startTime: asString(input.startTime),
    candidateId: asString(input.candidateId),
    candidateType: asString(input.candidateType || 'game_market'),
    market: asString(input.market),
    marketCategory: asString(input.marketCategory),
    pick: asString(input.pick),
    odds: asString(input.odds || input.decimalOdds),
    decimalOdds: asNumber(input.decimalOdds ?? input.oddsDecimal),
    team: asString(input.team || input.candidateTeam),
    player: asString(input.player || input.playerName),
    side: asString(input.side),
    line: asString(input.line),
    source: asString(input.source),
    oddsVerified: input.oddsVerified === true,
    teamResolved: input.teamResolved === true,
    lineupRequired: input.lineupRequired === true,
    voidRisk: asString(input.voidRisk || 'low'),
    ruleWarnings: uniqueStrings(input.ruleWarnings),
    confidenceScore: asNumber(input.confidenceScore, 0),
    valueScore: asNumber(input.valueScore, 0),
    volatilityScore: asNumber(input.volatilityScore, 0),
    riskFlags: uniqueStrings(input.riskFlags),
    evidence: uniqueStrings(input.evidence),
  };
}

function normalizeGameRecord(input = {}) {
  return {
    sport: asString(input.sport),
    league: asString(input.league),
    gameId: asString(input.gameId || input.id),
    game: asString(input.game),
    homeTeam: asString(input.homeTeam),
    awayTeam: asString(input.awayTeam),
    startTime: asString(input.startTime),
    status: asString(input.status),
    venue: asString(input.venue),
    source: asString(input.source),
  };
}

function normalizeProviderCandidate(rawCandidate = {}, defaults = {}) {
  return buildNormalizedCandidate({
    ...defaults,
    ...rawCandidate,
    odds: rawCandidate.odds || rawCandidate.oddsDecimal || defaults.odds,
    decimalOdds: rawCandidate.decimalOdds ?? rawCandidate.oddsDecimal ?? defaults.decimalOdds,
    team: rawCandidate.team || rawCandidate.candidateTeam || rawCandidate.playerTeam || defaults.team,
    player: rawCandidate.player || rawCandidate.playerName || defaults.player,
  });
}

module.exports = {
  buildNormalizedCandidate,
  normalizeGameRecord,
  normalizeProviderCandidate,
};
