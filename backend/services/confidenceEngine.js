'use strict';

const historicalInfluenceService = require('./historicalInfluenceService');

function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function addEvidence(target, message) {
  if (message) {
    target.push(message);
  }
}

function addRiskFlag(target, message) {
  if (message && !target.includes(message)) {
    target.push(message);
  }
}

function isPlusOnePointFive(candidate) {
  const pickText = String(candidate?.pick || '').toLowerCase();
  return pickText.includes('+1.5') || pickText.includes('+ 1.5');
}

function getMarketCategory(candidate) {
  return String(candidate?.marketCategory || candidate?.market || '').toLowerCase();
}

function scoreMoneyline(candidate, confidence, value, volatility, riskFlags, evidence) {
  const odds = Number(candidate?.oddsDecimal);
  if (candidate?.voidRisk === 'low') {
    confidence += 10;
    addEvidence(evidence, 'Void risk bajo.');
  }

  if (Number.isFinite(odds) && odds >= 1.45 && odds <= 2.0) {
    confidence += 8;
    value += 6;
    addEvidence(evidence, 'Cuota util en rango estable.');
  }

  if (candidate?.learningContext?.isClearFavorite) {
    confidence += 5;
    addEvidence(evidence, 'Favorito claro por precio.');
  }

  if (candidate?.closeGameRisk === 'medium') {
    confidence -= 10;
    volatility += 10;
    addRiskFlag(riskFlags, 'close_game_risk_medium');
  } else if (candidate?.closeGameRisk === 'high') {
    confidence -= 18;
    volatility += 18;
    addRiskFlag(riskFlags, 'close_game_risk_high');
  }

  if (candidate?.learningContext?.isUnderdog || candidate?.learningContext?.inconsistentTeam) {
    confidence -= 12;
    volatility += 12;
    addRiskFlag(riskFlags, 'fragile_moneyline_profile');
  }

  if (candidate?.preferredMarket === 'spread') {
    confidence -= 12;
    addRiskFlag(riskFlags, 'spread_protection_preferred');
    addEvidence(evidence, 'Existe mejor proteccion con +1.5.');
  }

  return { confidence, value, volatility };
}

function scoreSpread(candidate, confidence, value, volatility, riskFlags, evidence) {
  const odds = Number(candidate?.oddsDecimal);
  if (isPlusOnePointFive(candidate)) {
    confidence += 10;
    value += 6;
    addEvidence(evidence, 'Protege underdog competitivo.');
  }

  if (Number.isFinite(odds) && odds >= 1.45 && odds <= 1.8) {
    confidence += 8;
    value += 5;
    addEvidence(evidence, 'Cuota controlada para spread.');
  }

  if (candidate?.protectionSuggested === true || candidate?.preferredMarket === 'spread') {
    confidence += 8;
    addEvidence(evidence, 'Spread recomendado sobre ML fragil.');
  }

  if (String(candidate?.market || '').toLowerCase() === 'spreads' && candidate?.protectionSuggested === true) {
    confidence += 5;
    value += 5;
    addEvidence(evidence, 'Spread protegido recomendado por riesgo de juego cerrado.');
  }

  if (candidate?.voidRisk === 'medium') {
    confidence -= 8;
    volatility += 8;
    addRiskFlag(riskFlags, 'requires_full_game');
  }

  return { confidence, value, volatility };
}

function scoreTotals(candidate, confidence, value, volatility, riskFlags, evidence) {
  const odds = Number(candidate?.oddsDecimal);
  if (Number.isFinite(odds) && odds >= 1.75 && odds <= 2.05) {
    confidence += 6;
    value += 5;
    addEvidence(evidence, 'Total dentro de rango util.');
  }

  if (!candidate?.records?.length && !candidate?.venue) {
    confidence -= 10;
    volatility += 10;
    addRiskFlag(riskFlags, 'limited_offensive_context');
  }

  if (candidate?.voidRisk === 'medium') {
    confidence -= 8;
    volatility += 8;
    addRiskFlag(riskFlags, 'requires_full_game');
  }

  return { confidence, value, volatility };
}

function scorePlayerProp(candidate, confidence, value, volatility, riskFlags, evidence) {
  const category = getMarketCategory(candidate);
  const odds = Number(candidate?.oddsDecimal);
  if (candidate?.teamResolved === true) {
    confidence += 10;
    addEvidence(evidence, 'Equipo del jugador verificado.');
  }

  if (candidate?.oddsVerified === true) {
    confidence += 10;
    addEvidence(evidence, 'Momio verificado desde odds feed.');
  }

  if (category === 'pitcher_strikeouts' && candidate?.probableStarter) {
    confidence += 8;
    addEvidence(evidence, 'Pitcher probable identificado.');
  }

  if (candidate?.lineupConfidence === 'unknown') {
    confidence -= 12;
    volatility += 12;
    addRiskFlag(riskFlags, 'lineup_confidence_unknown');
  }

  if (candidate?.voidRisk === 'high') {
    const voidPenalty = category === 'pitcher_strikeouts'
      ? 6
      : category === 'player_hit'
        ? 7
        : category === 'player_total_bases'
          ? 9
          : category === 'player_hrr'
            ? 14
            : 12;
    confidence -= voidPenalty;
    volatility += Math.max(8, voidPenalty + 2);
    addRiskFlag(riskFlags, 'high_void_risk');
  }

  if (Number.isFinite(odds) && odds > 3.5) {
    confidence -= 15;
    volatility += 18;
    addRiskFlag(riskFlags, 'long_prop_price');
  }

  if (category === 'pitcher_strikeouts') {
    value += 7;
    if (candidate?.teamResolved === true && candidate?.oddsVerified === true) {
      confidence = Math.max(confidence, 58);
      addEvidence(evidence, 'Prop de K con piso minimo verificado.');
    }
  } else if (category === 'player_hit') {
    value += 6;
    if (candidate?.teamResolved === true && candidate?.oddsVerified === true) {
      confidence = Math.max(confidence, 60);
      addEvidence(evidence, 'Prop de hit con piso minimo verificado.');
    }
  } else if (category === 'player_total_bases') {
    value += 5;
    if (candidate?.teamResolved === true && candidate?.oddsVerified === true) {
      confidence = Math.max(confidence, 55);
      addEvidence(evidence, 'Prop de bases totales con piso minimo verificado.');
    }
  } else if (category === 'player_hrr') {
    value += 3;
    if (value < 65) {
      confidence = Math.min(confidence, 50);
      addRiskFlag(riskFlags, 'home_run_prop_only_free_bet');
    }
  } else {
    value += 3;
  }

  return { confidence, value, volatility };
}

function scoreCandidate(candidate) {
  const riskFlags = [];
  const evidence = [];
  let confidence = 50;
  let value = 50;
  let volatility = candidate?.voidRisk === 'low' ? 24 : candidate?.voidRisk === 'medium' ? 44 : 62;
  const market = String(candidate?.market || '').toLowerCase();
  const category = getMarketCategory(candidate);

  if (market === 'h2h' || category === 'moneyline') {
    ({ confidence, value, volatility } = scoreMoneyline(candidate, confidence, value, volatility, riskFlags, evidence));
  } else if (market === 'spreads' || category === 'spread') {
    ({ confidence, value, volatility } = scoreSpread(candidate, confidence, value, volatility, riskFlags, evidence));
  } else if (market === 'totals' || category === 'total') {
    ({ confidence, value, volatility } = scoreTotals(candidate, confidence, value, volatility, riskFlags, evidence));
  } else {
    ({ confidence, value, volatility } = scorePlayerProp(candidate, confidence, value, volatility, riskFlags, evidence));
  }

  return {
    ...candidate,
    confidenceScore: clampScore(confidence),
    valueScore: clampScore(value),
    volatilityScore: clampScore(volatility),
    riskFlags,
    evidence,
  };
}

function applyHistoricalLearning(candidate, learningSummary = {}) {
  if (!learningSummary?.learningEnabled) {
    return {
      ...candidate,
      historicalPatternsApplied: [],
      historicalRiskFlags: [],
    };
  }

  let confidence = Number(candidate?.confidenceScore || 0);
  let value = Number(candidate?.valueScore || 0);
  let volatility = Number(candidate?.volatilityScore || 0);
  const riskFlags = [...(Array.isArray(candidate?.riskFlags) ? candidate.riskFlags : [])];
  const evidence = [...(Array.isArray(candidate?.evidence) ? candidate.evidence : [])];
  const appliedPatterns = [];
  const category = getMarketCategory(candidate);
  const odds = Number(candidate?.oddsDecimal);
  const failurePatternCounts = learningSummary?.failurePatternCounts || {};
  const candidateTeamKey = normalizeKey(candidate?.candidateTeam || candidate?.playerTeam || '');
  const playerKey = normalizeKey(candidate?.playerName || candidate?.player || '');
  const teamExposure = candidateTeamKey ? learningSummary?.teamExposureMap?.[candidateTeamKey] : null;
  const playerExposure = playerKey ? learningSummary?.playerPropExposureMap?.[playerKey] : null;
  const isHomeRunProp = category === 'player_hrr' || String(candidate?.market || '').toLowerCase() === 'batter_home_runs';

  function applyPattern(patternKey, effect = {}) {
    appliedPatterns.push(patternKey);
    confidence += Number(effect.confidence || 0);
    value += Number(effect.value || 0);
    volatility += Number(effect.volatility || 0);
    addRiskFlag(riskFlags, effect.riskFlag || '');
    addEvidence(evidence, effect.evidence || '');
  }

  if (category === 'moneyline' && Number(failurePatternCounts.ml_one_run_loss_risk || 0) > 0 && candidate?.closeGameRisk !== 'low') {
    applyPattern('ml_one_run_loss_risk', {
      confidence: -4,
      value: -2,
      riskFlag: 'historical_ml_one_run_loss_risk',
      evidence: 'Historical pattern: ML one-run loss risk.',
    });
  }

  if (category === 'moneyline' && Number(failurePatternCounts.protected_spread_preferred || 0) > 0 && candidate?.preferredMarket === 'spread') {
    applyPattern('protected_spread_preferred', {
      confidence: -5,
      value: -3,
      riskFlag: 'historical_protected_spread_preferred',
      evidence: 'Historical pattern: protected spread preferred.',
    });
  }

  if (category === 'spread' && isPlusOnePointFive(candidate) && Number(failurePatternCounts.protected_spread_preferred || 0) > 0) {
    applyPattern('protected_spread_preferred', {
      confidence: 4,
      value: 3,
      evidence: 'Historical pattern: protected spread preferred.',
    });
  }

  if ((candidate?.candidateType === 'player_prop' || category.startsWith('player_') || category === 'pitcher_strikeouts') && candidate?.lineupConfidence !== 'confirmed' && Number(failurePatternCounts.player_prop_requires_lineup_confirmation || 0) > 0) {
    applyPattern('player_prop_requires_lineup_confirmation', {
      confidence: -5,
      value: -2,
      volatility: 4,
      riskFlag: 'historical_lineup_confirmation_risk',
      evidence: 'Historical pattern: player prop requires lineup confirmation.',
    });
  }

  if (isHomeRunProp && Number(failurePatternCounts.home_run_market_high_volatility || 0) > 0) {
    applyPattern('home_run_market_high_volatility', {
      confidence: -4,
      value: -2,
      volatility: 6,
      riskFlag: 'historical_home_run_volatility',
      evidence: 'Historical pattern: home run market volatility.',
    });
  }

  if (category === 'moneyline' && Number.isFinite(odds) && odds > 0 && odds <= 1.6 && Number(failurePatternCounts.low_value_favorite_ml || 0) > 0) {
    applyPattern('low_value_favorite_ml', {
      confidence: -4,
      value: -4,
      riskFlag: 'historical_low_value_favorite_ml',
      evidence: 'Historical pattern: low-value favorite ML.',
    });
  }

  if ((category === 'total' || String(candidate?.market || '').toLowerCase() === 'totals') && Number(failurePatternCounts.totals_with_limited_context || 0) > 0 && !candidate?.records?.length && !candidate?.venue) {
    applyPattern('totals_with_limited_context', {
      confidence: -4,
      value: -3,
      volatility: 4,
      riskFlag: 'historical_totals_limited_context',
      evidence: 'Historical pattern: totals with limited context.',
    });
  }

  if (teamExposure && Number(teamExposure.legs || 0) >= 4 && Number(teamExposure.lossRate || 0) >= 0.6) {
    applyPattern('team_loss_exposure', {
      value: -3,
      riskFlag: 'historical_team_loss_exposure',
      evidence: 'Historical pattern: repeated team loss exposure.',
    });
  }

  if (playerExposure && Number(playerExposure.legs || 0) >= 3 && Number(playerExposure.lossRate || 0) >= 0.6) {
    applyPattern('player_prop_loss_exposure', {
      value: -2,
      riskFlag: 'historical_player_prop_loss_exposure',
      evidence: 'Historical pattern: repeated player prop loss exposure.',
    });
  }

  if (playerExposure && Number(playerExposure.lineupIssues || 0) > 0 && candidate?.lineupConfidence !== 'confirmed') {
    applyPattern('player_prop_lineup_exposure', {
      confidence: -3,
      volatility: 2,
      riskFlag: 'historical_player_lineup_issue',
      evidence: 'Historical pattern: player prop requires lineup confirmation.',
    });
  }

  if (Number(failurePatternCounts.long_parlay_one_leg_loss || 0) > 0 && Number(candidate?.volatilityScore || 0) >= 65) {
    applyPattern('long_parlay_one_leg_loss', {
      confidence: -2,
      volatility: 2,
      riskFlag: 'historical_long_parlay_exposure',
      evidence: 'Historical pattern: long parlay exposure.',
    });
  }

  return {
    ...candidate,
    confidenceScore: clampScore(confidence),
    valueScore: clampScore(value),
    volatilityScore: clampScore(volatility),
    riskFlags: uniqueStrings(riskFlags),
    evidence: uniqueStrings(evidence),
    historicalPatternsApplied: uniqueStrings(appliedPatterns),
    historicalRiskFlags: uniqueStrings(riskFlags.filter((flag) => String(flag).startsWith('historical_'))),
  };
}

function applyConfidenceEngine(candidates = [], context = {}) {
  const historicalLearning = context?.historicalLearning || null;
  const baseScored = candidates.map(scoreCandidate);
  const learned = baseScored.map((candidate) => applyHistoricalLearning(candidate, historicalLearning));
  let influenced = learned;
  let influenceDiagnostics = {
    historicalInfluenceEnabled: false,
    historicalInfluenceMode: 'disabled',
    historicalInfluenceAppliedCount: 0,
    historicalBoostedCount: 0,
    historicalPenalizedCount: 0,
    historicalInfluenceWarnings: [],
  };

  try {
    const influenceResult = historicalInfluenceService.applyHistoricalPatternInfluence(learned, historicalLearning);
    influenced = influenceResult.candidates;
    influenceDiagnostics = influenceResult.diagnostics;
  } catch (error) {
    console.error('[outcome-learning] Historical influence failed', {
      message: error.message,
      name: error.name,
    });
  }

  const avgConfidence = influenced.length
    ? Math.round(influenced.reduce((total, candidate) => total + Number(candidate.confidenceScore || 0), 0) / influenced.length)
    : 0;
  const historicalPatternsApplied = influenced.reduce((total, candidate) => (
    total + (Array.isArray(candidate.historicalPatternsApplied) ? candidate.historicalPatternsApplied.length : 0)
  ), 0);
  const historicalRiskFlags = uniqueStrings(influenced.flatMap((candidate) => candidate.historicalRiskFlags || []));

  if (historicalLearning?.learningEnabled && historicalPatternsApplied > 0) {
    console.log('[outcome-learning] APPLIED_LEARNING', {
      candidates: influenced.length,
      historicalPatternsApplied,
      historicalRiskFlags,
    });
  }

  return {
    candidates: influenced,
    diagnostics: {
      avgConfidence,
      historicalLearningEnabled: historicalLearning?.learningEnabled === true,
      historicalPatternsApplied,
      historicalRiskFlags,
      historicalInfluenceEnabled: influenceDiagnostics.historicalInfluenceEnabled === true,
      historicalInfluenceMode: influenceDiagnostics.historicalInfluenceMode || 'disabled',
      historicalInfluenceAppliedCount: Number(influenceDiagnostics.historicalInfluenceAppliedCount || 0),
      historicalBoostedCount: Number(influenceDiagnostics.historicalBoostedCount || 0),
      historicalPenalizedCount: Number(influenceDiagnostics.historicalPenalizedCount || 0),
      historicalInfluenceWarnings: uniqueStrings(influenceDiagnostics.historicalInfluenceWarnings || []),
      topByConfidence: [...influenced]
        .sort((left, right) => Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0))
        .slice(0, 5)
        .map((candidate) => ({
          candidateId: candidate.candidateId || '',
          pick: candidate.pick,
          market: candidate.market,
          confidenceScore: candidate.confidenceScore,
          preferredMarket: candidate.preferredMarket || '',
        })),
    },
  };
}

module.exports = {
  applyHistoricalLearning,
  applyConfidenceEngine,
};
