const DEFAULT_TIME_ZONE = process.env.DAILY_TICKET_TIME_ZONE || 'America/Mazatlan';
const VERSION = 'v2';

const MODE_CUTOFF_MINUTES = {
  safe: 20,
  emi: 10,
  free_bet: 5,
};

const VALID_MODES = new Set(Object.keys(MODE_CUTOFF_MINUTES));

function normalizeMode(mode) {
  const normalized = String(mode || 'safe').trim().toLowerCase();
  return VALID_MODES.has(normalized) ? normalized : 'safe';
}

function getDateKeyInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function getCurrentServerTimeContext(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const reliableClock = !Number.isNaN(now.getTime());
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;

  return {
    now: reliableClock ? now.toISOString() : '',
    nowDateKey: reliableClock ? getDateKeyInTimeZone(now, timeZone) : '',
    timeZone,
    reliableClock,
  };
}

function normalizeStatusText(game = {}) {
  const statusParts = [
    game.status,
    game.espnStatus,
    game.statusType,
    game.statusDescription,
    game.statusText,
    game.state,
  ];

  if (game.rawStatus && typeof game.rawStatus === 'object') {
    statusParts.push(
      game.rawStatus.name,
      game.rawStatus.state,
      game.rawStatus.description,
      game.rawStatus.detail,
      game.rawStatus.shortDetail
    );
  }

  return statusParts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => String(part))
    .join(' ')
    .trim();
}

function includesAny(value, patterns = []) {
  const normalized = String(value || '').toLowerCase();
  return patterns.some((pattern) => pattern.test(normalized));
}

function detectStatusReasons(game = {}, statusText = normalizeStatusText(game)) {
  const reasons = [];
  const warnings = [];

  if (game.isLive === true || includesAny(statusText, [
    /in[_\s-]?progress/,
    /\blive\b/,
    /\btop\s+\d+/,
    /\bbottom\s+\d+/,
    /\bbot\s+\d+/,
    /\bmid\s+\d+/,
    /\bend\s+\d+/,
  ])) {
    reasons.push('game_live');
  }

  if (game.isFinal === true || includesAny(statusText, [
    /final/,
    /completed/,
    /status_final/,
  ])) {
    reasons.push('game_final');
  }

  if (game.isPostponed === true || includesAny(statusText, [
    /postponed/,
    /suspended/,
  ])) {
    reasons.push('game_postponed');
  }

  if (includesAny(statusText, [
    /cancelled/,
    /canceled/,
    /status_cancelled/,
    /status_canceled/,
  ])) {
    reasons.push('game_cancelled');
  }

  if (includesAny(statusText, [
    /rain/,
    /weather delay/,
    /rain delay/,
    /delayed severe/,
  ])) {
    reasons.push('rain_delay');
  } else if (includesAny(statusText, [
    /\bdelay\b/,
    /\bdelayed\b/,
  ])) {
    warnings.push('delay_status_present');
  }

  if (!statusText) {
    warnings.push('unknown_status');
  }

  return {
    reasons,
    warnings,
    statusText,
  };
}

function parseStartTime(startTime) {
  if (!startTime) {
    return null;
  }

  const parsed = new Date(startTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function uniqueStrings(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function getCutoffMinutes(mode, options = {}) {
  const normalizedMode = normalizeMode(mode);
  const configured = options.cutoffMinutes;
  const parsed = Number(configured);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(parsed);
  }

  return MODE_CUTOFF_MINUTES[normalizedMode];
}

function buildGameIdentity(game = {}) {
  return {
    gameId: game.gameId || game.id || game.eventId || '',
    game: game.game || [
      game.awayTeam,
      game.homeTeam,
    ].filter(Boolean).join(' vs '),
  };
}

function evaluateGameTiming(game = {}, options = {}) {
  const mode = normalizeMode(options.mode);
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const serverTime = options.serverTimeContext || getCurrentServerTimeContext({
    now: options.now,
    timeZone,
  });
  const cutoffMinutes = getCutoffMinutes(mode, options);
  const allowHighRiskTiming = options.allowHighRiskTiming === true;
  const startTimeValue = game.startTime || game.commenceTime || game.date || '';
  const startTime = parseStartTime(startTimeValue);
  const now = parseStartTime(serverTime.now);
  const minutesUntilStart = startTime && now
    ? Math.floor((startTime.getTime() - now.getTime()) / 60000)
    : null;
  const status = detectStatusReasons(game);
  const reasons = [...status.reasons];
  const warnings = [...status.warnings];
  const identity = buildGameIdentity(game);

  if (!serverTime.reliableClock || !now) {
    reasons.push('unreliable_clock');
  }

  if (!startTime) {
    if (mode === 'safe') {
      reasons.push('missing_start_time');
    } else {
      warnings.push('missing_start_time');
    }
  } else {
    if (minutesUntilStart <= 0) {
      reasons.push('game_started');
    } else if (minutesUntilStart <= cutoffMinutes) {
      if (mode === 'free_bet' && allowHighRiskTiming) {
        warnings.push('cutoff_expired');
      } else {
        reasons.push('cutoff_expired');
      }
    }
  }

  if (warnings.includes('unknown_status') && mode === 'safe') {
    warnings.push('status_unverified');
  }

  const blocked = reasons.length > 0;
  const riskLevel = blocked
    ? 'blocked'
    : warnings.length > 0
      ? mode === 'free_bet' ? 'high' : 'medium'
      : 'low';

  return {
    allowed: !blocked,
    version: VERSION,
    mode,
    gameId: identity.gameId,
    game: identity.game,
    startTime: startTime ? startTime.toISOString() : '',
    now: serverTime.now,
    timezone: timeZone,
    minutesUntilStart,
    cutoffMinutes,
    statusType: game.statusType || '',
    status: game.status || game.espnStatus || '',
    statusText: status.statusText,
    isLive: game.isLive === true,
    isFinal: game.isFinal === true,
    isScheduled: game.isScheduled === true,
    isPostponed: game.isPostponed === true,
    reasons: blocked ? uniqueStrings(reasons) : ['timing_ok'],
    warnings: uniqueStrings(warnings),
    riskLevel,
  };
}

function filterGamesByTiming(games = [], options = {}) {
  const serverTimeContext = options.serverTimeContext || getCurrentServerTimeContext({
    now: options.now,
    timeZone: options.timeZone || DEFAULT_TIME_ZONE,
  });

  return (Array.isArray(games) ? games : []).map((game) => evaluateGameTiming(game, {
    ...options,
    serverTimeContext,
  }));
}

function buildTimingGateSummary(results = [], options = {}) {
  const safeResults = Array.isArray(results) ? results : [];
  const mode = normalizeMode(options.mode);
  const cutoffMinutes = getCutoffMinutes(mode, options);
  const rejectedByTiming = safeResults
    .filter((result) => result.allowed !== true)
    .map((result) => ({
      gameId: result.gameId,
      game: result.game,
      startTime: result.startTime,
      now: result.now,
      minutesUntilStart: result.minutesUntilStart,
      statusType: result.statusType,
      status: result.status,
      reasons: result.reasons,
      warnings: result.warnings,
      riskLevel: result.riskLevel,
    }));

  return {
    version: VERSION,
    timezone: options.timeZone || DEFAULT_TIME_ZONE,
    now: options.now || safeResults[0]?.now || '',
    mode,
    cutoffMinutes,
    totalGamesEvaluated: safeResults.length,
    allowedGames: safeResults.filter((result) => result.allowed === true).length,
    blockedGames: rejectedByTiming.length,
    rejectedByTiming,
  };
}

module.exports = {
  VERSION,
  DEFAULT_TIME_ZONE,
  MODE_CUTOFF_MINUTES,
  buildTimingGateSummary,
  evaluateGameTiming,
  filterGamesByTiming,
  getCurrentServerTimeContext,
};
