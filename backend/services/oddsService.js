const { listCacheFiles, readCache, writeCache } = require('../utils/cache');
const mlbStatsService = require('./mlbStatsService');

const ODDS_BASE_URL = 'https://api.the-odds-api.com/v4';
const DEFAULT_CACHE_MINUTES = Number(process.env.ODDS_CACHE_MINUTES || 30);
const EVENT_PROPS_CACHE_MINUTES = Number(process.env.ODDS_EVENT_PROPS_CACHE_MINUTES || 15);
const TARGET_TIME_ZONE = process.env.DAILY_TICKET_TIME_ZONE || 'America/Mazatlan';
const CORE_MARKETS = ['h2h', 'spreads', 'totals'];
const EXTRA_PLAYER_PROP_MARKETS = [
  'batter_hits',
  'batter_total_bases',
  'batter_runs_scored',
  'batter_rbis',
  'batter_hits_runs_rbis',
  'pitcher_strikeouts',
];
const EVENT_PLAYER_PROP_MARKETS = [
  'batter_hits',
  'batter_total_bases',
  'batter_runs_scored',
  'batter_rbis',
  'batter_hits_runs_rbis',
  'pitcher_strikeouts',
  'batter_home_runs',
];
const SUPPORTED_MARKETS = new Set([...CORE_MARKETS, ...EXTRA_PLAYER_PROP_MARKETS]);

class OddsApiError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'OddsApiError';
    this.code = code;
    this.provider = 'the_odds_api';
    this.httpStatus = options.httpStatus || 500;
    this.quotaReached = options.quotaReached === true;
    this.liveDisabled = options.liveDisabled === true;
    this.pathname = options.pathname || '';
  }
}

const guardState = {
  liveCallsBlocked: 0,
  liveCallsAllowed: 0,
  cacheHits: 0,
  cacheMisses: 0,
  lastBlockedReason: null,
  lastLiveCallAt: null,
  lastCacheHitAt: null,
};

function isConfigured() {
  return Boolean(process.env.ODDS_API_KEY);
}

function isLiveEnabled() {
  return String(process.env.ODDS_API_LIVE_ENABLED ?? '').trim().toLowerCase() === 'true';
}

function getOddsRuntimeMode() {
  return isLiveEnabled() ? 'live_enabled' : 'cache_only';
}

function getGuardStatus() {
  return {
    oddsLiveEnabled: isLiveEnabled(),
    runtimeMode: getOddsRuntimeMode(),
    hasOddsApiKey: isConfigured(),
    liveCallsBlocked: guardState.liveCallsBlocked,
    liveCallsAllowed: guardState.liveCallsAllowed,
    cacheHits: guardState.cacheHits,
    cacheMisses: guardState.cacheMisses,
    lastBlockedReason: guardState.lastBlockedReason,
    lastLiveCallAt: guardState.lastLiveCallAt,
    lastCacheHitAt: guardState.lastCacheHitAt,
  };
}

function logOddsEvent(event, payload = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
  console.log(`[odds-service] ${event}`, cleaned);
}

function recordLiveCallAllowed(pathname, metadata = {}) {
  guardState.liveCallsAllowed += 1;
  guardState.lastLiveCallAt = new Date().toISOString();
  logOddsEvent('LIVE_CALL_ALLOWED', {
    pathname,
    runtimeMode: getOddsRuntimeMode(),
    ...metadata,
  });
}

function recordLiveCallBlocked(pathname, reason, metadata = {}) {
  guardState.liveCallsBlocked += 1;
  guardState.lastBlockedReason = reason;
  logOddsEvent('LIVE_CALL_BLOCKED_BY_ENV', {
    pathname,
    runtimeMode: getOddsRuntimeMode(),
    reason,
    ...metadata,
  });
}

function recordCacheHit(filename, source = 'cache', metadata = {}) {
  guardState.cacheHits += 1;
  guardState.lastCacheHitAt = new Date().toISOString();
  if (source === 'stale_cache') {
    logOddsEvent('STALE_CACHE_USED', {
      filename,
      source,
      ...metadata,
    });
    return;
  }

  logOddsEvent('USING_CACHE', {
    filename,
    source,
    ...metadata,
  });
}

function recordCacheMiss(filename, metadata = {}) {
  guardState.cacheMisses += 1;
  if (!isLiveEnabled()) {
    logOddsEvent('CACHE_MISSING_LIVE_DISABLED', {
      filename,
      runtimeMode: getOddsRuntimeMode(),
      ...metadata,
    });
    return;
  }

  logOddsEvent('CACHE_MISSING', {
    filename,
    runtimeMode: getOddsRuntimeMode(),
    ...metadata,
  });
}

function assertOddsLiveAllowed(pathname, metadata = {}) {
  if (!isLiveEnabled()) {
    const reason = 'ODDS_API_LIVE_ENABLED is not explicitly true.';
    recordLiveCallBlocked(pathname, reason, metadata);
    throw new OddsApiError(
      'ODDS_API_LIVE_DISABLED',
      'The Odds API live esta desactivada; no se hizo fallback live.',
      {
        httpStatus: 503,
        liveDisabled: true,
        pathname,
      }
    );
  }

  recordLiveCallAllowed(pathname, metadata);
}

function isQuotaError(error) {
  return error?.code === 'ODDS_API_QUOTA_REACHED' || error?.quotaReached === true;
}

function isLiveDisabledError(error) {
  return error?.code === 'ODDS_API_LIVE_DISABLED' || error?.liveDisabled === true;
}

function shouldFallbackToCacheOnError(error) {
  return isQuotaError(error) || isLiveDisabledError(error);
}

function isQuotaMessage(message) {
  return /usage quota has been reached/i.test(String(message || ''));
}

function buildUrl(pathname, params = {}) {
  const url = new URL(`${ODDS_BASE_URL}${pathname}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url;
}

async function fetchOddsJson(pathname, params = {}) {
  if (!isConfigured()) {
    throw new OddsApiError('ODDS_API_NOT_CONFIGURED', 'ODDS_API_KEY is not configured.', {
      httpStatus: 503,
      pathname,
    });
  }

  assertOddsLiveAllowed(pathname, {
    regions: params.regions || null,
    markets: params.markets || null,
  });

  const url = buildUrl(pathname, {
    ...params,
    apiKey: process.env.ODDS_API_KEY,
  });

  logOddsEvent('REQUESTING_LIVE_API', {
    pathname,
    regions: params.regions || null,
    markets: params.markets || null,
  });

  const response = await fetch(url);
  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = rawText;
  }

  if (!response.ok) {
    const errorMessage = typeof payload === 'string'
      ? payload
      : payload?.message || `The Odds API request failed with status ${response.status}.`;

    if (response.status === 429 || isQuotaMessage(errorMessage)) {
      throw new OddsApiError('ODDS_API_QUOTA_REACHED', errorMessage, {
        httpStatus: response.status || 429,
        quotaReached: true,
        pathname,
      });
    }

    throw new OddsApiError('ODDS_API_REQUEST_FAILED', errorMessage, {
      httpStatus: response.status,
      pathname,
    });
  }

  return {
    data: payload,
    headers: {
      requestsRemaining: response.headers.get('x-requests-remaining'),
      requestsUsed: response.headers.get('x-requests-used'),
      requestsLast: response.headers.get('x-requests-last'),
    },
  };
}

function formatPoint(point) {
  if (point === undefined || point === null || Number.isNaN(Number(point))) {
    return '';
  }

  const numeric = Number(point);
  return numeric > 0 ? `+${numeric}` : `${numeric}`;
}

function getPropCountLabel(point) {
  const numeric = Number(point);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  if (Number.isInteger(numeric)) {
    return `${numeric}+`;
  }

  return `${Math.floor(numeric) + 1}+`;
}

function getPropLabel(marketKey) {
  switch (marketKey) {
    case 'batter_hits':
      return 'hits';
    case 'batter_total_bases':
      return 'total bases';
    case 'batter_runs_scored':
      return 'runs';
    case 'batter_rbis':
      return 'RBIs';
    case 'batter_hits_runs_rbis':
      return 'H+R+RBI';
    case 'pitcher_strikeouts':
      return 'strikeouts';
    case 'batter_home_runs':
      return 'home runs';
    default:
      return 'prop';
  }
}

function buildPlayerPropPick(marketKey, outcome) {
  const playerName = outcome?.description || outcome?.participant || outcome?.player || '';
  if (!playerName) {
    return '';
  }

  const outcomeName = String(outcome?.name || '').trim();
  const threshold = getPropCountLabel(outcome?.point);
  const propLabel = getPropLabel(marketKey);

  if (/^(over|yes)$/i.test(outcomeName)) {
    return `${playerName} ${threshold} ${propLabel}`.trim();
  }

  if (/^(under|no)$/i.test(outcomeName)) {
    return `${playerName} under ${outcome?.point} ${propLabel}`.trim();
  }

  return `${playerName} ${outcomeName}`.trim();
}

function normalizeOutcome(event, bookmaker, market, outcome) {
  const oddsDecimal = Number(outcome?.price);

  if (!Number.isFinite(oddsDecimal) || oddsDecimal <= 1) {
    return null;
  }

  let pick = outcome.name || '';
  const playerName = outcome?.description || outcome?.participant || outcome?.player || '';
  const playerTeam = outcome?.participant || outcome?.team || outcome?.team_name || '';

  if (market.key === 'h2h') {
    pick = `${outcome.name} ML`;
  } else if (market.key === 'spreads') {
    pick = `${outcome.name} ${formatPoint(outcome.point)}`.trim();
  } else if (market.key === 'totals') {
    pick = `${outcome.name} ${formatPoint(outcome.point)}`.trim();
  } else {
    pick = buildPlayerPropPick(market.key, outcome);
  }

  if (!pick) {
    return null;
  }

  return {
    sport: 'MLB',
    league: 'MLB',
    game: `${event.away_team} vs ${event.home_team}`,
    eventId: event.id,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    startTime: event.commence_time,
    market: market.key,
    pick,
    oddsDecimal,
    point: outcome?.point,
    playerName,
    playerTeam,
    bookmaker: bookmaker.title || bookmaker.key || 'Unknown',
    lastUpdate: market.last_update || bookmaker.last_update || event.last_update || null,
  };
}

function normalizeOddsGames(events = []) {
  const bestCandidates = new Map();

  events.forEach((event) => {
    const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];

    bookmakers.forEach((bookmaker) => {
      const markets = Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

      markets.forEach((market) => {
        if (!SUPPORTED_MARKETS.has(market.key)) {
          return;
        }

        const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
        outcomes.forEach((outcome) => {
          const normalized = normalizeOutcome(event, bookmaker, market, outcome);
          if (!normalized) {
            return;
          }

          const dedupeKey = [
            normalized.game,
            normalized.market,
            normalized.pick,
          ].join('|');

          const current = bestCandidates.get(dedupeKey);
          if (!current || normalized.oddsDecimal > current.oddsDecimal) {
            bestCandidates.set(dedupeKey, normalized);
          }
        });
      });
    });
  });

  return Array.from(bestCandidates.values()).sort((left, right) => {
    if (left.game !== right.game) {
      return left.game.localeCompare(right.game);
    }

    const marketOrder = {
      h2h: 0,
      spreads: 1,
      totals: 2,
      batter_hits: 3,
      batter_total_bases: 4,
      batter_runs_scored: 5,
      batter_rbis: 6,
      batter_hits_runs_rbis: 7,
      pitcher_strikeouts: 8,
    };
    const leftOrder = marketOrder[left.market] ?? 99;
    const rightOrder = marketOrder[right.market] ?? 99;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return right.oddsDecimal - left.oddsDecimal;
  });
}

function normalizeSampleGame(game) {
  if (!game) {
    return null;
  }

  return {
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    startTime: game.commence_time,
    bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers.length : 0,
  };
}

function normalizeEventSummary(event) {
  if (!event) {
    return null;
  }

  return {
    eventId: event.id || '',
    homeTeam: event.home_team || '',
    awayTeam: event.away_team || '',
    commenceTime: event.commence_time || '',
    game: event.home_team && event.away_team ? `${event.away_team} vs ${event.home_team}` : '',
  };
}

function getDateKeyInTimeZone(date = new Date(), timeZone = TARGET_TIME_ZONE) {
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

function matchesTargetDate(startTime, targetDate, timeZone = TARGET_TIME_ZONE) {
  if (!targetDate) {
    return true;
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return false;
  }

  return getDateKeyInTimeZone(start, timeZone) === targetDate;
}

function getMarketCategory(marketKey) {
  switch (marketKey) {
    case 'batter_hits':
      return 'player_hit';
    case 'batter_total_bases':
      return 'player_total_bases';
    case 'batter_runs_scored':
      return 'player_runs';
    case 'batter_rbis':
      return 'player_rbi';
    case 'batter_hits_runs_rbis':
      return 'player_hrr';
    case 'pitcher_strikeouts':
      return 'pitcher_strikeouts';
    case 'batter_home_runs':
      return 'other_player_prop';
    default:
      return 'other_player_prop';
  }
}

function buildPropLineValue(point) {
  if (point === undefined || point === null || Number.isNaN(Number(point))) {
    return '';
  }

  return `${Number(point)}`;
}

function buildEventPropPick(marketKey, outcome) {
  const playerName = outcome?.description || outcome?.participant || outcome?.player || '';
  const side = String(outcome?.name || '').trim();
  const line = buildPropLineValue(outcome?.point);
  const label = getPropLabel(marketKey);

  if (!playerName || !side) {
    return '';
  }

  return `${playerName} ${side} ${line} ${label}`.trim();
}

function extractMarketsFromPayload(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((item) => extractMarketsFromPayload(item));
  }

  if (Array.isArray(payload.markets)) {
    return payload.markets.filter(Boolean);
  }

  if (Array.isArray(payload.bookmakers)) {
    return payload.bookmakers.flatMap((bookmaker) => (
      Array.isArray(bookmaker.markets) ? bookmaker.markets.filter(Boolean) : []
    ));
  }

  return [];
}

function getAvailableMarketKeys(payload) {
  return Array.from(new Set(
    extractMarketsFromPayload(payload)
      .map((market) => market?.key)
      .filter(Boolean)
  ));
}

function normalizeEventPropOutcome(event, market, outcome) {
  const oddsDecimal = Number(outcome?.price);
  const playerName = outcome?.description || outcome?.participant || outcome?.player || '';
  const side = String(outcome?.name || '').trim();
  const line = buildPropLineValue(outcome?.point);
  const pick = buildEventPropPick(market.key, outcome);

  if (!playerName || !pick || !Number.isFinite(oddsDecimal) || oddsDecimal <= 1) {
    return null;
  }

  return {
    source: 'the_odds_api_event_props',
    sport: 'baseball_mlb',
    game: `${event.away_team} vs ${event.home_team}`,
    homeTeam: event.home_team || '',
    awayTeam: event.away_team || '',
    team: outcome?.team || outcome?.team_name || null,
    playerTeam: outcome?.team || outcome?.team_name || null,
    playerName,
    market: market.key,
    marketCategory: getMarketCategory(market.key),
    line,
    side,
    pick,
    oddsDecimal,
    eventId: event.id || '',
    commenceTime: event.commence_time || '',
    startTime: event.commence_time || '',
    oddsVerified: true,
    eligibleForTicket: false,
    teamResolved: false,
    lineupRequired: true,
    lineupConfidence: 'unknown',
  };
}

function normalizeEventPropMarkets(event, payload) {
  const markets = extractMarketsFromPayload(payload)
    .filter((market) => EVENT_PLAYER_PROP_MARKETS.includes(market?.key));
  const bestCandidates = new Map();

  markets.forEach((market) => {
    const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
    outcomes.forEach((outcome) => {
      const normalized = normalizeEventPropOutcome(event, market, outcome);
      if (!normalized) {
        return;
      }

      const dedupeKey = [
        normalized.eventId,
        normalized.market,
        normalized.playerName,
        normalized.side,
        normalized.line,
      ].join('|');

      const current = bestCandidates.get(dedupeKey);
      if (!current || normalized.oddsDecimal > current.oddsDecimal) {
        bestCandidates.set(dedupeKey, normalized);
      }
    });
  });

  return Array.from(bestCandidates.values());
}

function buildRejectedReasonCounts(props = []) {
  return props.reduce((accumulator, prop) => {
    const reason = prop.warning || 'Unknown rejection reason.';
    accumulator[reason] = (accumulator[reason] || 0) + 1;
    return accumulator;
  }, {});
}

async function readOrFetchCachedOdds(filename, fetcher, maxAgeMinutes, forceRefresh = false, options = {}) {
  const {
    cacheOnly = false,
    pathname = filename,
  } = options;

  if (cacheOnly) {
    const cached = await readCache(filename, {
      maxAgeMinutes,
      allowStale: true,
    });

    if (cached.exists && cached.data) {
      recordCacheHit(filename, cached.expired ? 'stale_cache' : 'cache', {
        pathname,
      });
      return {
        ...cached.data,
        source: cached.expired ? 'stale_cache' : 'cache',
        quotaReached: false,
      };
    }

    recordCacheMiss(filename, {
      pathname,
      cacheOnly: true,
    });
    if (!isLiveEnabled()) {
      recordLiveCallBlocked(pathname, 'ODDS_API_LIVE_ENABLED is not explicitly true.', {
        filename,
        cacheOnly: true,
      });
      throw new OddsApiError(
        'ODDS_API_LIVE_DISABLED',
        'The Odds API live esta desactivada; no se hizo fallback live.',
        {
          httpStatus: 503,
          liveDisabled: true,
          pathname,
        }
      );
    }
    throw new OddsApiError(
      'ODDS_API_CACHE_UNAVAILABLE',
      `No cached The Odds API payload is available for ${filename}.`,
      {
        httpStatus: 503,
        pathname: filename,
      }
    );
  }

  if (!forceRefresh) {
    const cached = await readCache(filename, {
      maxAgeMinutes,
      allowStale: false,
    });

    if (cached.hit && cached.data) {
      recordCacheHit(filename, 'cache', {
        pathname,
      });
      return {
        ...cached.data,
        source: 'cache',
      };
    }
  }

  if (!isLiveEnabled()) {
    const cached = await readCache(filename, {
      maxAgeMinutes,
      allowStale: true,
    });

    if (cached.exists && cached.data) {
      recordCacheHit(filename, cached.expired ? 'stale_cache' : 'cache', {
        pathname,
        forcedLiveBypassed: forceRefresh === true,
      });
      return {
        ...cached.data,
        source: cached.expired ? 'stale_cache' : 'cache',
        quotaReached: false,
        warning: 'The Odds API live esta desactivada; se uso cache local existente.',
      };
    }

    recordCacheMiss(filename, {
      pathname,
      forceRefresh,
    });
    recordLiveCallBlocked(pathname, 'ODDS_API_LIVE_ENABLED is not explicitly true.', {
      filename,
      forceRefresh,
    });
    throw new OddsApiError(
      'ODDS_API_LIVE_DISABLED',
      'The Odds API live esta desactivada; no se hizo fallback live.',
      {
        httpStatus: 503,
        liveDisabled: true,
        pathname,
      }
    );
  }

  try {
    const payload = await fetcher();
    await writeCache(filename, payload);
    return {
      ...payload,
      source: 'live',
      quotaReached: false,
    };
  } catch (error) {
    if (!shouldFallbackToCacheOnError(error)) {
      throw error;
    }

    const staleCache = await readCache(filename, {
      maxAgeMinutes,
      allowStale: true,
    });

    if (staleCache.exists && staleCache.data) {
      recordCacheHit(filename, staleCache.expired ? 'stale_cache' : 'cache', {
        pathname,
        fallbackFrom: error.code || error.name || 'unknown_error',
      });
      return {
        ...staleCache.data,
        source: staleCache.expired ? 'stale_cache' : 'cache',
        quotaReached: isQuotaError(error),
        warning: isQuotaError(error)
          ? 'The Odds API quota has been reached. Showing cached data if available.'
          : 'Live The Odds API is disabled. Showing cached data if available.',
      };
    }

    recordCacheMiss(filename, {
      pathname,
      fallbackFrom: error.code || error.name || 'unknown_error',
    });
    throw error;
  }
}

async function getHealth() {
  if (!isConfigured()) {
    return {
      configured: false,
      mlbAvailable: false,
      sportsCount: 0,
      sampleSports: [],
      message: 'ODDS_API_KEY is not configured.',
    };
  }

  if (!isLiveEnabled()) {
    return {
      configured: true,
      mlbAvailable: false,
      sportsCount: 0,
      sampleSports: [],
      runtimeMode: getOddsRuntimeMode(),
      oddsSource: 'cache_only',
      message: 'The Odds API live esta desactivada; no se ejecuto health probe live.',
    };
  }

  const { data } = await fetchOddsJson('/sports/');
  const sports = Array.isArray(data) ? data : [];
  const mlb = sports.find((sport) => sport.key === 'baseball_mlb');

  return {
    configured: true,
    mlbAvailable: Boolean(mlb && mlb.active !== false),
    sportsCount: sports.length,
    sampleSports: sports.slice(0, 5).map((sport) => ({
      key: sport.key,
      title: sport.title,
      active: sport.active,
    })),
    message: mlb
      ? 'The Odds API is configured and baseball_mlb is available.'
      : 'The Odds API responded, but baseball_mlb was not found in the sports list.',
  };
}

async function testMlbH2h() {
  if (!isConfigured()) {
    return {
      success: false,
      gamesFound: 0,
      sampleGame: null,
      message: 'ODDS_API_KEY is not configured.',
    };
  }

  try {
    const payload = await getMlbOdds({
      markets: 'h2h',
      forceRefresh: false,
      useCache: true,
      cacheOnly: !isLiveEnabled(),
    });
    const games = Array.isArray(payload.games) ? payload.games : [];

    return {
      success: true,
      gamesFound: games.length,
      sampleGame: normalizeSampleGame(games[0]),
      oddsSource: payload.source || 'cache',
      runtimeMode: getOddsRuntimeMode(),
      message: games.length > 0
        ? 'MLB odds retrieved successfully.'
        : 'No MLB odds found right now, but API key and sport are valid.',
    };
  } catch (error) {
    if (isLiveDisabledError(error)) {
      return {
        success: false,
        gamesFound: 0,
        sampleGame: null,
        oddsSource: 'cache_missing',
        runtimeMode: getOddsRuntimeMode(),
        message: 'The Odds API live esta desactivada; no se hizo fallback live.',
      };
    }

    throw error;
  }
}

async function getMlbEventsByDate(targetDate = getDateKeyInTimeZone(new Date()), options = {}) {
  const {
    forceRefresh = false,
    useCache = true,
    cacheOnly = false,
    timeZone = TARGET_TIME_ZONE,
  } = options;

  const cacheFilename = `odds-events-mlb-${targetDate}.json`;

  const load = async () => {
    const { data, headers } = await fetchOddsJson('/sports/baseball_mlb/events', {
      dateFormat: 'iso',
    });
    const events = Array.isArray(data)
      ? data.filter((event) => matchesTargetDate(event?.commence_time, targetDate, timeZone))
      : [];

    return {
      fetchedAt: new Date().toISOString(),
      sport: 'baseball_mlb',
      targetDate,
      events,
      requestMeta: headers,
    };
  };

  if (!useCache) {
    if (isLiveEnabled()) {
      return load();
    }
  }

  return readOrFetchCachedOdds(cacheFilename, load, EVENT_PROPS_CACHE_MINUTES, forceRefresh, {
    cacheOnly,
    pathname: '/sports/baseball_mlb/events',
  });
}

async function getMlbEventMarkets(eventId, options = {}) {
  const {
    forceRefresh = false,
    useCache = true,
    cacheOnly = false,
    regions = 'us',
  } = options;

  const cacheFilename = `odds-event-markets-${eventId}.json`;
  const load = async () => {
    const { data, headers } = await fetchOddsJson(`/sports/baseball_mlb/events/${eventId}/markets`, {
      regions,
    });
    return {
      fetchedAt: new Date().toISOString(),
      eventId,
      regions,
      payload: data,
      availableMarkets: getAvailableMarketKeys(data),
      requestMeta: headers,
    };
  };

  if (!useCache) {
    if (isLiveEnabled()) {
      return load();
    }
  }

  return readOrFetchCachedOdds(cacheFilename, load, EVENT_PROPS_CACHE_MINUTES, forceRefresh, {
    cacheOnly,
    pathname: `/sports/baseball_mlb/events/${eventId}/markets`,
  });
}

async function getMlbEventPropsOdds(eventId, markets, options = {}) {
  const {
    forceRefresh = false,
    useCache = true,
    cacheOnly = false,
    regions = 'us',
  } = options;
  const normalizedMarkets = Array.from(new Set((Array.isArray(markets) ? markets : [])
    .map((market) => String(market || '').trim())
    .filter(Boolean)));
  const cacheFilename = `odds-event-props-${eventId}.json`;
  const pathname = `/sports/baseball_mlb/events/${eventId}/odds`;

  const load = async () => {
    const { data, headers } = await fetchOddsJson(pathname, {
      regions,
      markets: normalizedMarkets.join(','),
      oddsFormat: 'decimal',
      dateFormat: 'iso',
    });
    return {
      fetchedAt: new Date().toISOString(),
      eventId,
      regions,
      requestedMarkets: normalizedMarkets,
      payload: data,
      returnedMarkets: getAvailableMarketKeys(data).filter((market) => normalizedMarkets.includes(market)),
      requestMeta: headers,
    };
  };

  if (useCache && !forceRefresh) {
    const cached = await readCache(cacheFilename, {
      maxAgeMinutes: EVENT_PROPS_CACHE_MINUTES,
      allowStale: cacheOnly,
    });

    const cachedMarkets = Array.isArray(cached.data?.requestedMarkets) ? cached.data.requestedMarkets : [];
    const cacheCoversRequest = normalizedMarkets.every((market) => cachedMarkets.includes(market));
    if (cached.hit && cached.data && cacheCoversRequest) {
      recordCacheHit(cacheFilename, cached.expired ? 'stale_cache' : 'cache', {
        pathname,
      });
      return {
        ...cached.data,
        source: cached.expired ? 'stale_cache' : 'cache',
      };
    }

    if (cacheOnly) {
      recordCacheMiss(cacheFilename, {
        pathname,
        cacheOnly: true,
      });
      if (!isLiveEnabled()) {
        recordLiveCallBlocked(pathname, 'ODDS_API_LIVE_ENABLED is not explicitly true.', {
          filename: cacheFilename,
          cacheOnly: true,
        });
        throw new OddsApiError(
          'ODDS_API_LIVE_DISABLED',
          'The Odds API live esta desactivada; no se hizo fallback live.',
          {
            httpStatus: 503,
            liveDisabled: true,
            pathname,
          }
        );
      }
      throw new OddsApiError(
        'ODDS_API_CACHE_UNAVAILABLE',
        `No cached event props odds payload is available for event ${eventId}.`,
        {
          httpStatus: 503,
          pathname,
        }
      );
    }
  }

  if (!isLiveEnabled()) {
    const cached = await readCache(cacheFilename, {
      maxAgeMinutes: EVENT_PROPS_CACHE_MINUTES,
      allowStale: true,
    });
    const cachedMarkets = Array.isArray(cached.data?.requestedMarkets) ? cached.data.requestedMarkets : [];
    const cacheCoversRequest = normalizedMarkets.every((market) => cachedMarkets.includes(market));

    if (cached.exists && cached.data && cacheCoversRequest) {
      recordCacheHit(cacheFilename, cached.expired ? 'stale_cache' : 'cache', {
        pathname,
        forcedLiveBypassed: forceRefresh === true,
      });
      return {
        ...cached.data,
        source: cached.expired ? 'stale_cache' : 'cache',
      };
    }

    recordCacheMiss(cacheFilename, {
      pathname,
      forceRefresh,
    });
    recordLiveCallBlocked(pathname, 'ODDS_API_LIVE_ENABLED is not explicitly true.', {
      filename: cacheFilename,
      forceRefresh,
    });
    throw new OddsApiError(
      'ODDS_API_LIVE_DISABLED',
      'The Odds API live esta desactivada; no se hizo fallback live.',
      {
        httpStatus: 503,
        liveDisabled: true,
        pathname,
      }
    );
  }

  const payload = await load();
  if (useCache) {
    await writeCache(cacheFilename, payload);
  }
  return {
    ...payload,
    source: 'live',
  };
}

async function getMlbPropsByDateViaEvents(targetDate = getDateKeyInTimeZone(new Date()), options = {}) {
  const {
    forceRefresh = false,
    useCache = true,
    cacheOnly = false,
    limitEvents = 3,
    requestedMarkets = EVENT_PLAYER_PROP_MARKETS,
    regions = 'us',
  } = options;

  let eventsPayload;
  try {
    eventsPayload = await getMlbEventsByDate(targetDate, {
      forceRefresh,
      useCache,
      cacheOnly,
    });
  } catch (error) {
    if (!shouldFallbackToCacheOnError(error)) {
      throw error;
    }

    return {
      configured: true,
      sport: 'baseball_mlb',
      method: 'event_level_markets',
      targetDate,
      eventsFound: 0,
      eventsChecked: 0,
      propsAvailable: false,
      propsFeedAvailable: false,
      requestedMarkets,
      returnedMarkets: [],
      marketsByEvent: [],
      props: [],
      allProps: [],
      eligibleProps: [],
      rejectedProps: [],
      rejectedReasons: {},
      sampleProps: [],
      sampleEligibleProps: [],
      sampleRejectedProps: [],
      warning: isQuotaError(error)
        ? 'The Odds API quota has been reached. Showing cached data if available.'
        : 'The Odds API live esta desactivada; no se hizo fallback live.',
      quotaReached: isQuotaError(error),
      source: isLiveDisabledError(error) ? 'cache_missing' : 'unavailable',
      propsAvailabilityStatus: isLiveDisabledError(error) ? 'blocked_by_env' : 'unavailable',
    };
  }
  const events = Array.isArray(eventsPayload.events) ? eventsPayload.events.slice(0, limitEvents) : [];
  const marketsByEvent = [];
  const returnedMarkets = new Set();
  const allProps = [];
  let eventsChecked = 0;

  for (const event of events) {
    eventsChecked += 1;
    let eventMarkets;

    try {
      eventMarkets = await getMlbEventMarkets(event.id, {
        forceRefresh,
        useCache,
        cacheOnly,
        regions,
      });
    } catch (error) {
      marketsByEvent.push({
        eventId: event.id || '',
        game: `${event.away_team} vs ${event.home_team}`,
        commenceTime: event.commence_time || '',
        availableMarkets: [],
        propMarketsFound: [],
        warning: error.message,
      });
      continue;
    }

    const availableMarkets = Array.isArray(eventMarkets.availableMarkets) ? eventMarkets.availableMarkets : [];
    const propMarketsFound = availableMarkets.filter((market) => requestedMarkets.includes(market));

    marketsByEvent.push({
      eventId: event.id || '',
      game: `${event.away_team} vs ${event.home_team}`,
      commenceTime: event.commence_time || '',
      availableMarkets,
      propMarketsFound,
    });

    if (!propMarketsFound.length) {
      continue;
    }

    let eventProps;
    try {
      eventProps = await getMlbEventPropsOdds(event.id, propMarketsFound, {
        forceRefresh,
        useCache,
        cacheOnly,
        regions,
      });
    } catch (error) {
      const current = marketsByEvent[marketsByEvent.length - 1];
      current.warning = error.message;
      continue;
    }

    eventProps.returnedMarkets.forEach((market) => returnedMarkets.add(market));
    const normalizedProps = normalizeEventPropMarkets(event, eventProps.payload);
    let mlbStatsContext = null;

    try {
      mlbStatsContext = await mlbStatsService.buildEventContext(event, {
        forceRefresh,
      });
    } catch (error) {
      mlbStatsContext = null;
    }

    const resolvedProps = normalizedProps.map((prop) => {
      if (!mlbStatsContext) {
        return {
          ...prop,
          teamResolved: false,
          eligibleForTicket: false,
          warning: 'Player team could not be verified for this event.',
          warnings: ['Player team could not be verified for this event.'],
        };
      }

      return mlbStatsService.resolvePropPlayerTeam(prop, event, mlbStatsContext);
    });

    allProps.push(...resolvedProps);
  }

  const eligibleProps = allProps.filter((prop) => prop.eligibleForTicket === true);
  const rejectedProps = allProps.filter((prop) => prop.eligibleForTicket !== true);
  const rejectedReasons = buildRejectedReasonCounts(rejectedProps);
  const warning = eligibleProps.length > 0
    ? ''
    : returnedMarkets.size > 0
      ? 'Player props were found but not used because player-team integrity could not be verified.'
      : 'Player props unavailable from The Odds API for current plan/feed.';

  return {
    configured: true,
    sport: 'baseball_mlb',
    method: 'event_level_markets',
    targetDate,
    eventsFound: Array.isArray(eventsPayload.events) ? eventsPayload.events.length : 0,
    eventsChecked,
    propsAvailable: eligibleProps.length > 0,
    propsFeedAvailable: allProps.length > 0,
    requestedMarkets,
    returnedMarkets: Array.from(returnedMarkets),
    marketsByEvent,
    props: eligibleProps,
    allProps,
    eligibleProps,
    rejectedProps,
    rejectedReasons,
    sampleProps: eligibleProps.slice(0, 5),
    sampleEligibleProps: eligibleProps.slice(0, 5),
    sampleRejectedProps: rejectedProps.slice(0, 5),
    warning,
    quotaReached: eventsPayload.quotaReached === true,
    source: eventsPayload.source || 'live',
  };
}

async function testMlbProps(options = {}) {
  const {
    date = getDateKeyInTimeZone(new Date()),
    limitEvents = 3,
    forceRefresh = false,
  } = options;

  const requestedMarkets = [...EVENT_PLAYER_PROP_MARKETS];

  if (!isConfigured()) {
    return {
      configured: false,
      sport: 'baseball_mlb',
      method: 'event_level_markets',
      eventsFound: 0,
      eventsChecked: 0,
      propsAvailable: false,
      requestedMarkets,
      returnedMarkets: [],
      marketsByEvent: [],
      sampleProps: [],
      sampleEligibleProps: [],
      sampleRejectedProps: [],
      warning: 'ODDS_API_KEY is not configured.',
    };
  }

  try {
    return await getMlbPropsByDateViaEvents(date, {
      limitEvents,
      forceRefresh,
      requestedMarkets,
    });
  } catch (error) {
    return {
      configured: true,
      sport: 'baseball_mlb',
      method: 'event_level_markets',
      eventsFound: 0,
      eventsChecked: 0,
      propsAvailable: false,
      requestedMarkets,
      returnedMarkets: [],
      marketsByEvent: [],
      sampleProps: [],
      sampleEligibleProps: [],
      sampleRejectedProps: [],
      warning: isLiveDisabledError(error)
        ? 'The Odds API live esta desactivada; no se hizo fallback live.'
        : 'Player props unavailable from The Odds API for current plan/feed.',
      message: error.message,
      oddsSource: isLiveDisabledError(error) ? 'cache_missing' : 'unavailable',
      propsAvailabilityStatus: isLiveDisabledError(error) ? 'blocked_by_env' : 'unavailable',
      runtimeMode: getOddsRuntimeMode(),
    };
  }
}

async function getMlbOdds(options = {}) {
  const {
    markets = CORE_MARKETS.join(','),
    targetDate = getDateKeyInTimeZone(new Date()),
    timeZone = TARGET_TIME_ZONE,
    forceRefresh = false,
    useCache = true,
    cacheOnly = false,
  } = options;

  const cacheFilename = `odds-mlb-${targetDate}.json`;

  const warnings = [];

  const load = async () => {
    let fetched;

    try {
      fetched = await fetchOddsJson('/sports/baseball_mlb/odds', {
        regions: 'us',
        markets,
        oddsFormat: 'decimal',
        dateFormat: 'iso',
      });
    } catch (error) {
      const requestedMarkets = String(markets || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const requestedProps = requestedMarkets.filter((market) => EXTRA_PLAYER_PROP_MARKETS.includes(market));

      if (requestedProps.length > 0 && !isQuotaError(error) && !isLiveDisabledError(error)) {
        warnings.push('Some requested player prop markets were unavailable from The Odds API; using supported game markets only.');
        fetched = await fetchOddsJson('/sports/baseball_mlb/odds', {
          regions: 'us',
          markets: CORE_MARKETS.join(','),
          oddsFormat: 'decimal',
          dateFormat: 'iso',
        });
      } else {
        throw error;
      }
    }

    const { data, headers } = fetched;
    const games = Array.isArray(data)
      ? data.filter((game) => matchesTargetDate(game?.commence_time, targetDate, timeZone))
      : [];

    return {
      fetchedAt: new Date().toISOString(),
      sport: 'MLB',
      league: 'MLB',
      targetDate,
      games,
      normalizedPicks: normalizeOddsGames(games),
      requestMeta: headers,
      warnings,
    };
  };

  const payload = useCache || !isLiveEnabled()
    ? await readOrFetchCachedOdds(cacheFilename, load, DEFAULT_CACHE_MINUTES, forceRefresh, {
      cacheOnly,
      pathname: '/sports/baseball_mlb/odds',
    })
    : {
      ...(await load()),
      source: 'live',
      quotaReached: false,
    };

  logOddsEvent('RETURNING_MLB_ODDS_PAYLOAD', {
    cacheFilename,
    gamesFound: Array.isArray(payload.games) ? payload.games.length : 0,
    source: payload.source,
    quotaReached: payload.quotaReached === true,
  });

  return payload;
}

async function getCacheStatus() {
  const todayDateKey = getDateKeyInTimeZone(new Date());
  const todayFilename = `odds-mlb-${todayDateKey}.json`;
  const todayCache = await readCache(todayFilename, {
    allowStale: true,
  });
  const eventPropsFiles = await listCacheFiles('odds-event-props-');
  const eventPropsAges = await Promise.all(eventPropsFiles.map(async (filename) => {
    const entry = await readCache(filename, {
      allowStale: true,
    });
    return entry.ageMs;
  }));
  const latestAgeMs = eventPropsAges
    .filter((ageMs) => Number.isFinite(ageMs))
    .sort((left, right) => left - right)[0];

  return {
    mlbOddsCache: {
      today: {
        exists: todayCache.exists,
        cacheFilename: todayCache.exists ? todayFilename : '',
        ageMinutes: Number.isFinite(todayCache.ageMs) ? Math.round(todayCache.ageMs / 60000) : null,
      },
    },
    eventPropsCache: {
      files: eventPropsFiles.length,
      latestAgeMinutes: Number.isFinite(latestAgeMs) ? Math.round(latestAgeMs / 60000) : null,
    },
    liveEnabled: isLiveEnabled(),
    runtimeMode: getOddsRuntimeMode(),
  };
}

module.exports = {
  assertOddsLiveAllowed,
  getGuardStatus,
  getOddsRuntimeMode,
  getCacheStatus,
  getMlbEventMarkets,
  getMlbEventPropsOdds,
  getMlbEventsByDate,
  getHealth,
  getMlbOdds,
  getMlbPropsByDateViaEvents,
  isConfigured,
  isOddsLiveEnabled: isLiveEnabled,
  isLiveDisabledError,
  isLiveEnabled,
  isQuotaError,
  normalizeOddsGames,
  testMlbH2h,
  testMlbProps,
};
