'use strict';

function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function getPatternCodes(learningSummary = {}) {
  const snapshot = learningSummary?.patternSnapshot || {};
  const riskFlags = Array.isArray(snapshot.riskFlags) ? snapshot.riskFlags : [];
  const positiveSignals = Array.isArray(snapshot.positiveSignals) ? snapshot.positiveSignals : [];
  return {
    riskFlags,
    positiveSignals,
  };
}

function getResolvedTicketCount(learningSummary = {}) {
  return Number(learningSummary?.won || 0)
    + Number(learningSummary?.lost || 0)
    + Number(learningSummary?.push || 0);
}

function getInfluenceMode(learningSummary = {}) {
  const resolvedTickets = getResolvedTicketCount(learningSummary);
  if (resolvedTickets < 20) {
    return 'low_sample_soft';
  }

  return 'standard';
}

function isH2hCandidate(candidate = {}) {
  const market = String(candidate?.market || '').toLowerCase();
  const category = String(candidate?.marketCategory || '').toLowerCase();
  return market === 'h2h' || category === 'moneyline';
}

function isSpreadPlusOnePointFive(candidate = {}) {
  const market = String(candidate?.market || '').toLowerCase();
  const category = String(candidate?.marketCategory || '').toLowerCase();
  const pick = String(candidate?.pick || '').toLowerCase();
  return (market === 'spreads' || category === 'spread')
    && (pick.includes('+1.5') || pick.includes('+ 1.5'));
}

function buildEmptyDiagnostics(enabled = false) {
  return {
    historicalInfluenceEnabled: enabled,
    historicalInfluenceMode: enabled ? 'standard' : 'disabled',
    historicalInfluenceAppliedCount: 0,
    historicalBoostedCount: 0,
    historicalPenalizedCount: 0,
    historicalInfluenceWarnings: [],
  };
}

function applyHistoricalPatternInfluence(candidates = [], learningSummary = {}) {
  const enabled = learningSummary?.learningEnabled === true;
  if (!enabled) {
    return {
      candidates: Array.isArray(candidates) ? candidates : [],
      diagnostics: buildEmptyDiagnostics(false),
    };
  }

  const mode = getInfluenceMode(learningSummary);
  const resolvedTickets = getResolvedTicketCount(learningSummary);
  const { riskFlags, positiveSignals } = getPatternCodes(learningSummary);
  const hasMlRisk = riskFlags.includes('ml_negative_recent_losses');
  const hasWeakH2h = riskFlags.includes('market_low_performance_h2h');
  const hasProtectedSpreadSignal = positiveSignals.includes('prefer_protected_spread_for_competitive_underdogs');
  const emiLowRoi = riskFlags.includes('ticket_type_emi_low_roi');
  const diagnostics = {
    historicalInfluenceEnabled: true,
    historicalInfluenceMode: mode,
    historicalInfluenceAppliedCount: 0,
    historicalBoostedCount: 0,
    historicalPenalizedCount: 0,
    historicalInfluenceWarnings: [],
    resolvedTickets,
  };

  if (emiLowRoi) {
    diagnostics.historicalInfluenceWarnings.push('Estilo Emi viene con ROI negativo en historial real; controlar exposición.');
  }

  if (mode === 'low_sample_soft') {
    diagnostics.historicalInfluenceWarnings.push('Influencia histórica aplicada en modo suave por muestra limitada.');
  }

  const adjustedCandidates = (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const currentConfidence = Number(candidate?.confidenceScore || 0);
    const currentValue = Number(candidate?.valueScore || 0);
    let requestedConfidenceDelta = 0;
    let requestedValueDelta = 0;
    const warnings = [...(Array.isArray(candidate?.historicalInfluenceWarnings) ? candidate.historicalInfluenceWarnings : [])];
    const reasons = [];

    if (hasMlRisk && isH2hCandidate(candidate)) {
      requestedConfidenceDelta += mode === 'low_sample_soft' ? -2 : -4;
      reasons.push('ml_negative_recent_losses');
      warnings.push('Historial reciente marca riesgo en Moneyline/h2h.');
    }

    if (hasWeakH2h && isH2hCandidate(candidate)) {
      requestedValueDelta += mode === 'low_sample_soft' ? -2 : -3;
      if (!reasons.includes('market_low_performance_h2h')) {
        reasons.push('market_low_performance_h2h');
      }
      warnings.push('Historial reciente marca riesgo en Moneyline/h2h.');
    }

    if (hasProtectedSpreadSignal && isSpreadPlusOnePointFive(candidate)) {
      requestedConfidenceDelta += mode === 'low_sample_soft' ? 2 : 4;
      if (!reasons.includes('prefer_protected_spread_for_competitive_underdogs')) {
        reasons.push('prefer_protected_spread_for_competitive_underdogs');
      }
    }

    const boundedRequestedDelta = Math.max(-5, Math.min(5, requestedConfidenceDelta));
    let nextConfidence = currentConfidence;
    if (boundedRequestedDelta < 0) {
      const lowerFloor = currentConfidence <= 50 ? currentConfidence : 50;
      nextConfidence = Math.max(lowerFloor, currentConfidence + boundedRequestedDelta);
    } else if (boundedRequestedDelta > 0) {
      nextConfidence = Math.min(85, currentConfidence + boundedRequestedDelta);
    }

    const appliedConfidenceDelta = Math.round(nextConfidence - currentConfidence);
    const nextValue = clampScore(currentValue + requestedValueDelta);
    const appliedValueDelta = Math.round(nextValue - currentValue);
    const historicalInfluenceApplied = appliedConfidenceDelta !== 0 || appliedValueDelta !== 0;
    const historicalBoostApplied = appliedConfidenceDelta > 0;
    const historicalPenaltyApplied = appliedConfidenceDelta < 0 || appliedValueDelta < 0;
    const normalizedWarnings = uniqueStrings(warnings);

    if (historicalInfluenceApplied) {
      diagnostics.historicalInfluenceAppliedCount += 1;
    }

    if (historicalBoostApplied) {
      diagnostics.historicalBoostedCount += 1;
    }

    if (historicalPenaltyApplied) {
      diagnostics.historicalPenalizedCount += 1;
    }

    return {
      ...candidate,
      confidenceScore: clampScore(nextConfidence),
      valueScore: clampScore(nextValue),
      ruleWarnings: uniqueStrings([
        ...(Array.isArray(candidate?.ruleWarnings) ? candidate.ruleWarnings : []),
        ...normalizedWarnings,
      ]),
      historicalInfluenceApplied,
      historicalBoostApplied,
      historicalPenaltyApplied,
      historicalInfluenceReason: reasons.join(','),
      historicalInfluenceReasons: uniqueStrings(reasons),
      historicalConfidenceDelta: appliedConfidenceDelta,
      historicalValueDelta: appliedValueDelta,
      historicalInfluenceWarnings: normalizedWarnings,
    };
  });

  diagnostics.historicalInfluenceWarnings = uniqueStrings(diagnostics.historicalInfluenceWarnings);

  return {
    candidates: adjustedCandidates,
    diagnostics,
  };
}

module.exports = {
  applyHistoricalPatternInfluence,
  getInfluenceMode,
};
