function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function isMoneyline(candidate) {
  return String(candidate?.market || '').toLowerCase() === 'h2h';
}

function isSpread(candidate) {
  return String(candidate?.market || '').toLowerCase() === 'spreads';
}

function isPlusOnePointFive(candidate) {
  const pickText = String(candidate?.pick || '').toLowerCase();
  return pickText.includes('+1.5') || pickText.includes('+ 1.5');
}

function candidateTeamKey(candidate) {
  return normalizeKey(candidate?.candidateTeam || candidate?.playerTeam || candidate?.team || '');
}

function buildGameTeamIndex(candidates = []) {
  const index = new Map();

  for (const candidate of candidates) {
    const gameKey = normalizeKey(candidate?.game);
    const teamKey = candidateTeamKey(candidate);
    if (!gameKey || !teamKey) {
      continue;
    }

    const compoundKey = `${gameKey}|${teamKey}`;
    const current = index.get(compoundKey) || [];
    current.push(candidate);
    index.set(compoundKey, current);
  }

  return index;
}

function getSpreadProtectionCandidate(candidate, index) {
  const gameKey = normalizeKey(candidate?.game);
  const teamKey = candidateTeamKey(candidate);
  const compoundKey = `${gameKey}|${teamKey}`;
  const related = index.get(compoundKey) || [];
  return related.find((entry) => isSpread(entry) && isPlusOnePointFive(entry)) || null;
}

function getMoneylineCandidate(candidate, index) {
  const gameKey = normalizeKey(candidate?.game);
  const teamKey = candidateTeamKey(candidate);
  const compoundKey = `${gameKey}|${teamKey}`;
  const related = index.get(compoundKey) || [];
  return related.find((entry) => isMoneyline(entry)) || null;
}

function buildProtectionReason(candidate, spreadCandidate, closeGameRisk) {
  const totalBand = candidate?.learningContext?.totalBand || 'unknown';
  if (spreadCandidate && closeGameRisk !== 'low') {
    return `Spread +1.5 disponible para proteger un juego ${closeGameRisk === 'high' ? 'muy' : ''} cerrado.`
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (totalBand === 'low' || totalBand === 'medium') {
    return 'Entorno de carreras controlado; conviene proteger margen corto.';
  }

  return '';
}

function normalizePreferredMarket(candidate, preferSpread) {
  if (preferSpread) {
    return 'spread';
  }

  if (isMoneyline(candidate)) {
    return 'h2h';
  }

  if (isSpread(candidate)) {
    return 'spread';
  }

  if (String(candidate?.market || '').toLowerCase() === 'totals') {
    return 'total';
  }

  return String(candidate?.market || '');
}

function getCloseGameRisk(candidate, spreadCandidate) {
  if (!isMoneyline(candidate)) {
    return candidate?.closeGameRisk || 'low';
  }

  const odds = Number(candidate?.oddsDecimal);
  let risk = 'low';

  if (Number.isFinite(odds) && odds >= 1.65 && odds <= 2.10) {
    risk = 'medium';
  }

  if (Number.isFinite(odds) && odds > 2.10) {
    risk = 'high';
  }

  const totalBand = candidate?.learningContext?.totalBand;
  if (totalBand === 'low') {
    risk = risk === 'medium' ? 'high' : 'medium';
  } else if (totalBand === 'medium' && risk === 'low') {
    risk = 'medium';
  }

  if (candidate?.learningContext?.inconsistentTeam && risk !== 'high') {
    risk = 'medium';
  }

  if (!spreadCandidate && risk === 'medium') {
    return 'medium';
  }

  return risk;
}

function analyzeCandidateProtection(candidate, index) {
  const spreadCandidate = getSpreadProtectionCandidate(candidate, index);
  const moneylineCandidate = getMoneylineCandidate(candidate, index);
  const closeGameRisk = getCloseGameRisk(candidate, spreadCandidate);
  const isUnderdog = candidate?.learningContext?.isUnderdog === true;
  const inconsistentTeam = candidate?.learningContext?.inconsistentTeam === true;
  const preferSpread = isMoneyline(candidate)
    && Boolean(spreadCandidate)
    && (closeGameRisk === 'medium' || closeGameRisk === 'high' || isUnderdog || inconsistentTeam);
  const spreadIsProtectedOption = isSpread(candidate)
    && isPlusOnePointFive(candidate)
    && Boolean(moneylineCandidate)
    && (moneylineCandidate?.learningContext?.isUnderdog === true
      || moneylineCandidate?.learningContext?.inconsistentTeam === true
      || moneylineCandidate?.oddsDecimal >= 1.65);

  return {
    ...candidate,
    protectionSuggested: preferSpread || spreadIsProtectedOption,
    preferredMarket: normalizePreferredMarket(candidate, preferSpread || spreadIsProtectedOption),
    protectionReason: buildProtectionReason(
      candidate,
      spreadCandidate || (spreadIsProtectedOption ? candidate : null),
      spreadIsProtectedOption ? moneylineCandidate?.closeGameRisk || closeGameRisk : closeGameRisk
    ),
    closeGameRisk: spreadIsProtectedOption ? moneylineCandidate?.closeGameRisk || 'medium' : closeGameRisk,
    protectedByCandidateId: spreadCandidate?.candidateId || (spreadIsProtectedOption ? candidate?.candidateId || '' : ''),
  };
}

function applyMarketProtection(candidates = []) {
  const index = buildGameTeamIndex(candidates);
  const protectedCandidates = candidates.map((candidate) => analyzeCandidateProtection(candidate, index));
  const protectionSuggestedCount = protectedCandidates.filter((candidate) => candidate.protectionSuggested === true).length;
  const mlReplacedBySpreadCount = protectedCandidates.filter((candidate) => (
    isMoneyline(candidate) && candidate.preferredMarket === 'spread'
  )).length;

  return {
    candidates: protectedCandidates,
    diagnostics: {
      protectionSuggestedCount,
      mlReplacedBySpreadCount,
    },
  };
}

module.exports = {
  applyMarketProtection,
};
