const { listCacheFiles, readCache } = require('../utils/cache');

const VERSION = 'v2';
const SPORT = 'MLB';
const SOURCE = 'odds_cache';
const FRESHNESS_MINUTES = 30;
const CORE_CACHE_PREFIX = 'odds-mlb-';
const EVENTS_CACHE_PREFIX = 'odds-events-mlb-';
const EVENT_MARKETS_CACHE_PREFIX = 'odds-event-markets-';
const EVENT_PROPS_CACHE_PREFIX = 'odds-event-props-';

const MARKET_LABELS = {
  h2h: 'Moneyline',
  spreads: 'Spread',
  totals: 'Total Runs',
  batter_hits: 'Batter Hits',
  batter_total_bases: 'Batter Total Bases',
  batter_runs_scored: 'Batter Runs',
  batter_rbis: 'Batter RBIs',
  batter_hits_runs_rbis: 'Batter Hits + Runs + RBIs',
  pitcher_strikeouts: 'Pitcher Strikeouts',
  batter_home_runs: 'Batter Home Runs',
};

const PLAYER_PROP_PREFIXES = [
  'batter_',
  'pitcher_',
];

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBookmaker(bookmaker = {}) {
  return {
    bookmaker: bookmaker.key || '',
    bookmakerTitle: bookmaker.title || bookmaker.key || '',
    lastUpdate: bookmaker.last_update || '',
  };
}

function convertOddsToDecimal(value) {
  const price = parseFiniteNumber(value);
  if (price === null) {
    return null;
  }

  if (price >= 100) {
    return Number((1 + price / 100).toFixed(3));
  }

  if (price <= -100) {
    return Number((1 + 100 / Math.abs(price)).toFixed(3));
  }

  if (price > 1) {
    return Number(price.toFixed(3));
  }

  return null;
}

function getMarketLabel(marketKey) {
  return MARKET_LABELS[marketKey] || String(marketKey || 'Unknown Market');
}

function isPlayerPropMarket(marketKey = '') {
  return PLAYER_PROP_PREFIXES.some((prefix) => String(marketKey || '').startsWith(prefix));
}

function requiresLine(marketKey = '') {
  return marketKey === 'spreads'
    || marketKey === 'totals'
    || isPlayerPropMarket(marketKey);
}

function detectOddsFreshness(snapshot = {}) {
  const timestamp = snapshot.lastUpdate || snapshot.fetchedAt || '';
  const parsed = Date.parse(timestamp);

  if (!timestamp || !Number.isFinite(parsed)) {
    return {
      lastUpdate: timestamp || '',
      ageMinutes: null,
      status: 'unknown',
    };
  }

  const now = snapshot.now instanceof Date ? snapshot.now : new Date(snapshot.now || Date.now());
  const ageMinutes = Math.max(0, Math.round((now.getTime() - parsed) / 60000));

  return {
    lastUpdate: new Date(parsed).toISOString(),
    ageMinutes,
    status: ageMinutes <= FRESHNESS_MINUTES ? 'fresh' : 'stale',
  };
}

function normalizeOutcome(outcome = {}) {
  const price = parseFiniteNumber(outcome.price);
  const line = parseFiniteNumber(outcome.point);

  return {
    selectionName: String(outcome.name || '').trim(),
    playerName: String(outcome.description || outcome.player || '').trim(),
    participant: String(outcome.participant || '').trim(),
    teamName: String(outcome.team || outcome.team_name || '').trim(),
    line,
    price,
    decimalOdds: convertOddsToDecimal(outcome.price),
  };
}

function getSelectionTeamName(marketKey, outcomeInfo) {
  if (outcomeInfo.teamName) {
    return outcomeInfo.teamName;
  }

  if (marketKey === 'h2h' || marketKey === 'spreads') {
    return outcomeInfo.selectionName;
  }

  return '';
}

function getPlayerName(marketKey, outcomeInfo) {
  if (!isPlayerPropMarket(marketKey)) {
    return '';
  }

  return outcomeInfo.playerName || outcomeInfo.participant || '';
}

function buildDataQuality(normalized) {
  const warnings = [];

  if (requiresLine(normalized.marketKey) && normalized.line === null) {
    warnings.push('missing_line');
  }

  if (normalized.decimalOdds === null || normalized.price === null) {
    warnings.push('missing_price');
  }

  if (!normalized.bookmaker) {
    warnings.push('missing_bookmaker');
  }

  if (!normalized.eventId) {
    warnings.push('missing_event_id');
  }

  if (!normalized.commenceTime) {
    warnings.push('missing_commence_time');
  }

  if (normalized.freshness.status === 'stale') {
    warnings.push('stale_odds');
  }

  if (normalized.freshness.status === 'unknown') {
    warnings.push('unknown_freshness');
  }

  return {
    hasLine: normalized.line !== null,
    hasPrice: normalized.decimalOdds !== null,
    hasBookmaker: Boolean(normalized.bookmaker),
    hasEventId: Boolean(normalized.eventId),
    warnings,
  };
}

function buildNormalizedId(parts = []) {
  return parts.map(normalizeKey).filter(Boolean).join('__');
}

function normalizeOddsMarket(rawMarket = {}, context = {}) {
  const outcomes = Array.isArray(rawMarket.outcomes) ? rawMarket.outcomes : [];
  if (!outcomes.length) {
    return [];
  }

  const marketKey = rawMarket.key || '';
  const event = context.event || {};
  const bookmakerInfo = normalizeBookmaker(context.bookmaker || {});
  const marketLastUpdate = rawMarket.last_update || bookmakerInfo.lastUpdate || event.last_update || context.snapshot?.fetchedAt || '';

  return outcomes.map((outcome) => {
    const outcomeInfo = normalizeOutcome(outcome);
    const freshness = detectOddsFreshness({
      lastUpdate: marketLastUpdate,
      fetchedAt: context.snapshot?.fetchedAt || '',
      now: context.now,
    });
    const playerName = getPlayerName(marketKey, outcomeInfo);
    const teamName = getSelectionTeamName(marketKey, outcomeInfo);
    const normalized = {
      id: '',
      source: SOURCE,
      sport: SPORT,
      eventId: event.id || context.snapshot?.eventId || '',
      commenceTime: event.commence_time || event.commenceTime || context.snapshot?.commenceTime || '',
      homeTeam: event.home_team || event.homeTeam || '',
      awayTeam: event.away_team || event.awayTeam || '',
      marketKey,
      marketLabel: getMarketLabel(marketKey),
      selectionName: outcomeInfo.selectionName,
      playerName,
      teamName,
      line: outcomeInfo.line,
      price: outcomeInfo.price,
      decimalOdds: outcomeInfo.decimalOdds,
      bookmaker: bookmakerInfo.bookmaker,
      bookmakerTitle: bookmakerInfo.bookmakerTitle,
      lastUpdate: marketLastUpdate,
      freshness,
      dataQuality: null,
      rawRefs: {
        cacheFile: context.cacheFile || '',
        marketKey,
      },
    };

    normalized.id = buildNormalizedId([
      normalized.source,
      normalized.eventId,
      normalized.marketKey,
      normalized.bookmaker,
      normalized.selectionName,
      normalized.playerName,
      normalized.line,
      normalized.price,
    ]);
    normalized.dataQuality = buildDataQuality(normalized);

    return normalized;
  });
}

function getSnapshotEvents(rawSnapshot = {}) {
  if (Array.isArray(rawSnapshot.games)) {
    return rawSnapshot.games;
  }

  if (Array.isArray(rawSnapshot.events)) {
    return rawSnapshot.events;
  }

  if (Array.isArray(rawSnapshot.payload)) {
    return rawSnapshot.payload;
  }

  if (rawSnapshot.payload && typeof rawSnapshot.payload === 'object') {
    return [rawSnapshot.payload];
  }

  return [];
}

function normalizeOddsSnapshot(rawSnapshot = {}, context = {}) {
  const events = getSnapshotEvents(rawSnapshot);
  const normalized = [];
  const warnings = [];
  let marketsSeen = 0;
  let emptyMarkets = 0;

  events.forEach((event) => {
    const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
    if (!bookmakers.length) {
      warnings.push('snapshot_event_without_bookmakers');
    }

    bookmakers.forEach((bookmaker) => {
      const markets = Array.isArray(bookmaker.markets) ? bookmaker.markets : [];
      marketsSeen += markets.length;
      markets.forEach((market) => {
        const rows = normalizeOddsMarket(market, {
          ...context,
          event,
          bookmaker,
          snapshot: rawSnapshot,
        });
        if (!rows.length) {
          emptyMarkets += 1;
        }
        normalized.push(...rows);
      });
    });
  });

  return {
    normalized,
    diagnostics: {
      cacheFile: context.cacheFile || '',
      events: events.length,
      marketsSeen,
      emptyMarkets,
      warnings: uniqueStrings(warnings),
    },
  };
}

function increment(target, key, amount = 1) {
  const normalizedKey = key || 'unknown';
  target[normalizedKey] = (target[normalizedKey] || 0) + amount;
}

function buildOddsIngestionSummary(normalized = [], context = {}) {
  const byMarket = {};
  const byBookmaker = {};
  const freshness = {
    fresh: 0,
    stale: 0,
    unknown: 0,
  };
  const dataQualityWarnings = {};

  normalized.forEach((item) => {
    increment(byMarket, item.marketKey);
    increment(byBookmaker, item.bookmakerTitle || item.bookmaker);
    increment(freshness, item.freshness?.status || 'unknown');
    (item.dataQuality?.warnings || []).forEach((warning) => {
      increment(dataQualityWarnings, warning);
    });
  });

  return {
    version: VERSION,
    source: SOURCE,
    cacheOnly: true,
    totalNormalized: normalized.length,
    byMarket,
    byBookmaker,
    freshness,
    dataQualityWarnings,
    warnings: uniqueStrings(context.warnings || []),
    samples: normalized.slice(0, context.sampleLimit || 8),
  };
}

function filterFilesByDate(files = [], date = '') {
  if (!date) {
    return files;
  }

  return files.filter((file) => file.includes(date));
}

async function readSnapshotFile(filename) {
  const entry = await readCache(filename, { allowStale: true });
  return entry.data
    ? {
      filename,
      data: entry.data,
      exists: entry.exists,
      ageMs: entry.ageMs,
    }
    : {
      filename,
      data: null,
      exists: entry.exists,
      ageMs: entry.ageMs,
    };
}

async function getCachedOddsIngestion(options = {}) {
  const sampleLimit = Math.max(1, Math.min(25, Number(options.sampleLimit || 8)));
  const date = String(options.date || '').trim();
  const now = new Date();
  const warnings = [];
  const coreFiles = filterFilesByDate(await listCacheFiles(CORE_CACHE_PREFIX), date)
    .filter((file) => file.endsWith('.json'));
  const eventFiles = filterFilesByDate(await listCacheFiles(EVENTS_CACHE_PREFIX), date)
    .filter((file) => file.endsWith('.json'));
  const eventMarketsFiles = (await listCacheFiles(EVENT_MARKETS_CACHE_PREFIX))
    .filter((file) => file.endsWith('.json'));
  const eventPropsFiles = (await listCacheFiles(EVENT_PROPS_CACHE_PREFIX))
    .filter((file) => file.endsWith('.json'));
  const snapshots = [];

  for (const filename of [...coreFiles, ...eventPropsFiles]) {
    snapshots.push(await readSnapshotFile(filename));
  }

  const normalized = [];
  const cacheDiagnostics = [];

  snapshots.forEach((snapshot) => {
    if (!snapshot.data) {
      warnings.push(`cache_unreadable:${snapshot.filename}`);
      return;
    }

    const result = normalizeOddsSnapshot(snapshot.data, {
      cacheFile: snapshot.filename,
      now,
    });
    normalized.push(...result.normalized);
    cacheDiagnostics.push({
      ...result.diagnostics,
      ageMinutes: Number.isFinite(snapshot.ageMs) ? Math.round(snapshot.ageMs / 60000) : null,
    });
  });

  if (!eventPropsFiles.length) {
    warnings.push('no_cached_props');
  }

  if (!normalized.some((item) => isPlayerPropMarket(item.marketKey))) {
    warnings.push('no_cached_props_normalized');
  }

  if (!coreFiles.length) {
    warnings.push('no_core_odds_cache');
  }

  const summary = buildOddsIngestionSummary(normalized, {
    sampleLimit,
    warnings,
  });

  return {
    ...summary,
    ...(options.includeNormalized === true ? { normalizedOdds: normalized } : {}),
    dateFilter: date || null,
    cacheAudit: {
      coreOddsFiles: coreFiles.length,
      eventsFiles: eventFiles.length,
      eventMarketsFiles: eventMarketsFiles.length,
      eventPropsFiles: eventPropsFiles.length,
      normalizedFiles: snapshots.filter((snapshot) => snapshot.data).length,
      diagnostics: cacheDiagnostics.slice(0, 20),
    },
  };
}

module.exports = {
  VERSION,
  buildOddsIngestionSummary,
  detectOddsFreshness,
  getCachedOddsIngestion,
  normalizeBookmaker,
  normalizeOddsMarket,
  normalizeOddsSnapshot,
  normalizeOutcome,
};
