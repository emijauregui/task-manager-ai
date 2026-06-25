function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function parseWinningPercentage(records = [], candidate = {}) {
  const candidateTeamKey = normalizeKey(candidate?.candidateTeam || candidate?.playerTeam || '');
  const recordList = Array.isArray(records) ? records : [];

  const parseRecord = (recordText) => {
    const match = String(recordText || '').match(/(\d+)-(\d+)/);
    if (!match) {
      return null;
    }

    const wins = Number(match[1]);
    const losses = Number(match[2]);
    const games = wins + losses;
    if (!games) {
      return null;
    }

    return wins / games;
  };

  if (candidateTeamKey) {
    for (const recordText of recordList) {
      const recordKey = normalizeKey(recordText);
      if (!recordKey || !recordKey.includes(candidateTeamKey)) {
        continue;
      }

      const parsed = parseRecord(recordText);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  for (const recordText of recordList) {
    const parsed = parseRecord(recordText);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function inferGameTotalBand(candidate, candidates = []) {
  const sameGameTotals = (Array.isArray(candidates) ? candidates : [])
    .filter((entry) => entry?.game === candidate?.game)
    .filter((entry) => String(entry?.market || '').toLowerCase() === 'totals')
    .map((entry) => Number(entry?.point))
    .filter((point) => Number.isFinite(point));

  const totalPoint = sameGameTotals.length ? Math.min(...sameGameTotals) : null;

  if (!Number.isFinite(totalPoint)) {
    return {
      totalPoint: null,
      totalBand: 'unknown',
    };
  }

  if (totalPoint <= 8.5) {
    return {
      totalPoint,
      totalBand: 'low',
    };
  }

  if (totalPoint <= 9.5) {
    return {
      totalPoint,
      totalBand: 'medium',
    };
  }

  return {
    totalPoint,
    totalBand: 'high',
  };
}

function attachOutcomeSignals(candidate, candidates = []) {
  const winningPercentage = parseWinningPercentage(candidate?.records, candidate);
  const { totalPoint, totalBand } = inferGameTotalBand(candidate, candidates);
  const odds = Number(candidate?.oddsDecimal);
  const isUnderdog = Number.isFinite(odds) && odds >= 2.0;
  const isClearFavorite = Number.isFinite(odds) && odds <= 1.72;
  const inconsistentTeam = winningPercentage === null
    ? isUnderdog
    : winningPercentage >= 0.42 && winningPercentage <= 0.58;

  return {
    ...candidate,
    learningContext: {
      winningPercentage,
      totalPoint,
      totalBand,
      isUnderdog,
      isClearFavorite,
      inconsistentTeam,
    },
  };
}

module.exports = {
  attachOutcomeSignals,
};
