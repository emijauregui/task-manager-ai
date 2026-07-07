const enginePipelineStatusService = require('./enginePipelineStatusService');
const lineupGateService = require('./lineupGateService');
const oddsIngestionService = require('./oddsIngestionService');
const oddsService = require('./oddsService');
const pickCandidateGeneratorService = require('./pickCandidateGeneratorService');
const scoringEngineService = require('./scoringEngineService');
const ticketBuilderService = require('./ticketBuilderService');

const ENGINE_VERSION = 'v8.0-diagnostic';
const SOURCE = 'engine_v8_diagnostic';
const MODES = ['safe', 'emi', 'free_bet'];

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
  buildEngineV8Response,
  buildEngineV8Summary,
  buildNoTicketResponse,
  buildTicketModeResponse,
  runDailyTicketEngineV8,
};
