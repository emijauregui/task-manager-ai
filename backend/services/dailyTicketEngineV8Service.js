const enginePipelineStatusService = require('./enginePipelineStatusService');
const lineupGateService = require('./lineupGateService');
const mlbTicketHistoryService = require('./mlbTicketHistoryService');
const oddsIngestionService = require('./oddsIngestionService');
const oddsService = require('./oddsService');
const pickCandidateGeneratorService = require('./pickCandidateGeneratorService');
const scoringEngineService = require('./scoringEngineService');
const ticketBuilderService = require('./ticketBuilderService');
const { writeCache } = require('../utils/cache');

const ENGINE_VERSION = 'v8.0-diagnostic';
const GENERATE_ENGINE_VERSION = 'v8.0';
const SOURCE = 'engine_v8_diagnostic';
const GENERATE_SOURCE = 'engine_v8_generate';
const MODES = ['safe', 'emi', 'free_bet'];
const LIVE_ODDS_ESTIMATE = {
  endpointType: 'sports_odds',
  markets: ['h2h', 'spreads', 'totals'],
  eventCount: 1,
};

const TICKET_MODE_DEFAULTS = {
  safe: {
    name: 'Ticket Seguro',
    stake: '$50-$100 MXN',
    risk: 'low',
  },
  emi: {
    name: 'Estilo Emi',
    stake: '$50-$75 MXN',
    risk: 'medium',
  },
  free_bet: {
    name: 'Free Bet',
    stake: 'Apuesta gratis',
    risk: 'high',
  },
};

function uniqueStrings(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function getCount(map = {}, key) {
  return Number(map?.[key] || 0);
}

function compactGuard(guard = {}) {
  return {
    oddsLiveEnabled: guard.oddsLiveEnabled,
    runtimeMode: guard.runtimeMode,
    budgetGateVersion: guard.budgetGateVersion,
    canUseLiveOdds: guard.canUseLiveOdds,
    reasons: guard.reasons || [],
    todayEstimatedUsage: guard.todayEstimatedUsage,
    todayActualUsage: guard.todayActualUsage,
  };
}

function compactIngestion(ingestion = {}) {
  return {
    version: ingestion.version,
    totalNormalized: ingestion.totalNormalized || 0,
    byMarket: ingestion.byMarket || {},
    byBookmaker: ingestion.byBookmaker || {},
    freshness: ingestion.freshness || {},
    warnings: ingestion.warnings || [],
    dateFilter: ingestion.dateFilter || '',
  };
}

function compactCandidateSummary(summary = {}) {
  return {
    version: summary.version,
    totalCandidates: summary.totalCandidates || 0,
    activeCandidates: summary.activeCandidates || 0,
    rejectedCandidates: summary.rejectedCandidates || 0,
    byMarketType: summary.byMarketType || {},
    byRiskTag: summary.byRiskTag || {},
    freshness: summary.freshness || {},
    rejectionReasons: summary.rejectionReasons || {},
  };
}

function compactScoringSummary(summary = {}) {
  return {
    version: summary.version,
    totalScored: summary.totalScored || 0,
    byConfidenceTier: summary.byConfidenceTier || {},
    byRiskLevel: summary.byRiskLevel || {},
    byMarketType: summary.byMarketType || {},
    byValueTier: summary.byValueTier || {},
    warnings: summary.warnings || [],
    warningCounts: summary.warningCounts || {},
  };
}

function compactLineupSummary(summary = {}) {
  return {
    version: summary.version,
    totalEvaluated: summary.totalEvaluated || 0,
    byStatus: summary.byStatus || {},
    byMarketType: summary.byMarketType || {},
    warnings: summary.warnings || [],
    warningCounts: summary.warningCounts || {},
  };
}

function buildTicketModeResponse(ticketBuilderResult = {}, mode = 'safe') {
  const ticket = ticketBuilderResult.modes?.[mode] || {};

  return {
    mode,
    status: ticket.status || 'no_ticket',
    legs: Array.isArray(ticket.legs) ? ticket.legs : [],
    totalDecimalOdds: ticket.totalDecimalOdds ?? null,
    estimatedMultiplier: ticket.estimatedMultiplier ?? null,
    riskLevel: ticket.riskLevel || 'blocked',
    correlationScore: ticket.correlationScore || 0,
    warnings: ticket.warnings || [],
    rejectionReasons: ticket.rejectionReasons || [],
    metadata: ticket.metadata || null,
  };
}

function buildModes(ticketBuilderResult = {}) {
  return MODES.reduce((accumulator, mode) => {
    accumulator[mode] = buildTicketModeResponse(ticketBuilderResult, mode);
    return accumulator;
  }, {});
}

function chooseRecommendedMode(modes = {}) {
  const priority = ['safe', 'emi', 'free_bet'];
  return priority.find((mode) => modes[mode]?.status === 'ticket_candidate') || null;
}

function normalizeMode(value = 'all') {
  const mode = String(value || 'all').trim().toLowerCase();
  return mode === 'all' || MODES.includes(mode) ? mode : 'all';
}

function getRequestedModePriority(modeRequested = 'all') {
  const normalizedMode = normalizeMode(modeRequested);
  return normalizedMode === 'all' ? ['safe', 'emi', 'free_bet'] : [normalizedMode];
}

function chooseRecommendedModeForRequest(modes = {}, modeRequested = 'all') {
  return getRequestedModePriority(modeRequested)
    .find((mode) => modes[mode]?.status === 'ticket_candidate') || null;
}

function summarizeModeRejections(modes = {}) {
  return MODES.reduce((accumulator, mode) => {
    accumulator[mode] = modes[mode]?.rejectionReasons || [];
    return accumulator;
  }, {});
}

function buildExplainabilityReasons(pipelineResult = {}) {
  const guard = pipelineResult.guard || {};
  const ingestionSummary = pipelineResult.ingestionSummary || {};
  const candidateSummary = pipelineResult.candidateSummary || {};
  const scoringSummary = pipelineResult.scoringSummary || {};
  const ticketBuilderResult = pipelineResult.ticketBuilderResult || {};
  const engineStatus = pipelineResult.engineStatus || {};
  const reasons = [...(engineStatus.blockers || [])];

  if (guard.oddsLiveEnabled === false) {
    reasons.push('odds_live_disabled');
  }

  if (guard.runtimeMode === 'cache_only') {
    reasons.push('cache_only_mode');
  }

  if (ingestionSummary.totalNormalized > 0
    && getCount(ingestionSummary.freshness, 'stale') >= ingestionSummary.totalNormalized) {
    reasons.push('all_odds_stale');
  }

  if (getCount(candidateSummary.byRiskTag, 'timing_blocked') > 0) {
    reasons.push('timing_gate_blocked_games');
  }

  if (getCount(candidateSummary.byRiskTag, 'lineup_unknown') > 0) {
    reasons.push('lineup_not_confirmed');
  }

  if (ticketBuilderResult.summary?.noTicket >= MODES.length) {
    reasons.push('ticket_builder_no_ticket');
  }

  if (ticketBuilderResult.summary?.rejectionReasons?.not_enough_candidates) {
    reasons.push('not_enough_candidates');
  }

  if (scoringSummary.totalScored > 0
    && getCount(scoringSummary.byConfidenceTier, 'F') >= scoringSummary.totalScored) {
    reasons.push('all_candidates_low_score');
  }

  return uniqueStrings(reasons);
}

function determineEngineV8Status(pipelineResult = {}, modes = {}) {
  const engineStatus = pipelineResult.engineStatus || {};
  const ticketBuilderSummary = pipelineResult.ticketBuilderResult?.summary || {};
  const candidateSummary = pipelineResult.candidateSummary || {};
  const blockers = buildExplainabilityReasons(pipelineResult);
  const hasTicketCandidate = MODES.some((mode) => modes[mode]?.status === 'ticket_candidate');

  if (hasTicketCandidate) {
    return 'ticket_candidate';
  }

  if (engineStatus.readiness === 'blocked'
    || candidateSummary.activeCandidates === 0
    || ticketBuilderSummary.noTicket >= MODES.length
    || blockers.includes('all_odds_stale')
    || blockers.includes('timing_gate_blocked_games')) {
    return 'blocked';
  }

  return 'no_ticket';
}

function buildEngineV8Summary(result = {}) {
  const modes = result.modes || {};
  const modeValues = MODES.map((mode) => modes[mode]).filter(Boolean);

  return {
    engineVersion: result.engineVersion || ENGINE_VERSION,
    status: result.status || 'blocked',
    readiness: result.readiness || 'blocked',
    recommendedMode: result.recommendedMode || null,
    ticketCandidates: modeValues.filter((mode) => mode.status === 'ticket_candidate').length,
    noTicket: modeValues.filter((mode) => mode.status === 'no_ticket').length,
    blockedModes: modeValues.filter((mode) => mode.riskLevel === 'blocked').length,
    blockers: result.blockers || [],
    warnings: result.warnings || [],
    modeRejectionReasons: summarizeModeRejections(modes),
  };
}

function buildWarnings(pipelineResult = {}, blockers = []) {
  return uniqueStrings([
    ...(pipelineResult.engineStatus?.warnings || []),
    ...(pipelineResult.ticketBuilderResult?.warnings || []),
    ...(pipelineResult.lineupSummary?.warnings || []),
    ...(blockers.includes('ticket_builder_no_ticket') ? ['Ticket Builder returned no_ticket for every mode.'] : []),
    ...(blockers.includes('all_odds_stale') ? ['Odds cache is stale; v8 is diagnostic only.'] : []),
    ...(blockers.includes('odds_live_disabled') ? ['Odds API live remains disabled by guard.'] : []),
  ]);
}

function getRecommendedAction(blockers = [], canGenerate = false) {
  if (canGenerate) {
    return 'generate_dry_run_available';
  }

  if (blockers.includes('all_odds_stale') || blockers.includes('no_fresh_odds')) {
    return 'refresh_fresh_odds_with_budget_gate';
  }

  if (blockers.includes('timing_gate_blocked_games')) {
    return 'wait_for_games';
  }

  if (blockers.includes('lineup_not_confirmed')) {
    return 'lineups_needed';
  }

  return 'wait_for_games';
}

function getModePreflight(modeResponse = {}) {
  return {
    canGenerate: modeResponse.status === 'ticket_candidate' && Array.isArray(modeResponse.legs) && modeResponse.legs.length > 0,
    reasons: uniqueStrings([
      ...(modeResponse.rejectionReasons || []),
      ...(modeResponse.warnings || []),
    ]),
  };
}

async function buildLiveOddsBudget(options = {}) {
  const maxRequests = Math.max(0, Math.trunc(Number(options.maxRequests || 0)));
  const guard = await oddsService.getGuardStatusDetailed({
    dryRun: {
      ...LIVE_ODDS_ESTIMATE,
      allowedRequests: maxRequests > 0 ? maxRequests : undefined,
    },
  });
  const dryRun = guard.dryRun || {};
  const reasons = [];

  if (options.allowLiveOdds === true && guard.oddsLiveEnabled !== true) {
    reasons.push('live_odds_disabled_by_guard');
  }

  if (options.allowLiveOdds === true && guard.canUseLiveOdds !== true) {
    reasons.push('budget_gate_disallows_live_odds');
  }

  if (options.allowLiveOdds === true && maxRequests <= 0) {
    reasons.push('max_requests_required_for_live_odds');
  }

  if (options.allowLiveOdds === true
    && maxRequests > 0
    && Number(dryRun.estimatedRequests || 0) > maxRequests) {
    reasons.push('estimated_requests_exceed_max_requests');
  }

  if (dryRun.blocked === true) {
    reasons.push(dryRun.errorCode || 'budget_gate_blocked');
  }

  return {
    liveOddsRequired: options.liveOddsRequired === true,
    estimatedRequests: Number.isFinite(Number(dryRun.estimatedRequests))
      ? Number(dryRun.estimatedRequests)
      : null,
    budgetGateVersion: guard.budgetGateVersion || dryRun.budgetGateVersion || 'v2',
    canUseLiveOdds: options.allowLiveOdds === true
      && guard.oddsLiveEnabled === true
      && guard.canUseLiveOdds === true
      && reasons.length === 0,
    allowLiveOdds: options.allowLiveOdds === true,
    maxRequests,
    reasons: uniqueStrings([
      ...(dryRun.reasons || []),
      ...(dryRun.reason && dryRun.reason !== 'allowed' ? [dryRun.reason] : []),
      ...reasons,
    ]),
    dryRun: {
      endpointType: dryRun.endpointType || LIVE_ODDS_ESTIMATE.endpointType,
      markets: dryRun.markets || LIVE_ODDS_ESTIMATE.markets,
      eventCount: dryRun.eventCount || LIVE_ODDS_ESTIMATE.eventCount,
      estimatedRequests: Number.isFinite(Number(dryRun.estimatedRequests))
        ? Number(dryRun.estimatedRequests)
        : null,
      blocked: dryRun.blocked === true,
      errorCode: dryRun.errorCode || '',
    },
  };
}

async function buildEngineV8Preflight(options = {}) {
  const diagnostic = await runDailyTicketEngineV8({
    date: options.date,
    applyTiming: options.applyTiming,
    timingMode: options.timingMode,
  });
  const canGenerate = diagnostic.status === 'ticket_candidate' && Boolean(diagnostic.recommendedTicket);
  const liveOddsRequired = diagnostic.blockers.includes('all_odds_stale')
    || diagnostic.blockers.includes('no_fresh_odds');
  const budget = await buildLiveOddsBudget({
    liveOddsRequired,
    allowLiveOdds: false,
    maxRequests: 0,
  });

  return {
    engineVersion: GENERATE_ENGINE_VERSION,
    preflight: true,
    cacheOnly: true,
    runtimeMode: diagnostic.runtimeMode,
    oddsLiveEnabled: diagnostic.oddsLiveEnabled,
    canGenerate,
    canPersist: canGenerate && diagnostic.readiness !== 'blocked',
    recommendedAction: getRecommendedAction(diagnostic.blockers, canGenerate),
    blockers: diagnostic.blockers,
    warnings: diagnostic.warnings,
    modes: MODES.reduce((accumulator, mode) => {
      accumulator[mode] = getModePreflight(diagnostic.modes?.[mode]);
      return accumulator;
    }, {}),
    budget,
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'engine_v8_preflight',
      historyWrite: false,
      historyWriteReason: 'preflight_only',
      pipeline: diagnostic.metadata?.pipeline || {},
    },
  };
}

function buildNoTicketResponse(pipelineResult = {}, options = {}) {
  return buildEngineV8Response(pipelineResult, options);
}

function buildEngineV8Response(pipelineResult = {}, options = {}) {
  const modes = buildModes(pipelineResult.ticketBuilderResult);
  const recommendedMode = chooseRecommendedMode(modes);
  const recommendedTicket = recommendedMode ? modes[recommendedMode] : null;
  const blockers = buildExplainabilityReasons(pipelineResult);
  const status = determineEngineV8Status(pipelineResult, modes);
  const warnings = buildWarnings(pipelineResult, blockers);
  const response = {
    engineVersion: ENGINE_VERSION,
    cacheOnly: true,
    runtimeMode: pipelineResult.guard?.runtimeMode || 'cache_only',
    oddsLiveEnabled: pipelineResult.guard?.oddsLiveEnabled === true,
    status,
    readiness: pipelineResult.engineStatus?.readiness || 'blocked',
    modes,
    recommendedMode,
    recommendedTicket,
    summary: {},
    blockers,
    warnings,
    metadata: {
      generatedAt: options.generatedAt || new Date().toISOString(),
      source: SOURCE,
      dryRun: true,
      historyWrite: false,
      applyTiming: options.applyTiming !== false,
      timingMode: options.timingMode || 'safe',
      pipeline: {
        oddsGuard: compactGuard(pipelineResult.guard),
        oddsIngestion: compactIngestion(pipelineResult.ingestionSummary),
        candidates: compactCandidateSummary(pipelineResult.candidateSummary),
        scoring: compactScoringSummary(pipelineResult.scoringSummary),
        ticketBuilder: {
          version: pipelineResult.ticketBuilderResult?.version,
          summary: pipelineResult.ticketBuilderResult?.summary || {},
          warnings: pipelineResult.ticketBuilderResult?.warnings || [],
        },
        lineupGate: compactLineupSummary(pipelineResult.lineupSummary),
        engineStatus: {
          version: pipelineResult.engineStatus?.version,
          readiness: pipelineResult.engineStatus?.readiness || 'blocked',
          overallStatus: pipelineResult.engineStatus?.overallStatus || 'blocked',
          blockers: pipelineResult.engineStatus?.blockers || [],
          warnings: pipelineResult.engineStatus?.warnings || [],
          nextRecommendedPhase: pipelineResult.engineStatus?.nextRecommendedPhase || '',
        },
      },
    },
  };

  response.summary = buildEngineV8Summary(response);
  return response;
}

function getCacheDateKey(options = {}) {
  const targetDate = String(options.targetDate || options.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return targetDate;
  }

  return new Date().toISOString().slice(0, 10);
}

function getDailyTicketCacheFilename(dateKey) {
  return `daily-ticket-${dateKey}.json`;
}

function getMarketCategory(leg = {}) {
  if (leg.marketType === 'team_moneyline') return 'moneyline';
  if (leg.marketType === 'team_spread') return 'spread';
  if (leg.marketType === 'game_total') return 'total';
  if (leg.marketType === 'pitcher_prop') return 'pitcher_strikeouts';
  if (leg.marketType === 'batter_prop') return leg.marketKey || 'batter_prop';
  return leg.marketKey || leg.marketType || 'unknown';
}

function formatLegPick(leg = {}) {
  if (leg.playerName) {
    const direction = String(leg.selectionName || '').trim();
    const line = leg.line !== null && leg.line !== undefined ? ` ${leg.line}` : '';
    return `${leg.playerName}${direction ? ` ${direction}` : ''}${line}`.trim();
  }

  if (leg.selectionName) {
    const line = leg.line !== null && leg.line !== undefined ? ` ${leg.line}` : '';
    return `${leg.selectionName}${line}`.trim();
  }

  return leg.gameLabel || 'Unknown pick';
}

function convertLegForDailyTicket(leg = {}) {
  const isPlayerProp = Boolean(leg.playerName);

  return {
    candidateId: leg.candidateId || '',
    game: leg.gameLabel || '',
    pick: formatLegPick(leg),
    market: leg.marketKey || '',
    marketCategory: getMarketCategory(leg),
    candidateType: isPlayerProp ? 'player_prop' : 'game_market',
    candidateTeam: leg.teamName || '',
    team: leg.teamName || '',
    player: leg.playerName || '',
    playerName: leg.playerName || '',
    odds: leg.decimalOdds !== null && leg.decimalOdds !== undefined ? String(leg.decimalOdds) : '',
    oddsDecimal: leg.decimalOdds ?? null,
    confidence: leg.score ?? 0,
    confidenceTier: leg.confidenceTier || '',
    riskTags: leg.riskTags || [],
    lineupStatus: leg.lineupStatus || '',
    lineupGate: leg.lineupGate || null,
    why: 'Selected by Daily Ticket Engine v8 diagnostic scoring.',
    result: 'pending',
  };
}

function buildPersistableTicket(response = {}, options = {}) {
  const mode = response.recommendedMode;
  const ticket = response.recommendedTicket || {};
  const defaults = TICKET_MODE_DEFAULTS[mode] || TICKET_MODE_DEFAULTS.safe;
  const dateKey = getCacheDateKey(options);
  const generatedAt = new Date().toISOString();

  return {
    date: dateKey,
    targetDate: dateKey,
    generatedAt,
    status: 'pending',
    source: GENERATE_SOURCE,
    engineVersion: GENERATE_ENGINE_VERSION,
    tickets: [
      {
        type: mode,
        name: defaults.name,
        available: true,
        stake: defaults.stake,
        odds: ticket.estimatedMultiplier ? `${ticket.estimatedMultiplier}x` : '',
        risk: ticket.riskLevel || defaults.risk,
        summary: `Daily Ticket Engine v8 ${mode} candidate.`,
        warnings: ticket.warnings || [],
        legs: (ticket.legs || []).map(convertLegForDailyTicket),
      },
    ],
    meta: {
      source: GENERATE_SOURCE,
      engineVersion: GENERATE_ENGINE_VERSION,
      mode,
      dryRun: false,
      oddsLiveEnabled: response.oddsLiveEnabled,
      runtimeMode: response.runtimeMode,
      budgetGateVersion: response.metadata?.pipeline?.oddsGuard?.budgetGateVersion || 'v2',
      timingGate: response.metadata?.pipeline?.engineStatus || null,
      lineupGate: response.metadata?.pipeline?.lineupGate || null,
      scoringSummary: response.metadata?.pipeline?.scoring || null,
      ticketBuilderSummary: response.metadata?.pipeline?.ticketBuilder?.summary || null,
      blockers: response.blockers || [],
      warnings: response.warnings || [],
      historyWrite: true,
      generatedAt,
    },
  };
}

function hasTimingBlockedLeg(ticket = {}) {
  return (ticket.legs || []).some((leg) => (
    Array.isArray(leg.riskTags) && leg.riskTags.includes('timing_blocked')
  ));
}

function getHistoryWriteDecision(response = {}, options = {}, budget = {}) {
  if (options.dryRun !== false) {
    return { allowed: false, reason: 'dry_run' };
  }

  if (options.persist !== true) {
    return { allowed: false, reason: 'persist_false' };
  }

  if (options.confirmWrite !== true) {
    return { allowed: false, reason: 'missing_confirm_write' };
  }

  if (response.status === 'blocked' || response.readiness === 'blocked') {
    return { allowed: false, reason: 'blocked' };
  }

  if (response.status === 'no_ticket' || !response.recommendedTicket) {
    return { allowed: false, reason: 'no_ticket' };
  }

  if (!Array.isArray(response.recommendedTicket.legs) || response.recommendedTicket.legs.length === 0) {
    return { allowed: false, reason: 'no_ticket' };
  }

  if (hasTimingBlockedLeg(response.recommendedTicket)) {
    return { allowed: false, reason: 'timing_blocked' };
  }

  if (response.recommendedMode === 'safe' && response.blockers.includes('all_odds_stale')) {
    return { allowed: false, reason: 'all_odds_stale' };
  }

  if (options.allowLiveOdds === true && budget.canUseLiveOdds !== true) {
    return { allowed: false, reason: 'budget_gate_blocked' };
  }

  return { allowed: true, reason: 'confirmed_write' };
}

async function persistEngineV8Ticket(response = {}, options = {}) {
  const ticket = buildPersistableTicket(response, options);
  const cacheFile = getDailyTicketCacheFilename(ticket.date);

  await writeCache(cacheFile, ticket);
  const historyRecord = await mlbTicketHistoryService.saveGeneratedTicketResult(ticket);

  return {
    ticket,
    cacheFile,
    historyRecord,
  };
}

async function generateDailyTicketEngineV8(options = {}) {
  const modeRequested = normalizeMode(options.mode);
  const dryRun = options.dryRun !== false;
  const persist = options.persist === true;
  const confirmWrite = options.confirmWrite === true;
  const allowLiveOdds = options.allowLiveOdds === true;
  const maxRequests = Math.max(0, Math.trunc(Number(options.maxRequests || 0)));
  const diagnostic = await runDailyTicketEngineV8({
    date: options.targetDate || options.date,
    applyTiming: options.applyTiming,
    timingMode: options.timingMode,
  });
  const requestedRecommendedMode = chooseRecommendedModeForRequest(diagnostic.modes, modeRequested);
  const recommendedTicket = requestedRecommendedMode ? diagnostic.modes[requestedRecommendedMode] : null;
  const liveOddsRequired = diagnostic.blockers.includes('all_odds_stale')
    || diagnostic.blockers.includes('no_fresh_odds');
  const budget = await buildLiveOddsBudget({
    liveOddsRequired,
    allowLiveOdds,
    maxRequests,
  });
  const response = {
    ...diagnostic,
    engineVersion: GENERATE_ENGINE_VERSION,
    dryRun,
    persist,
    historyWrite: false,
    status: requestedRecommendedMode ? 'ticket_candidate' : diagnostic.status,
    modeRequested,
    recommendedMode: requestedRecommendedMode,
    recommendedTicket,
    metadata: {
      ...diagnostic.metadata,
      source: GENERATE_SOURCE,
      dryRun,
      persist,
      confirmWrite,
      allowLiveOdds,
      maxRequests,
      historyWrite: false,
      historyWriteReason: '',
      budget,
    },
  };
  const writeDecision = getHistoryWriteDecision(response, {
    dryRun,
    persist,
    confirmWrite,
    allowLiveOdds,
  }, budget);

  response.metadata.historyWriteReason = writeDecision.reason;

  if (writeDecision.allowed) {
    const persisted = await persistEngineV8Ticket(response, {
      targetDate: options.targetDate || options.date,
    });
    response.status = 'persisted';
    response.historyWrite = true;
    response.persistedTicket = persisted.ticket;
    response.metadata.historyWrite = true;
    response.metadata.historyWriteReason = 'persisted';
    response.metadata.cacheFile = persisted.cacheFile;
    response.metadata.historyRecordId = persisted.historyRecord?.id || '';
  }

  response.summary = buildEngineV8Summary(response);

  if (budget.reasons.length > 0) {
    response.warnings = uniqueStrings([
      ...(response.warnings || []),
      ...budget.reasons,
    ]);
    response.summary.warnings = response.warnings;
  }

  return response;
}

async function runDailyTicketEngineV8(options = {}) {
  const applyTiming = options.applyTiming !== false;
  const guard = await oddsService.getGuardStatusDetailed();
  const ingestion = await oddsIngestionService.getCachedOddsIngestion({
    date: options.date,
    includeNormalized: true,
    sampleLimit: 1,
  });
  const candidates = pickCandidateGeneratorService.generatePickCandidatesFromOdds(
    ingestion.normalizedOdds || [],
    {
      applyTiming,
      timingMode: options.timingMode,
    }
  );
  const candidateSummary = pickCandidateGeneratorService.buildCandidateSummary(candidates, {
    sampleLimit: 0,
  });
  const lineupSummary = lineupGateService.buildLineupGateSummary(candidates, {
    sampleLimit: 0,
  });
  const scoredCandidates = scoringEngineService.scoreCandidates(candidates);
  const scoringSummary = scoringEngineService.buildScoringSummary(scoredCandidates, {
    sampleLimit: 0,
  });
  const ticketBuilderResult = ticketBuilderService.buildTicketsFromScoredCandidates(scoredCandidates);
  const engineStatus = await enginePipelineStatusService.buildEnginePipelineStatus({
    date: options.date,
    applyTiming,
    timingMode: options.timingMode,
  });
  const pipelineResult = {
    guard,
    ingestionSummary: compactIngestion(ingestion),
    candidateSummary,
    lineupSummary,
    scoringSummary,
    ticketBuilderResult,
    engineStatus,
  };

  return buildEngineV8Response(pipelineResult, {
    ...options,
    applyTiming,
  });
}

module.exports = {
  ENGINE_VERSION,
  GENERATE_ENGINE_VERSION,
  buildEngineV8Preflight,
  buildEngineV8Response,
  buildEngineV8Summary,
  buildNoTicketResponse,
  buildTicketModeResponse,
  generateDailyTicketEngineV8,
  runDailyTicketEngineV8,
};
