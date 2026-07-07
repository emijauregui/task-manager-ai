const oddsIngestionService = require('./oddsIngestionService');
const oddsService = require('./oddsService');
const pickCandidateGeneratorService = require('./pickCandidateGeneratorService');
const scoringEngineService = require('./scoringEngineService');
const ticketBuilderService = require('./ticketBuilderService');

const VERSION = 'v1';

function getCount(map = {}, key) {
  return Number(map?.[key] || 0);
}

function compactCacheAudit(cacheAudit = null) {
  if (!cacheAudit) {
    return null;
  }

  return {
    coreOddsFiles: cacheAudit.coreOddsFiles,
    eventsFiles: cacheAudit.eventsFiles,
    eventMarketsFiles: cacheAudit.eventMarketsFiles,
    eventPropsFiles: cacheAudit.eventPropsFiles,
    normalizedFiles: cacheAudit.normalizedFiles,
  };
}

function compactTicket(ticket = {}) {
  return {
    mode: ticket.mode || '',
    status: ticket.status || 'no_ticket',
    legs: Array.isArray(ticket.legs) ? ticket.legs.length : 0,
    totalDecimalOdds: ticket.totalDecimalOdds ?? null,
    estimatedMultiplier: ticket.estimatedMultiplier ?? null,
    riskLevel: ticket.riskLevel || 'unknown',
    correlationScore: ticket.correlationScore || 0,
    warnings: ticket.warnings || [],
    rejectionReasons: ticket.rejectionReasons || [],
    metadata: ticket.metadata
      ? {
        totalCandidatesConsidered: ticket.metadata.totalCandidatesConsidered,
        eligibleCandidates: ticket.metadata.eligibleCandidates,
        rejectedCandidates: ticket.metadata.rejectedCandidates,
        generatedFrom: ticket.metadata.generatedFrom,
        cacheOnly: ticket.metadata.cacheOnly,
      }
      : null,
  };
}

function compactTicketModes(modes = {}) {
  return {
    safe: compactTicket(modes.safe),
    emi: compactTicket(modes.emi),
    free_bet: compactTicket(modes.free_bet),
  };
}

function hasAllNoTicket(ticketBuilderStage = {}) {
  const modes = ticketBuilderStage.modes || {};
  return ['safe', 'emi', 'free_bet'].every((mode) => modes[mode]?.status === 'no_ticket');
}

function hasAnyTicketCandidate(ticketBuilderStage = {}) {
  const modes = ticketBuilderStage.modes || {};
  return ['safe', 'emi', 'free_bet'].some((mode) => modes[mode]?.status === 'ticket_candidate');
}

function getGoodConfidenceCount(scoringStage = {}) {
  const tiers = scoringStage.byConfidenceTier || {};
  return getCount(tiers, 'A') + getCount(tiers, 'B') + getCount(tiers, 'C');
}

function summarizePipelineBlockers(status = {}) {
  const blockers = [];
  const guard = status.stages?.oddsGuard || {};
  const ingestion = status.stages?.oddsIngestion || {};
  const candidates = status.stages?.candidates || {};
  const scoring = status.stages?.scoring || {};
  const ticketBuilder = status.stages?.ticketBuilder || {};
  const totalNormalized = ingestion.totalNormalized || 0;
  const totalCandidates = candidates.totalCandidates || 0;
  const totalScored = scoring.totalScored || 0;
  const staleOdds = getCount(ingestion.freshness, 'stale');
  const freshOdds = getCount(ingestion.freshness, 'fresh');
  const timingBlocked = getCount(candidates.byRiskTag, 'timing_blocked');

  if (guard.oddsLiveEnabled === false) {
    blockers.push('odds_live_disabled');
  }

  if (guard.runtimeMode === 'cache_only' || status.cacheOnly === true) {
    blockers.push('cache_only_mode');
  }

  if (totalNormalized === 0) {
    blockers.push('no_normalized_odds');
  }

  if (totalNormalized > 0 && staleOdds >= totalNormalized) {
    blockers.push('all_odds_stale');
  }

  if (totalNormalized > 0 && freshOdds === 0) {
    blockers.push('no_fresh_odds');
  }

  if (totalCandidates === 0) {
    blockers.push('no_candidates');
  }

  if (totalCandidates > 0 && candidates.activeCandidates === 0) {
    blockers.push('no_active_candidates');
  }

  if (timingBlocked > 0) {
    blockers.push('timing_gate_blocked_games');
  }

  if (ticketBuilder.modes?.safe?.status === 'no_ticket') {
    blockers.push('no_safe_ticket');
  }

  if (hasAllNoTicket(ticketBuilder)) {
    blockers.push('ticket_builder_no_ticket');
  }

  if (ticketBuilder.summary?.rejectionReasons?.not_enough_candidates) {
    blockers.push('not_enough_candidates');
  }

  if (totalScored > 0 && getCount(scoring.byConfidenceTier, 'F') >= totalScored) {
    blockers.push('all_candidates_low_score');
  }

  return Array.from(new Set(blockers));
}

function determineEngineReadiness(status = {}) {
  const ingestion = status.stages?.oddsIngestion || {};
  const candidates = status.stages?.candidates || {};
  const scoring = status.stages?.scoring || {};
  const ticketBuilder = status.stages?.ticketBuilder || {};
  const totalNormalized = ingestion.totalNormalized || 0;
  const totalCandidates = candidates.totalCandidates || 0;
  const totalScored = scoring.totalScored || 0;
  const allOddsStale = totalNormalized > 0 && getCount(ingestion.freshness, 'stale') >= totalNormalized;
  const allCandidatesStale = totalCandidates > 0 && getCount(candidates.freshness, 'stale') >= totalCandidates;
  const allCandidatesTimingBlocked = totalCandidates > 0
    && getCount(candidates.byRiskTag, 'timing_blocked') >= totalCandidates;
  const noCache = totalNormalized === 0;
  const allNoTicket = hasAllNoTicket(ticketBuilder);

  if (noCache
    || candidates.activeCandidates === 0
    || allNoTicket
    || allCandidatesTimingBlocked
    || allCandidatesStale
    || allOddsStale) {
    return 'blocked';
  }

  if (totalNormalized > 0
    && totalCandidates > 0
    && totalScored > 0
    && hasAnyTicketCandidate(ticketBuilder)
    && getGoodConfidenceCount(scoring) > 0) {
    return 'ready';
  }

  if (totalNormalized > 0 && totalCandidates > 0 && totalScored > 0) {
    return 'diagnostic_ready';
  }

  return 'blocked';
}

function getOverallStatus(readiness, blockers = []) {
  if (readiness === 'blocked') {
    return 'blocked';
  }

  if (readiness === 'diagnostic_ready' || blockers.length > 0) {
    return 'degraded';
  }

  return 'healthy';
}

function getNextRecommendedPhase(readiness, blockers = []) {
  if (blockers.includes('no_normalized_odds')) {
    return 'Odds Ingestion cache audit before any ticket work.';
  }

  if (blockers.includes('all_odds_stale') || blockers.includes('no_fresh_odds')) {
    return 'Fresh odds cache refresh only with explicit approval through Budget Gate v2.';
  }

  if (blockers.includes('timing_gate_blocked_games')) {
    return 'Run pipeline against upcoming games, then calibrate Candidate Generator v2.1.';
  }

  if (readiness === 'ready') {
    return 'Ticket Builder v2 can feed the next diagnostic shadow-mode phase.';
  }

  return 'Candidate quality calibration and fresh cache validation.';
}

function buildWarnings(status = {}, blockers = []) {
  const warnings = [];

  if (blockers.includes('all_odds_stale') || blockers.includes('no_fresh_odds')) {
    warnings.push('Odds are cache-only and stale; do not use for real betting decisions.');
  }

  if (blockers.includes('ticket_builder_no_ticket')) {
    warnings.push('Ticket Builder correctly returned no_ticket.');
  }

  if (status.stages?.oddsGuard?.oddsLiveEnabled === false) {
    warnings.push('Live odds require explicit approval and Budget Gate v2.');
  }

  if (blockers.includes('timing_gate_blocked_games')) {
    warnings.push('Timing Gate v2 is blocking started or expired games.');
  }

  return warnings;
}

async function buildEnginePipelineStatus(options = {}) {
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
  const scoredCandidates = scoringEngineService.scoreCandidates(candidates);
  const scoringSummary = scoringEngineService.buildScoringSummary(scoredCandidates, {
    sampleLimit: 0,
  });
  const ticketBuilder = ticketBuilderService.buildTicketsFromScoredCandidates(scoredCandidates);

  const status = {
    version: VERSION,
    cacheOnly: true,
    runtimeMode: guard.runtimeMode,
    oddsLiveEnabled: guard.oddsLiveEnabled,
    readiness: 'blocked',
    overallStatus: 'blocked',
    stages: {
      oddsGuard: {
        oddsLiveEnabled: guard.oddsLiveEnabled,
        runtimeMode: guard.runtimeMode,
        budgetGateVersion: guard.budgetGateVersion,
        canUseLiveOdds: guard.canUseLiveOdds,
        reasons: guard.reasons || [],
        todayEstimatedUsage: guard.todayEstimatedUsage,
        todayActualUsage: guard.todayActualUsage,
      },
      oddsIngestion: {
        version: ingestion.version,
        totalNormalized: ingestion.totalNormalized,
        byMarket: ingestion.byMarket,
        byBookmaker: ingestion.byBookmaker,
        freshness: ingestion.freshness,
        warnings: ingestion.warnings,
        dateFilter: ingestion.dateFilter,
        cacheAudit: compactCacheAudit(ingestion.cacheAudit),
      },
      candidates: {
        version: candidateSummary.version,
        totalCandidates: candidateSummary.totalCandidates,
        activeCandidates: candidateSummary.activeCandidates,
        rejectedCandidates: candidateSummary.rejectedCandidates,
        byMarketType: candidateSummary.byMarketType,
        byRiskTag: candidateSummary.byRiskTag,
        freshness: candidateSummary.freshness,
        rejectionReasons: candidateSummary.rejectionReasons,
      },
      scoring: {
        version: scoringSummary.version,
        totalScored: scoringSummary.totalScored,
        byConfidenceTier: scoringSummary.byConfidenceTier,
        byRiskLevel: scoringSummary.byRiskLevel,
        byMarketType: scoringSummary.byMarketType,
        byValueTier: scoringSummary.byValueTier,
        warnings: scoringSummary.warnings,
        warningCounts: scoringSummary.warningCounts,
      },
      ticketBuilder: {
        version: ticketBuilder.version,
        modes: compactTicketModes(ticketBuilder.modes),
        summary: ticketBuilder.summary,
        warnings: ticketBuilder.warnings,
      },
    },
    blockers: [],
    warnings: [],
    nextRecommendedPhase: '',
    metadata: {
      generatedAt: new Date().toISOString(),
      applyTiming,
      timingMode: options.timingMode || 'safe',
      generatedFrom: 'engine_pipeline_status_v1',
    },
  };

  status.blockers = summarizePipelineBlockers(status);
  status.readiness = determineEngineReadiness(status);
  status.overallStatus = getOverallStatus(status.readiness, status.blockers);
  status.warnings = buildWarnings(status, status.blockers);
  status.nextRecommendedPhase = getNextRecommendedPhase(status.readiness, status.blockers);

  return status;
}

module.exports = {
  VERSION,
  buildEnginePipelineStatus,
  determineEngineReadiness,
  summarizePipelineBlockers,
};
