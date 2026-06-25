const { getCompactDateKey, getDateKey, readCache, writeCache } = require('../utils/cache');

const DEFAULT_CACHE_MINUTES = Number(process.env.ESPN_CACHE_MINUTES || 60);

function buildScoreboardUrl(dateKey) {
  return `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${getCompactDateKey(new Date(dateKey))}`;
}

function buildCacheFilename(dateKey) {
  return `espn-scoreboard-${dateKey}.json`;
}

function extractLogo(team) {
  return team?.logos?.[0]?.href || team?.logo || '';
}

function buildScore(home, away) {
  const homeScore = home?.score;
  const awayScore = away?.score;

  if (homeScore === undefined || awayScore === undefined || homeScore === '' || awayScore === '') {
    return '';
  }

  return `${awayScore} - ${homeScore}`;
}

function normalizeGame(event) {
  const competition = event?.competitions?.[0] || {};
  const competitors = Array.isArray(competition.competitors) ? competition.competitors : [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home') || {};
  const away = competitors.find((competitor) => competitor.homeAway === 'away') || {};

  const records = [away, home]
    .map((team) => team?.records?.[0]?.summary)
    .filter(Boolean);

  const probables = Array.isArray(competition.probables)
    ? competition.probables.map((probable) => ({
        team: probable?.team?.displayName || probable?.team?.abbreviation || '',
        athlete: probable?.athlete?.displayName || '',
        record: probable?.statistics?.[0]?.displayValue || '',
      }))
    : [];

  return {
    id: event?.id || '',
    homeTeam: home?.team?.displayName || '',
    awayTeam: away?.team?.displayName || '',
    homeLogo: extractLogo(home?.team),
    awayLogo: extractLogo(away?.team),
    status: competition?.status?.type?.shortDetail
      || competition?.status?.type?.description
      || event?.status?.type?.description
      || 'Scheduled',
    startTime: event?.date || '',
    score: buildScore(home, away),
    venue: competition?.venue?.fullName || '',
    records,
    probables,
  };
}

function normalizeScoreboard(data, dateKey) {
  const events = Array.isArray(data?.events) ? data.events : [];
  return {
    sport: 'MLB',
    date: dateKey,
    games: events.map(normalizeGame),
    message: '',
  };
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
      return {
        ...cached.data,
        source: 'cache',
      };
    }
  }

  try {
    const fresh = await fetchMlbScoreboard(dateKey);
    const payload = {
      ...fresh,
      fetchedAt: new Date().toISOString(),
    };
    await writeCache(cacheFilename, payload);
    console.log('[espn] Returning MLB scoreboard from live API', {
      cacheFilename,
      gamesFound: payload.games.length,
    });
    return {
      ...payload,
      source: 'live',
    };
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
        return {
          ...stale.data,
          source: 'stale-cache',
          message: 'Using cached ESPN data because the live request failed.',
        };
      }
    }

    return {
      sport: 'MLB',
      date: dateKey,
      games: [],
      fetchedAt: null,
      source: 'unavailable',
      message: 'ESPN data is temporarily unavailable.',
    };
  }
}

module.exports = {
  getMlbScoreboard,
};
