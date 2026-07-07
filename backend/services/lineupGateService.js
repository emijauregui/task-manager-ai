const VERSION = 'v1';

const BATTER_PROP_MARKETS = new Set([
  'batter_hits',
  'batter_total_bases',
  'batter_hits_runs_rbis',
  'batter_rbis',
  'batter_runs_scored',
  'batter_home_runs',
]);

const TEAM_MARKETS = new Set([
  'h2h',
  'spreads',
  'totals',
]);

function uniqueStrings(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function namesMatch(left, right) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft.length < 5 || normalizedRight.length < 5) {
    return false;
  }

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getContextPlayers(lineupContext = {}, key, candidate = {}) {
  const eventId = String(candidate.eventId || '');
  const teamName = String(candidate.teamName || '');
  const byEvent = lineupContext?.[key]?.byEvent || {};
  const byTeam = lineupContext?.[key]?.byTeam || {};
  const global = lineupContext?.[key]?.all || [];

  return [
    ...asArray(lineupContext?.[key]),
    ...asArray(byEvent[eventId]),
    ...asArray(byTeam[teamName]),
    ...asArray(global),
  ].filter(Boolean);
}

function findMatchingPlayer(playerName, players = []) {
  return players.find((player) => {
    if (typeof player === 'string') {
      return namesMatch(playerName, player);
    }

    return namesMatch(playerName, player?.fullName)
      || namesMatch(playerName, player?.displayName)
      || namesMatch(playerName, player?.name)
      || namesMatch(playerName, player?.shortName);
  }) || null;
}

function getMatchedPlayerName(player) {
  if (!player) return '';
  if (typeof player === 'string') return player;
  return player.fullName || player.displayName || player.name || player.shortName || '';
}

function isBatterProp(candidate = {}) {
  return BATTER_PROP_MARKETS.has(candidate.marketKey)
    || (candidate.marketType === 'batter_prop' && Boolean(candidate.playerName));
}

function isPitcherProp(candidate = {}) {
  return candidate.marketKey === 'pitcher_strikeouts'
    || candidate.marketType === 'pitcher_prop';
}

function isTeamMarket(candidate = {}) {
  return TEAM_MARKETS.has(candidate.marketKey)
    || ['team_moneyline', 'team_spread', 'game_total'].includes(candidate.marketType);
}

function buildGate(status, overrides = {}) {
  const defaults = {
    lineup_confirmed: {
      riskLevel: 'low',
      reasons: ['lineup_confirmed'],
      warnings: [],
    },
    lineup_projected: {
      riskLevel: 'medium',
      reasons: ['projected_lineup_match'],
      warnings: ['lineup_not_confirmed'],
    },
    lineup_unknown: {
      riskLevel: 'high',
      reasons: ['lineup_required'],
      warnings: ['lineup_not_confirmed'],
    },
    player_not_starting: {
      riskLevel: 'blocked',
      reasons: ['confirmed_lineup_without_player'],
      warnings: ['player_not_starting'],
    },
    pitcher_confirmed: {
      riskLevel: 'low',
      reasons: ['pitcher_confirmed'],
      warnings: [],
    },
    pitcher_unknown: {
      riskLevel: 'medium',
      reasons: ['pitcher_confirmation_required'],
      warnings: ['pitcher_not_confirmed'],
    },
    not_applicable: {
      riskLevel: 'low',
      reasons: ['lineup_not_applicable'],
      warnings: [],
    },
  };
  const base = defaults[status] || defaults.lineup_unknown;

  return {
    version: VERSION,
    status,
    riskLevel: overrides.riskLevel || base.riskLevel,
    reasons: uniqueStrings([...(base.reasons || []), ...(overrides.reasons || [])]),
    warnings: uniqueStrings([...(base.warnings || []), ...(overrides.warnings || [])]),
    source: overrides.source || 'no_lineup_cache_available',
    matchedPlayer: overrides.matchedPlayer || '',
  };
}

function determineLineupStatus(candidate = {}, lineupContext = {}) {
  const playerName = candidate.playerName || candidate.selectionName || '';
  const source = lineupContext.source || 'no_lineup_cache_available';

  if (isTeamMarket(candidate) && !isBatterProp(candidate) && !isPitcherProp(candidate)) {
    return buildGate('not_applicable', {
      source: 'team_market',
    });
  }

  if (isBatterProp(candidate)) {
    const confirmedBatters = getContextPlayers(lineupContext, 'confirmedBatters', candidate);
    const projectedBatters = getContextPlayers(lineupContext, 'projectedBatters', candidate);

    if (!playerName) {
      return buildGate('lineup_unknown', {
        source,
        warnings: ['missing_player_name'],
      });
    }

    if (confirmedBatters.length) {
      const match = findMatchingPlayer(playerName, confirmedBatters);
      return match
        ? buildGate('lineup_confirmed', {
          source: lineupContext.source || 'confirmed_lineup_cache',
          matchedPlayer: getMatchedPlayerName(match),
        })
        : buildGate('player_not_starting', {
          source: lineupContext.source || 'confirmed_lineup_cache',
        });
    }

    if (projectedBatters.length) {
      const match = findMatchingPlayer(playerName, projectedBatters);
      if (match) {
        return buildGate('lineup_projected', {
          source: lineupContext.source || 'projected_lineup_cache',
          matchedPlayer: getMatchedPlayerName(match),
        });
      }
    }

    return buildGate('lineup_unknown', {
      source,
    });
  }

  if (isPitcherProp(candidate)) {
    const pitchers = [
      ...getContextPlayers(lineupContext, 'confirmedPitchers', candidate),
      ...getContextPlayers(lineupContext, 'probablePitchers', candidate),
      ...getContextPlayers(lineupContext, 'currentPitchers', candidate),
    ];

    if (!playerName) {
      return buildGate('pitcher_unknown', {
        source,
        warnings: ['missing_player_name'],
      });
    }

    if (pitchers.length) {
      const match = findMatchingPlayer(playerName, pitchers);
      if (match) {
        return buildGate('pitcher_confirmed', {
          source: lineupContext.source || 'pitcher_cache',
          matchedPlayer: getMatchedPlayerName(match),
        });
      }
    }

    return buildGate('pitcher_unknown', {
      source,
    });
  }

  return buildGate('not_applicable', {
    source: 'unsupported_or_team_market',
  });
}

function evaluateLineupForCandidate(candidate = {}, context = {}) {
  return determineLineupStatus(candidate, context?.lineupContext || context || {});
}

function getRiskTagForStatus(status) {
  if (status === 'not_applicable') return 'lineup_not_applicable';
  return status;
}

function withLineupGate(candidate = {}, context = {}) {
  const lineupGate = evaluateLineupForCandidate(candidate, context);
  const riskTags = uniqueStrings([
    ...(Array.isArray(candidate.riskTags) ? candidate.riskTags : []),
    getRiskTagForStatus(lineupGate.status),
    ...(lineupGate.status === 'lineup_unknown' || lineupGate.status === 'lineup_projected'
      ? ['lineup_required']
      : []),
  ]);

  return {
    ...candidate,
    lineupGate,
    riskTags,
  };
}

function evaluateLineupsForCandidates(candidates = [], context = {}) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => withLineupGate(candidate, context));
}

function increment(target, key, amount = 1) {
  const safeKey = key || 'unknown';
  target[safeKey] = (target[safeKey] || 0) + amount;
}

function buildLineupGateSummary(results = [], options = {}) {
  const sampleLimit = Math.max(0, Math.min(20, Number(options.sampleLimit ?? 20)));
  const byStatus = {};
  const byMarketType = {};
  const warnings = {};
  const safeResults = Array.isArray(results) ? results : [];

  safeResults.forEach((item) => {
    const gate = item.lineupGate || item;
    increment(byStatus, gate.status);
    increment(byMarketType, item.marketType || 'unknown');
    (gate.warnings || []).forEach((warning) => increment(warnings, warning));
  });

  return {
    version: VERSION,
    cacheOnly: true,
    totalEvaluated: safeResults.length,
    byStatus,
    byMarketType,
    warnings: Object.keys(warnings),
    warningCounts: warnings,
    samples: safeResults.slice(0, sampleLimit),
  };
}

module.exports = {
  VERSION,
  buildLineupGateSummary,
  determineLineupStatus,
  evaluateLineupForCandidate,
  evaluateLineupsForCandidates,
};
