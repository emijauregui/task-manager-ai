function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
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

function applyConfidenceEngine(candidates = []) {
  const scored = candidates.map(scoreCandidate);
  const avgConfidence = scored.length
    ? Math.round(scored.reduce((total, candidate) => total + Number(candidate.confidenceScore || 0), 0) / scored.length)
    : 0;

  return {
    candidates: scored,
    diagnostics: {
      avgConfidence,
      topByConfidence: [...scored]
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
  applyConfidenceEngine,
};
