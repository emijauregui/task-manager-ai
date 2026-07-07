const { getCompactDateKey, getDateKey, readCache, writeCache } = require('../utils/cache');
const liveSyncGuardService = require('./liveSyncGuardService');

const DEFAULT_CACHE_MINUTES = Number(process.env.ESPN_CACHE_MINUTES || 60);
const ESPN_SUMMARY_CACHE_MINUTES = Number(process.env.ESPN_SUMMARY_CACHE_MINUTES || 2);
const ESPN_SUMMARY_ENRICHMENT_LIMIT = Number(process.env.ESPN_SUMMARY_ENRICHMENT_LIMIT || 3);
const MLB_STATSAPI_SCHEDULE_CACHE_MINUTES = Number(process.env.MLB_STATSAPI_SCHEDULE_CACHE_MINUTES || 720);
const MLB_STATSAPI_LIVE_CACHE_SECONDS = Number(process.env.MLB_STATSAPI_LIVE_CACHE_SECONDS || 45);
const MLB_STATSAPI_LIVE_ENRICHMENT_LIMIT = Number(process.env.MLB_STATSAPI_LIVE_ENRICHMENT_LIMIT || 3);

function dateFromKey(dateKey) {
  const [year, month, day] = String(dateKey || getDateKey()).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function buildScoreboardUrl(dateKey) {
  return `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${getCompactDateKey(dateFromKey(dateKey))}`;
}

function buildSummaryUrl(eventId) {
  return `https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${encodeURIComponent(eventId)}`;
}

function buildMlbStatsApiScheduleUrl(dateKey) {
  return `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(dateKey)}`;
}

function buildMlbStatsApiLiveFeedUrl(gamePk) {
  return `https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`;
}

function buildCacheFilename(dateKey) {
  return `espn-scoreboard-${dateKey}.json`;
}

function buildSummaryCacheFilename(eventId) {
  return `espn-summary-${String(eventId || '').replace(/[^a-zA-Z0-9_-]/g, '')}.json`;
}

function buildMlbStatsApiScheduleCacheFilename(dateKey) {
  return `mlb-statsapi-schedule-${dateKey}.json`;
}

function buildMlbStatsApiMappingCacheFilename(dateKey) {
  return `mlb-statsapi-map-${dateKey}.json`;
}

function buildMlbStatsApiLiveCacheFilename(gamePk) {
  return `mlb-statsapi-live-${String(gamePk || '').replace(/[^a-zA-Z0-9_-]/g, '')}.json`;
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

function getFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function parseCountText(value) {
  if (typeof value !== 'string') return {};

  const compact = value.trim().match(/^(\d+)\s*[-/]\s*(\d+)$/);
  if (compact) {
    return {
      balls: parseNumeric(compact[1]),
      strikes: parseNumeric(compact[2]),
    };
  }

  const balls = value.match(/(\d+)\s*(?:b|ball|balls)/i);
  const strikes = value.match(/(\d+)\s*(?:s|strike|strikes)/i);
  const outs = value.match(/(\d+)\s*(?:o|out|outs)/i);
  return {
    balls: balls ? parseNumeric(balls[1]) : null,
    strikes: strikes ? parseNumeric(strikes[1]) : null,
    outs: outs ? parseNumeric(outs[1]) : null,
  };
}

function normalizeBaseOccupied(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'object') return true;

  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (['true', 'yes', 'occupied', 'runner', '1'].includes(text)) return true;
  if (['false', 'no', 'empty', '0'].includes(text)) return false;
  return true;
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\bst\.?\b/g, 'saint')
    .replace(/[^a-z0-9]+/g, '');
}

function compactDateTimeMs(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function getCandidateValues(values = []) {
  return values
    .flat()
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => String(value));
}

function namesMatch(leftValues = [], rightValues = []) {
  const left = getCandidateValues(leftValues).map(normalizeMatchText).filter(Boolean);
  const right = getCandidateValues(rightValues).map(normalizeMatchText).filter(Boolean);

  return left.some((leftValue) => right.some((rightValue) => {
    if (leftValue === rightValue) return true;
    if (leftValue.length < 5 || rightValue.length < 5) return false;
    return leftValue.includes(rightValue) || rightValue.includes(leftValue);
  }));
}

function getMlbScheduleTeamCandidates(team = {}) {
  return getCandidateValues([
    team?.name,
    team?.teamName,
    team?.clubName,
    team?.shortName,
    team?.abbreviation,
    team?.fileCode,
    team?.franchiseName,
    team?.locationName,
  ]);
}

function getEspnGameTeamCandidates(game = {}, side = 'home') {
  return getCandidateValues([
    game?.[`${side}Team`],
    game?.linescore?.[side]?.team,
    game?.[side]?.team?.displayName,
    game?.[side]?.team?.shortDisplayName,
    game?.[side]?.team?.abbreviation,
  ]);
}

function normalizeMlbScheduleGame(rawGame = {}) {
  const homeTeam = rawGame?.teams?.home?.team || {};
  const awayTeam = rawGame?.teams?.away?.team || {};

  return {
    gamePk: rawGame?.gamePk,
    gameDate: rawGame?.gameDate || '',
    status: rawGame?.status?.detailedState || rawGame?.status?.abstractGameState || '',
    homeTeam: homeTeam?.name || '',
    awayTeam: awayTeam?.name || '',
    homeCandidates: getMlbScheduleTeamCandidates(homeTeam),
    awayCandidates: getMlbScheduleTeamCandidates(awayTeam),
  };
}

function getMlbScheduleGames(schedulePayload = {}) {
  const payload = schedulePayload?.payload || schedulePayload;
  const dates = Array.isArray(payload?.dates) ? payload.dates : [];
  return dates
    .flatMap((dateEntry) => Array.isArray(dateEntry?.games) ? dateEntry.games : [])
    .map(normalizeMlbScheduleGame)
    .filter((game) => game.gamePk);
}

function findMlbScheduleMatch(espnGame = {}, scheduleGames = []) {
  const espnHome = getEspnGameTeamCandidates(espnGame, 'home');
  const espnAway = getEspnGameTeamCandidates(espnGame, 'away');
  const espnStartMs = compactDateTimeMs(espnGame?.startTime || espnGame?.date);

  const candidates = scheduleGames
    .map((mlbGame) => {
      const homeMatch = namesMatch(espnHome, mlbGame.homeCandidates);
      const awayMatch = namesMatch(espnAway, mlbGame.awayCandidates);
      if (!homeMatch || !awayMatch) return null;

      const mlbStartMs = compactDateTimeMs(mlbGame.gameDate);
      const timeDeltaMs = espnStartMs !== null && mlbStartMs !== null
        ? Math.abs(espnStartMs - mlbStartMs)
        : null;
      const timeScore = timeDeltaMs === null ? 0 : Math.max(0, 20 - Math.floor(timeDeltaMs / (30 * 60 * 1000)));

      return {
        ...mlbGame,
        score: 100 + timeScore,
        timeDeltaMs,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (a.timeDeltaMs ?? Infinity) - (b.timeDeltaMs ?? Infinity));

  return candidates[0] || null;
}

function normalizeMlbPlayer(value = null) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value?.id || value?.person?.id || null,
    fullName: value?.fullName || value?.person?.fullName || '',
    link: value?.link || value?.person?.link || '',
  };
}

function getRunnerForBase(offense = {}, key = '', baseNumber = null) {
  const player = normalizeMlbPlayer(offense?.[key]);
  if (!player) return null;
  return {
    ...player,
    base: baseNumber,
    baseName: key,
  };
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

function normalizeVenueMetadata(competition = {}, event = {}, legacyGame = {}) {
  const venue = competition?.venue || event?.venue || legacyGame?.venueMetadata || {};
  const legacyVenue = typeof legacyGame?.venue === 'object' ? legacyGame.venue : {};
  const address = venue?.address || legacyVenue?.address || {};
  const name = venue?.fullName || venue?.name || legacyVenue?.fullName || legacyVenue?.name || legacyGame?.venue || '';
  const city = venue?.address?.city || address?.city || venue?.city || legacyGame?.city || '';
  const state = venue?.address?.state || address?.state || venue?.state || legacyGame?.state || '';

  if (!name && !city && !state && !venue?.id) return null;

  return {
    id: venue?.id || legacyVenue?.id || '',
    name,
    fullName: venue?.fullName || legacyVenue?.fullName || name,
    city,
    state,
    country: venue?.address?.country || address?.country || venue?.country || legacyGame?.country || '',
    indoor: getFirstDefined(venue?.indoor, legacyVenue?.indoor, null),
  };
}

function normalizeWeatherPayload(...sources) {
  const weather = sources.find((source) => source !== undefined && source !== null && source !== '');
  if (!weather) return null;

  if (typeof weather === 'string') {
    return {
      condition: weather,
      displayValue: weather,
      temp: null,
      temperature: null,
      wind: null,
      humidity: null,
    };
  }

  if (typeof weather !== 'object') return null;

  const condition = getFirstDefined(
    weather.condition,
    weather.displayValue,
    weather.description,
    weather.shortDisplayName,
    weather.summary,
    weather.type
  );
  const temp = getFirstDefined(
    weather.temp,
    weather.temperature,
    weather.highTemperature,
    weather.currentTemperature
  );
  const wind = getFirstDefined(
    weather.wind,
    weather.windSpeed,
    weather.windDisplayValue,
    weather.windDirection
  );
  const humidity = getFirstDefined(weather.humidity, weather.relativeHumidity);

  if (!condition && temp === undefined && !wind && humidity === undefined) return null;

  return {
    condition: condition || '',
    displayValue: weather.displayValue || condition || '',
    temp: temp ?? null,
    temperature: temp ?? null,
    wind: wind || null,
    humidity: humidity ?? null,
  };
}

function getBaseFromRunners(runners, baseName, baseNumber) {
  if (!Array.isArray(runners)) return null;

  return runners.some((runner) => {
    if (typeof runner === 'number' || typeof runner === 'string') {
      return String(runner) === String(baseNumber) || String(runner).toLowerCase() === baseName.toLowerCase();
    }

    return Number(runner?.base || runner?.baseNumber || runner?.currentBase) === baseNumber
      || String(runner?.base || runner?.baseName || '').toLowerCase() === baseName.toLowerCase();
  });
}

function normalizeLiveSituation(competition = {}, event = {}, legacyGame = {}) {
  const rawSituation = competition?.situation || event?.situation || legacyGame?.situation || {};
  const rawCount = getFirstDefined(rawSituation?.count, competition?.count, legacyGame?.count);
  const parsedCount = parseCountText(rawCount);
  const runners = getFirstDefined(
    rawSituation?.runners,
    rawSituation?.baseRunners,
    rawSituation?.runnersOnBase,
    legacyGame?.runners
  );
  const balls = parseNumeric(getFirstDefined(
    rawSituation?.balls,
    competition?.balls,
    legacyGame?.balls,
    rawCount?.balls,
    parsedCount.balls
  ));
  const strikes = parseNumeric(getFirstDefined(
    rawSituation?.strikes,
    competition?.strikes,
    legacyGame?.strikes,
    rawCount?.strikes,
    parsedCount.strikes
  ));
  const outs = parseNumeric(getFirstDefined(
    rawSituation?.outs,
    competition?.outs,
    legacyGame?.outs,
    rawCount?.outs,
    parsedCount.outs
  ));
  const onFirst = normalizeBaseOccupied(getFirstDefined(
    rawSituation?.onFirst,
    rawSituation?.runnerOnFirst,
    rawSituation?.first,
    legacyGame?.onFirst,
    getBaseFromRunners(runners, 'first', 1)
  ));
  const onSecond = normalizeBaseOccupied(getFirstDefined(
    rawSituation?.onSecond,
    rawSituation?.runnerOnSecond,
    rawSituation?.second,
    legacyGame?.onSecond,
    getBaseFromRunners(runners, 'second', 2)
  ));
  const onThird = normalizeBaseOccupied(getFirstDefined(
    rawSituation?.onThird,
    rawSituation?.runnerOnThird,
    rawSituation?.third,
    legacyGame?.onThird,
    getBaseFromRunners(runners, 'third', 3)
  ));
  const hasCount = [balls, strikes, outs].some((value) => value !== null);
  const hasBases = [onFirst, onSecond, onThird].some((value) => value !== null);
  const hasSituationText = Boolean(rawSituation?.lastPlay?.text || rawSituation?.shortDownDistanceText || rawSituation?.description);

  if (!hasCount && !hasBases && !hasSituationText && !Array.isArray(runners)) {
    return {
      situation: null,
      count: null,
      balls: null,
      strikes: null,
      outs: null,
      runners: null,
      bases: null,
      onFirst: null,
      onSecond: null,
      onThird: null,
    };
  }

  const bases = hasBases ? {
    first: onFirst,
    second: onSecond,
    third: onThird,
  } : null;

  return {
    situation: {
      balls,
      strikes,
      outs,
      runners: Array.isArray(runners) ? runners : null,
      bases,
      onFirst,
      onSecond,
      onThird,
      lastPlay: rawSituation?.lastPlay?.text || rawSituation?.description || '',
    },
    count: hasCount ? { balls, strikes, outs } : null,
    balls,
    strikes,
    outs,
    runners: Array.isArray(runners) ? runners : null,
    bases,
    onFirst,
    onSecond,
    onThird,
  };
}

function buildGameMetadata({ competition = {}, event = {}, legacyGame = {} }) {
  const venueMetadata = normalizeVenueMetadata(competition, event, legacyGame);
  const weather = normalizeWeatherPayload(
    competition?.weather,
    event?.weather,
    event?.weatherCondition,
    legacyGame?.weather
  );
  const liveSituation = normalizeLiveSituation(competition, event, legacyGame);

  return {
    venue: venueMetadata?.fullName || venueMetadata?.name || legacyGame?.venue || '',
    venueName: venueMetadata?.fullName || venueMetadata?.name || legacyGame?.venueName || '',
    venueMetadata,
    city: venueMetadata?.city || legacyGame?.city || '',
    state: venueMetadata?.state || legacyGame?.state || '',
    country: venueMetadata?.country || legacyGame?.country || '',
    attendance: parseNumeric(getFirstDefined(
      competition?.attendance,
      event?.attendance,
      legacyGame?.attendance
    )),
    weather,
    ...liveSituation,
  };
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
  const metadata = buildGameMetadata({ legacyGame: game });

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
    venue: metadata.venue,
    venueName: metadata.venueName,
    venueMetadata: metadata.venueMetadata,
    city: metadata.city,
    state: metadata.state,
    country: metadata.country,
    attendance: metadata.attendance,
    weather: metadata.weather,
    situation: metadata.situation,
    count: metadata.count,
    balls: metadata.balls,
    strikes: metadata.strikes,
    outs: metadata.outs,
    runners: metadata.runners,
    bases: metadata.bases,
    onFirst: metadata.onFirst,
    onSecond: metadata.onSecond,
    onThird: metadata.onThird,
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
  const metadata = buildGameMetadata({ competition, event });

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
    venue: metadata.venue,
    venueName: metadata.venueName,
    venueMetadata: metadata.venueMetadata,
    city: metadata.city,
    state: metadata.state,
    country: metadata.country,
    attendance: metadata.attendance,
    weather: metadata.weather,
    situation: metadata.situation,
    count: metadata.count,
    balls: metadata.balls,
    strikes: metadata.strikes,
    outs: metadata.outs,
    runners: metadata.runners,
    bases: metadata.bases,
    onFirst: metadata.onFirst,
    onSecond: metadata.onSecond,
    onThird: metadata.onThird,
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

async function fetchMlbSummary(eventId) {
  const url = buildSummaryUrl(eventId);
  const response = await fetch(url);
  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(`ESPN summary request failed with status ${response.status}.`);
  }

  return payload || {};
}

async function fetchMlbStatsApiSchedule(dateKey) {
  const response = await fetch(buildMlbStatsApiScheduleUrl(dateKey));
  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(`MLB StatsAPI schedule request failed with status ${response.status}.`);
  }

  return payload || {};
}

async function fetchMlbStatsApiLiveFeed(gamePk) {
  const response = await fetch(buildMlbStatsApiLiveFeedUrl(gamePk));
  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(`MLB StatsAPI live feed request failed with status ${response.status}.`);
  }

  return payload || {};
}

async function getMlbSummaryFromCache(eventId) {
  const cacheFilename = buildSummaryCacheFilename(eventId);
  const cached = await readCache(cacheFilename, {
    maxAgeMinutes: ESPN_SUMMARY_CACHE_MINUTES,
    allowStale: false,
  });

  if (cached.hit && cached.data) {
    return {
      source: 'summary_cache',
      payload: cached.data,
    };
  }

  try {
    const payload = await fetchMlbSummary(eventId);
    const wrapped = {
      eventId,
      fetchedAt: new Date().toISOString(),
      payload,
    };
    await writeCache(cacheFilename, wrapped);
    return {
      source: 'summary_live',
      payload: wrapped,
    };
  } catch (error) {
    console.error('[espn] Failed to fetch MLB summary', {
      eventId,
      message: error.message,
    });

    const stale = await readCache(cacheFilename, {
      maxAgeMinutes: ESPN_SUMMARY_CACHE_MINUTES,
      allowStale: true,
    });

    if (stale.exists && stale.data) {
      return {
        source: stale.expired ? 'summary_stale_cache' : 'summary_cache',
        payload: stale.data,
      };
    }

    return {
      source: 'summary_unavailable',
      payload: null,
      error: error.message,
    };
  }
}

async function getMlbStatsApiScheduleFromCache(dateKey) {
  const cacheFilename = buildMlbStatsApiScheduleCacheFilename(dateKey);
  const cached = await readCache(cacheFilename, {
    maxAgeMinutes: MLB_STATSAPI_SCHEDULE_CACHE_MINUTES,
    allowStale: false,
  });

  if (cached.hit && cached.data) {
    return {
      source: 'mlb_schedule_cache',
      payload: cached.data,
    };
  }

  try {
    const payload = await fetchMlbStatsApiSchedule(dateKey);
    const wrapped = {
      dateKey,
      fetchedAt: new Date().toISOString(),
      payload,
    };
    await writeCache(cacheFilename, wrapped);
    return {
      source: 'mlb_schedule_live',
      payload: wrapped,
    };
  } catch (error) {
    console.error('[espn] Failed to fetch MLB StatsAPI schedule', {
      dateKey,
      message: error.message,
    });

    const stale = await readCache(cacheFilename, {
      maxAgeMinutes: MLB_STATSAPI_SCHEDULE_CACHE_MINUTES,
      allowStale: true,
    });

    if (stale.exists && stale.data) {
      return {
        source: stale.expired ? 'mlb_schedule_stale_cache' : 'mlb_schedule_cache',
        payload: stale.data,
      };
    }

    return {
      source: 'mlb_schedule_unavailable',
      payload: null,
      error: error.message,
    };
  }
}

async function getMlbStatsApiLiveFeedFromCache(gamePk) {
  const cacheFilename = buildMlbStatsApiLiveCacheFilename(gamePk);
  const cached = await readCache(cacheFilename, {
    maxAgeMinutes: MLB_STATSAPI_LIVE_CACHE_SECONDS / 60,
    allowStale: false,
  });

  if (cached.hit && cached.data) {
    return {
      source: 'mlb_live_cache',
      payload: cached.data,
    };
  }

  try {
    const payload = await fetchMlbStatsApiLiveFeed(gamePk);
    const wrapped = {
      gamePk,
      fetchedAt: new Date().toISOString(),
      payload,
    };
    await writeCache(cacheFilename, wrapped);
    return {
      source: 'mlb_live',
      payload: wrapped,
    };
  } catch (error) {
    console.error('[espn] Failed to fetch MLB StatsAPI live feed', {
      gamePk,
      message: error.message,
    });

    const stale = await readCache(cacheFilename, {
      maxAgeMinutes: MLB_STATSAPI_LIVE_CACHE_SECONDS / 60,
      allowStale: true,
    });

    if (stale.exists && stale.data) {
      return {
        source: stale.expired ? 'mlb_live_stale_cache' : 'mlb_live_cache',
        payload: stale.data,
      };
    }

    return {
      source: 'mlb_live_unavailable',
      payload: null,
      error: error.message,
    };
  }
}

function normalizeSummaryGame(summaryWrapper = {}, fallbackGame = {}) {
  const payload = summaryWrapper?.payload || summaryWrapper || {};
  const summary = payload?.payload || payload;
  const headerCompetition = summary?.header?.competitions?.[0] || {};

  if (!headerCompetition || !Object.keys(headerCompetition).length) {
    return fallbackGame;
  }

  const normalized = normalizeRawGame({
    id: fallbackGame?.id || summary?.header?.id || payload?.eventId || '',
    date: fallbackGame?.date || summary?.header?.competitions?.[0]?.date || '',
    competitions: [headerCompetition],
    status: summary?.header?.competitions?.[0]?.status || summary?.header?.status || {},
    weather: summary?.gameInfo?.weather || summary?.weather,
    venue: summary?.gameInfo?.venue,
    attendance: summary?.gameInfo?.attendance,
  }, fallbackGame?.sourceDate || getDateKey());

  return {
    ...fallbackGame,
    ...normalized,
    id: fallbackGame?.id || normalized.id,
    gameId: fallbackGame?.gameId || normalized.gameId,
    sourceDate: fallbackGame?.sourceDate || normalized.sourceDate,
    summarySource: summaryWrapper?.source || 'summary',
    summaryFetchedAt: payload?.fetchedAt || null,
  };
}

function normalizeMlbLiveFeedGame(liveWrapper = {}, fallbackGame = {}, mapping = {}) {
  const payload = liveWrapper?.payload || liveWrapper || {};
  const feed = payload?.payload || payload;
  const liveData = feed?.liveData || {};
  const linescore = liveData?.linescore || {};
  const currentPlay = liveData?.plays?.currentPlay || {};
  const count = currentPlay?.count || {};
  const offense = linescore?.offense || {};
  const defense = linescore?.defense || {};
  const hasLinescore = Boolean(liveData?.linescore);

  if (!hasLinescore) return fallbackGame;

  const balls = parseNumeric(getFirstDefined(count?.balls, linescore?.balls, fallbackGame?.balls));
  const strikes = parseNumeric(getFirstDefined(count?.strikes, linescore?.strikes, fallbackGame?.strikes));
  const outs = parseNumeric(getFirstDefined(count?.outs, linescore?.outs, fallbackGame?.outs));
  const firstRunner = getRunnerForBase(offense, 'first', 1);
  const secondRunner = getRunnerForBase(offense, 'second', 2);
  const thirdRunner = getRunnerForBase(offense, 'third', 3);
  const runners = [firstRunner, secondRunner, thirdRunner].filter(Boolean);
  const bases = {
    first: Boolean(firstRunner),
    second: Boolean(secondRunner),
    third: Boolean(thirdRunner),
  };
  const batter = normalizeMlbPlayer(offense?.batter || currentPlay?.matchup?.batter);
  const pitcher = normalizeMlbPlayer(defense?.pitcher || currentPlay?.matchup?.pitcher);
  const situation = {
    ...(fallbackGame?.situation || {}),
    source: 'mlb_statsapi_live',
    gamePk: mapping?.gamePk || payload?.gamePk || null,
    balls,
    strikes,
    outs,
    runners,
    bases,
    onFirst: bases.first,
    onSecond: bases.second,
    onThird: bases.third,
    currentBatter: batter,
    currentPitcher: pitcher,
    inning: linescore?.currentInning ?? fallbackGame?.inning ?? null,
    inningHalf: linescore?.inningHalf || fallbackGame?.inningHalf || '',
    inningState: linescore?.inningState || '',
  };

  return {
    ...fallbackGame,
    mlbGamePk: mapping?.gamePk || payload?.gamePk || fallbackGame?.mlbGamePk || null,
    count: { balls, strikes, outs },
    balls,
    strikes,
    outs,
    runners,
    bases,
    onFirst: bases.first,
    onSecond: bases.second,
    onThird: bases.third,
    situation,
    statsApiLiveSource: liveWrapper?.source || 'mlb_live',
    statsApiLiveFetchedAt: payload?.fetchedAt || null,
  };
}

async function buildAndCacheMlbStatsApiMappings(dateKey, games = [], scheduleWrapper = {}) {
  const scheduleGames = getMlbScheduleGames(scheduleWrapper?.payload || scheduleWrapper);
  const mappings = games.map((game) => {
    const match = findMlbScheduleMatch(game, scheduleGames);
    return {
      espnEventId: game?.id || game?.gameId || '',
      gamePk: match?.gamePk || null,
      score: match?.score || 0,
      timeDeltaMs: match?.timeDeltaMs ?? null,
      espnHomeTeam: game?.homeTeam || '',
      espnAwayTeam: game?.awayTeam || '',
      mlbHomeTeam: match?.homeTeam || '',
      mlbAwayTeam: match?.awayTeam || '',
      mlbGameDate: match?.gameDate || '',
    };
  });

  await writeCache(buildMlbStatsApiMappingCacheFilename(dateKey), {
    dateKey,
    fetchedAt: new Date().toISOString(),
    source: scheduleWrapper?.source || 'mlb_schedule',
    mappings,
  });

  return mappings;
}

async function enrichLiveGamesWithSummary(scoreboard = {}, options = {}) {
  const {
    maxGames = ESPN_SUMMARY_ENRICHMENT_LIMIT,
  } = options;

  const games = Array.isArray(scoreboard?.games) ? scoreboard.games : [];
  const liveGames = games
    .filter((game) => game?.isLive && (game?.id || game?.gameId))
    .slice(0, Math.max(0, maxGames));

  if (!liveGames.length) {
    return {
      ...scoreboard,
      summaryEnrichment: {
        attempted: 0,
        maxGames,
        source: 'not_needed',
      },
    };
  }

  const summaryById = new Map();
  for (const game of liveGames) {
    const eventId = game.id || game.gameId;
    const summary = await getMlbSummaryFromCache(eventId);
    summaryById.set(String(eventId), summary);
  }

  const enrichedGames = games.map((game) => {
    const eventId = String(game?.id || game?.gameId || '');
    const summary = summaryById.get(eventId);
    if (!summary?.payload) return game;
    return normalizeSummaryGame(summary, game);
  });

  return {
    ...scoreboard,
    games: enrichedGames,
    summaryEnrichment: {
      attempted: summaryById.size,
      maxGames,
      ttlMinutes: ESPN_SUMMARY_CACHE_MINUTES,
      sources: Array.from(summaryById.values()).map((summary) => summary.source),
    },
  };
}

async function enrichLiveGamesWithMlbStatsApi(scoreboard = {}, options = {}) {
  const {
    dateKey = scoreboard?.date || getDateKey(),
    maxGames = MLB_STATSAPI_LIVE_ENRICHMENT_LIMIT,
  } = options;

  const games = Array.isArray(scoreboard?.games) ? scoreboard.games : [];
  const liveGames = games
    .filter((game) => game?.isLive && (game?.id || game?.gameId))
    .slice(0, Math.max(0, maxGames));

  if (!liveGames.length) {
    return {
      ...scoreboard,
      statsApiEnrichment: {
        attempted: 0,
        maxGames,
        source: 'not_needed',
      },
    };
  }

  const schedule = await getMlbStatsApiScheduleFromCache(dateKey);
  if (!schedule?.payload) {
    return {
      ...scoreboard,
      statsApiEnrichment: {
        attempted: 0,
        maxGames,
        scheduleSource: schedule?.source || 'mlb_schedule_unavailable',
        source: 'schedule_unavailable',
        error: schedule?.error || '',
      },
    };
  }

  const mappings = await buildAndCacheMlbStatsApiMappings(dateKey, liveGames, schedule);
  const matchedMappings = mappings.filter((mapping) => mapping.gamePk).slice(0, Math.max(0, maxGames));
  const liveFeedByEspnId = new Map();

  for (const mapping of matchedMappings) {
    const liveFeed = await getMlbStatsApiLiveFeedFromCache(mapping.gamePk);
    liveFeedByEspnId.set(String(mapping.espnEventId), {
      mapping,
      liveFeed,
    });
  }

  const enrichedGames = games.map((game) => {
    const eventId = String(game?.id || game?.gameId || '');
    const item = liveFeedByEspnId.get(eventId);
    if (!item?.liveFeed?.payload) return game;
    return normalizeMlbLiveFeedGame(item.liveFeed, game, item.mapping);
  });

  return {
    ...scoreboard,
    games: enrichedGames,
    statsApiEnrichment: {
      attempted: liveFeedByEspnId.size,
      matched: matchedMappings.length,
      maxGames,
      ttlSeconds: MLB_STATSAPI_LIVE_CACHE_SECONDS,
      scheduleSource: schedule.source,
      sources: Array.from(liveFeedByEspnId.values()).map((item) => item.liveFeed.source),
      mappings: mappings.map((mapping) => ({
        espnEventId: mapping.espnEventId,
        gamePk: mapping.gamePk,
        espnHomeTeam: mapping.espnHomeTeam,
        espnAwayTeam: mapping.espnAwayTeam,
        mlbHomeTeam: mapping.mlbHomeTeam,
        mlbAwayTeam: mapping.mlbAwayTeam,
      })),
    },
  };
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
    liveSyncSummary: scoreboard?.liveSyncSummary || null,
  };
}

async function getMlbScoreboardBundle(options = {}) {
  const {
    dateKey = getDateKey(),
    includeTomorrow = false,
    refreshLive = false,
    enrichLiveDetails = false,
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

  if (enrichLiveDetails) {
    today = await enrichLiveGamesWithSummary(today);
    today = await enrichLiveGamesWithMlbStatsApi(today, { dateKey });
    today = {
      ...today,
      games: liveSyncGuardService.applyLiveSyncGuard(today.games),
    };
    today = {
      ...today,
      liveSyncSummary: liveSyncGuardService.buildLiveSyncSummary(today.games),
    };
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
    summaryEnrichment: today.summaryEnrichment || {
      attempted: 0,
      source: enrichLiveDetails ? 'not_needed' : 'disabled',
    },
    statsApiEnrichment: today.statsApiEnrichment || {
      attempted: 0,
      source: enrichLiveDetails ? 'not_needed' : 'disabled',
    },
    liveSyncSummary: today.liveSyncSummary || {
      version: liveSyncGuardService.VERSION,
      evaluated: 0,
      ok: 0,
      warnings: 0,
      mismatches: 0,
      unknown: 0,
      staleStatsApi: 0,
      reasons: {},
    },
    message: today.message || '',
  };
}

module.exports = {
  getMlbScoreboard,
  getMlbScoreboardBundle,
};
