const { getCompactDateKey, getDateKey, readCache, writeCache } = require('../utils/cache');

const DEFAULT_CACHE_MINUTES = Number(process.env.ESPN_CACHE_MINUTES || 60);

function dateFromKey(dateKey) {
  const [year, month, day] = String(dateKey || getDateKey()).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function buildScoreboardUrl(dateKey) {
  return `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${getCompactDateKey(dateFromKey(dateKey))}`;
}

function buildCacheFilename(dateKey) {
  return `espn-scoreboard-${dateKey}.json`;
}

function getNextDateKey(dateKey = getDateKey()) {
  const next = dateFromKey(dateKey);
  next.setDate(next.getDate() + 1);
  return getDateKey(next);
}

function extractLogo(team) {
  return team?.logos?.[0]?.href || team?.logo || '';
}

function parseNumeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildScore(homeScore, awayScore) {
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    return '';
  }

  return `${awayScore} - ${homeScore}`;
}

function normalizeStatKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getStatValue(competitor, supportedKeys = []) {
  const stats = Array.isArray(competitor?.statistics) ? competitor.statistics : [];
  const supported = supportedKeys.map(normalizeStatKey);

  for (const item of stats) {
    const candidates = [
      item?.name,
      item?.shortDisplayName,
      item?.displayName,
      item?.abbreviation,
      item?.label,
    ].map(normalizeStatKey);

    if (candidates.some((key) => supported.includes(key))) {
      const displayValue = item?.displayValue ?? item?.value ?? item?.stat;
      if (displayValue !== undefined && displayValue !== null && displayValue !== '') {
        return String(displayValue);
      }
    }
  }

  return '';
}

function normalizeInningRuns(linescores = []) {
  return (Array.isArray(linescores) ? linescores : [])
    .map((entry) => entry?.displayValue ?? entry?.value ?? entry?.displayValueString ?? '')
    .map((value) => String(value));
}

function parseInningHalfFromText(text = '') {
  const lower = String(text || '').toLowerCase();
  if (lower.includes('top')) {
    return 'Top';
  }

  if (lower.includes('bottom') || lower.includes('bot')) {
    return 'Bottom';
  }

  if (lower.includes('mid')) {
    return 'Mid';
  }

  if (lower.includes('end')) {
    return 'End';
  }

  return '';
}

function parseInningFromText(text = '') {
  const match = String(text || '').match(/(\d+)(st|nd|rd|th)?/i);
  return match ? match[1] : '';
}

function isFinalStatus(statusText = '', statusType = {}) {
  const haystack = `${statusText} ${statusType?.description || ''} ${statusType?.name || ''} ${statusType?.state || ''}`.toLowerCase();
  return statusType?.completed === true || haystack.includes('final');
}

function isPostponedStatus(statusText = '', statusType = {}) {
  const haystack = `${statusText} ${statusType?.description || ''} ${statusType?.name || ''} ${statusType?.state || ''}`.toLowerCase();
  return /(postponed|suspended|delayed|delay|cancelled|canceled|rain)/i.test(haystack);
}

function isLiveStatus(statusText = '', statusType = {}) {
  const haystack = `${statusText} ${statusType?.description || ''} ${statusType?.name || ''} ${statusType?.state || ''}`.toLowerCase();
  if (isFinalStatus(statusText, statusType) || isPostponedStatus(statusText, statusType)) {
    return false;
  }

  return statusType?.state === 'in'
    || /(top|bottom|bot|mid|end)\s+\d+/i.test(haystack)
    || /(in progress|live)/i.test(haystack);
}

function extractProbablePitchers(competition = {}, legacyGame = null) {
  if (Array.isArray(legacyGame?.probablePitchers)) {
    return legacyGame.probablePitchers;
  }

  if (Array.isArray(legacyGame?.probables)) {
    return legacyGame.probables;
  }

  if (!Array.isArray(competition?.probables)) {
    return [];
  }

  return competition.probables.map((probable) => ({
    team: probable?.team?.displayName || probable?.team?.abbreviation || '',
    athlete: probable?.athlete?.displayName || '',
    record: probable?.statistics?.[0]?.displayValue || '',
  }));
}

function buildLinescore(competition, awayCompetitor, homeCompetitor, legacyGame = null) {
  if (legacyGame?.linescore) {
    return legacyGame.linescore;
  }

  const awayRunsByInning = normalizeInningRuns(awayCompetitor?.linescores);
  const homeRunsByInning = normalizeInningRuns(homeCompetitor?.linescores);
  const inningsCount = Math.max(awayRunsByInning.length, homeRunsByInning.length);

  const awayRuns = getStatValue(awayCompetitor, ['runs', 'r']) || String(parseNumeric(awayCompetitor?.score) ?? '');
  const homeRuns = getStatValue(homeCompetitor, ['runs', 'r']) || String(parseNumeric(homeCompetitor?.score) ?? '');
  const awayHits = getStatValue(awayCompetitor, ['hits', 'h']);
  const homeHits = getStatValue(homeCompetitor, ['hits', 'h']);
  const awayErrors = getStatValue(awayCompetitor, ['errors', 'e']);
  const homeErrors = getStatValue(homeCompetitor, ['errors', 'e']);

  if (!inningsCount && !awayHits && !homeHits && !awayErrors && !homeErrors) {
    return null;
  }

  const innings = Array.from({ length: inningsCount }, (_, index) => String(index + 1));

  return {
    innings,
    away: {
      team: awayCompetitor?.team?.displayName || legacyGame?.awayTeam || '',
      runs: awayRuns || '',
      hits: awayHits || '',
      errors: awayErrors || '',
      inningRuns: awayRunsByInning,
    },
    home: {
      team: homeCompetitor?.team?.displayName || legacyGame?.homeTeam || '',
      runs: homeRuns || '',
      hits: homeHits || '',
      errors: homeErrors || '',
      inningRuns: homeRunsByInning,
    },
  };
}

function buildBoxscoreSummary(linescore, legacyGame = null) {
  if (legacyGame?.boxscoreSummary) {
    return legacyGame.boxscoreSummary;
  }

  if (!linescore) {
    return null;
  }

  return {
    away: `R ${linescore.away.runs || '-'} H ${linescore.away.hits || '-'} E ${linescore.away.errors || '-'}`,
    home: `R ${linescore.home.runs || '-'} H ${linescore.home.hits || '-'} E ${linescore.home.errors || '-'}`,
  };
}

function getRecords(awayCompetitor, homeCompetitor, legacyGame = null) {
  if (Array.isArray(legacyGame?.records)) {
    return legacyGame.records;
  }

  return [awayCompetitor, homeCompetitor]
    .map((team) => team?.records?.[0]?.summary)
    .filter(Boolean);
}

function buildLegacyStatusShape(game = {}) {
  const statusText = String(game?.status || '');
  const isFinal = isFinalStatus(statusText);
  const isPostponed = isPostponedStatus(statusText);
  const isLive = isLiveStatus(statusText);

  return {
    status: statusText || 'Scheduled',
    statusType: game?.statusType || (isFinal ? 'STATUS_FINAL' : isLive ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED'),
    statusDescription: game?.statusDescription || statusText || 'Scheduled',
    isLive,
    isFinal,
    isScheduled: !isFinal && !isLive && !isPostponed,
    isPostponed,
    inning: game?.inning || parseInningFromText(statusText),
    inningHalf: game?.inningHalf || parseInningHalfFromText(statusText),
  };
}

function parseScoreFromLegacyGame(game = {}) {
  const scoreText = String(game?.score || '');
  const parts = scoreText.split('-').map((part) => parseNumeric(String(part).trim()));
  return {
    awayScore: parts.length === 2 ? parts[0] : parseNumeric(game?.awayScore),
    homeScore: parts.length === 2 ? parts[1] : parseNumeric(game?.homeScore),
  };
}

function normalizeLegacyGame(game = {}, dateKey) {
  const status = buildLegacyStatusShape(game);
  const parsedScore = parseScoreFromLegacyGame(game);
  const linescore = game?.linescore || null;

  return {
    id: game?.id || game?.gameId || '',
    gameId: game?.gameId || game?.id || '',
    date: game?.date || game?.startTime || '',
    startTime: game?.startTime || game?.date || '',
    status: status.status,
    statusType: status.statusType,
    statusDescription: status.statusDescription,
    isLive: status.isLive,
    isFinal: status.isFinal,
    isScheduled: status.isScheduled,
    isPostponed: status.isPostponed,
    inning: status.inning,
    inningHalf: status.inningHalf,
    venue: game?.venue || '',
    homeTeam: game?.homeTeam || '',
    awayTeam: game?.awayTeam || '',
    homeScore: Number.isFinite(parsedScore.homeScore) ? parsedScore.homeScore : null,
    awayScore: Number.isFinite(parsedScore.awayScore) ? parsedScore.awayScore : null,
    score: game?.score || buildScore(parsedScore.homeScore, parsedScore.awayScore),
    homeLogo: game?.homeLogo || '',
    awayLogo: game?.awayLogo || '',
    linescore,
    boxscoreSummary: buildBoxscoreSummary(linescore, game),
    probablePitchers: extractProbablePitchers({}, game),
    probables: extractProbablePitchers({}, game),
    records: Array.isArray(game?.records) ? game.records : [],
    message: game?.message || '',
    sourceDate: dateKey,
  };
}

function normalizeRawGame(event = {}, dateKey) {
  const competition = event?.competitions?.[0] || {};
  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  const homeCompetitor = competitors.find((competitor) => competitor.homeAway === 'home') || {};
  const awayCompetitor = competitors.find((competitor) => competitor.homeAway === 'away') || {};
  const statusType = competition?.status?.type || event?.status?.type || {};
  const statusText = statusType?.shortDetail || statusType?.detail || statusType?.description || 'Scheduled';
  const isFinal = isFinalStatus(statusText, statusType);
  const isPostponed = isPostponedStatus(statusText, statusType);
  const isLive = isLiveStatus(statusText, statusType);
  const linescore = buildLinescore(competition, awayCompetitor, homeCompetitor);
  const probablePitchers = extractProbablePitchers(competition);
  const awayScore = parseNumeric(awayCompetitor?.score);
  const homeScore = parseNumeric(homeCompetitor?.score);

  return {
    id: event?.id || '',
    gameId: event?.id || '',
    date: event?.date || '',
    startTime: event?.date || '',
    status: statusText,
    statusType: statusType?.name || statusType?.state || '',
    statusDescription: statusType?.description || statusText,
    isLive,
    isFinal,
    isScheduled: !isFinal && !isLive && !isPostponed,
    isPostponed,
    inning: competition?.status?.period || competition?.situation?.inning || parseInningFromText(statusText),
    inningHalf: competition?.situation?.halfInning || parseInningHalfFromText(statusText),
    venue: competition?.venue?.fullName || '',
    homeTeam: homeCompetitor?.team?.displayName || '',
    awayTeam: awayCompetitor?.team?.displayName || '',
    homeScore,
    awayScore,
    score: buildScore(homeScore, awayScore),
    homeLogo: extractLogo(homeCompetitor?.team),
    awayLogo: extractLogo(awayCompetitor?.team),
    linescore,
    boxscoreSummary: buildBoxscoreSummary(linescore),
    probablePitchers,
    probables: probablePitchers,
    records: getRecords(awayCompetitor, homeCompetitor),
    sourceDate: dateKey,
  };
}

function summarizeGames(games = []) {
  const summary = {
    total: games.length,
    live: 0,
    final: 0,
    scheduled: 0,
    postponed: 0,
  };

  games.forEach((game) => {
    if (game?.isLive) {
      summary.live += 1;
      return;
    }

    if (game?.isFinal) {
      summary.final += 1;
      return;
    }

    if (game?.isPostponed) {
      summary.postponed += 1;
      return;
    }

    summary.scheduled += 1;
  });

  return summary;
}

function hydrateScoreboardPayload(payload = {}, dateKey, sourceOverride = '') {
  const games = (Array.isArray(payload?.games) ? payload.games : []).map((game) => (
    game?.gameId || game?.statusType || game?.linescore || game?.boxscoreSummary || game?.probablePitchers
      ? normalizeLegacyGame(game, dateKey)
      : normalizeLegacyGame(game, dateKey)
  ));
  const summary = summarizeGames(games);

  return {
    sport: 'MLB',
    date: payload?.date || dateKey,
    games,
    message: payload?.message || '',
    fetchedAt: payload?.fetchedAt || null,
    lastUpdated: payload?.fetchedAt || payload?.lastUpdated || null,
    source: sourceOverride || payload?.source || 'unavailable',
    todayGamesTotal: summary.total,
    renderedGamesTotal: summary.total,
    liveGamesTotal: summary.live,
    finalGamesTotal: summary.final,
    scheduledGamesTotal: summary.scheduled,
    postponedGamesTotal: summary.postponed,
    scoreboardSource: sourceOverride || payload?.source || 'unavailable',
  };
}

function normalizeScoreboard(data, dateKey) {
  const events = Array.isArray(data?.events) ? data.events : [];
  return hydrateScoreboardPayload({
    sport: 'MLB',
    date: dateKey,
    games: events.map((event) => normalizeRawGame(event, dateKey)),
    message: '',
    fetchedAt: null,
  }, dateKey);
}

async function fetchMlbScoreboard(dateKey) {
  const url = buildScoreboardUrl(dateKey);
  const response = await fetch(url);
  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(`ESPN scoreboard request failed with status ${response.status}.`);
  }

  return normalizeScoreboard(payload, dateKey);
}

async function getMlbScoreboard(options = {}) {
  const {
    dateKey = getDateKey(),
    forceRefresh = false,
    allowStaleOnError = true,
  } = options;

  const cacheFilename = buildCacheFilename(dateKey);

  if (!forceRefresh) {
    const cached = await readCache(cacheFilename, {
      maxAgeMinutes: DEFAULT_CACHE_MINUTES,
      allowStale: false,
    });

    if (cached.hit && cached.data) {
      console.log('[espn] Returning MLB scoreboard from cache', {
        cacheFilename,
      });
      return hydrateScoreboardPayload(cached.data, dateKey, 'cache');
    }
  }

  try {
    const fresh = await fetchMlbScoreboard(dateKey);
    const payload = {
      ...fresh,
      fetchedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    await writeCache(cacheFilename, payload);
    console.log('[espn] Returning MLB scoreboard from live API', {
      cacheFilename,
      gamesFound: payload.games.length,
    });
    return hydrateScoreboardPayload(payload, dateKey, 'live');
  } catch (error) {
    console.error('[espn] Failed to fetch MLB scoreboard', {
      message: error.message,
    });

    if (allowStaleOnError) {
      const stale = await readCache(cacheFilename, {
        maxAgeMinutes: DEFAULT_CACHE_MINUTES,
        allowStale: true,
      });

      if (stale.exists && stale.data) {
        console.log('[espn] Returning stale cached MLB scoreboard', {
          cacheFilename,
        });
        return hydrateScoreboardPayload({
          ...stale.data,
          message: 'Using cached ESPN data because the live request failed.',
        }, dateKey, stale.expired ? 'stale_cache' : 'cache');
      }
    }

    return hydrateScoreboardPayload({
      sport: 'MLB',
      date: dateKey,
      games: [],
      fetchedAt: null,
      message: 'ESPN data is temporarily unavailable.',
    }, dateKey, 'unavailable');
  }
}

function buildScoreboardDayPayload(scoreboard = {}) {
  const games = Array.isArray(scoreboard?.games) ? scoreboard.games : [];
  return {
    total: games.length,
    live: Number(scoreboard?.liveGamesTotal || 0),
    final: Number(scoreboard?.finalGamesTotal || 0),
    scheduled: Number(scoreboard?.scheduledGamesTotal || 0),
    postponed: Number(scoreboard?.postponedGamesTotal || 0),
    games,
    source: scoreboard?.source || 'unavailable',
    lastUpdated: scoreboard?.lastUpdated || scoreboard?.fetchedAt || null,
    message: scoreboard?.message || '',
  };
}

async function getMlbScoreboardBundle(options = {}) {
  const {
    dateKey = getDateKey(),
    includeTomorrow = false,
    refreshLive = false,
  } = options;

  let today = await getMlbScoreboard({
    dateKey,
  });

  if (refreshLive && Number(today?.liveGamesTotal || 0) > 0) {
    today = await getMlbScoreboard({
      dateKey,
      forceRefresh: true,
    });
  }

  const tomorrowDateKey = getNextDateKey(dateKey);
  const tomorrow = includeTomorrow
    ? await getMlbScoreboard({
      dateKey: tomorrowDateKey,
    })
    : hydrateScoreboardPayload({
      sport: 'MLB',
      date: tomorrowDateKey,
      games: [],
      fetchedAt: null,
      message: '',
    }, tomorrowDateKey, 'not_requested');

  const todayPayload = buildScoreboardDayPayload(today);
  const tomorrowPayload = buildScoreboardDayPayload(tomorrow);

  return {
    date: dateKey,
    source: today.source,
    scoreboardSource: today.source,
    lastUpdated: today.lastUpdated || today.fetchedAt || null,
    today: todayPayload,
    tomorrow: tomorrowPayload,
    games: todayPayload.games,
    todayGamesTotal: todayPayload.total,
    renderedGamesTotal: todayPayload.total + tomorrowPayload.total,
    liveGamesTotal: todayPayload.live,
    finalGamesTotal: todayPayload.final,
    scheduledGamesTotal: todayPayload.scheduled,
    postponedGamesTotal: todayPayload.postponed,
    tomorrowGamesTotal: tomorrowPayload.total,
    livePollingRecommended: todayPayload.live > 0,
    message: today.message || '',
  };
}

module.exports = {
  getMlbScoreboard,
  getMlbScoreboardBundle,
};
