const GAME_MARKETS = new Set(['h2h', 'spreads', 'totals']);
const BLOCKED_STATUS_PATTERNS = [
  'final',
  'completed',
  'live',
  'in progress',
  'halftime',
  'end of period',
  'postponed',
  'cancelled',
  'canceled',
  'suspended',
];

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isGameMarket(candidate) {
  return GAME_MARKETS.has(String(candidate?.market || '').toLowerCase());
}

function isPlayerPropCandidate(candidate) {
  if (!candidate || !candidate.market) {
    return false;
  }

  if (!isGameMarket(candidate)) {
    return true;
  }

  return Boolean(candidate.playerName || candidate.playerTeam || candidate.lineupRequired);
}

function inferTeamFromPick(candidate) {
  const pickKey = normalizeKey(candidate?.pick);
  const homeTeam = String(candidate?.homeTeam || '').trim();
  const awayTeam = String(candidate?.awayTeam || '').trim();

  if (homeTeam && pickKey.includes(normalizeKey(homeTeam))) {
    return homeTeam;
  }

  if (awayTeam && pickKey.includes(normalizeKey(awayTeam))) {
    return awayTeam;
  }

  return '';
}

function detectCandidateTeam(candidate) {
  return candidate?.playerTeam
    || candidate?.team
    || candidate?.teamName
    || inferTeamFromPick(candidate)
    || '';
}

function getLineupConfidence(candidate) {
  if (!isPlayerPropCandidate(candidate)) {
    return 'not_required';
  }

  if (candidate?.lineupConfirmed === true || candidate?.starterConfirmed === true) {
    return 'confirmed';
  }

  if (candidate?.lineupConfidence) {
    const normalized = String(candidate.lineupConfidence).toLowerCase();
    if (['confirmed', 'probable', 'unknown'].includes(normalized)) {
      return normalized;
    }
  }

  return 'unknown';
}

function hasBlockedDrafteaStatus(candidate) {
  const status = String(candidate?.espnStatus || candidate?.status || '').toLowerCase();
  if (!status) {
    return false;
  }

  return BLOCKED_STATUS_PATTERNS.some((pattern) => status.includes(pattern))
    || status.includes('delayed severe');
}

function getVoidRisk(candidateType, market, lineupConfidence) {
  if (candidateType === 'player_prop') {
    return lineupConfidence === 'confirmed' ? 'medium' : 'high';
  }

  if (market === 'spreads' || market === 'totals') {
    return 'medium';
  }

  return 'low';
}

function getBaseRuleWarnings(candidate, details) {
  const warnings = [];

  if (details.candidateType === 'player_prop') {
    warnings.push('Player props requieren titular confirmado.');
    if (details.lineupConfidence !== 'confirmed') {
      warnings.push('Lineup no confirmado; riesgo mayor.');
    }
  }

  if (candidate.market === 'h2h') {
    warnings.push('Money Line incluye extra innings.');
  }

  if (candidate.market === 'spreads' || candidate.market === 'totals') {
    warnings.push('Spread/totales requieren juego completo.');
  }

  if (candidate.pitcherChangeDetected === true || candidate.probablePitcherChanged === true) {
    warnings.push('Cambio de pitcher reduce confianza.');
  }

  if (hasBlockedDrafteaStatus(candidate)) {
    warnings.push('Estado del juego no apto para Draftea.');
  }

  if (details.candidateType === 'player_prop' && !details.candidateTeam) {
    warnings.push('Equipo del jugador no confirmado.');
  }

  return uniqueStrings(warnings);
}

function buildCandidateDetails(candidate) {
  const candidateType = isPlayerPropCandidate(candidate) ? 'player_prop' : 'game_market';
  const candidateTeam = detectCandidateTeam(candidate);
  const lineupConfidence = getLineupConfidence(candidate);
  const lineupRequired = candidateType === 'player_prop';
  const voidRisk = getVoidRisk(candidateType, candidate.market, lineupConfidence);
  const drafteaCompliant = !hasBlockedDrafteaStatus(candidate);
  const safeEligible = candidateType !== 'player_prop' || lineupConfidence === 'confirmed';
  const ruleWarnings = getBaseRuleWarnings(candidate, {
    candidateType,
    candidateTeam,
    lineupConfidence,
  });

  return {
    candidateType,
    candidateTeam,
    lineupConfidence,
    lineupRequired,
    voidRisk,
    drafteaCompliant,
    safeEligible,
    ruleWarnings,
  };
}

function applyDrafteaRules(candidates = []) {
  const diagnostics = {
    playerPropsByTeam: {},
    rejectedSameTeamPlayerProps: [],
    voidRiskCounts: {
      low: 0,
      medium: 0,
      high: 0,
    },
  };

  const playerPropsByTeam = new Map();

  const annotatedCandidates = candidates
    .map((candidate) => {
      const details = buildCandidateDetails(candidate);
      const annotated = {
        ...candidate,
        ...details,
      };

      diagnostics.voidRiskCounts[details.voidRisk] += 1;

      if (details.candidateType === 'player_prop' && details.candidateTeam) {
        const current = playerPropsByTeam.get(details.candidateTeam) || [];
        current.push(annotated);
        playerPropsByTeam.set(details.candidateTeam, current);
      }

      return annotated;
    })
    .filter((candidate) => candidate.drafteaCompliant);

  diagnostics.playerPropsByTeam = Object.fromEntries(
    Array.from(playerPropsByTeam.entries()).map(([team, items]) => ([
      team,
      items.map((item) => ({
        candidateId: item.candidateId || '',
        pick: item.pick,
        market: item.market,
        oddsDecimal: item.oddsDecimal,
        lineupConfidence: item.lineupConfidence,
      })),
    ]))
  );

  diagnostics.rejectedSameTeamPlayerProps = Array.from(playerPropsByTeam.entries()).flatMap(([team, items]) => {
    if (items.length <= 1) {
      return [];
    }

    return [...items]
      .sort((left, right) => getCandidateStrength(right, 'emi') - getCandidateStrength(left, 'emi'))
      .slice(1)
      .map((item) => ({
        team,
        candidateId: item.candidateId || '',
        pick: item.pick,
        market: item.market,
        oddsDecimal: item.oddsDecimal,
        reason: 'Would conflict with another player prop from the same team inside one Draftea ticket.',
      }));
  });

  return {
    candidates: annotatedCandidates,
    diagnostics,
  };
}

function buildCandidateIndex(candidates = []) {
  const index = new Map();

  candidates.forEach((candidate) => {
    const key = [
      normalizeKey(candidate.game),
      normalizeKey(candidate.pick),
      normalizeKey(candidate.market),
    ].join('|');
    index.set(key, candidate);
  });

  return index;
}

function findCandidateForLeg(leg, candidateIndex, candidates = []) {
  const exactKey = [
    normalizeKey(leg?.game),
    normalizeKey(leg?.pick),
    normalizeKey(leg?.market),
  ].join('|');

  const exact = candidateIndex.get(exactKey);
  if (exact) {
    return exact;
  }

  return candidates.find((candidate) => (
    normalizeKey(candidate.game) === normalizeKey(leg?.game)
      && normalizeKey(candidate.market) === normalizeKey(leg?.market)
      && normalizeKey(candidate.pick) === normalizeKey(leg?.pick)
  )) || null;
}

function getCandidateStrength(candidate, ticketType) {
  if (!candidate) {
    return -1000;
  }

  let score = 0;

  if (candidate.market === 'h2h') {
    score += 50;
  } else if (candidate.market === 'spreads') {
    score += 30;
  } else if (candidate.market === 'totals') {
    score += 24;
  } else {
    score += 18;
  }

  if (ticketType === 'safe' && candidate.market === 'h2h') {
    score += 30;
  }

  if (candidate.voidRisk === 'low') {
    score += 18;
  } else if (candidate.voidRisk === 'medium') {
    score += 8;
  } else {
    score -= 10;
  }

  if (candidate.safeEligible) {
    score += 10;
  }

  if (candidate.lineupConfidence === 'confirmed') {
    score += 12;
  } else if (candidate.lineupConfidence === 'unknown') {
    score -= 6;
  }

  if (candidate.pitcherChangeDetected === true || candidate.probablePitcherChanged === true) {
    score -= 8;
  }

  const oddsDecimal = Number(candidate.oddsDecimal);
  if (Number.isFinite(oddsDecimal)) {
    score -= Math.abs(oddsDecimal - 1.9) * 10;
  }

  return score;
}

function trimWords(text, maxWords) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.split(/\s+/).slice(0, maxWords).join(' ');
}

function buildLegFromCandidate(candidate) {
  const why = candidate.market === 'h2h'
    ? 'Money Line mas limpio para Draftea.'
    : `Valor controlado en ${candidate.market}.`;

  return {
    candidateId: candidate.candidateId || '',
    game: candidate.game,
    pick: candidate.pick,
    market: candidate.market,
    odds: Number(candidate.oddsDecimal).toFixed(2),
    why: trimWords(why, 8),
    candidateType: candidate.candidateType,
    candidateTeam: candidate.candidateTeam || '',
    lineupRequired: candidate.lineupRequired === true,
    voidRisk: candidate.voidRisk,
    confidence: Math.max(1, Math.min(100, Math.round(getCandidateStrength(candidate, 'safe')))),
    ruleWarnings: candidate.ruleWarnings || [],
    teamResolved: candidate.teamResolved === true,
    oddsVerified: candidate.oddsVerified !== false,
  };
}

function markUnavailable(ticket, reason) {
  return {
    ...ticket,
    available: false,
    reason,
    legs: [],
    warnings: uniqueStrings(ticket.warnings || []),
  };
}

function validateTicketAgainstDrafteaRules(ticket, candidates = []) {
  const candidateIndex = buildCandidateIndex(candidates);
  const correctedTickets = Array.isArray(ticket?.tickets) ? ticket.tickets.map((item) => ({
    ...item,
  })) : [];

  const updatedTickets = correctedTickets.map((ticketItem) => {
    if (ticketItem?.available === false) {
      return {
        ...ticketItem,
        warnings: uniqueStrings(ticketItem.warnings || []),
      };
    }

    const warnings = new Set(Array.isArray(ticketItem?.warnings) ? ticketItem.warnings : []);
    const rawLegs = Array.isArray(ticketItem?.legs) ? ticketItem.legs : [];
    const resolvedLegs = rawLegs
      .map((leg) => {
        const candidate = findCandidateForLeg(leg, candidateIndex, candidates);
        return {
          leg,
          candidate,
        };
      })
      .filter((entry) => entry.candidate);

    if (resolvedLegs.some((entry) => entry.candidate.lineupRequired)) {
      warnings.add('Player props dependen de que el jugador sea titular.');
    }

    if (resolvedLegs.some((entry) => entry.candidate.market === 'spreads' || entry.candidate.market === 'totals')) {
      warnings.add('Spread/totales pueden anularse si el partido no se completa.');
    }

    const groupedPlayerProps = new Map();
    resolvedLegs.forEach((entry) => {
      if (entry.candidate.candidateType !== 'player_prop' || !entry.candidate.candidateTeam) {
        return;
      }

      const current = groupedPlayerProps.get(entry.candidate.candidateTeam) || [];
      current.push(entry);
      groupedPlayerProps.set(entry.candidate.candidateTeam, current);
    });

    const removedKeys = new Set();
    groupedPlayerProps.forEach((entries) => {
      if (entries.length <= 1) {
        return;
      }

      entries.sort((left, right) => (
        getCandidateStrength(right.candidate, ticketItem.type) - getCandidateStrength(left.candidate, ticketItem.type)
      ));

      entries.slice(1).forEach((entry) => {
        const removeKey = [
          normalizeKey(entry.candidate.game),
          normalizeKey(entry.candidate.pick),
          normalizeKey(entry.candidate.market),
        ].join('|');
        removedKeys.add(removeKey);
      });

      warnings.add('Este ticket evita props correlacionadas por reglas de Draftea.');
    });

    let filteredEntries = resolvedLegs.filter((entry) => {
      const key = [
        normalizeKey(entry.candidate.game),
        normalizeKey(entry.candidate.pick),
        normalizeKey(entry.candidate.market),
      ].join('|');
      return !removedKeys.has(key);
    });

    if (ticketItem.type === 'safe') {
      const removedUnsafeProps = filteredEntries.filter((entry) => (
        entry.candidate.candidateType === 'player_prop' && entry.candidate.safeEligible !== true
      ));

      if (removedUnsafeProps.length > 0) {
        warnings.add('Ticket Seguro prioriza Money Line y props con lineup confiable.');
      }

      filteredEntries = filteredEntries.filter((entry) => (
        entry.candidate.candidateType !== 'player_prop' || entry.candidate.safeEligible === true
      ));

      const hasMoneyLine = filteredEntries.some((entry) => entry.candidate.market === 'h2h');
      if (!hasMoneyLine) {
        const usedKeys = new Set(filteredEntries.map((entry) => [
          normalizeKey(entry.candidate.game),
          normalizeKey(entry.candidate.pick),
          normalizeKey(entry.candidate.market),
        ].join('|')));

        const replacement = candidates
          .filter((candidate) => candidate.market === 'h2h')
          .filter((candidate) => !usedKeys.has([
            normalizeKey(candidate.game),
            normalizeKey(candidate.pick),
            normalizeKey(candidate.market),
          ].join('|')))
          .sort((left, right) => getCandidateStrength(right, 'safe') - getCandidateStrength(left, 'safe'))[0];

        if (replacement) {
          filteredEntries = [
            {
              leg: buildLegFromCandidate(replacement),
              candidate: replacement,
            },
            ...filteredEntries,
          ].slice(0, 3);
          warnings.add('Ticket Seguro prioriza Money Line por reglas de Draftea.');
        }
      }
    }

    if (filteredEntries.length === 0) {
      return markUnavailable(ticketItem, 'Not enough Draftea-compliant picks available.');
    }

    const correctedLegs = filteredEntries.map((entry) => ({
      ...buildLegFromCandidate(entry.candidate),
      why: entry.leg?.why || entry.leg?.reason || buildLegFromCandidate(entry.candidate).why,
    }));

    return {
      ...ticketItem,
      available: true,
      legs: correctedLegs,
      warnings: Array.from(warnings),
    };
  });

  return {
    ...ticket,
    tickets: updatedTickets,
  };
}

module.exports = {
  applyDrafteaRules,
  detectCandidateTeam,
  findCandidateForLeg,
  getCandidateStrength,
  isPlayerPropCandidate,
  validateTicketAgainstDrafteaRules,
};
