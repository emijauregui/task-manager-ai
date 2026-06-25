'use strict';

const drafteaRulesService = require('../../drafteaRulesService');
const espnService = require('../../espnService');
const mlbStatsService = require('../../mlbStatsService');
const oddsService = require('../../oddsService');
const {
  buildNormalizedCandidate,
  normalizeGameRecord,
  normalizeProviderCandidate,
} = require('../normalizers/normalizedCandidateService');

const MLB_SUPPORTED_MARKETS = [
  'h2h',
  'spreads',
  'totals',
  'batter_hits',
  'batter_total_bases',
  'batter_runs_scored',
  'batter_rbis',
  'batter_hits_runs_rbis',
  'pitcher_strikeouts',
  'batter_home_runs',
];

function getSportKey() {
  return 'mlb';
}

function getLeagueKey() {
  return 'MLB';
}

function normalizeGame(rawGame = {}) {
  const awayTeam = rawGame.awayTeam || rawGame.away_team || '';
  const homeTeam = rawGame.homeTeam || rawGame.home_team || '';

  return normalizeGameRecord({
    sport: getSportKey(),
    league: getLeagueKey(),
    gameId: rawGame.id || rawGame.eventId || '',
    game: rawGame.game || (awayTeam && homeTeam ? `${awayTeam} vs ${homeTeam}` : ''),
    homeTeam,
    awayTeam,
    startTime: rawGame.startTime || rawGame.commenceTime || rawGame.commence_time || '',
    status: rawGame.status || '',
    venue: rawGame.venue || '',
    source: rawGame.source || 'mlb_adapter',
  });
}

function normalizeMarket(rawMarket = {}) {
  return buildNormalizedCandidate(normalizeProviderCandidate(rawMarket, {
    sport: getSportKey(),
    league: getLeagueKey(),
    gameId: rawMarket.eventId || '',
    source: rawMarket.source || 'mlb_odds_service',
    candidateType: rawMarket.candidateType || 'game_market',
    team: rawMarket.team || rawMarket.candidateTeam,
    player: rawMarket.player || rawMarket.playerName,
  }));
}

function normalizePlayerProp(rawProp = {}) {
  return buildNormalizedCandidate(normalizeProviderCandidate(rawProp, {
    sport: getSportKey(),
    league: getLeagueKey(),
    gameId: rawProp.eventId || '',
    source: rawProp.source || 'mlb_event_props',
    candidateType: 'player_prop',
    team: rawProp.team || rawProp.playerTeam,
    player: rawProp.player || rawProp.playerName,
  }));
}

async function getGamesByDate(dateKey, options = {}) {
  const scoreboard = await espnService.getMlbScoreboard({
    dateKey,
    forceRefresh: options.forceRefresh === true,
    allowStaleOnError: options.allowStaleOnError !== false,
  });

  return {
    ...scoreboard,
    adapter: getSportKey(),
    normalizedGames: Array.isArray(scoreboard.games)
      ? scoreboard.games.map((game) => normalizeGame({ ...game, source: scoreboard.source }))
      : [],
  };
}

async function getOddsByDate(dateKey, options = {}) {
  const oddsPayload = await oddsService.getMlbOdds({
    targetDate: dateKey,
    markets: options.markets || 'h2h,spreads,totals',
    forceRefresh: options.forceRefresh === true,
    useCache: options.useCache !== false,
  });

  return {
    ...oddsPayload,
    adapter: getSportKey(),
    normalizedCandidates: Array.isArray(oddsPayload.normalizedPicks)
      ? oddsPayload.normalizedPicks.map(normalizeMarket)
      : [],
  };
}

async function getPlayerPropsByDate(dateKey, options = {}) {
  const propsPayload = await oddsService.getMlbPropsByDateViaEvents(dateKey, {
    forceRefresh: options.forceRefresh === true,
    useCache: options.useCache !== false,
    limitEvents: options.limitEvents,
    requestedMarkets: options.requestedMarkets,
  });

  return {
    ...propsPayload,
    adapter: getSportKey(),
    normalizedCandidates: Array.isArray(propsPayload.eligibleProps)
      ? propsPayload.eligibleProps.map(normalizePlayerProp)
      : [],
  };
}

function getRules() {
  return {
    applyCandidateRules: drafteaRulesService.applyDrafteaRules,
    validateTicket: drafteaRulesService.validateTicketAgainstDrafteaRules,
    metadata: {
      provider: 'draftea',
      sport: getSportKey(),
      adapter: 'mlbAdapter',
    },
  };
}

function getSupportedMarkets() {
  return [...MLB_SUPPORTED_MARKETS];
}

module.exports = {
  getGamesByDate,
  getLeagueKey,
  getOddsByDate,
  getPlayerPropsByDate,
  getRules,
  getSportKey,
  getSupportedMarkets,
  mlbStatsService,
  normalizeGame,
  normalizeMarket,
  normalizePlayerProp,
  oddsService,
};
