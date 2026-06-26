const bedrockService = require('./bedrockService');
const drafteaRulesService = require('./drafteaRulesService');
const espnService = require('./espnService');
const footballService = require('./footballService');
const historicalPatternEngine = require('./historicalPatternEngine');
const marketMixService = require('./marketMixService');
const mlbTicketHistoryService = require('./mlbTicketHistoryService');
const oddsService = require('./oddsService');
const pickEnrichmentService = require('./pickEnrichmentService');
const {
  listCacheFiles,
  readCache,
  readJsonFile,
  writeCache,
  getCacheFilePath,
} = require('../utils/cache');

const MAX_AI_GENERATIONS_PER_DAY = Number(process.env.MAX_AI_GENERATIONS_PER_DAY || 1);
const MAX_CANDIDATES = Number(process.env.DAILY_TICKET_MAX_CANDIDATES || 12);
const MAX_OUTPUT_TOKENS = Number(process.env.DAILY_TICKET_MAX_OUTPUT_TOKENS || 1800);
const BEDROCK_TIMEOUT_MS = Number(process.env.BEDROCK_TIMEOUT_MS || 45000);
const LOCK_MINUTES_BEFORE_START = Number(process.env.DAILY_TICKET_LOCK_MINUTES_BEFORE_START || 10);
const MAX_PROP_EVENTS = Number(process.env.DAILY_TICKET_PROPS_MAX_EVENTS || 6);
const TARGET_TIME_ZONE = process.env.DAILY_TICKET_TIME_ZONE || 'America/Mazatlan';
const TICKET_LEG_LIMITS = {
  safe: 3,
  emi: 3,
  free_bet: 5,
};
const TICKET_MAX_ODDS = {
  safe: 5.0,
  emi: 5.0,
  free_bet: 10.0,
};
const PROPS_BLOCKED_TIME_LOCK_MESSAGE = 'Player props no disponibles porque los juegos con props ya empezaron o estan dentro del limite de bloqueo.';
const PROPS_BLOCKED_TIME_LOCK_SHORT_MESSAGE = 'Player props no disponibles porque el juego ya empezo o esta dentro del limite de bloqueo.';

const TOMORROW_SOURCE_REASON = 'today_had_no_bettable_candidates';

class DailyTicketGenerationError extends Error {
  constructor(stage, message, cause) {
    super(message);
    this.name = 'DailyTicketGenerationError';
    this.stage = stage || 'unknown';
    this.errorCode = 'DAILY_TICKET_GENERATION_FAILED';
    this.cause = cause;
  }
}

const TICKET_DEFAULTS = {
  safe: {
    type: 'safe',
    name: 'Ticket Seguro',
    odds: '2.0x-3.0x',
    risk: 'low',
    stake: '$50-$100 MXN',
  },
  emi: {
    type: 'emi',
    name: 'Estilo Emi',
    odds: '3.0x-5.0x',
    risk: 'medium',
    stake: '$50-$75 MXN',
  },
  free_bet: {
    type: 'free_bet',
    name: 'Free Bet',
    odds: '5.0x-10.0x',
    risk: 'high',
    stake: 'Apuesta gratis',
  },
};

function getTicketCacheFilename(dateKey = getTodayDateKey()) {
  return `daily-ticket-${dateKey}.json`;
}

function logGenerateStage(event, metadata = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(cleaned).length > 0) {
    console.log(`[daily-ticket] ${event}`, cleaned);
    return;
  }

  console.log(`[daily-ticket] ${event}`);
}

function sanitizeRawModelResponse(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .slice(0, 1200);
}

function normalizeGenerationError(error, fallbackStage = 'unknown') {
  if (error instanceof DailyTicketGenerationError) {
    return error;
  }

  return new DailyTicketGenerationError(fallbackStage, error.message || 'Daily Ticket generation failed.', error);
}

function buildErrorResponse(error) {
  const normalized = normalizeGenerationError(error);
  const providerErrorCodes = new Set([
    'ODDS_API_QUOTA_REACHED',
    'ODDS_API_LIVE_DISABLED',
    'ODDS_API_NOT_CONFIGURED',
  ]);
  return {
    success: false,
    source: 'error',
    errorCode: normalized.errorCode || 'DAILY_TICKET_GENERATION_FAILED',
    message: providerErrorCodes.has(normalized.errorCode)
      ? normalized.message
      : 'Daily Ticket generation failed. Check backend logs.',
    stage: normalized.stage || 'unknown',
  };
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function buildEmptyPropsPayload() {
  return {
    fetched: 0,
    eligible: 0,
    rejected: 0,
    rejectedReasons: {},
    sampleEligible: [],
    sampleRejected: [],
    allProps: [],
    eligibleProps: [],
    rejectedProps: [],
    sampleEligibleProps: [],
    sampleRejectedProps: [],
    warning: '',
    quotaReached: false,
    source: 'unavailable',
  };
}

function buildEmptyPropsPipeline() {
  return {
    fetched: 0,
    eligibleRaw: 0,
    afterStatusFilter: 0,
    rejectedByStatus: 0,
    afterTimeFilter: 0,
    rejectedByTime: 0,
    afterOddsFilter: 0,
    rejectedByOdds: 0,
    bettable: 0,
    sentToPrompt: 0,
    finalUsed: 0,
    blockedReason: '',
    blockedMessage: '',
  };
}

function buildNoCandidatesResponse() {
  return {
    success: false,
    source: 'no_candidates',
    errorCode: 'NO_BETTABLE_CANDIDATES',
    message: 'No upcoming games with valid odds are available right now.',
    stage: 'filter',
    ticket: null,
    dashboardHint: "Try again before tomorrow's games or use force after new odds are available.",
  };
}

function getSafeIntelligenceDiagnostics(intelligenceDiagnostics = {}) {
  return {
    intelligenceEnabled: true,
    historicalLearningEnabled: intelligenceDiagnostics?.historicalLearningEnabled === true,
    historicalPatternsApplied: Number(intelligenceDiagnostics?.historicalPatternsApplied || 0),
    historicalRiskFlags: Array.isArray(intelligenceDiagnostics?.historicalRiskFlags)
      ? intelligenceDiagnostics.historicalRiskFlags
      : [],
    historicalPatternSummary: intelligenceDiagnostics?.historicalPatternSummary || historicalPatternEngine.buildEmptyPatternSnapshot(),
  };
}

async function getHistoricalLearningSummarySafe() {
  try {
    const summary = await mlbTicketHistoryService.summarizeHistoricalTickets();
    try {
      const patternReport = await historicalPatternEngine.summarizeHistoricalPatterns({
        summary,
      });
      return {
        ...summary,
        patternSnapshot: historicalPatternEngine.buildPatternSnapshot(patternReport),
      };
    } catch (error) {
      console.error('[outcome-learning] Failed to summarize MLB historical patterns', {
        message: error.message,
        name: error.name,
      });
      return {
        ...summary,
        patternSnapshot: historicalPatternEngine.buildEmptyPatternSnapshot(),
      };
    }
  } catch (error) {
    console.error('[outcome-learning] Failed to summarize MLB ticket history', {
      message: error.message,
      name: error.name,
    });
    return {
      totalTickets: 0,
      won: 0,
      lost: 0,
      pending: 0,
      byTicketType: {},
      byMarketCategory: {},
      commonFailurePatterns: [],
      teamExposure: [],
      playerPropExposure: [],
      learningEnabled: false,
      failurePatternCounts: {},
      teamExposureMap: {},
      playerPropExposureMap: {},
      patternSnapshot: historicalPatternEngine.buildEmptyPatternSnapshot(),
    };
  }
}

async function saveGeneratedTicketHistorySafe(ticket) {
  try {
    const saved = await mlbTicketHistoryService.saveGeneratedTicketResult(ticket);
    logGenerateStage('HISTORY_SAVE_GENERATED', {
      id: saved.id,
      date: saved.date,
      tickets: Array.isArray(saved.tickets) ? saved.tickets.length : 0,
    });
  } catch (error) {
    console.error('[daily-ticket] Failed to save generated ticket history', {
      message: error.message,
      name: error.name,
    });
  }
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateKeyInTimeZone(date = new Date(), timeZone = TARGET_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function getTodayDateKey(referenceDate = new Date()) {
  return getDateKeyInTimeZone(referenceDate);
}

function getTomorrowDateKey(referenceDate = new Date()) {
  return getDateKeyInTimeZone(addDays(referenceDate, 1));
}

function buildGameLookupKey(homeTeam, awayTeam) {
  return `${normalizeKey(awayTeam)}@${normalizeKey(homeTeam)}`;
}

function buildStableCandidateId(candidate, fallbackIndex = 0) {
  const baseType = candidate?.candidateType === 'player_prop' || candidate?.playerName ? 'pp' : 'gm';
  const eventPart = normalizeKey(candidate?.eventId || candidate?.game || `event-${fallbackIndex}`);
  const marketPart = normalizeKey(candidate?.market || 'market');

  if (baseType === 'pp') {
    return [
      'pp',
      eventPart,
      marketPart,
      normalizeKey(candidate?.playerName || 'player'),
      normalizeKey(candidate?.side || candidate?.pick || 'pick'),
      normalizeKey(candidate?.line || candidate?.point || 'line'),
    ].join('-');
  }

  return [
    'gm',
    eventPart,
    marketPart,
    normalizeKey(candidate?.pick || `${candidate?.awayTeam || ''}-${candidate?.homeTeam || ''}` || 'pick'),
  ].join('-');
}

function buildScoreboardIndex(scoreboard) {
  const index = new Map();
  (scoreboard?.games || []).forEach((game) => {
    const key = buildGameLookupKey(game.homeTeam, game.awayTeam);
    const current = index.get(key) || [];
    current.push(game);
    index.set(key, current);
  });
  return index;
}

function getLocalDateKeyForStartTime(startTime) {
  if (!startTime) {
    return '';
  }

  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return getDateKeyInTimeZone(date);
}

function isSameTargetDate(leftStartTime, rightStartTime) {
  const leftDateKey = getLocalDateKeyForStartTime(leftStartTime);
  const rightDateKey = getLocalDateKeyForStartTime(rightStartTime);

  return Boolean(leftDateKey && rightDateKey && leftDateKey === rightDateKey);
}

function findBestScoreboardMatch(candidate, scoreboardIndex) {
  const key = buildGameLookupKey(candidate.homeTeam, candidate.awayTeam);
  const possibleMatches = scoreboardIndex.get(key) || [];

  if (!possibleMatches.length) {
    return null;
  }

  const candidateStart = new Date(candidate.startTime);
  if (Number.isNaN(candidateStart.getTime())) {
    return null;
  }

  const eligibleMatches = possibleMatches
    .filter((game) => isSameTargetDate(candidate.startTime, game.startTime))
    .map((game) => {
      const gameStart = new Date(game.startTime);
      const timeDiffMs = Number.isNaN(gameStart.getTime())
        ? Number.POSITIVE_INFINITY
        : Math.abs(candidateStart.getTime() - gameStart.getTime());

      return {
        game,
        timeDiffMs,
      };
    })
    .sort((left, right) => left.timeDiffMs - right.timeDiffMs);

  const bestMatch = eligibleMatches[0];
  if (!bestMatch) {
    return null;
  }

  const clearMatchThresholdMs = 6 * 60 * 60 * 1000;
  if (bestMatch.timeDiffMs > clearMatchThresholdMs) {
    return null;
  }

  return bestMatch.game;
}

function isPlayerPropCandidate(candidate) {
  return candidate?.candidateType === 'player_prop'
    || Boolean(candidate?.playerName)
    || candidate?.lineupRequired === true;
}

function summarizePromptCandidates(candidates = []) {
  const promptPropsCount = candidates.filter((candidate) => isPlayerPropCandidate(candidate)).length;
  return {
    promptCandidateCount: candidates.length,
    promptPropsCount,
    promptGameMarketsCount: Math.max(0, candidates.length - promptPropsCount),
  };
}

function meetsTicketConfidenceThreshold(ticketType, candidate) {
  const confidence = Number(candidate?.confidenceScore ?? candidate?.confidence ?? 0);
  const valueScore = Number(candidate?.valueScore ?? 0);

  if (ticketType === 'safe') {
    return confidence >= 60
      && candidate?.closeGameRisk !== 'high'
      && ['low', 'medium'].includes(String(candidate?.voidRisk || ''))
      && !(candidate?.candidateType === 'player_prop' && candidate?.voidRisk === 'high');
  }

  if (ticketType === 'emi') {
    return confidence >= 58;
  }

  return confidence >= 50 || valueScore >= 62;
}

function passesPromptConfidence(candidate) {
  const recommendedFor = Array.isArray(candidate?.recommendedFor) ? candidate.recommendedFor : [];

  if (recommendedFor.includes('safe') && meetsTicketConfidenceThreshold('safe', candidate)) {
    return true;
  }

  if (recommendedFor.includes('emi') && meetsTicketConfidenceThreshold('emi', candidate)) {
    return true;
  }

  if (recommendedFor.includes('free_bet') && meetsTicketConfidenceThreshold('free_bet', candidate)) {
    return true;
  }

  return false;
}

function filterPromptCandidatesByConfidence(promptCandidates = [], sourceCandidates = [], limit = MAX_CANDIDATES) {
  const pool = uniqueCandidatesByKey([
    ...(Array.isArray(promptCandidates) ? promptCandidates : []),
    ...(Array.isArray(sourceCandidates) ? sourceCandidates : []),
  ]);

  const filtered = pool.filter((candidate) => passesPromptConfidence(candidate));
  if (!filtered.length) {
    return uniqueCandidatesByKey(Array.isArray(promptCandidates) ? promptCandidates : []).slice(0, limit);
  }

  return filtered.slice(0, limit);
}

function mergeCandidatePools(primary = [], secondary = []) {
  return uniqueCandidatesByKey([
    ...(Array.isArray(primary) ? primary : []),
    ...(Array.isArray(secondary) ? secondary : []),
  ]);
}

function samplePromptBlockedProps(samples = [], limit = 5) {
  return (Array.isArray(samples) ? samples : [])
    .slice(0, limit)
    .map((sample) => ({
      candidateId: sample.candidateId || '',
      game: sample.game || '',
      pick: sample.pick || '',
      market: sample.market || '',
      startTime: sample.commenceTime || sample.startTime || '',
      blockedAt: sample.rejectedAt || '',
      reason: sample.reason || '',
    }));
}

function resolvePropsBlockedReason(propsPipeline) {
  if (!propsPipeline || propsPipeline.eligibleRaw <= 0) {
    return '';
  }

  if (propsPipeline.bettable > 0) {
    return '';
  }

  if (propsPipeline.afterStatusFilter > 0 && propsPipeline.afterTimeFilter === 0 && propsPipeline.rejectedByTime > 0) {
    return 'filtered_by_time_lock';
  }

  if (propsPipeline.afterTimeFilter > 0 && propsPipeline.afterOddsFilter === 0 && propsPipeline.rejectedByOdds > 0) {
    return 'filtered_by_odds_rules';
  }

  if (propsPipeline.afterStatusFilter === 0 && propsPipeline.rejectedByStatus > 0) {
    return 'filtered_by_status';
  }

  return 'all_props_conflicted_or_filtered';
}

function buildPropsBlockedWarning(propsBlockedReason) {
  switch (propsBlockedReason) {
    case 'filtered_by_time_lock':
      return PROPS_BLOCKED_TIME_LOCK_MESSAGE;
    case 'filtered_by_odds_rules':
      return 'Player props were found but excluded because their odds did not pass ticket rules.';
    case 'filtered_by_status':
      return 'Player props were found but excluded because their games were no longer bettable.';
    case 'all_props_conflicted_or_filtered':
      return 'Props were available but not included in prompt due to candidate selection bug or filtering.';
    default:
      return '';
  }
}

function buildPropsBlockedMessage(propsBlockedReason) {
  switch (propsBlockedReason) {
    case 'filtered_by_time_lock':
      return PROPS_BLOCKED_TIME_LOCK_SHORT_MESSAGE;
    case 'filtered_by_odds_rules':
      return 'Player props no disponibles porque sus momios no pasaron las reglas del ticket.';
    case 'filtered_by_status':
      return 'Player props no disponibles porque esos juegos ya no estaban aptos para apuesta.';
    case 'all_props_conflicted_or_filtered':
      return 'Player props detectadas, pero no llegaron al prompt final por filtros o conflictos.';
    case 'final_ticket_props_not_selected':
      return 'Player props disponibles, pero no quedaron seleccionadas en el ticket final.';
    default:
      return '';
  }
}

function determineTicketMode(propsPipeline, promptPropsCount) {
  if ((promptPropsCount || 0) > 0) {
    return 'mixed_verified_markets';
  }

  if ((propsPipeline?.bettable || 0) > 0) {
    return 'verified_game_markets_props_not_prompted';
  }

  if (propsPipeline?.eligibleRaw > 0 && propsPipeline?.rejectedByTime > 0 && propsPipeline?.afterTimeFilter === 0) {
    return 'verified_game_markets_props_filtered_by_time';
  }

  return 'verified_game_markets';
}

function getProbablePitcherInfo(candidate, gameInfo) {
  const probables = Array.isArray(gameInfo?.probables) ? gameInfo.probables : [];
  const playerKey = normalizeKey(candidate?.playerName);
  if (!playerKey) {
    return null;
  }

  return probables.find((probable) => normalizeKey(probable?.athlete) === playerKey) || null;
}

function enrichCandidates(candidates, scoreboard) {
  const scoreboardIndex = buildScoreboardIndex(scoreboard);

  return candidates.map((candidate, index) => {
    const gameInfo = findBestScoreboardMatch(candidate, scoreboardIndex);
    const probablePitcher = getProbablePitcherInfo(candidate, gameInfo);
    const isPlayerProp = isPlayerPropCandidate(candidate);
    let lineupConfidence = candidate.lineupConfidence || (isPlayerProp ? 'unknown' : 'not_required');

    if (probablePitcher && isPlayerProp) {
      lineupConfidence = 'probable';
    }

    return {
      ...candidate,
      candidateId: candidate.candidateId || buildStableCandidateId(candidate, index + 1),
      status: gameInfo?.status || '',
      espnStatus: gameInfo?.status || 'unmatched',
      espnMatched: Boolean(gameInfo),
      statusSource: gameInfo ? 'espn' : 'odds_only',
      statusPassReason: gameInfo
        ? 'Matched ESPN game; status will be checked.'
        : 'No ESPN match; Odds commence_time is future candidate.',
      venue: gameInfo?.venue || '',
      records: gameInfo?.records || [],
      probables: gameInfo?.probables || [],
      probableStarter: Boolean(probablePitcher),
      lineupConfidence,
    };
  });
}

function scoreCandidate(candidate) {
  const marketPriority = {
    h2h: 38,
    spreads: 20,
    totals: 10,
  };

  const oddsDistance = Math.abs(candidate.oddsDecimal - 1.9);
  let score = 100 - oddsDistance * 35 + (marketPriority[candidate.market] || 0);
  score += Number(candidate.confidenceScore || 0);
  score -= Number(candidate.volatilityScore || 0) / 6;

  if (candidate.voidRisk === 'low') {
    score += 12;
  } else if (candidate.voidRisk === 'medium') {
    score += 4;
  } else if (candidate.voidRisk === 'high') {
    score -= 10;
  }

  if (candidate.safeEligible === true) {
    score += 8;
  }

  if (candidate.lineupConfidence === 'confirmed') {
    score += 8;
  } else if (candidate.lineupConfidence === 'unknown') {
    score -= 4;
  }

  if (candidate.venue) {
    score += 2;
  }

  if (candidate.records?.length) {
    score += 3;
  }

  return score;
}

function filterCandidatePicks(candidates) {
  const valid = candidates.filter((candidate) => {
    if (!candidate.homeTeam || !candidate.awayTeam || !candidate.pick || !candidate.market) {
      return false;
    }

    if (candidate.drafteaCompliant === false) {
      return false;
    }

    if (!Number.isFinite(candidate.oddsDecimal)) {
      return false;
    }

    if (candidate.eligibleForTicket === false) {
      return false;
    }

    if (candidate.oddsDecimal < 1.2 || candidate.oddsDecimal > 10.0) {
      return false;
    }

    return true;
  });

  const sorted = valid.sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
  const selected = [];
  const perGameCount = new Map();

  for (const candidate of sorted) {
    if (selected.length >= MAX_CANDIDATES) {
      break;
    }

    const currentCount = perGameCount.get(candidate.game) || 0;
    if (currentCount >= 3) {
      continue;
    }

    selected.push(candidate);
    perGameCount.set(candidate.game, currentCount + 1);
  }

  return selected;
}

function isScheduledStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  if (normalized.includes('final')) {
    return false;
  }

  if (normalized.includes('completed')) {
    return false;
  }

  if (normalized.includes('in progress')) {
    return false;
  }

  if (normalized.includes('live')) {
    return false;
  }

  if (normalized === 'status_scheduled') {
    return true;
  }

  return (
    normalized.includes('scheduled')
    || normalized.includes('pre-game')
    || normalized.includes('pregame')
    || normalized.includes('not started')
    || normalized.includes('status_scheduled')
    || normalized.includes('delayed')
  );
}

function isBlockedEspnStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();

  return normalized.includes('final')
    || normalized.includes('completed')
    || normalized.includes('in progress')
    || normalized.includes('live')
    || normalized.includes('halftime')
    || normalized.includes('end of period')
    || normalized.includes('postponed')
    || normalized.includes('cancelled')
    || normalized.includes('canceled')
    || normalized.includes('suspended')
    || normalized.includes('delayed severe');
}

function isAfterLockWindow(startTime, now = new Date()) {
  const start = new Date(startTime);

  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const lockTime = new Date(start.getTime() - LOCK_MINUTES_BEFORE_START * 60 * 1000);
  return now < lockTime;
}

function hasValidOddsForCandidate(candidate) {
  return Number.isFinite(candidate.oddsDecimal) && candidate.oddsDecimal >= 1.2 && candidate.oddsDecimal <= 10.0;
}

function buildRejectedSample(candidate, rejectedAt, reason) {
  return {
    candidateId: candidate.candidateId || '',
    game: candidate.game,
    commenceTime: candidate.startTime || '',
    espnStatus: candidate.espnStatus || '',
    statusSource: candidate.statusSource || 'unknown',
    statusPassReason: candidate.statusPassReason || '',
    market: candidate.market,
    pick: candidate.pick,
    oddsDecimal: candidate.oddsDecimal,
    rejectedAt,
    reason,
  };
}

function buildAcceptedSample(candidate) {
  return {
    game: candidate.game,
    commenceTime: candidate.startTime || '',
    espnStatus: candidate.espnStatus || 'unmatched',
    statusSource: candidate.statusSource || 'unknown',
    statusPassReason: candidate.statusPassReason || '',
    candidateType: candidate.candidateType || 'game_market',
    voidRisk: candidate.voidRisk || 'low',
  };
}

function filterByGameStatus(candidates, diagnostics) {
  return candidates.filter((candidate) => {
    if (!candidate.espnMatched) {
      candidate.espnStatus = 'unmatched';
      candidate.statusSource = 'odds_only';
      candidate.statusPassReason = 'No ESPN match; Odds commence_time is future';
      diagnostics.unmatchedEspnCount += 1;
      return true;
    }

    diagnostics.matchedEspnCount += 1;
    const status = String(candidate.espnStatus || candidate.status || '').trim();

    if (!status) {
      candidate.espnStatus = 'unmatched';
      candidate.statusSource = 'espn_unknown';
      candidate.statusPassReason = 'Matched ESPN game, but status is empty or unknown';
      return true;
    }

    if (isBlockedEspnStatus(status)) {
      diagnostics.rejectedByFinalStatusCount += 1;
      diagnostics.rejections.push(buildRejectedSample(
        candidate,
        'status',
        `ESPN status "${status}" indicates the game is no longer bettable.`
      ));
      diagnostics.rejectedStatus += 1;
      return false;
    }

    if (status.toLowerCase().includes('delayed') && !hasValidOddsForCandidate(candidate)) {
      diagnostics.rejections.push(buildRejectedSample(
        candidate,
        'status',
        'Delayed game without valid odds.'
      ));
      diagnostics.rejectedStatus += 1;
      return false;
    }

    if (isScheduledStatus(status)) {
      candidate.statusSource = 'espn';
      candidate.statusPassReason = `Matched ESPN pre-game status "${status}"`;
      return true;
    }

    candidate.statusSource = 'espn_unknown';
    candidate.statusPassReason = `Matched ESPN game, but status "${status}" is treated as unknown`;
    return true;
  });
}

function filterByStartTime(candidates, diagnostics, now = new Date()) {
  return candidates.filter((candidate) => {
    if (!candidate.startTime) {
      diagnostics.rejections.push(buildRejectedSample(
        candidate,
        'time',
        'Missing commence_time from The Odds API.'
      ));
      diagnostics.rejectedTime += 1;
      return false;
    }

    if (!isAfterLockWindow(candidate.startTime, now)) {
      diagnostics.rejections.push(buildRejectedSample(
        candidate,
        'time',
        `Game starts too soon or has already started for ${TARGET_TIME_ZONE}.`
      ));
      diagnostics.rejectedTime += 1;
      return false;
    }

    return true;
  });
}

function filterByOdds(candidates, diagnostics) {
  return candidates.filter((candidate) => {
    if (!Number.isFinite(candidate.oddsDecimal)) {
      diagnostics.rejections.push(buildRejectedSample(
        candidate,
        'odds',
        'Missing or invalid decimal odds.'
      ));
      diagnostics.rejectedOdds += 1;
      return false;
    }

    if (candidate.oddsDecimal < 1.2) {
      diagnostics.rejections.push(buildRejectedSample(
        candidate,
        'odds',
        'Decimal odds are below the minimum threshold of 1.20.'
      ));
      diagnostics.rejectedOdds += 1;
      return false;
    }

    if (candidate.oddsDecimal > 10.0) {
      diagnostics.rejections.push(buildRejectedSample(
        candidate,
        'odds',
        'Decimal odds are above the maximum supported threshold of 10.00.'
      ));
      diagnostics.rejectedOdds += 1;
      return false;
    }

    return true;
  });
}

function selectBettableCandidates(candidates, now = new Date(), context = {}) {
  const diagnostics = {
    rejectedStatus: 0,
    rejectedTime: 0,
    rejectedOdds: 0,
    afterStatusFilter: 0,
    afterTimeFilter: 0,
    afterOddsFilter: 0,
    matchedEspnCount: 0,
    unmatchedEspnCount: 0,
    rejectedByFinalStatusCount: 0,
    statusPassReason: 'Candidates pass status by default unless a clear ESPN match reports a blocked live/final state.',
    acceptedSamples: [],
    rejections: [],
  };

  logGenerateStage('CANDIDATES_BEFORE_FILTER', {
    targetDate: context.targetDate,
    count: candidates.length,
  });

  const statusFiltered = filterByGameStatus(candidates, diagnostics);
  diagnostics.afterStatusFilter = statusFiltered.length;
  logGenerateStage('CANDIDATES_AFTER_STATUS_FILTER', {
    targetDate: context.targetDate,
    count: statusFiltered.length,
  });
  logGenerateStage('REJECTED_STATUS', {
    targetDate: context.targetDate,
    count: diagnostics.rejectedStatus,
  });

  const timeFiltered = filterByStartTime(statusFiltered, diagnostics, now);
  diagnostics.afterTimeFilter = timeFiltered.length;
  logGenerateStage('CANDIDATES_AFTER_TIME_FILTER', {
    targetDate: context.targetDate,
    count: timeFiltered.length,
    lockMinutesBeforeStart: LOCK_MINUTES_BEFORE_START,
  });
  logGenerateStage('REJECTED_TIME', {
    targetDate: context.targetDate,
    count: diagnostics.rejectedTime,
  });

  const oddsFiltered = filterByOdds(timeFiltered, diagnostics);
  diagnostics.afterOddsFilter = oddsFiltered.length;
  logGenerateStage('CANDIDATES_AFTER_ODDS_FILTER', {
    targetDate: context.targetDate,
    count: oddsFiltered.length,
  });
  logGenerateStage('REJECTED_ODDS', {
    targetDate: context.targetDate,
    count: diagnostics.rejectedOdds,
  });
  logGenerateStage('ACCEPTED_CANDIDATES', {
    targetDate: context.targetDate,
    count: oddsFiltered.length,
  });
  logGenerateStage('SAMPLE_ACCEPTED_CANDIDATES', {
    targetDate: context.targetDate,
    sample: oddsFiltered.slice(0, 3).map(buildAcceptedSample),
  });
  diagnostics.acceptedSamples = oddsFiltered.slice(0, 5).map(buildAcceptedSample);

  return {
    candidates: oddsFiltered,
    diagnostics,
  };
}

function buildModelCandidates(candidates) {
  return candidates.map((candidate) => ({
    id: candidate.candidateId,
    game: candidate.game,
    pick: candidate.pick,
    market: candidate.market,
    odds: candidate.oddsDecimal.toFixed(2),
    status: candidate.status || 'Scheduled',
    startTime: candidate.startTime,
    marketCategory: candidate.marketCategory || '',
    confidenceScore: candidate.confidenceScore || 0,
    valueScore: candidate.valueScore || 0,
    volatilityScore: candidate.volatilityScore || 0,
    protectionSuggested: candidate.protectionSuggested === true,
    preferredMarket: candidate.preferredMarket || '',
    closeGameRisk: candidate.closeGameRisk || 'low',
    riskFlags: candidate.riskFlags || [],
    evidence: candidate.evidence || [],
    recommendedFor: candidate.recommendedFor || [],
    candidateType: candidate.candidateType || 'game_market',
    candidateTeam: candidate.candidateTeam || '',
    lineupRequired: candidate.lineupRequired === true,
    lineupConfidence: candidate.lineupConfidence || 'not_required',
    voidRisk: candidate.voidRisk || 'low',
    safeEligible: candidate.safeEligible !== false,
    ruleWarnings: candidate.ruleWarnings || [],
  }));
}

function buildUpcomingGamesContext(candidates) {
  const seenGames = new Set();

  return candidates.reduce((items, candidate) => {
    if (!candidate.game || seenGames.has(candidate.game)) {
      return items;
    }

    seenGames.add(candidate.game);
    items.push({
      game: candidate.game,
      status: candidate.espnStatus || 'unmatched',
      statusSource: candidate.statusSource || 'odds_only',
      startTime: candidate.startTime,
    });
    return items;
  }, []);
}

function buildDailyPrompt(dateKey, promptCandidates, scoreboard, warnings) {
  const simplifiedCandidates = buildModelCandidates(promptCandidates);
  const context = {
    date: dateKey,
    gamesStatus: buildUpcomingGamesContext(promptCandidates).slice(0, 8),
    warnings,
  };

  return `
Build Daily Ticket AI for MLB using ONLY the candidates below.
Return JSON only.
Return raw JSON only.
No markdown.
Do not use markdown.
No text outside JSON.
Do not wrap in \`\`\`json.
The first character must be {.
The last character must be }.
Exactly 3 tickets.
Ticket Seguro: max 3 legs.
Estilo Emi: max 3 legs.
Free Bet: max 5 legs.
Do not include more than one MLB player prop from the same team in the same ticket.
Prefer Money Line for safe tickets.
Player props require starting lineup confidence.
Avoid correlated player props that Draftea may reject.
Build varied tickets.
Do not make all tickets Money Line unless no other markets are available.
Prefer the most accurate market per ticket type.
Safe can be conservative.
Estilo Emi should mix markets.
Free Bet should prefer player props when available.
Do not invent props not present in candidates.
Respect Draftea: max one player prop per team per ticket.
Do not use more than one pick from the same game in the same ticket.
Do not pick both sides of the same game.
Do not pick over and under from the same game.
Prefer picks with higher confidenceScore.
Use valueScore and volatilityScore to balance risk.
If preferredMarket is "spread", do not choose the moneyline version unless the ticket is Free Bet and the confidenceScore is still strong.
Do not change candidate id or pick details.
If player props are unavailable, build variety using moneyline, spread and totals.
Safe can use max 2 ML.
Estilo Emi should mix ML/spread/total when props are unavailable.
Free Bet should avoid 5 ML legs unless it is the only available market type.
Use only candidates provided below.
Return candidate id in each leg as "id".
Do not mark tickets unavailable if there are enough candidates.
If unsure, choose the highest confidenceScore candidates.
Each "w" max 5 words.
"avoid" max 2 items.
"summary" max 80 characters.
Do not include raw API data.
Do not include bookmaker lists.
Do not include long reasoning.
Do not mention finished games.
Do not include completed games in summary.
Do not include completed games in avoid.
Avoid list must only include upcoming games or risky markets from valid candidates.
If there are few valid candidates, say "Opciones limitadas disponibles", but do not mention finished games.
Use Spanish.

Candidates:
${JSON.stringify(simplifiedCandidates, null, 2)}

Context:
${JSON.stringify(context, null, 2)}

Expected JSON:
{
  "date": "YYYY-MM-DD",
  "generatedAt": "ISO",
  "summary": "string max 80 chars",
  "tickets": [
    {
      "type": "safe",
      "name": "Ticket Seguro",
      "odds": "2.0x-3.0x",
      "risk": "low",
      "stake": "$50-$100 MXN",
      "legs": [
        {
          "id": "",
          "g": "",
          "p": "",
          "m": "",
          "o": "",
          "w": "max 5 words"
        }
      ]
    },
    {
      "type": "emi",
      "name": "Estilo Emi",
      "odds": "3.0x-5.0x",
      "risk": "medium",
      "stake": "$50-$75 MXN",
      "legs": []
    },
    {
      "type": "free_bet",
      "name": "Free Bet",
      "odds": "5.0x-10.0x",
      "risk": "high",
      "stake": "Apuesta gratis",
      "legs": []
    }
  ],
  "avoid": [],
  "disclaimer": "Análisis informativo."
}
  `.trim();
}

function buildCandidateIndex(candidates) {
  const index = new Map();
  candidates.forEach((candidate) => {
    if (candidate.candidateId) {
      index.set(`id:${candidate.candidateId}`, candidate);
    }
    const exactKey = [
      normalizeKey(candidate.game),
      normalizeKey(candidate.pick),
      normalizeKey(candidate.market),
    ].join('|');
    index.set(exactKey, candidate);
  });
  return index;
}

function findCandidateForLeg(leg, candidateIndex, candidates) {
  const byId = candidateIndex.get(`id:${String(leg?.id || leg?.candidateId || '').trim()}`);
  if (byId) {
    return byId;
  }

  const exactKey = [
    normalizeKey(leg?.game || leg?.g),
    normalizeKey(leg?.pick || leg?.p),
    normalizeKey(leg?.market || leg?.m),
  ].join('|');

  const exact = candidateIndex.get(exactKey);
  if (exact) {
    return exact;
  }

  return candidates.find((candidate) => (
    normalizeKey(candidate.game) === normalizeKey(leg?.game || leg?.g)
      && normalizeKey(candidate.market) === normalizeKey(leg?.market || leg?.m)
  )) || null;
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 60;
  }
  return Math.max(1, Math.min(100, Math.round(numeric)));
}

function trimWords(text, maxWords) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return '';
  }

  const words = normalized.split(/\s+/).slice(0, maxWords);
  return words.join(' ');
}

function trimChars(text, maxChars) {
  const normalized = String(text || '').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return normalized.slice(0, maxChars).trim();
}

function mentionsFinishedGames(text) {
  const normalized = normalizeKey(text);
  return normalized.includes('finalizado')
    || normalized.includes('finalizados')
    || normalized.includes('completed')
    || normalized.includes('final');
}

function sanitizeSummary(text) {
  const trimmed = trimChars(String(text || '').trim(), 80);
  if (!trimmed) {
    return 'Opciones limitadas disponibles.';
  }

  if (mentionsFinishedGames(trimmed)) {
    return 'Opciones limitadas disponibles.';
  }

  return trimmed;
}

function sanitizeAvoidList(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter(Boolean)
    .map((item) => trimChars(item, 80))
    .filter((item) => item && !mentionsFinishedGames(item))
    .slice(0, 2);
}

function buildUnavailableTicket(type, reason) {
  return {
    ...TICKET_DEFAULTS[type],
    type,
    available: false,
    reason,
    legs: [],
  };
}

function sanitizeTicketResponse(modelOutput, candidates, warnings) {
  const candidateIndex = buildCandidateIndex(candidates);
  const globalWarnings = Array.isArray(warnings) ? [...warnings] : [];
  const modelTickets = Array.isArray(modelOutput?.tickets) ? modelOutput.tickets : [];

  const tickets = Object.keys(TICKET_DEFAULTS).map((type) => {
    if (type === 'free_bet' && candidates.length <= 3) {
      return buildUnavailableTicket(type, 'Not enough valid picks available.');
    }

    const modelTicket = modelTickets.find((ticket) => ticket?.type === type) || {};
    const legs = Array.isArray(modelTicket.legs) ? modelTicket.legs : [];
    const sanitizedLegs = [];

    legs.slice(0, TICKET_LEG_LIMITS[type]).forEach((leg) => {
      const hydratedLeg = hydrateLegFromCandidateId(leg, candidateIndex, candidates, type);
      if (!hydratedLeg) {
        return;
      }

       if (Number(hydratedLeg.odds) > TICKET_MAX_ODDS[type]) {
        return;
      }

      sanitizedLegs.push(hydratedLeg);
    });

    if (sanitizedLegs.length === 0) {
      return buildUnavailableTicket(type, 'Not enough valid picks available.');
    }

    return {
      ...TICKET_DEFAULTS[type],
      type,
      name: TICKET_DEFAULTS[type].name,
      odds: TICKET_DEFAULTS[type].odds,
      risk: TICKET_DEFAULTS[type].risk,
      stake: TICKET_DEFAULTS[type].stake,
      warnings: [],
      legs: sanitizedLegs,
    };
  });

  return {
    date: modelOutput?.date || getTodayDateKey(),
    generatedAt: modelOutput?.generatedAt || new Date().toISOString(),
    title: modelOutput?.title || 'Ticket del Dia',
    summary: sanitizeSummary(
      modelOutput?.summary || 'Analisis diario compacto generado con MLB odds y contexto de ESPN.'
    ),
    tickets,
    avoid: sanitizeAvoidList(modelOutput?.avoid),
    disclaimer: modelOutput?.disclaimer || 'Análisis informativo.',
    warnings: globalWarnings,
  };
}

function buildFallbackLeg(candidate, why) {
  return {
    candidateId: candidate.candidateId || '',
    game: candidate.game,
    pick: candidate.pick,
    market: candidate.market,
    odds: candidate.oddsDecimal.toFixed(2),
    candidateType: candidate.candidateType || 'game_market',
    candidateTeam: candidate.candidateTeam || '',
    lineupRequired: candidate.lineupRequired === true,
    voidRisk: candidate.voidRisk || 'low',
    confidence: clampConfidence(candidate.confidenceScore ?? candidate.confidence ?? scoreCandidate(candidate)),
    valueScore: Number(candidate.valueScore || 0),
    ruleWarnings: candidate.ruleWarnings || [],
    teamResolved: candidate.teamResolved === true,
    oddsVerified: candidate.oddsVerified !== false,
    protected: candidate.protectionSuggested === true,
    marketProtectionApplied: candidate.protectionSuggested === true,
    protectionReason: candidate.protectionSuggested === true ? (candidate.protectionReason || '') : '',
    why: sanitizeLegWhy(why, candidate),
    confidenceSource: 'intelligence',
    confidenceAdjusted: false,
    lowConfidenceOverride: false,
  };
}

function isPlayerPropMarketCategory(category) {
  return [
    'player_hit',
    'player_total_bases',
    'player_runs',
    'player_rbi',
    'player_hrr',
    'pitcher_strikeouts',
    'pitcher_hits_allowed',
    'other_player_prop',
  ].includes(String(category || ''));
}

function isUsableTicketItem(ticketItem) {
  return ticketItem?.available !== false && Array.isArray(ticketItem?.legs) && ticketItem.legs.length > 0;
}

function getTicketLegCounts(ticket) {
  const allLegs = Array.isArray(ticket?.tickets)
    ? ticket.tickets.flatMap((item) => (Array.isArray(item?.legs) ? item.legs : []))
    : [];
  const finalPropsUsed = allLegs.filter((leg) => leg?.candidateType === 'player_prop' || leg?.lineupRequired === true).length;
  const finalGameMarketsUsed = Math.max(0, allLegs.length - finalPropsUsed);
  const confidenceValues = allLegs
    .map((leg) => Number(leg?.confidence))
    .filter((value) => Number.isFinite(value));
  const protectedMarketsUsed = allLegs.filter((leg) => String(leg?.market || '').toLowerCase() === 'spreads').length;

  return {
    totalLegs: allLegs.length,
    finalPropsUsed,
    finalGameMarketsUsed,
    avgTicketConfidence: confidenceValues.length
      ? Math.round(confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length)
      : 0,
    lowestLegConfidence: confidenceValues.length ? Math.min(...confidenceValues) : 0,
    protectedMarketsUsed,
  };
}

function sortCandidatesForRebuild(candidates, ticketType) {
  return [...candidates].sort((left, right) => {
    const leftScore = scoreCandidate(left) + (left.market === 'h2h' ? 8 : 0) + (left.marketCategory === 'pitcher_strikeouts' ? 12 : 0);
    const rightScore = scoreCandidate(right) + (right.market === 'h2h' ? 8 : 0) + (right.marketCategory === 'pitcher_strikeouts' ? 12 : 0);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    if (ticketType === 'safe') {
      return Number(left.oddsDecimal) - Number(right.oddsDecimal);
    }

    return Number(right.oddsDecimal) - Number(left.oddsDecimal);
  });
}

function rebuildTicketFromCandidatePool(type, promptCandidates, context = {}) {
  const propsAvailable = Number(context.promptPropsCount || 0) > 0;
  const sorted = sortCandidatesForRebuild(uniqueCandidatesByKey(promptCandidates), type);
  const selected = [];
  const usedGames = new Set();
  const usedPropTeams = new Set();
  const maxLegs = TICKET_LEG_LIMITS[type];
  const targetLegs = type === 'safe' ? 3 : type === 'emi' ? 3 : 5;

  function canUse(candidate) {
    if (!candidate || selected.length >= maxLegs) {
      return false;
    }

    const gameKey = normalizeKey(candidate.game);
    if (usedGames.has(gameKey)) {
      return false;
    }

    if (candidate.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate.marketCategory)) {
      const teamKey = normalizeKey(candidate.candidateTeam || candidate.playerTeam || '');
      if (teamKey && usedPropTeams.has(teamKey)) {
        return false;
      }
    }

    return true;
  }

  function addCandidate(candidate) {
    if (!canUse(candidate)) {
      return false;
    }

    selected.push(candidate);
    usedGames.add(normalizeKey(candidate.game));
    if (candidate.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate.marketCategory)) {
      const teamKey = normalizeKey(candidate.candidateTeam || candidate.playerTeam || '');
      if (teamKey) {
        usedPropTeams.add(teamKey);
      }
    }
    return true;
  }

  function addFirst(predicate) {
    const candidate = sorted.find((item) => predicate(item) && canUse(item));
    if (candidate) {
      addCandidate(candidate);
    }
  }

  const isProp = (candidate) => candidate.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate.marketCategory);
  const isPreferredProp = (candidate) => ['pitcher_strikeouts', 'player_hit', 'player_total_bases'].includes(candidate.marketCategory);
  const isGameMarket = (candidate) => !isProp(candidate);

  if (type === 'safe') {
    addFirst((candidate) => (
      isGameMarket(candidate)
      && candidate.market === 'spreads'
      && candidate.preferredMarket === 'spread'
      && String(candidate.pick || '').includes('+1.5')
    ));
    addFirst((candidate) => (
      isGameMarket(candidate)
      && candidate.market === 'h2h'
      && candidate.voidRisk === 'low'
      && candidate.preferredMarket !== 'spread'
    ));
    addFirst((candidate) => isGameMarket(candidate) && candidate.market === 'spreads' && String(candidate.pick || '').includes('+1.5'));
    addFirst((candidate) => isGameMarket(candidate) && (candidate.market === 'totals' || candidate.market === 'h2h'));
    if (propsAvailable && selected.length < 2) {
      addFirst((candidate) => isProp(candidate) && isPreferredProp(candidate) && candidate.lineupConfidence === 'confirmed');
    }
  } else if (type === 'emi') {
    if (propsAvailable) {
      addFirst((candidate) => isProp(candidate) && isPreferredProp(candidate));
    }
    addFirst((candidate) => isGameMarket(candidate) && candidate.market === 'spreads');
    addFirst((candidate) => isGameMarket(candidate) && candidate.market === 'h2h' && candidate.preferredMarket !== 'spread');
    addFirst((candidate) => isGameMarket(candidate) && (candidate.market === 'spreads' || candidate.market === 'totals' || candidate.market === 'h2h'));
  } else {
    if (propsAvailable) {
      addFirst((candidate) => isProp(candidate) && isPreferredProp(candidate));
      addFirst((candidate) => isProp(candidate) && canUse(candidate));
    }
    addFirst((candidate) => isGameMarket(candidate) && candidate.market === 'h2h');
    addFirst((candidate) => isGameMarket(candidate) && candidate.market === 'spreads');
    addFirst((candidate) => isGameMarket(candidate) && candidate.market === 'totals');
  }

  sorted.forEach((candidate) => {
    if (selected.length >= Math.min(targetLegs, maxLegs)) {
      return;
    }
    addCandidate(candidate);
  });

  if (selected.length === 0) {
    return buildUnavailableTicket(type, 'Not enough valid picks available.');
  }

  return {
    ...TICKET_DEFAULTS[type],
    type,
    warnings: [],
    legs: selected.map((candidate) => buildFallbackLeg(
      candidate,
      isProp(candidate) ? 'Prop verificada del feed' : candidate.market === 'h2h' ? 'Money Line mas limpio' : `Valor en ${candidate.market}`
    )),
  };
}

function rebuildEmptyTicketsFromPromptCandidates(ticket, promptCandidates, context = {}) {
  const rebuiltTickets = Array.isArray(ticket?.tickets) ? ticket.tickets.map((item) => {
    if (isUsableTicketItem(item)) {
      return item;
    }

    return rebuildTicketFromCandidatePool(item?.type || 'safe', promptCandidates, context);
  }) : [];

  return {
    ...ticket,
    tickets: rebuiltTickets,
  };
}

function areAllTicketsEmptyOrUnavailable(ticket) {
  const tickets = Array.isArray(ticket?.tickets) ? ticket.tickets : [];
  if (tickets.length === 0) {
    return true;
  }

  return tickets.every((item) => !isUsableTicketItem(item));
}

function uniqueCandidatesByKey(candidates) {
  const seen = new Set();

  return candidates.filter((candidate) => {
    const key = [
      normalizeKey(candidate.game),
      normalizeKey(candidate.pick),
      normalizeKey(candidate.market),
    ].join('|');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function takeCandidates(candidates, limit, usedKeys, preferredMarkets = []) {
  const sorted = [...candidates].sort((left, right) => scoreCandidate(right) - scoreCandidate(left));
  const selected = [];

  preferredMarkets.forEach((market) => {
    sorted.forEach((candidate) => {
      if (selected.length >= limit) {
        return;
      }

      const key = [
        normalizeKey(candidate.game),
        normalizeKey(candidate.pick),
        normalizeKey(candidate.market),
      ].join('|');

      if (usedKeys.has(key) || candidate.market !== market) {
        return;
      }

      selected.push(candidate);
      usedKeys.add(key);
    });
  });

  sorted.forEach((candidate) => {
    if (selected.length >= limit) {
      return;
    }

    const key = [
      normalizeKey(candidate.game),
      normalizeKey(candidate.pick),
      normalizeKey(candidate.market),
    ].join('|');

    if (usedKeys.has(key)) {
      return;
    }

    selected.push(candidate);
    usedKeys.add(key);
  });

  return selected;
}

function buildFallbackTicket(type, candidates, whyBuilder) {
  if (candidates.length === 0) {
    return buildUnavailableTicket(type, 'Not enough valid picks available.');
  }

  return {
    ...TICKET_DEFAULTS[type],
    type,
    warnings: [],
    legs: candidates.map((candidate) => buildFallbackLeg(candidate, whyBuilder(candidate))),
  };
}

function buildDeterministicFallbackTicket(targetDate, candidates, warnings = []) {
  const globalWarnings = [
    ...(Array.isArray(warnings) ? warnings : []),
    'AI output was truncated; fallback ticket generated from filtered odds.',
  ];

  const uniqueCandidates = uniqueCandidatesByKey(candidates);
  const safePool = uniqueCandidates.filter((candidate) => candidate.market === 'h2h' && candidate.voidRisk === 'low');
  const usedSafeKeys = new Set();
  const safeCandidates = takeCandidates(safePool, TICKET_LEG_LIMITS.safe, usedSafeKeys, ['h2h']);

  const usedEmiKeys = new Set();
  const emiPool = uniqueCandidates.filter((candidate) => !safeCandidates.includes(candidate));
  const emiCandidates = takeCandidates(emiPool, TICKET_LEG_LIMITS.emi, usedEmiKeys, ['h2h', 'spreads', 'totals']);

  const usedFreeKeys = new Set();
  const freePool = uniqueCandidates.filter((candidate) => (
    !safeCandidates.includes(candidate) && !emiCandidates.includes(candidate)
  ));
  const freeCandidates = takeCandidates(freePool, TICKET_LEG_LIMITS.free_bet, usedFreeKeys, ['h2h', 'spreads', 'totals']);

  return {
    date: targetDate,
    generatedAt: new Date().toISOString(),
    title: 'Ticket del Dia',
    summary: 'Fallback compacto desde odds filtrados.',
    tickets: [
      buildFallbackTicket('safe', safeCandidates, () => 'Money Line mas limpio'),
      buildFallbackTicket('emi', emiCandidates, (candidate) => (
        candidate.market === 'h2h' ? 'Valor directo en ML' : `Valor en ${candidate.market}`
      )),
      buildFallbackTicket('free_bet', freeCandidates, (candidate) => (
        candidate.market === 'h2h' ? 'Cuota agresiva con ML' : `Cuota util en ${candidate.market}`
      )),
    ],
    avoid: [],
    disclaimer: 'Análisis informativo.',
    warnings: globalWarnings,
  };
}

async function getTodayTicket() {
  const cache = await readCache(getTicketCacheFilename(getTodayDateKey()), {
    allowStale: true,
  });

  return cache.data || null;
}

async function getTicketByDate(dateKey) {
  const cache = await readCache(getTicketCacheFilename(dateKey), {
    allowStale: true,
  });

  return cache.data || null;
}

async function getUpcomingTicket() {
  const todayDateKey = getTodayDateKey();
  const todayTicket = await getTicketByDate(todayDateKey);
  if (todayTicket) {
    return todayTicket;
  }

  return getTicketByDate(getTomorrowDateKey());
}

async function getHistory(limit = 5) {
  const files = await listCacheFiles('daily-ticket-');
  const latest = files
    .sort((left, right) => right.localeCompare(left))
    .slice(0, limit);

  const history = [];
  for (const file of latest) {
    const filePath = getCacheFilePath(file);
    const ticket = await readJsonFile(filePath);
    if (ticket) {
      history.push(ticket);
    }
  }

  return history;
}

async function getStatus() {
  const todayTicket = await getTodayTicket();
  const upcomingTicket = todayTicket || await getTicketByDate(getTomorrowDateKey());

  return {
    hasTicketToday: Boolean(todayTicket),
    canGenerate: !todayTicket && bedrockService.isConfigured() && oddsService.isConfigured(),
    source: todayTicket ? 'cache' : 'none',
    bedrockConfigured: bedrockService.isConfigured(),
    oddsConfigured: oddsService.isConfigured(),
    footballConfigured: footballService.isConfigured(),
    espnAvailable: true,
    lastGeneratedAt: todayTicket?.generatedAt || '',
    upcomingTargetDate: upcomingTicket?.date || '',
    maxAiGenerationsPerDay: MAX_AI_GENERATIONS_PER_DAY,
  };
}

async function getDashboard() {
  logGenerateStage('DASHBOARD_BUILD', {
    note: 'Building dashboard without Bedrock or Odds API calls',
  });
  const [status, todayTicket, upcomingTicket, history, scoreboard] = await Promise.all([
    getStatus(),
    getTodayTicket(),
    getUpcomingTicket(),
    getHistory(5),
    espnService.getMlbScoreboardBundle({
      includeTomorrow: true,
    }),
  ]);

  return {
    status,
    ticket: todayTicket || upcomingTicket,
    todayTicket,
    upcomingTicket,
    history,
    games: scoreboard,
    todayGamesTotal: scoreboard.todayGamesTotal,
    renderedGamesTotal: scoreboard.renderedGamesTotal,
    liveGamesTotal: scoreboard.liveGamesTotal,
    finalGamesTotal: scoreboard.finalGamesTotal,
    scheduledGamesTotal: scoreboard.scheduledGamesTotal,
    postponedGamesTotal: scoreboard.postponedGamesTotal,
    tomorrowGamesTotal: scoreboard.tomorrowGamesTotal,
    scoreboardSource: scoreboard.scoreboardSource,
  };
}

function buildTicketResponse(ticket, options = {}) {
  const {
    source = 'generated',
    cached = false,
    sourceDateReason = '',
  } = options;

  return {
    success: true,
    source,
    targetDate: ticket?.date || '',
    sourceDateReason,
    ticket,
    meta: ticket?.meta || {},
    cached,
  };
}

const MLB_TEAM_KEYWORDS = [
  'diamondbacks', 'dbacks', 'braves', 'orioles', 'red sox', 'cubs', 'white sox', 'reds',
  'guardians', 'rockies', 'tigers', 'astros', 'royals', 'angels', 'dodgers', 'marlins',
  'brewers', 'twins', 'mets', 'yankees', 'athletics', 'phillies', 'pirates',
  'padres', 'giants', 'mariners', 'cardinals', 'rays', 'devil rays', 'rangers',
  'blue jays', 'jays', 'nationals'
];

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAllowedWhyKeys(candidate) {
  return uniqueStrings([
    ...(String(candidate?.game || '').split(/\s+vs\s+|\s+/i)),
    ...(String(candidate?.pick || '').split(/\s+/)),
    ...(String(candidate?.candidateTeam || candidate?.playerTeam || '').split(/\s+/)),
    ...(String(candidate?.playerName || '').split(/\s+/)),
  ])
    .map((token) => normalizeKey(token))
    .filter((token) => token.length >= 3);
}

function getMentionedTeamKeywords(text) {
  const lowerText = String(text || '').toLowerCase();
  return MLB_TEAM_KEYWORDS.filter((keyword) => {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
    return pattern.test(lowerText);
  });
}

function mentionsUnexpectedTeam(text, candidate) {
  const mentionedTeams = getMentionedTeamKeywords(text);
  if (!mentionedTeams.length) {
    return false;
  }

  const allowedKeys = extractAllowedWhyKeys(candidate);
  return mentionedTeams.some((teamKeyword) => !allowedKeys.includes(normalizeKey(teamKeyword)));
}

function mentionsUnexpectedPlayer(text, candidate) {
  if (!candidate?.playerName) {
    return false;
  }

  const explicitNameMatches = String(text || '').match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g) || [];
  if (!explicitNameMatches.length) {
    return false;
  }

  const candidatePlayerKey = normalizeKey(candidate.playerName);
  return explicitNameMatches.some((name) => normalizeKey(name) !== candidatePlayerKey);
}

function whyContradictsMarket(text, candidate) {
  const lowerText = String(text || '').toLowerCase();
  const market = String(candidate?.market || '').toLowerCase();
  const marketCategory = String(candidate?.marketCategory || '').toLowerCase();

  if (market === 'pitcher_strikeouts' || marketCategory === 'pitcher_strikeouts') {
    return /\bspread\b|\bcobertura\b|\bprotector\b|\btotal\b|\bcarreras\b|\bml\b|\bmoney line\b/.test(lowerText);
  }

  if (market === 'batter_hits') {
    return /\bspread\b|\btotal\b|\bcarreras\b|\bponches\b|\bstrikeouts?\b/.test(lowerText);
  }

  if (market === 'batter_total_bases') {
    return /\bspread\b|\btotal\b|\bcarreras\b|\bponches\b|\bstrikeouts?\b/.test(lowerText);
  }

  if (market === 'batter_home_runs' || marketCategory === 'other_player_prop') {
    return /\bspread\b|\bml\b|\bmoney line\b|\bcobertura\b/.test(lowerText);
  }

  if (market === 'h2h') {
    return /\bspread\b|\bponches\b|\bstrikeouts?\b|\bhit\b|\bhits\b|\bbases\b|\blineup\b|\btotal\b/.test(lowerText);
  }

  if (market === 'spreads') {
    return /\bponches\b|\bstrikeouts?\b|\bhit\b|\bhits\b|\bbases\b|\bmoney line\b|\bml\b/.test(lowerText);
  }

  if (market === 'totals') {
    return /\bspread\b|\bponches\b|\bstrikeouts?\b|\bhit\b|\bhits\b|\bbases\b|\bmoney line\b|\bml\b/.test(lowerText);
  }

  return false;
}

function buildDefaultWhyFromCandidate(candidate, ticketType = '') {
  const market = String(candidate?.market || '').toLowerCase();
  const marketCategory = String(candidate?.marketCategory || '').toLowerCase();

  if (market === 'h2h') {
    return 'Pick directo basado en mercado verificado y cuota disponible.';
  }

  if (market === 'spreads') {
    return 'Spread elegido por cobertura adicional; requiere juego completo.';
  }

  if (market === 'totals') {
    return 'Total elegido por mezcla de mercados; requiere juego completo.';
  }

  if (market === 'pitcher_strikeouts' || marketCategory === 'pitcher_strikeouts') {
    return 'Prop de ponches verificada en The Odds API; requiere confirmar pitcher abridor.';
  }

  if (market === 'batter_hits' || marketCategory === 'player_hit') {
    return 'Prop de hit verificada; requiere confirmar lineup.';
  }

  if (market === 'batter_total_bases' || marketCategory === 'player_total_bases') {
    return 'Prop de bases totales verificada; mayor volatilidad que hit simple.';
  }

  if (market === 'batter_home_runs' || marketCategory === 'other_player_prop') {
    return ticketType === 'free_bet'
      ? 'Prop de alta volatilidad, adecuada solo para Free Bet.'
      : 'Prop de alta volatilidad; usar con cautela.';
  }

  return 'Pick respaldado por mercado verificado y seleccion filtrada.';
}

function sanitizeLegWhy(rawWhy, candidate, ticketType = '') {
  const text = trimChars(String(rawWhy || '').trim(), 160);
  if (!text) {
    return buildDefaultWhyFromCandidate(candidate, ticketType);
  }

  if (mentionsUnexpectedTeam(text, candidate)) {
    return buildDefaultWhyFromCandidate(candidate, ticketType);
  }

  if (mentionsUnexpectedPlayer(text, candidate)) {
    return buildDefaultWhyFromCandidate(candidate, ticketType);
  }

  if (whyContradictsMarket(text, candidate)) {
    return buildDefaultWhyFromCandidate(candidate, ticketType);
  }

  return text;
}

function isGameMarketWhyValid(rawWhy, candidate) {
  const text = trimChars(String(rawWhy || '').trim(), 160);
  if (!text) {
    return false;
  }

  if (mentionsUnexpectedTeam(text, candidate)) {
    return false;
  }

  if (mentionsUnexpectedPlayer(text, candidate)) {
    return false;
  }

  if (whyContradictsMarket(text, candidate)) {
    return false;
  }

  return true;
}

function sanitizeFinalTicketWhy(ticket, candidates = []) {
  const candidateIndex = buildCandidateIndex(candidates);
  const summary = {
    totalLegs: 0,
    replaced: 0,
    playerPropsForced: 0,
    gameMarketsReplaced: 0,
  };

  const sanitizedTickets = Array.isArray(ticket?.tickets)
    ? ticket.tickets.map((ticketItem) => {
      const ticketType = ticketItem?.type || '';
      const sanitizedLegs = Array.isArray(ticketItem?.legs)
        ? ticketItem.legs.map((leg) => {
          summary.totalLegs += 1;

          const candidate = findCandidateForLeg(leg, candidateIndex, candidates);
          if (!candidate) {
            return {
              ...leg,
              why: trimChars(String(leg?.why || ''), 160),
              whySource: leg?.whySource || 'ai_clean',
              whyReplaced: leg?.whyReplaced === true,
            };
          }

          const candidateType = candidate?.candidateType || leg?.candidateType || 'game_market';
          const defaultWhy = buildDefaultWhyFromCandidate(candidate, ticketType);
          const currentWhy = String(leg?.why || '').trim();

          if (candidateType === 'player_prop') {
            summary.playerPropsForced += 1;
            const replaced = currentWhy !== defaultWhy;
            if (replaced) {
              summary.replaced += 1;
            }

            return {
              ...leg,
              why: defaultWhy,
              whySource: 'backend_default',
              whyReplaced: replaced,
            };
          }

          if (isGameMarketWhyValid(currentWhy, candidate)) {
            return {
              ...leg,
              why: trimChars(currentWhy, 160),
              whySource: 'ai_clean',
              whyReplaced: false,
            };
          }

          summary.replaced += 1;
          summary.gameMarketsReplaced += 1;

          return {
            ...leg,
            why: defaultWhy,
            whySource: 'backend_default',
            whyReplaced: true,
          };
        })
        : [];

      return {
        ...ticketItem,
        legs: sanitizedLegs,
      };
    })
    : [];

  logGenerateStage('WHY_SANITIZED', summary);

  return {
    ...ticket,
    tickets: sanitizedTickets,
  };
}

function buildConfidenceCandidateKey(candidate) {
  return [
    normalizeKey(candidate?.game),
    normalizeKey(candidate?.pick),
    normalizeKey(candidate?.market),
  ].join('|');
}

function buildTicketStateExcludingLeg(ticketItem, candidates = [], excludeIndex = -1) {
  const candidateIndex = buildCandidateIndex(candidates);
  const state = {
    usedGames: new Set(),
    usedKeys: new Set(),
    usedPropTeams: new Set(),
    totalCount: 0,
  };

  (Array.isArray(ticketItem?.legs) ? ticketItem.legs : []).forEach((leg, index) => {
    if (index === excludeIndex) {
      return;
    }

    const candidate = findCandidateForLeg(leg, candidateIndex, candidates);
    if (!candidate) {
      return;
    }

    state.usedGames.add(normalizeKey(candidate.game));
    state.usedKeys.add(buildConfidenceCandidateKey(candidate));

    if (String(candidate.marketCategory || candidate.market || '').toLowerCase() === 'total') {
      state.totalCount += 1;
    }

    if (candidate.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate.marketCategory)) {
      const teamKey = normalizeKey(candidate.candidateTeam || candidate.playerTeam || '');
      if (teamKey) {
        state.usedPropTeams.add(teamKey);
      }
    }
  });

  return state;
}

function canUseConfidenceReplacement(ticketType, candidate, state) {
  if (!candidate) {
    return false;
  }

  const meetsThreshold = meetsTicketConfidenceThreshold(ticketType, candidate)
    || shouldKeepValidatedPlayerProp(ticketType, candidate);

  if (!meetsThreshold) {
    return false;
  }

  if (state.usedGames.has(normalizeKey(candidate.game))) {
    return false;
  }

  if (state.usedKeys.has(buildConfidenceCandidateKey(candidate))) {
    return false;
  }

  if (ticketType === 'safe') {
    if (String(candidate.voidRisk || '') === 'high') {
      return false;
    }

    if (String(candidate.marketCategory || candidate.market || '').toLowerCase() === 'total' && state.totalCount >= 1) {
      return false;
    }

    if (
      (candidate.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate.marketCategory))
      && String(candidate.voidRisk || '') === 'high'
    ) {
      return false;
    }

    if (String(candidate.market || '').toLowerCase() === 'h2h' && String(candidate.preferredMarket || '') === 'spread') {
      return false;
    }
  }

  if (
    ticketType === 'emi'
    && String(candidate.market || '').toLowerCase() === 'h2h'
    && String(candidate.preferredMarket || '') === 'spread'
    && Number(candidate.confidenceScore || 0) < 72
  ) {
    return false;
  }

  if (candidate.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate.marketCategory)) {
    const teamKey = normalizeKey(candidate.candidateTeam || candidate.playerTeam || '');
    if (teamKey && state.usedPropTeams.has(teamKey)) {
      return false;
    }
  }

  return true;
}

function isPreferredPlayerPropCategory(category) {
  return ['pitcher_strikeouts', 'player_hit', 'player_total_bases'].includes(String(category || '').toLowerCase());
}

function shouldKeepValidatedPlayerProp(ticketType, candidate) {
  const category = String(candidate?.marketCategory || candidate?.market || '').toLowerCase();
  const confidence = Number(candidate?.confidenceScore ?? candidate?.confidence ?? 0);
  const valueScore = Number(candidate?.valueScore ?? 0);
  const isProp = candidate?.candidateType === 'player_prop' || isPlayerPropMarketCategory(category);

  if (!isProp || candidate?.oddsVerified !== true || candidate?.teamResolved !== true) {
    return false;
  }

  if (ticketType === 'emi') {
    return confidence >= 55 && isPreferredPlayerPropCategory(category);
  }

  if (ticketType === 'free_bet') {
    if (category === 'player_hrr') {
      return confidence >= 50 && valueScore >= 65;
    }

    return confidence >= 50 || valueScore >= 62;
  }

  return confidence >= 60
    && candidate?.lineupConfidence === 'confirmed'
    && String(candidate?.voidRisk || '').toLowerCase() !== 'high'
    && isPreferredPlayerPropCategory(category);
}

function sanitizeFinalTicketConfidence(ticket, candidates = []) {
  const candidateIndex = buildCandidateIndex(candidates);
  const sortedCandidatesByTicket = {
    safe: sortCandidatesForRebuild(candidates, 'safe'),
    emi: sortCandidatesForRebuild(candidates, 'emi'),
    free_bet: sortCandidatesForRebuild(candidates, 'free_bet'),
  };
  const summary = {
    totalLegs: 0,
    replacedLowConfidence: 0,
    keptLowConfidence: 0,
    lowestLegConfidence: 0,
    avgTicketConfidence: 0,
  };

  const sanitizedTickets = Array.isArray(ticket?.tickets)
    ? ticket.tickets.map((ticketItem) => {
      const ticketType = ticketItem?.type || 'safe';
      const warnings = new Set(Array.isArray(ticketItem?.warnings) ? ticketItem.warnings : []);
      const originalLegs = Array.isArray(ticketItem?.legs) ? ticketItem.legs : [];
      const nextLegs = [];

      originalLegs.forEach((leg, index) => {
        summary.totalLegs += 1;
        const candidate = findCandidateForLeg(leg, candidateIndex, candidates);

        if (!candidate) {
          nextLegs.push({
            ...leg,
            confidenceSource: 'intelligence',
            confidenceAdjusted: false,
            lowConfidenceOverride: false,
          });
          return;
        }

        const candidateConfidence = clampConfidence(candidate.confidenceScore);
        const candidateValueScore = Number(candidate.valueScore || 0);
        const passes = meetsTicketConfidenceThreshold(ticketType, candidate)
          || shouldKeepValidatedPlayerProp(ticketType, candidate);

        if (passes) {
          nextLegs.push({
            ...leg,
            confidence: candidateConfidence,
            valueScore: candidateValueScore,
            confidenceSource: 'intelligence',
            confidenceAdjusted: false,
            lowConfidenceOverride: false,
          });
          return;
        }

        const state = buildTicketStateExcludingLeg({
          ...ticketItem,
          legs: nextLegsPlaceholder(originalLegs, nextLegs, index),
        }, candidates, index);
        const replacement = sortedCandidatesByTicket[ticketType].find((entry) => (
          canUseConfidenceReplacement(ticketType, entry, state)
        ));

        if (replacement) {
          summary.replacedLowConfidence += 1;
          const hydrated = hydrateLegFromCandidateId({
            candidateId: replacement.candidateId,
            why: leg?.why || '',
          }, candidateIndex, candidates, ticketType);

          nextLegs.push({
            ...hydrated,
            valueScore: Number(replacement.valueScore || 0),
            confidenceSource: 'intelligence',
            confidenceAdjusted: true,
            lowConfidenceOverride: false,
          });
          return;
        }

        summary.keptLowConfidence += 1;
        warnings.add('Leg kept despite low confidence due to limited slate.');
        nextLegs.push({
          ...leg,
          confidence: candidateConfidence,
          valueScore: candidateValueScore,
          confidenceSource: 'intelligence',
          confidenceAdjusted: false,
          lowConfidenceOverride: true,
        });
      });

      return {
        ...ticketItem,
        warnings: Array.from(warnings),
        legs: nextLegs,
      };
    })
    : [];

  const sanitizedTicket = {
    ...ticket,
    tickets: sanitizedTickets,
  };
  const counts = getTicketLegCounts(sanitizedTicket);
  summary.lowestLegConfidence = counts.lowestLegConfidence;
  summary.avgTicketConfidence = counts.avgTicketConfidence;
  logGenerateStage('CONFIDENCE_SANITIZED', summary);
  return sanitizedTicket;
}

function getPropCountForTicketItem(ticketItem, candidates = []) {
  const candidateIndex = buildCandidateIndex(candidates);
  return (Array.isArray(ticketItem?.legs) ? ticketItem.legs : [])
    .map((leg) => findCandidateForLeg(leg, candidateIndex, candidates))
    .filter(Boolean)
    .filter((candidate) => candidate.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate.marketCategory))
    .length;
}

function getCandidateRetentionScore(ticketType, candidate) {
  const confidence = Number(candidate?.confidenceScore ?? candidate?.confidence ?? 0);
  const valueScore = Number(candidate?.valueScore ?? 0);
  const volatilityPenalty = Number(candidate?.volatilityScore ?? 0) / 8;
  let score = confidence + (valueScore / 3) - volatilityPenalty;

  if (candidate?.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate?.marketCategory)) {
    score += 18;
  }

  if (ticketType === 'safe' && String(candidate?.preferredMarket || '').toLowerCase() === 'spread') {
    score += String(candidate?.market || '').toLowerCase() === 'spreads' ? 10 : -14;
  }

  if (ticketType === 'emi' && String(candidate?.market || '').toLowerCase() === 'spreads') {
    score += 6;
  }

  if (String(candidate?.market || '').toLowerCase() === 'totals') {
    score -= 4;
  }

  if (candidate?.lowConfidenceOverride === true) {
    score -= 8;
  }

  return score;
}

function buildPropInsertionCandidatePool(ticketType, candidates = []) {
  const priorityByCategory = {
    pitcher_strikeouts: 0,
    player_hit: 1,
    player_total_bases: 2,
    player_runs: 3,
    player_rbi: 4,
    player_hrr: 5,
  };

  return [...candidates]
    .filter((candidate) => candidate?.candidateType === 'player_prop' || isPlayerPropMarketCategory(candidate?.marketCategory))
    .filter((candidate) => candidate?.eligibleForTicket === true)
    .filter((candidate) => candidate?.oddsVerified === true)
    .filter((candidate) => candidate?.teamResolved === true)
    .filter((candidate) => {
      if (ticketType === 'safe') {
        return shouldKeepValidatedPlayerProp('safe', candidate);
      }

      if (ticketType === 'emi') {
        return shouldKeepValidatedPlayerProp('emi', candidate);
      }

      return shouldKeepValidatedPlayerProp('free_bet', candidate);
    })
    .sort((left, right) => {
      const leftPriority = priorityByCategory[String(left?.marketCategory || '').toLowerCase()] ?? 99;
      const rightPriority = priorityByCategory[String(right?.marketCategory || '').toLowerCase()] ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftScore = getCandidateRetentionScore(ticketType, left);
      const rightScore = getCandidateRetentionScore(ticketType, right);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return normalizeKey(left?.pick).localeCompare(normalizeKey(right?.pick));
    });
}

function findPropReplacementIndex(ticketItem, candidates = []) {
  const candidateIndex = buildCandidateIndex(candidates);
  const ranked = (Array.isArray(ticketItem?.legs) ? ticketItem.legs : [])
    .map((leg, index) => ({
      leg,
      index,
      candidate: findCandidateForLeg(leg, candidateIndex, candidates),
    }))
    .filter((entry) => entry.candidate)
    .filter((entry) => !(entry.candidate?.candidateType === 'player_prop' || isPlayerPropMarketCategory(entry.candidate?.marketCategory)))
    .sort((left, right) => (
      getCandidateRetentionScore(ticketItem?.type || 'emi', left.candidate)
      - getCandidateRetentionScore(ticketItem?.type || 'emi', right.candidate)
    ));

  return ranked[0]?.index ?? -1;
}

function canInsertFinalProp(ticketType, candidate, state) {
  if (!candidate) {
    return false;
  }

  if (!canUseConfidenceReplacement(ticketType, candidate, state)) {
    return false;
  }

  if (ticketType === 'emi' && !isPreferredPlayerPropCategory(candidate?.marketCategory)) {
    return false;
  }

  if (ticketType === 'free_bet' && String(candidate?.marketCategory || '').toLowerCase() === 'player_hrr') {
    return Number(candidate?.confidenceScore ?? 0) >= 50 && Number(candidate?.valueScore ?? 0) >= 65;
  }

  return true;
}

function buildHydratedReplacementLeg(candidate, candidateIndex, candidates, ticketType) {
  const hydrated = hydrateLegFromCandidateId({
    candidateId: candidate?.candidateId,
    why: '',
  }, candidateIndex, candidates, ticketType);

  if (!hydrated) {
    return null;
  }

  return {
    ...hydrated,
    confidence: clampConfidence(candidate.confidenceScore ?? candidate.confidence ?? scoreCandidate(candidate)),
    valueScore: Number(candidate.valueScore || 0),
    confidenceSource: 'intelligence',
    confidenceAdjusted: true,
    lowConfidenceOverride: false,
  };
}

function ensurePropsForTicketItem(ticketItem, candidates = [], desiredProps = 0) {
  if (!ticketItem || ticketItem.available === false || desiredProps <= 0) {
    return {
      ticketItem,
      inserted: 0,
    };
  }

  const candidateIndex = buildCandidateIndex(candidates);
  const propPool = buildPropInsertionCandidatePool(ticketItem.type, candidates);
  const nextItem = {
    ...ticketItem,
    warnings: Array.isArray(ticketItem?.warnings) ? [...ticketItem.warnings] : [],
    legs: Array.isArray(ticketItem?.legs) ? [...ticketItem.legs] : [],
  };
  const maxLegs = TICKET_LEG_LIMITS[ticketItem.type] || nextItem.legs.length;
  let inserted = 0;

  while (getPropCountForTicketItem(nextItem, candidates) < desiredProps) {
    let replacementIndex = -1;
    let state;

    if (nextItem.legs.length < maxLegs) {
      state = buildTicketStateExcludingLeg(nextItem, candidates, -1);
    } else {
      replacementIndex = findPropReplacementIndex(nextItem, candidates);
      if (replacementIndex === -1) {
        break;
      }
      state = buildTicketStateExcludingLeg(nextItem, candidates, replacementIndex);
    }

    const replacementCandidate = propPool.find((candidate) => canInsertFinalProp(ticketItem.type, candidate, state));
    if (!replacementCandidate) {
      break;
    }

    const nextLeg = buildHydratedReplacementLeg(replacementCandidate, candidateIndex, candidates, ticketItem.type);
    if (!nextLeg) {
      break;
    }

    if (replacementIndex >= 0) {
      nextItem.legs[replacementIndex] = nextLeg;
    } else {
      nextItem.legs.push(nextLeg);
    }

    inserted += 1;
  }

  return {
    ticketItem: nextItem,
    inserted,
  };
}

function ensureFinalProps(ticket, candidates = [], options = {}) {
  const {
    propsAvailable = false,
  } = options;

  const beforeCounts = getTicketLegCounts(ticket);
  const result = {
    propsAvailable,
    beforeFinalPropsUsed: beforeCounts.finalPropsUsed,
    afterFinalPropsUsed: beforeCounts.finalPropsUsed,
    insertedEmiProps: 0,
    insertedFreeBetProps: 0,
    insertedFinalProps: 0,
    propsEnsured: false,
    skippedReason: '',
  };

  if (!propsAvailable) {
    result.skippedReason = 'no_bettable_props';
    logGenerateStage('FINAL_PROPS_ENSURED', result);
    return {
      ticket,
      diagnostics: result,
    };
  }

  const updatedTickets = Array.isArray(ticket?.tickets) ? ticket.tickets.map((item) => {
    if (item?.type === 'emi') {
      const ensured = ensurePropsForTicketItem(item, candidates, 1);
      result.insertedEmiProps += ensured.inserted;
      return ensured.ticketItem;
    }

    if (item?.type === 'free_bet') {
      const desired = Math.min(2, Math.max(1, buildPropInsertionCandidatePool('free_bet', candidates).length));
      const ensured = ensurePropsForTicketItem(item, candidates, desired);
      result.insertedFreeBetProps += ensured.inserted;
      return ensured.ticketItem;
    }

    return item;
  }) : [];

  const nextTicket = {
    ...ticket,
    tickets: updatedTickets,
  };
  const afterCounts = getTicketLegCounts(nextTicket);
  result.afterFinalPropsUsed = afterCounts.finalPropsUsed;
  result.insertedFinalProps = result.insertedEmiProps + result.insertedFreeBetProps;
  result.propsEnsured = result.insertedFinalProps > 0;

  if (afterCounts.finalPropsUsed === 0) {
    result.skippedReason = 'final_ticket_props_not_selected';
  }

  logGenerateStage('FINAL_PROPS_ENSURED', result);

  return {
    ticket: nextTicket,
    diagnostics: result,
  };
}

function finalizePropUsageWarnings(ticket, context = {}) {
  const {
    propsFeedAvailable = false,
    bettablePlayerProps = 0,
    promptPropsCount = 0,
    finalPropsUsed = 0,
  } = context;

  const warningsToRemove = new Set([
    'Player props unavailable from odds feed; using game markets only.',
    'Only game markets were available from the odds feed.',
    'Only Money Line markets were usable after Draftea and correlation filters.',
    'Player props were available and sent to prompt, but were not selected in final tickets.',
    PROPS_BLOCKED_TIME_LOCK_MESSAGE,
  ]);

  const updateWarnings = (warnings = []) => {
    const cleaned = uniqueStrings(warnings).filter((warning) => {
      if (!propsFeedAvailable) {
        return true;
      }

      if (finalPropsUsed > 0) {
        return !warningsToRemove.has(warning);
      }

      return true;
    });

    if (propsFeedAvailable && bettablePlayerProps > 0 && promptPropsCount > 0 && finalPropsUsed === 0) {
      cleaned.push('Player props were available and sent to prompt, but were not selected in final tickets.');
    }

    return uniqueStrings(cleaned);
  };

  return {
    ...ticket,
    warnings: updateWarnings(ticket?.warnings),
    tickets: Array.isArray(ticket?.tickets)
      ? ticket.tickets.map((item) => ({
        ...item,
        warnings: updateWarnings(item?.warnings),
      }))
      : [],
  };
}

function nextLegsPlaceholder(originalLegs = [], builtLegs = [], currentIndex = -1) {
  return (Array.isArray(originalLegs) ? originalLegs : []).map((leg, index) => {
    if (index < builtLegs.length) {
      return builtLegs[index];
    }

    if (index === currentIndex) {
      return null;
    }

    return leg;
  });
}

function hydrateLegFromCandidateId(leg, candidateMap, candidates = [], ticketType = '') {
  const candidateId = String(leg?.candidateId || leg?.id || '').trim();
  let candidate = candidateId ? candidateMap.get(`id:${candidateId}`) : null;

  if (!candidate) {
    candidate = findCandidateForLeg(leg, candidateMap, candidates);
  }

  if (!candidate) {
    return null;
  }

  return {
    candidateId: candidate.candidateId || candidateId,
    game: candidate.game,
    pick: candidate.pick,
    market: candidate.market,
    odds: String(leg?.o || leg?.odds || candidate.oddsDecimal.toFixed(2)),
    candidateType: candidate.candidateType || 'game_market',
    candidateTeam: candidate.candidateTeam || '',
    lineupRequired: candidate.lineupRequired === true,
    voidRisk: candidate.voidRisk || 'low',
    confidence: clampConfidence(candidate.confidenceScore ?? candidate.confidence ?? scoreCandidate(candidate)),
    valueScore: Number(candidate.valueScore || 0),
    ruleWarnings: candidate.ruleWarnings || [],
    teamResolved: candidate.teamResolved === true,
    oddsVerified: candidate.oddsVerified !== false,
    protected: candidate.protectionSuggested === true,
    marketProtectionApplied: candidate.protectionSuggested === true,
    protectionReason: candidate.protectionSuggested === true ? (candidate.protectionReason || '') : '',
    why: sanitizeLegWhy(
      leg?.w || leg?.why || leg?.reason,
      candidate,
      ticketType
    ),
    whySource: 'ai_clean',
    whyReplaced: false,
    confidenceSource: 'intelligence',
    confidenceAdjusted: false,
    lowConfidenceOverride: false,
  };
}

function reconcilePropWarnings(ticket, propsPayload) {
  const propWarning = 'Player props were found but not used because player-team integrity could not be verified.';
  const propsTimeLockWarning = PROPS_BLOCKED_TIME_LOCK_MESSAGE;
  const genericWarningsToRemove = new Set([
    'Player props unavailable from odds feed; using game markets only.',
    'Only game markets were available from the odds feed.',
    'Only Money Line markets were usable after Draftea and correlation filters.',
  ]);
  const hadFetchedProps = (propsPayload?.allProps?.length || 0) > 0;
  const hasEligibleProps = (propsPayload?.eligibleProps?.length || 0) > 0;
  const propsBlockedReason = propsPayload?.pipeline?.blockedReason || '';

  const sanitizeWarnings = (warnings = []) => {
    const cleaned = uniqueStrings(warnings).filter((warning) => {
      if (!hadFetchedProps) {
        return true;
      }

      return !genericWarningsToRemove.has(warning);
    });

    if (hadFetchedProps && !hasEligibleProps) {
      cleaned.push(propWarning);
    }

    if (propsBlockedReason === 'filtered_by_time_lock') {
      cleaned.push(propsTimeLockWarning);
    }

    return uniqueStrings(cleaned);
  };

  return {
    ...ticket,
    warnings: sanitizeWarnings(ticket?.warnings),
    tickets: Array.isArray(ticket?.tickets)
      ? ticket.tickets.map((item) => ({
        ...item,
        warnings: sanitizeWarnings(item?.warnings),
      }))
      : [],
  };
}

async function getBettableCandidatesForDate(dateKey, options = {}) {
  const {
    force = false,
    useCache = true,
    cacheOnly = false,
    limitPropEvents = MAX_PROP_EVENTS,
  } = options;

  logGenerateStage('TARGET_DATE_CHECK_START', {
    targetDate: dateKey,
    force,
  });

  let oddsPayload;
  let propsPayload;
  try {
    logGenerateStage('ODDS_FETCH', {
      targetDate: dateKey,
      forceRefresh: force,
    });
    [oddsPayload, propsPayload] = await Promise.all([
      oddsService.getMlbOdds({
        markets: 'h2h,spreads,totals',
        forceRefresh: force,
        useCache,
        cacheOnly,
        targetDate: dateKey,
      }),
      oddsService.getMlbPropsByDateViaEvents(dateKey, {
        forceRefresh: force,
        useCache,
        cacheOnly,
        limitEvents: limitPropEvents,
      }),
    ]);
  } catch (error) {
    const stageError = new DailyTicketGenerationError('odds', error.message || 'Failed to fetch odds.', error);
    if (oddsService.isQuotaError?.(error)) {
      stageError.errorCode = 'ODDS_API_QUOTA_REACHED';
      stageError.message = 'No odds cache available and The Odds API quota has been reached.';
    } else if (oddsService.isLiveDisabledError?.(error)) {
      stageError.errorCode = 'ODDS_API_LIVE_DISABLED';
      stageError.message = 'Live odds are disabled and no local odds cache is available.';
    }
    throw stageError;
  }

  const safePropsPayload = propsPayload || buildEmptyPropsPayload();

  logGenerateStage('ODDS_RAW_GAMES', {
    targetDate: dateKey,
    count: Array.isArray(oddsPayload.games) ? oddsPayload.games.length : 0,
    source: oddsPayload.source,
  });
  logGenerateStage('NORMALIZED_PICKS', {
    targetDate: dateKey,
    count: Array.isArray(oddsPayload.normalizedPicks) ? oddsPayload.normalizedPicks.length : 0,
  });
  logGenerateStage('PLAYER_PROPS_FETCH', {
    targetDate: dateKey,
    fetched: Array.isArray(safePropsPayload.allProps) ? safePropsPayload.allProps.length : 0,
    eligible: Array.isArray(safePropsPayload.eligibleProps) ? safePropsPayload.eligibleProps.length : 0,
    rejected: Array.isArray(safePropsPayload.rejectedProps) ? safePropsPayload.rejectedProps.length : 0,
  });

  let scoreboard;
  try {
    scoreboard = await espnService.getMlbScoreboard({
      dateKey,
    });
    logGenerateStage('ESPN_CACHE', {
      targetDate: dateKey,
      source: scoreboard.source,
      gamesCount: Array.isArray(scoreboard.games) ? scoreboard.games.length : 0,
    });
  } catch (error) {
    console.error('[daily-ticket] ESPN secondary data unavailable', {
      targetDate: dateKey,
      message: error.message,
    });
    scoreboard = {
      sport: 'MLB',
      date: dateKey,
      games: [],
      source: 'unavailable',
      message: 'ESPN data unavailable; continuing with Odds API only.',
    };
  }

  try {
    const warnings = [...(Array.isArray(oddsPayload.warnings) ? oddsPayload.warnings : [])];
    if (safePropsPayload.warning) {
      warnings.push(safePropsPayload.warning);
    }

    const eligibleProps = (Array.isArray(safePropsPayload.eligibleProps) ? safePropsPayload.eligibleProps : [])
      .filter((prop) => (
        prop?.eligibleForTicket === true
        && prop?.oddsVerified === true
        && prop?.teamResolved === true
        && Boolean(prop?.playerName)
      ));
    const allCandidates = [
      ...(Array.isArray(oddsPayload.normalizedPicks) ? oddsPayload.normalizedPicks : []),
      ...eligibleProps,
    ];
    const enrichedCandidates = enrichCandidates(allCandidates, scoreboard);
    const drafteaApplied = drafteaRulesService.applyDrafteaRules(enrichedCandidates);
    const historicalLearning = await getHistoricalLearningSummarySafe();
    const intelligenceApplied = pickEnrichmentService.enrichCandidates(drafteaApplied.candidates, {
      targetDate: dateKey,
      historicalLearning,
    });
    const intelligenceDiagnostics = {
      ...(intelligenceApplied?.diagnostics || {}),
      historicalPatternSummary: historicalLearning?.patternSnapshot || historicalPatternEngine.buildEmptyPatternSnapshot(),
    };
    const marketMixApplied = marketMixService.applyMarketMixStrategy(intelligenceApplied.candidates);
    const selection = selectBettableCandidates(marketMixApplied.candidates, new Date(), {
      targetDate: dateKey,
    });
    const marketMixCandidates = selection.candidates;
    const rankedCandidates = filterCandidatePicks(marketMixCandidates);
    const candidates = rankedCandidates;
    const propOnlySelection = selectBettableCandidates(
      marketMixApplied.candidates.filter((candidate) => isPlayerPropCandidate(candidate)),
      new Date(),
      { targetDate: dateKey }
    );
    const propsPipeline = {
      fetched: Array.isArray(safePropsPayload.allProps) ? safePropsPayload.allProps.length : 0,
      eligibleRaw: eligibleProps.length,
      afterStatusFilter: propOnlySelection.diagnostics.afterStatusFilter || 0,
      rejectedByStatus: propOnlySelection.diagnostics.rejectedStatus || 0,
      afterTimeFilter: propOnlySelection.diagnostics.afterTimeFilter || 0,
      rejectedByTime: propOnlySelection.diagnostics.rejectedTime || 0,
      afterOddsFilter: propOnlySelection.diagnostics.afterOddsFilter || 0,
      rejectedByOdds: propOnlySelection.diagnostics.rejectedOdds || 0,
      bettable: propOnlySelection.candidates.length,
      sentToPrompt: 0,
      finalUsed: 0,
    };
    const promptSourceCandidates = mergeCandidatePools(marketMixCandidates, propOnlySelection.candidates);
    let promptCandidates = marketMixService.preparePromptCandidates(promptSourceCandidates, MAX_CANDIDATES);
    promptCandidates = filterPromptCandidatesByConfidence(promptCandidates, promptSourceCandidates, MAX_CANDIDATES);
    const propsFeedAvailable = propsPipeline.fetched > 0;
    const propsAvailable = propsPipeline.bettable > 0;
    let promptSummary = summarizePromptCandidates(promptCandidates);
    propsPipeline.sentToPrompt = promptSummary.promptPropsCount;
    let propsBlockedReason = resolvePropsBlockedReason(propsPipeline);
    let propsBlockedMessage = propsBlockedReason ? buildPropsBlockedMessage(propsBlockedReason) : '';
    let sampleBlockedProps = [];

    if (propsAvailable && promptSummary.promptPropsCount === 0) {
      console.warn('[daily-ticket] PROMPT_PROPS_MISSING', {
        targetDate: dateKey,
        eligiblePlayerProps: eligibleProps.length,
        marketMixCandidates: promptSourceCandidates.length,
      });
      promptCandidates = marketMixService.injectRequiredPropsIntoPromptCandidates(
        promptCandidates,
        promptSourceCandidates,
        {
          limit: MAX_CANDIDATES,
          minProps: Math.min(2, eligibleProps.length),
        }
      );
      promptCandidates = filterPromptCandidatesByConfidence(promptCandidates, promptSourceCandidates, MAX_CANDIDATES);
      promptSummary = summarizePromptCandidates(promptCandidates);
      propsPipeline.sentToPrompt = promptSummary.promptPropsCount;
      if (promptSummary.promptPropsCount === 0) {
        console.warn('[daily-ticket] PROMPT_PROPS_MISSING_AFTER_INJECTION', {
          targetDate: dateKey,
          eligiblePlayerProps: eligibleProps.length,
        });
        propsBlockedReason = propsBlockedReason || 'all_props_conflicted_or_filtered';
        propsBlockedMessage = propsBlockedReason ? buildPropsBlockedMessage(propsBlockedReason) : '';
      }
    }

    if (!propsFeedAvailable) {
      warnings.push('Player props unavailable from odds feed; using game markets only.');
    }

    if (propsFeedAvailable && eligibleProps.length === 0) {
      warnings.push('Player props were found but not used because player-team integrity could not be verified.');
    }

    if (propsBlockedReason) {
      const blockedSamplesSource = propOnlySelection.diagnostics.rejections
        .filter((sample) => {
          if (propsBlockedReason === 'filtered_by_time_lock') {
            return sample.rejectedAt === 'time';
          }
          if (propsBlockedReason === 'filtered_by_status') {
            return sample.rejectedAt === 'status';
          }
          if (propsBlockedReason === 'filtered_by_odds_rules') {
            return sample.rejectedAt === 'odds';
          }
          return true;
        });
      sampleBlockedProps = samplePromptBlockedProps(blockedSamplesSource);
      const blockedWarning = buildPropsBlockedWarning(propsBlockedReason);
      if (blockedWarning) {
        warnings.push(blockedWarning);
      }
      propsBlockedMessage = propsBlockedMessage || buildPropsBlockedMessage(propsBlockedReason);
    }

    if (candidates.length >= 1 && candidates.length <= 3) {
      warnings.push('Limited candidates available.');
    }

    if (candidates.length < 8 && candidates.length > 0) {
      warnings.push(`Solo se encontraron ${candidates.length} candidatos validos; el ticket puede salir parcial.`);
    }

    logGenerateStage('CANDIDATES_FILTERED', {
      targetDate: dateKey,
      totalOddsCandidates: enrichedCandidates.length,
      eligiblePlayerProps: eligibleProps.length,
      drafteaCandidates: drafteaApplied.candidates.length,
      enrichedCandidates: intelligenceApplied.candidates.length,
      marketMixCandidates: marketMixCandidates.length,
      promptSourceCandidates: promptSourceCandidates.length,
      rankedCandidates: rankedCandidates.length,
      selectedCandidates: candidates.length,
      promptCandidates: promptSummary.promptCandidateCount,
      promptPropsCount: promptSummary.promptPropsCount,
      bettablePlayerProps: propsPipeline.bettable,
      oddsSource: oddsPayload.source,
      scoreboardSource: scoreboard.source,
    });

    logGenerateStage('TARGET_DATE_CHECK_RESULT', {
      targetDate: dateKey,
      candidates: candidates.length,
      oddsSource: oddsPayload.source,
      scoreboardSource: scoreboard.source,
    });

    const uniqueWarningsList = uniqueStrings(warnings);

    return {
      targetDate: dateKey,
      oddsPayload,
      propsPayload: {
        ...safePropsPayload,
        eligibleProps,
        pipeline: {
          ...propsPipeline,
          blockedReason: propsBlockedReason,
          blockedMessage: propsBlockedMessage,
        },
      },
      scoreboard,
      candidates,
      marketMixCandidates,
      promptCandidates,
      bettablePlayerPropCandidates: propOnlySelection.candidates,
      playerPropSelectionDiagnostics: propOnlySelection.diagnostics,
      intelligenceDiagnostics,
      intelligenceEnabled: true,
      historicalLearningEnabled: intelligenceDiagnostics.historicalLearningEnabled === true,
      historicalPatternsApplied: intelligenceDiagnostics.historicalPatternsApplied || 0,
      historicalRiskFlags: Array.isArray(intelligenceDiagnostics.historicalRiskFlags)
        ? intelligenceDiagnostics.historicalRiskFlags
        : [],
      diagnostics: {
        oddsRawGames: Array.isArray(oddsPayload.games) ? oddsPayload.games.length : 0,
        normalizedPicks: Array.isArray(oddsPayload.normalizedPicks) ? oddsPayload.normalizedPicks.length : 0,
        propsFeedAvailable,
        eligiblePlayerPropsRaw: propsPipeline.eligibleRaw,
        bettablePlayerProps: propsPipeline.bettable,
        propsAvailable,
        afterStatusFilter: selection.diagnostics.afterStatusFilter,
        afterTimeFilter: selection.diagnostics.afterTimeFilter,
        afterOddsFilter: selection.diagnostics.afterOddsFilter,
        matchedEspnCount: selection.diagnostics.matchedEspnCount,
        unmatchedEspnCount: selection.diagnostics.unmatchedEspnCount,
        rejectedByFinalStatusCount: selection.diagnostics.rejectedByFinalStatusCount,
        statusPassReason: selection.diagnostics.statusPassReason,
        sampleAccepted: selection.diagnostics.acceptedSamples,
        sampleRejected: selection.diagnostics.rejections.slice(0, 8),
        playerProps: {
          fetched: propsPipeline.fetched,
          eligible: propsPipeline.eligibleRaw,
          rejected: Array.isArray(safePropsPayload.rejectedProps) ? safePropsPayload.rejectedProps.length : 0,
          rejectedReasons: safePropsPayload.rejectedReasons || {},
          sampleEligible: eligibleProps.slice(0, 5),
          sampleRejected: Array.isArray(safePropsPayload.sampleRejectedProps) ? safePropsPayload.sampleRejectedProps : [],
        },
        playerPropsPipeline: {
          ...propsPipeline,
        },
        drafteaRules: drafteaApplied.diagnostics,
        intelligence: {
          ...intelligenceApplied.diagnostics,
          rejectedLowConfidence: marketMixApplied.diagnostics.rejectedLowConfidence || 0,
        },
        marketMix: marketMixApplied.diagnostics,
        prompt: {
          candidateCount: promptSummary.promptCandidateCount,
          propsCount: promptSummary.promptPropsCount,
          gameMarketsCount: promptSummary.promptGameMarketsCount,
          propsFeedAvailable,
          propsAvailable,
          propsBlockedReason,
          propsBlockedMessage,
          sampleBlockedProps,
        },
        quotaReached: oddsPayload.quotaReached === true,
        warning: oddsPayload.warning || safePropsPayload.warning || '',
        oddsSource: oddsPayload.source,
      },
      warnings: uniqueWarningsList,
    };
  } catch (error) {
    throw new DailyTicketGenerationError('filter', error.message || 'Failed to filter candidates.', error);
  }
}

async function getDebugCandidates(options = {}) {
  const {
    force = false,
  } = options;

  const todayDateKey = getTodayDateKey();
  const tomorrowDateKey = getTomorrowDateKey();

  const resolveDiagnostics = async (dateKey) => {
    try {
      return (await getBettableCandidatesForDate(dateKey, { force })).diagnostics;
    } catch (error) {
      if (oddsService.isQuotaError?.(error) || error?.errorCode === 'ODDS_API_QUOTA_REACHED') {
        return {
          oddsRawGames: 0,
          normalizedPicks: 0,
          propsFeedAvailable: false,
          eligiblePlayerPropsRaw: 0,
          bettablePlayerProps: 0,
          propsAvailable: false,
          afterStatusFilter: 0,
          afterTimeFilter: 0,
          afterOddsFilter: 0,
          quotaReached: true,
          warning: 'The Odds API quota has been reached. Showing cached data if available.',
          oddsSource: 'unavailable',
          sampleBlockedProps: [],
          playerPropsPipeline: buildEmptyPropsPipeline(),
        };
      }

      if (oddsService.isLiveDisabledError?.(error) || error?.errorCode === 'ODDS_API_LIVE_DISABLED') {
        return {
          oddsRawGames: 0,
          normalizedPicks: 0,
          propsFeedAvailable: false,
          eligiblePlayerPropsRaw: 0,
          bettablePlayerProps: 0,
          propsAvailable: false,
          afterStatusFilter: 0,
          afterTimeFilter: 0,
          afterOddsFilter: 0,
          quotaReached: false,
          warning: 'Live The Odds API is disabled. Showing cached data if available.',
          oddsSource: 'unavailable',
          sampleBlockedProps: [],
          playerPropsPipeline: buildEmptyPropsPipeline(),
        };
      }

      throw error;
    }
  };

  return {
    today: await resolveDiagnostics(todayDateKey),
    tomorrow: await resolveDiagnostics(tomorrowDateKey),
  };
}

async function generateDailyTicket(options = {}) {
  const {
    force = false,
  } = options;

  try {
    logGenerateStage('START_GENERATE', {
      force,
      nodeEnv: process.env.NODE_ENV || 'development',
    });

    if (force && process.env.NODE_ENV === 'production') {
      throw new DailyTicketGenerationError('cache', 'force=true is disabled in production.');
    }

    const todayDateKey = getTodayDateKey();
    const tomorrowDateKey = getTomorrowDateKey();

    logGenerateStage('CACHE_CHECK', {
      force,
      todayDate: todayDateKey,
      tomorrowDate: tomorrowDateKey,
    });
    const cachedTicket = await getTicketByDate(todayDateKey);
    if (cachedTicket && !force) {
      logGenerateStage('CACHE_CHECK', {
        hit: true,
        date: cachedTicket.date,
      });
      return buildTicketResponse(cachedTicket, {
        source: 'cache',
        cached: true,
      });
    }

    logGenerateStage('CACHE_CHECK', {
      hit: false,
      force,
    });

    if (!bedrockService.isConfigured()) {
      throw new DailyTicketGenerationError('bedrock', 'AWS Bedrock is not configured.');
    }

    if (!oddsService.isConfigured()) {
      throw new DailyTicketGenerationError('odds', 'ODDS_API_KEY is not configured.');
    }

    const todayResult = await getBettableCandidatesForDate(todayDateKey, { force });
    let targetResult = todayResult;
    let sourceDateReason = '';

    if (todayResult.candidates.length === 0) {
      const cachedTomorrowTicket = !force ? await getTicketByDate(tomorrowDateKey) : null;
      logGenerateStage('FALLBACK_TO_TOMORROW', {
        fromDate: todayDateKey,
        toDate: tomorrowDateKey,
        cachedTomorrowTicket: Boolean(cachedTomorrowTicket),
      });

      if (cachedTomorrowTicket) {
        return buildTicketResponse(cachedTomorrowTicket, {
          source: 'cache',
          cached: true,
          sourceDateReason: TOMORROW_SOURCE_REASON,
        });
      }

      const tomorrowResult = await getBettableCandidatesForDate(tomorrowDateKey, { force });
      if (tomorrowResult.candidates.length === 0) {
        logGenerateStage('TOMORROW_NO_CANDIDATES', {
          targetDate: tomorrowDateKey,
        });
        logGenerateStage('NO_BETTABLE_CANDIDATES', {
          checkedDates: [todayDateKey, tomorrowDateKey],
        });
        return buildNoCandidatesResponse();
      }

      logGenerateStage('TOMORROW_CANDIDATES_FOUND', {
        targetDate: tomorrowDateKey,
        candidates: tomorrowResult.candidates.length,
      });
      targetResult = tomorrowResult;
      sourceDateReason = TOMORROW_SOURCE_REASON;
    }

    const {
      targetDate,
      oddsPayload,
      propsPayload = buildEmptyPropsPayload(),
      scoreboard,
      candidates,
      marketMixCandidates = [],
      promptCandidates: promptCandidatesFromTarget = [],
      intelligenceDiagnostics: targetIntelligenceDiagnostics = {},
      diagnostics = {},
      warnings,
    } = targetResult;
    const intelligenceMetadata = getSafeIntelligenceDiagnostics(targetIntelligenceDiagnostics);
    let promptCandidates = Array.isArray(promptCandidatesFromTarget) && promptCandidatesFromTarget.length > 0
      ? promptCandidatesFromTarget
      : marketMixService.preparePromptCandidates(marketMixCandidates, MAX_CANDIDATES);
    const propsPipeline = {
      ...buildEmptyPropsPipeline(),
      ...(propsPayload?.pipeline || {}),
    };
    const eligiblePlayerPropsRaw = propsPipeline.eligibleRaw;
    const bettablePlayerProps = propsPipeline.bettable;
    const propsFeedAvailable = propsPipeline.fetched > 0;
    const propsAvailable = bettablePlayerProps > 0;
    if (propsAvailable && summarizePromptCandidates(promptCandidates).promptPropsCount === 0) {
      console.warn('[daily-ticket] PROMPT_PROPS_MISSING', {
        targetDate,
        eligiblePlayerProps: eligiblePlayerPropsRaw,
        marketMixCandidates: marketMixCandidates.length,
      });
      promptCandidates = marketMixService.injectRequiredPropsIntoPromptCandidates(
        promptCandidates,
        marketMixCandidates,
        {
          limit: MAX_CANDIDATES,
          minProps: Math.min(2, bettablePlayerProps),
        }
      );
    }
    const promptSummary = summarizePromptCandidates(promptCandidates);
    propsPipeline.sentToPrompt = promptSummary.promptPropsCount;
    const candidatePool = mergeCandidatePools(candidates, promptCandidates);
    const rebuildContext = {
      promptPropsCount: promptSummary.promptPropsCount,
      promptCandidateCount: promptSummary.promptCandidateCount,
    };
    const propsBlockedReason = diagnostics?.prompt?.propsBlockedReason || '';
    const propsBlockedMessage = diagnostics?.prompt?.propsBlockedMessage || '';
    const sampleBlockedProps = Array.isArray(diagnostics?.prompt?.sampleBlockedProps)
      ? diagnostics.prompt.sampleBlockedProps
      : [];

    let bedrockResponse;
    try {
      logGenerateStage('BEDROCK_CALL', {
        targetDate,
        promptCandidates: promptSummary.promptCandidateCount,
        promptPropsCount: promptSummary.promptPropsCount,
        promptGameMarketsCount: promptSummary.promptGameMarketsCount,
        propsAvailable,
        eligiblePlayerProps: eligiblePlayerPropsRaw,
        bettablePlayerProps,
        maxTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: BEDROCK_TIMEOUT_MS,
      });
      bedrockResponse = await bedrockService.invokeTextWithMetadata({
        system: 'You are a disciplined sports betting analyst. Respond with valid JSON only.',
        prompt: buildDailyPrompt(targetDate, promptCandidates, scoreboard, warnings),
        maxTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        timeoutMs: BEDROCK_TIMEOUT_MS,
      });
    } catch (error) {
      throw new DailyTicketGenerationError('bedrock', error.message || 'Bedrock request failed.', error);
    }

    let modelOutput;
    try {
      logGenerateStage('JSON_PARSE');
      const jsonText = bedrockService.extractJsonObject(bedrockResponse.text, {
        stopReason: bedrockResponse.stopReason,
      });
      modelOutput = JSON.parse(jsonText);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[daily-ticket] Bedrock raw response (sanitized)', {
          preview: sanitizeRawModelResponse(bedrockResponse?.text),
          stopReason: bedrockResponse?.stopReason || '',
        });
      }

      let fallbackTicket;
      let fallbackSource = 'fallback_generated';
      try {
        fallbackTicket = buildDeterministicFallbackTicket(targetDate, candidatePool, warnings);
        fallbackTicket = drafteaRulesService.validateTicketAgainstDrafteaRules(fallbackTicket, candidatePool);
        fallbackTicket = marketMixService.validateMarketMix(fallbackTicket, candidatePool);
        fallbackTicket = reconcilePropWarnings(fallbackTicket, propsPayload || buildEmptyPropsPayload());
        const emptyAiTicketsDetected = areAllTicketsEmptyOrUnavailable(fallbackTicket);
        let rebuiltFromEmptyAiOutput = false;
        if (emptyAiTicketsDetected && promptCandidates.length > 0) {
          fallbackTicket = rebuildEmptyTicketsFromPromptCandidates(fallbackTicket, promptCandidates, rebuildContext);
          rebuiltFromEmptyAiOutput = true;
          fallbackSource = 'fallback_generated';
        }
        fallbackTicket = sanitizeFinalTicketConfidence(fallbackTicket, candidatePool);
        const ensuredFallbackProps = ensureFinalProps(fallbackTicket, candidatePool, {
          propsAvailable,
        });
        fallbackTicket = ensuredFallbackProps.ticket;
        fallbackTicket = sanitizeFinalTicketWhy(fallbackTicket, candidatePool);
        const finalCounts = getTicketLegCounts(fallbackTicket);
        fallbackTicket = finalizePropUsageWarnings(fallbackTicket, {
          propsFeedAvailable,
          bettablePlayerProps,
          promptPropsCount: promptSummary.promptPropsCount,
          finalPropsUsed: finalCounts.finalPropsUsed,
        });
        fallbackTicket.date = targetDate;
        fallbackTicket.generatedAt = new Date().toISOString();
        fallbackTicket.targetDate = targetDate;
        fallbackTicket.sourceDateReason = sourceDateReason;
        propsPipeline.finalUsed = finalCounts.finalPropsUsed;
        const finalPropsBlockedReason = finalCounts.finalPropsUsed > 0
          ? ''
          : (propsBlockedReason || (promptSummary.promptPropsCount > 0 ? 'final_ticket_props_not_selected' : ''));
        fallbackTicket.meta = {
          source: fallbackSource,
          candidateCount: candidatePool.length,
          promptCandidateCount: promptSummary.promptCandidateCount,
          promptPropsCount: promptSummary.promptPropsCount,
          promptGameMarketsCount: promptSummary.promptGameMarketsCount,
          propsFeedAvailable,
          eligiblePlayerPropsRaw,
          bettablePlayerProps,
          propsAvailable,
          ticketMode: determineTicketMode(propsPipeline, promptSummary.promptPropsCount),
          propsBlockedReason: finalPropsBlockedReason,
          propsBlockedMessage: finalPropsBlockedReason
            ? (propsBlockedMessage || buildPropsBlockedMessage(finalPropsBlockedReason))
            : '',
          sampleBlockedProps: finalPropsBlockedReason ? sampleBlockedProps : [],
          oddsSource: oddsPayload.source,
          oddsQuotaReached: oddsPayload.quotaReached === true,
          scoreboardSource: scoreboard.source,
          bedrockStopReason: bedrockResponse?.stopReason || '',
          fallbackReason: error.errorCode || 'BEDROCK_JSON_PARSE_FAILED',
          rebuiltFromEmptyAiOutput,
          emptyAiTicketsDetected,
          playerPropsPipeline: { ...propsPipeline },
          finalPropsUsed: finalCounts.finalPropsUsed,
          finalGameMarketsUsed: finalCounts.finalGameMarketsUsed,
          propsEnsured: ensuredFallbackProps.diagnostics.propsEnsured,
          insertedFinalProps: ensuredFallbackProps.diagnostics.insertedFinalProps,
          finalPropsSkippedReason: ensuredFallbackProps.diagnostics.skippedReason,
          ...intelligenceMetadata,
          avgTicketConfidence: finalCounts.avgTicketConfidence,
          lowestLegConfidence: finalCounts.lowestLegConfidence,
          protectedMarketsUsed: finalCounts.protectedMarketsUsed,
        };
      } catch (fallbackError) {
        throw new DailyTicketGenerationError(
          'post_validation',
          fallbackError.message || 'Failed to build fallback ticket after Bedrock parse error.',
          fallbackError
        );
      }

      logGenerateStage('CACHE_WRITE', {
        cacheFile: getTicketCacheFilename(fallbackTicket.date),
        source: 'fallback_generated',
      });
      await writeCache(getTicketCacheFilename(fallbackTicket.date), fallbackTicket);
      await saveGeneratedTicketHistorySafe(fallbackTicket);

      logGenerateStage('GENERATE_SUCCESS', {
        date: fallbackTicket.date,
        cacheFile: getTicketCacheFilename(fallbackTicket.date),
        source: 'fallback_generated',
      });

      return buildTicketResponse(fallbackTicket, {
        source: fallbackSource,
        cached: false,
        sourceDateReason,
      });
    }

    let ticket;
    let responseSource = 'generated';
    try {
      ticket = sanitizeTicketResponse(modelOutput, candidatePool, warnings);
      ticket = drafteaRulesService.validateTicketAgainstDrafteaRules(ticket, candidatePool);
      ticket = marketMixService.validateMarketMix(ticket, candidatePool);
      ticket = reconcilePropWarnings(ticket, propsPayload || buildEmptyPropsPayload());
      const emptyAiTicketsDetected = areAllTicketsEmptyOrUnavailable(ticket);
      let rebuiltFromEmptyAiOutput = false;
      if (emptyAiTicketsDetected && promptCandidates.length > 0) {
        ticket = rebuildEmptyTicketsFromPromptCandidates(ticket, promptCandidates, rebuildContext);
        ticket = drafteaRulesService.validateTicketAgainstDrafteaRules(ticket, candidatePool);
        ticket = marketMixService.validateMarketMix(ticket, candidatePool);
        ticket = reconcilePropWarnings(ticket, propsPayload || buildEmptyPropsPayload());
        rebuiltFromEmptyAiOutput = true;
        responseSource = 'fallback_generated';
      }
      ticket = sanitizeFinalTicketConfidence(ticket, candidatePool);
      const ensuredFinalProps = ensureFinalProps(ticket, candidatePool, {
        propsAvailable,
      });
      ticket = ensuredFinalProps.ticket;
      ticket = sanitizeFinalTicketWhy(ticket, candidatePool);
      const finalCounts = getTicketLegCounts(ticket);
      ticket = finalizePropUsageWarnings(ticket, {
        propsFeedAvailable,
        bettablePlayerProps,
        promptPropsCount: promptSummary.promptPropsCount,
        finalPropsUsed: finalCounts.finalPropsUsed,
      });
      ticket.date = targetDate;
      ticket.generatedAt = new Date().toISOString();
      ticket.targetDate = targetDate;
      ticket.sourceDateReason = sourceDateReason;
      propsPipeline.finalUsed = finalCounts.finalPropsUsed;
      const finalPropsBlockedReason = finalCounts.finalPropsUsed > 0
        ? ''
        : (propsBlockedReason || (promptSummary.promptPropsCount > 0 ? 'final_ticket_props_not_selected' : ''));
      ticket.meta = {
        source: responseSource === 'fallback_generated' ? 'fallback_generated' : 'ai',
        candidateCount: candidatePool.length,
        promptCandidateCount: promptSummary.promptCandidateCount,
        promptPropsCount: promptSummary.promptPropsCount,
        promptGameMarketsCount: promptSummary.promptGameMarketsCount,
        propsFeedAvailable,
        eligiblePlayerPropsRaw,
        bettablePlayerProps,
        propsAvailable,
        ticketMode: determineTicketMode(propsPipeline, promptSummary.promptPropsCount),
        propsBlockedReason: finalPropsBlockedReason,
        propsBlockedMessage: finalPropsBlockedReason
          ? (propsBlockedMessage || buildPropsBlockedMessage(finalPropsBlockedReason))
          : '',
        sampleBlockedProps: finalPropsBlockedReason ? sampleBlockedProps : [],
        oddsSource: oddsPayload.source,
        oddsQuotaReached: oddsPayload.quotaReached === true,
        scoreboardSource: scoreboard.source,
        rebuiltFromEmptyAiOutput,
        emptyAiTicketsDetected,
        playerPropsPipeline: { ...propsPipeline },
        finalPropsUsed: finalCounts.finalPropsUsed,
        finalGameMarketsUsed: finalCounts.finalGameMarketsUsed,
        propsEnsured: ensuredFinalProps.diagnostics.propsEnsured,
        insertedFinalProps: ensuredFinalProps.diagnostics.insertedFinalProps,
        finalPropsSkippedReason: ensuredFinalProps.diagnostics.skippedReason,
        ...intelligenceMetadata,
        avgTicketConfidence: finalCounts.avgTicketConfidence,
        lowestLegConfidence: finalCounts.lowestLegConfidence,
        protectedMarketsUsed: finalCounts.protectedMarketsUsed,
      };

      if (areAllTicketsEmptyOrUnavailable(ticket) && promptCandidates.length > 0) {
        throw new DailyTicketGenerationError(
          'post_validation',
          'Generated ticket remained empty after rebuild despite available prompt candidates.'
        );
      }
    } catch (error) {
      throw new DailyTicketGenerationError(
        'post_validation',
        error.message || 'Failed to validate or enrich generated ticket.',
        error
      );
    }

    try {
      logGenerateStage('CACHE_WRITE', {
        cacheFile: getTicketCacheFilename(ticket.date),
      });
      await writeCache(getTicketCacheFilename(ticket.date), ticket);
      await saveGeneratedTicketHistorySafe(ticket);
    } catch (error) {
      throw new DailyTicketGenerationError('cache', error.message || 'Failed to write ticket cache.', error);
    }

    logGenerateStage('GENERATE_SUCCESS', {
      date: ticket.date,
      cacheFile: getTicketCacheFilename(ticket.date),
      source: responseSource,
    });

      return buildTicketResponse(ticket, {
        source: responseSource,
        cached: false,
        sourceDateReason,
      });
  } catch (error) {
    const normalized = normalizeGenerationError(error);
    logGenerateStage('GENERATE_FAILED', {
      stage: normalized.stage,
      message: normalized.message,
      causeName: normalized.cause?.name,
    });
    return buildErrorResponse(normalized);
  }
}

function runWhySanitizerSmokeTest() {
  const mockCandidates = [
    {
      candidateId: 'gm-arizona-spreads-plus15',
      game: 'Arizona Diamondbacks vs St. Louis Cardinals',
      pick: 'Arizona Diamondbacks +1.5',
      market: 'spreads',
      marketCategory: 'spread',
      oddsDecimal: 1.91,
      candidateType: 'game_market',
      candidateTeam: 'Arizona Diamondbacks',
      voidRisk: 'medium',
    },
    {
      candidateId: 'pp-seattle-k-bryce',
      game: 'Seattle Mariners vs Pittsburgh Pirates',
      pick: 'Bryce Miller Over 5.5 strikeouts',
      market: 'pitcher_strikeouts',
      marketCategory: 'pitcher_strikeouts',
      oddsDecimal: 1.83,
      candidateType: 'player_prop',
      candidateTeam: 'Seattle Mariners',
      playerName: 'Bryce Miller',
      voidRisk: 'medium',
      lineupRequired: true,
    },
    {
      candidateId: 'pp-washington-k-cavalli',
      game: 'Philadelphia Phillies vs Washington Nationals',
      pick: 'Cade Cavalli Over 4.5 strikeouts',
      market: 'pitcher_strikeouts',
      marketCategory: 'pitcher_strikeouts',
      oddsDecimal: 1.80,
      candidateType: 'player_prop',
      candidateTeam: 'Washington Nationals',
      playerName: 'Cade Cavalli',
      voidRisk: 'medium',
      lineupRequired: true,
    },
    {
      candidateId: 'gm-giants-h2h-ml',
      game: 'San Francisco Giants vs Athletics',
      pick: 'San Francisco Giants ML',
      market: 'h2h',
      marketCategory: 'moneyline',
      oddsDecimal: 1.72,
      candidateType: 'game_market',
      candidateTeam: 'San Francisco Giants',
      voidRisk: 'low',
    },
  ];

  const mockTicket = {
    tickets: [
      {
        type: 'emi',
        legs: [
          {
            candidateId: 'gm-arizona-spreads-plus15',
            game: 'Arizona Diamondbacks vs St. Louis Cardinals',
            pick: 'Arizona Diamondbacks +1.5',
            market: 'spreads',
            why: 'Rays favoritos en casa',
          },
          {
            candidateId: 'pp-seattle-k-bryce',
            game: 'Seattle Mariners vs Pittsburgh Pirates',
            pick: 'Bryce Miller Over 5.5 strikeouts',
            market: 'pitcher_strikeouts',
            why: 'Rangers cubiertos con spread',
          },
          {
            candidateId: 'pp-washington-k-cavalli',
            game: 'Philadelphia Phillies vs Washington Nationals',
            pick: 'Cade Cavalli Over 4.5 strikeouts',
            market: 'pitcher_strikeouts',
            why: 'Arizona competitivo',
          },
        ],
      },
      {
        type: 'safe',
        legs: [
          {
            candidateId: 'gm-giants-h2h-ml',
            game: 'San Francisco Giants vs Athletics',
            pick: 'San Francisco Giants ML',
            market: 'h2h',
            why: 'Giants superiores a Athletics',
          },
        ],
      },
    ],
  };

  const sanitized = sanitizeFinalTicketWhy(mockTicket, mockCandidates);
  return {
    replacedSpreadMismatch: sanitized.tickets[0].legs[0].why === buildDefaultWhyFromCandidate(mockCandidates[0], 'emi'),
    replacedBrycePropMismatch: sanitized.tickets[0].legs[1].why === buildDefaultWhyFromCandidate(mockCandidates[1], 'emi'),
    replacedCavalliPropMismatch: sanitized.tickets[0].legs[2].why === buildDefaultWhyFromCandidate(mockCandidates[2], 'emi'),
    keptValidGiantsMoneylineWhy: sanitized.tickets[1].legs[0].why === 'Giants superiores a Athletics',
  };
}

module.exports = {
  DailyTicketGenerationError,
  buildErrorResponse,
  buildNoCandidatesResponse,
  generateDailyTicket,
  getDashboard,
  getDebugCandidates,
  getHistory,
  getTicketByDate,
  getUpcomingTicket,
  getStatus,
  getTodayTicket,
  ensureFinalProps,
  finalizePropUsageWarnings,
  runWhySanitizerSmokeTest,
  sanitizeFinalTicketConfidence,
  sanitizeFinalTicketWhy,
  getBettableCandidatesForDate,
  selectBettableCandidates,
};
