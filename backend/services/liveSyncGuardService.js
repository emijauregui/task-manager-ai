const VERSION = 'v1';
const SOURCE = 'espn_mlb_statsapi';
const FRESHNESS_SECONDS = 60;

function parseFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeInningHalf(value) {
  const text = String(value || '').trim().toLowerCase();

  if (!text) return '';
  if (['top', 'tophalf', 'top half', 'top_inning'].includes(text) || /\btop\b/.test(text)) {
    return 'top';
  }

  if (['bottom', 'bot', 'bottomhalf', 'bottom half', 'bottom_inning'].includes(text) || /\b(bot|bottom)\b/.test(text)) {
    return 'bottom';
  }

  if (['middle', 'mid', 'mid_inning'].includes(text) || /\b(mid|middle)\b/.test(text)) {
    return 'mid';
  }

  if (['end', 'end_inning'].includes(text) || /\bend\b/.test(text)) {
    return 'end';
  }

  return text.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function detectStatsApiFreshness(fetchedAt) {
  const parsed = Date.parse(fetchedAt || '');

  if (!fetchedAt || !Number.isFinite(parsed)) {
    return {
      status: 'unknown',
      ageSeconds: null,
    };
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));

  return {
    status: ageSeconds <= FRESHNESS_SECONDS ? 'fresh' : 'stale',
    ageSeconds,
  };
}

function getEspnState(game = {}) {
  return {
    status: game.status || game.statusDescription || '',
    statusType: game.statusType || '',
    inning: parseFiniteNumber(game.inning),
    inningHalf: normalizeInningHalf(game.inningHalf),
    isLive: game.isLive === true,
    isFinal: game.isFinal === true,
    isPostponed: game.isPostponed === true,
  };
}

function getMlbState(game = {}) {
  const situation = game.situation || {};
  return {
    source: situation.source || '',
    gamePk: game.mlbGamePk || situation.gamePk || null,
    inning: parseFiniteNumber(situation.inning),
    inningHalf: normalizeInningHalf(situation.inningHalf),
    inningState: normalizeInningHalf(situation.inningState),
    fetchedAt: game.statsApiLiveFetchedAt || null,
    balls: parseFiniteNumber(game.balls ?? situation.balls),
    strikes: parseFiniteNumber(game.strikes ?? situation.strikes),
    outs: parseFiniteNumber(game.outs ?? situation.outs),
    bases: game.bases || situation.bases || null,
    runners: Array.isArray(game.runners) ? game.runners : Array.isArray(situation.runners) ? situation.runners : [],
    isLive: situation.source === 'mlb_statsapi_live',
  };
}

function compareLiveState(espnState = {}, mlbState = {}) {
  const reasons = [];
  const warnings = [];
  const hasMlbLive = mlbState.source === 'mlb_statsapi_live';
  const hasEspnStatus = Boolean(espnState.status || espnState.statusType);

  if (!hasEspnStatus) {
    warnings.push('missing_espn_status');
  }

  if (espnState.isLive && !hasMlbLive) {
    reasons.push('espn_live_but_no_mlb_live');
  }

  if (hasMlbLive && !espnState.isLive) {
    reasons.push('mlb_live_but_espn_not_live');
  }

  if (espnState.isFinal && hasMlbLive) {
    reasons.push('espn_final_but_mlb_live');
  }

  if (!hasMlbLive && (espnState.isLive || mlbState.gamePk)) {
    warnings.push('missing_statsapi_live');
  }

  if (hasMlbLive
    && espnState.inning !== null
    && mlbState.inning !== null
    && espnState.inning !== mlbState.inning) {
    reasons.push('inning_mismatch');
  }

  const mlbHalf = mlbState.inningHalf || mlbState.inningState;
  if (hasMlbLive
    && espnState.inningHalf
    && mlbHalf
    && espnState.inningHalf !== mlbHalf) {
    reasons.push('inning_half_mismatch');
  }

  if (!reasons.length && !warnings.length && (espnState.isLive || hasMlbLive)) {
    reasons.push('sync_ok');
  }

  return {
    reasons: uniqueStrings(reasons),
    warnings: uniqueStrings(warnings),
  };
}

function getLiveSyncStatus(reasons = [], warnings = []) {
  if (reasons.some((reason) => [
    'inning_mismatch',
    'inning_half_mismatch',
    'espn_final_but_mlb_live',
    'mlb_live_but_espn_not_live',
  ].includes(reason))) {
    return 'mismatch';
  }

  if (reasons.includes('espn_live_but_no_mlb_live') || warnings.includes('missing_statsapi_live')) {
    return 'unknown';
  }

  if (warnings.length || reasons.some((reason) => reason !== 'sync_ok')) {
    return 'warning';
  }

  return 'ok';
}

function getRiskLevel(status, reasons = [], warnings = []) {
  if (status === 'mismatch') {
    return 'high';
  }

  if (warnings.includes('stale_statsapi_live') || reasons.includes('espn_live_but_no_mlb_live')) {
    return 'medium';
  }

  if (status === 'unknown' || status === 'warning') {
    return 'medium';
  }

  return 'low';
}

function shouldEvaluateGame(game = {}) {
  return game.isLive === true
    || game.mlbGamePk
    || game.statsApiLiveFetchedAt
    || game.situation?.source === 'mlb_statsapi_live';
}

function evaluateLiveSync(game = {}) {
  const espn = getEspnState(game);
  const mlb = getMlbState(game);
  const freshness = detectStatsApiFreshness(mlb.fetchedAt);
  const comparison = compareLiveState(espn, mlb);
  const warnings = [...comparison.warnings];
  const reasons = [...comparison.reasons];

  if (mlb.source === 'mlb_statsapi_live' && freshness.status === 'stale') {
    warnings.push('stale_statsapi_live');
  }

  if (mlb.source === 'mlb_statsapi_live' && freshness.status === 'unknown') {
    warnings.push('missing_statsapi_live');
  }

  if (!mlb.source && espn.isLive) {
    warnings.push('missing_statsapi_live');
  }

  const status = getLiveSyncStatus(uniqueStrings(reasons), uniqueStrings(warnings));

  return {
    version: VERSION,
    source: SOURCE,
    status,
    riskLevel: getRiskLevel(status, reasons, warnings),
    reasons: uniqueStrings(reasons),
    warnings: uniqueStrings(warnings),
    espn: {
      status: espn.status,
      statusType: espn.statusType,
      inning: espn.inning,
      inningHalf: espn.inningHalf,
      isLive: espn.isLive,
      isFinal: espn.isFinal,
      isPostponed: espn.isPostponed,
    },
    mlb: {
      gamePk: mlb.gamePk,
      inning: mlb.inning,
      inningHalf: mlb.inningHalf,
      inningState: mlb.inningState,
      fetchedAt: mlb.fetchedAt,
      freshness,
      balls: mlb.balls,
      strikes: mlb.strikes,
      outs: mlb.outs,
      hasBases: Boolean(mlb.bases),
      runnersCount: mlb.runners.length,
    },
  };
}

function buildLiveSyncSummary(games = []) {
  const summary = {
    version: VERSION,
    evaluated: 0,
    ok: 0,
    warnings: 0,
    mismatches: 0,
    unknown: 0,
    staleStatsApi: 0,
    reasons: {},
  };

  (Array.isArray(games) ? games : []).forEach((game) => {
    if (!game?.liveSync) return;

    summary.evaluated += 1;
    if (game.liveSync.status === 'ok') summary.ok += 1;
    if (game.liveSync.status === 'warning') summary.warnings += 1;
    if (game.liveSync.status === 'mismatch') summary.mismatches += 1;
    if (game.liveSync.status === 'unknown') summary.unknown += 1;
    if (game.liveSync.warnings?.includes('stale_statsapi_live')) summary.staleStatsApi += 1;

    [...(game.liveSync.reasons || []), ...(game.liveSync.warnings || [])].forEach((reason) => {
      summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
    });
  });

  return summary;
}

function applyLiveSyncGuard(games = []) {
  return (Array.isArray(games) ? games : []).map((game) => {
    if (!shouldEvaluateGame(game)) {
      return game;
    }

    return {
      ...game,
      liveSync: evaluateLiveSync(game),
    };
  });
}

module.exports = {
  VERSION,
  applyLiveSyncGuard,
  buildLiveSyncSummary,
  compareLiveState,
  evaluateLiveSync,
  normalizeInningHalf,
};
