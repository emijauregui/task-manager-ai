const { readCache, writeCache } = require('../utils/cache');

const VERSION = 'v1';
const SOURCE = 'rotowire';
const ROTOWIRE_URL = 'https://www.rotowire.com/baseball/daily-lineups.php';
const CACHE_TTL_MINUTES = 15;
const CACHE_PREFIX = 'rotowire-lineups-';

const TEAM_ALIASES = {
  ARI: ['ari', 'arizona diamondbacks', 'diamondbacks'],
  ATL: ['atl', 'atlanta braves', 'braves'],
  BAL: ['bal', 'baltimore orioles', 'orioles'],
  BOS: ['bos', 'boston red sox', 'red sox'],
  CHC: ['chc', 'chicago cubs', 'cubs'],
  CHW: ['chw', 'cws', 'chicago white sox', 'white sox'],
  CIN: ['cin', 'cincinnati reds', 'reds'],
  CLE: ['cle', 'cleveland guardians', 'guardians'],
  COL: ['col', 'colorado rockies', 'rockies'],
  DET: ['det', 'detroit tigers', 'tigers'],
  HOU: ['hou', 'houston astros', 'astros'],
  KC: ['kc', 'kan', 'kansas city royals', 'royals'],
  LAA: ['laa', 'los angeles angels', 'angels'],
  LAD: ['lad', 'los angeles dodgers', 'dodgers'],
  MIA: ['mia', 'miami marlins', 'marlins'],
  MIL: ['mil', 'milwaukee brewers', 'brewers'],
  MIN: ['min', 'minnesota twins', 'twins'],
  NYM: ['nym', 'new york mets', 'mets'],
  NYY: ['nyy', 'new york yankees', 'yankees'],
  ATH: ['ath', 'oakland athletics', 'athletics', 'a\'s'],
  PHI: ['phi', 'philadelphia phillies', 'phillies'],
  PIT: ['pit', 'pittsburgh pirates', 'pirates'],
  SD: ['sd', 'sdp', 'san diego padres', 'padres'],
  SEA: ['sea', 'seattle mariners', 'mariners'],
  SF: ['sf', 'sfg', 'san francisco giants', 'giants'],
  STL: ['stl', 'st. louis cardinals', 'saint louis cardinals', 'cardinals'],
  TB: ['tb', 'tbr', 'tampa bay rays', 'rays'],
  TEX: ['tex', 'texas rangers', 'rangers'],
  TOR: ['tor', 'toronto blue jays', 'blue jays'],
  WSH: ['wsh', 'was', 'washington nationals', 'nationals'],
};

const POSITIONS = new Set(['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']);

function uniqueStrings(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).filter(Boolean)));
}

function getDateKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function getCacheFilename(date = new Date()) {
  return `${CACHE_PREFIX}${getDateKey(date)}.json`;
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeName(value = '') {
  return decodeHtml(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeTeamKey(value = '') {
  return normalizeName(value);
}

function getTeamAbbr(value = '') {
  const normalized = normalizeTeamKey(value);
  if (!normalized) return '';

  return Object.entries(TEAM_ALIASES).find(([, aliases]) => (
    aliases.some((alias) => normalizeTeamKey(alias) === normalized)
  ))?.[0] || '';
}

function namesMatch(left, right) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const leftTokens = normalizedLeft.split(' ');
  const rightTokens = normalizedRight.split(' ');
  const leftLast = leftTokens[leftTokens.length - 1];
  const rightLast = rightTokens[rightTokens.length - 1];
  if (!leftLast || leftLast !== rightLast) return false;

  const leftFirst = leftTokens[0] || '';
  const rightFirst = rightTokens[0] || '';
  const firstInitialMatches = leftFirst[0] && rightFirst[0] && leftFirst[0] === rightFirst[0];
  const sharedMiddle = leftTokens.slice(1, -1).some((token) => rightTokens.slice(1, -1).includes(token));

  return firstInitialMatches || sharedMiddle;
}

function htmlToTextLines(html = '') {
  const cleaned = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|li|ul|ol|section|article|header|footer|h[1-6]|p|tr|td|th|span|a)>/gi, '\n')
    .replace(/<[^>]+>/g, '\n');

  return decodeHtml(cleaned)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isTimeLine(line = '') {
  return /^\d{1,2}:\d{2}\s*(AM|PM)\s*ET$/i.test(String(line || '').trim());
}

function isTeamAbbrLine(line = '') {
  const cleaned = String(line || '').replace(/^Image:\s*/i, '').trim().toUpperCase();
  return Boolean(TEAM_ALIASES[cleaned]);
}

function getAbbrFromLine(line = '') {
  const cleaned = String(line || '').replace(/^Image:\s*/i, '').trim().toUpperCase();
  return TEAM_ALIASES[cleaned] ? cleaned : '';
}

function isStatusLine(line = '') {
  return /^(Confirmed|Expected) Lineup$/i.test(String(line || '').trim());
}

function normalizeStatus(line = '') {
  if (/confirmed lineup/i.test(line)) return 'confirmed';
  if (/expected lineup/i.test(line)) return 'expected';
  return 'unknown';
}

function isPosition(line = '') {
  return POSITIONS.has(String(line || '').trim().toUpperCase());
}

function isSalary(line = '') {
  return /^\$[\d,]+$/.test(String(line || '').trim());
}

function isHandedness(line = '') {
  return /^[LRS]$/.test(String(line || '').trim());
}

function isLikelyRecordOrStat(line = '') {
  return /ERA|^\d+-\d+|^\d+%|Wind|LINE|O\/U|Runs|Umpire|Tickets|Watch Now|Alerts|Home Run Odds|Starting Pitcher Intel/i
    .test(String(line || ''));
}

function isPlausiblePlayerName(line = '') {
  const text = String(line || '').trim();
  if (!text || text.length < 3) return false;
  if (isPosition(text) || isSalary(text) || isHandedness(text) || isTimeLine(text) || isTeamAbbrLine(text)) return false;
  if (isLikelyRecordOrStat(text)) return false;
  return /[A-Za-z]/.test(text) && !/^\d/.test(text);
}

function splitNameAndBats(line = '') {
  const text = String(line || '').trim();
  const match = text.match(/^(.+?)\s+([LRS])$/);
  if (match && isPlausiblePlayerName(match[1])) {
    return {
      name: match[1].trim(),
      bats: match[2],
    };
  }

  return {
    name: text,
    bats: '',
  };
}

function findPitcher(lines = []) {
  const eraIndex = lines.findIndex((line) => /ERA/i.test(line));
  const searchEnd = eraIndex >= 0 ? eraIndex : lines.length;

  for (let index = searchEnd - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (isPlausiblePlayerName(line)) {
      return splitNameAndBats(line).name;
    }
  }

  return '';
}

function parseBatters(lines = []) {
  const batters = [];

  for (let index = 0; index < lines.length && batters.length < 9; index += 1) {
    const position = String(lines[index] || '').trim().toUpperCase();
    if (!isPosition(position) || position === 'P') {
      continue;
    }

    let nameIndex = index + 1;
    while (nameIndex < lines.length && (isSalary(lines[nameIndex]) || isHandedness(lines[nameIndex]))) {
      nameIndex += 1;
    }

    if (!isPlausiblePlayerName(lines[nameIndex])) {
      continue;
    }

    const parsedName = splitNameAndBats(lines[nameIndex]);
    let bats = parsedName.bats;
    if (!bats && isHandedness(lines[nameIndex + 1])) {
      bats = lines[nameIndex + 1];
    }

    batters.push({
      order: batters.length + 1,
      name: parsedName.name,
      bats,
      position,
    });
  }

  return batters;
}

function findLineupEnd(lines = [], startIndex) {
  const relative = lines.slice(startIndex).findIndex((line) => /Home Run Odds|Starting Pitcher Intel|Umpire:|LINE\s/i.test(line));
  return relative >= 0 ? startIndex + relative : Math.min(lines.length, startIndex + 40);
}

function parseGameBlock(lines = [], context = {}) {
  const warnings = [];
  const gameTime = lines[0] || '';
  const abbrs = [];

  lines.slice(0, 80).forEach((line) => {
    const abbr = getAbbrFromLine(line);
    if (abbr && !abbrs.includes(abbr)) {
      abbrs.push(abbr);
    }
  });

  if (abbrs.length < 2) {
    return {
      game: null,
      warnings: ['parse_failed_missing_team_abbr'],
    };
  }

  const statusIndexes = lines
    .map((line, index) => (isStatusLine(line) ? index : -1))
    .filter((index) => index >= 0);

  if (statusIndexes.length < 2) {
    warnings.push('parse_failed_missing_lineup_status');
  }

  const awayStatusIndex = statusIndexes[0] ?? -1;
  const homeStatusIndex = statusIndexes[1] ?? -1;
  const awayLineupEnd = awayStatusIndex >= 0 ? findLineupEnd(lines, awayStatusIndex + 1) : -1;
  const homeLineupEnd = homeStatusIndex >= 0 ? findLineupEnd(lines, homeStatusIndex + 1) : -1;

  const awayTeamAbbr = abbrs[0];
  const homeTeamAbbr = abbrs[1];
  const awayPitcher = awayStatusIndex >= 0 ? findPitcher(lines.slice(0, awayStatusIndex)) : '';
  const homePitcher = homeStatusIndex >= 0 ? findPitcher(lines.slice(awayLineupEnd + 1, homeStatusIndex)) : '';
  const awayLineupStatus = awayStatusIndex >= 0 ? normalizeStatus(lines[awayStatusIndex]) : 'unknown';
  const homeLineupStatus = homeStatusIndex >= 0 ? normalizeStatus(lines[homeStatusIndex]) : 'unknown';
  const awayBatters = awayStatusIndex >= 0 ? parseBatters(lines.slice(awayStatusIndex + 1, awayLineupEnd)) : [];
  const homeBatters = homeStatusIndex >= 0 ? parseBatters(lines.slice(homeStatusIndex + 1, homeLineupEnd)) : [];

  if (awayBatters.length === 0 && awayLineupStatus !== 'unknown') {
    warnings.push(`parse_failed_${awayTeamAbbr.toLowerCase()}_batters`);
  }

  if (homeBatters.length === 0 && homeLineupStatus !== 'unknown') {
    warnings.push(`parse_failed_${homeTeamAbbr.toLowerCase()}_batters`);
  }

  return {
    game: {
      gameTime,
      awayTeamAbbr,
      homeTeamAbbr,
      awayTeamName: TEAM_ALIASES[awayTeamAbbr]?.[1] || awayTeamAbbr,
      homeTeamName: TEAM_ALIASES[homeTeamAbbr]?.[1] || homeTeamAbbr,
      awayLineupStatus,
      homeLineupStatus,
      awayPitcher,
      homePitcher,
      awayPitcherStatus: awayLineupStatus === 'confirmed' ? 'confirmed' : (awayPitcher ? 'expected' : 'unknown'),
      homePitcherStatus: homeLineupStatus === 'confirmed' ? 'confirmed' : (homePitcher ? 'expected' : 'unknown'),
      awayBatters,
      homeBatters,
      source: SOURCE,
      fetchedAt: context.fetchedAt || new Date().toISOString(),
    },
    warnings,
  };
}

function parseRotowireLineups(html = '', context = {}) {
  const lines = htmlToTextLines(html);
  const startIndexes = lines
    .map((line, index) => (isTimeLine(line) ? index : -1))
    .filter((index) => index >= 0);
  const games = [];
  const warnings = [];

  startIndexes.forEach((startIndex, position) => {
    const nextIndex = startIndexes[position + 1] || lines.length;
    const block = lines.slice(startIndex, nextIndex);
    const parsed = parseGameBlock(block, context);

    warnings.push(...(parsed.warnings || []));
    if (parsed.game) {
      games.push(parsed.game);
    }
  });

  if (games.length === 0) {
    warnings.push('parse_failed');
  }

  return {
    version: VERSION,
    source: SOURCE,
    fetchedAt: context.fetchedAt || new Date().toISOString(),
    totalGames: games.length,
    warnings: uniqueStrings(warnings),
    games,
  };
}

async function readRotowireLineupsCache(date = new Date()) {
  const filename = getCacheFilename(date);
  const cache = await readCache(filename, {
    maxAgeMinutes: CACHE_TTL_MINUTES,
    allowStale: true,
  });

  return {
    ...cache,
    filename,
    cacheStatus: !cache.exists ? 'miss' : cache.expired ? 'stale' : 'fresh',
  };
}

async function writeRotowireLineupsCache(date = new Date(), payload = {}) {
  const filename = getCacheFilename(date);
  const data = {
    ...payload,
    cachedAt: new Date().toISOString(),
  };
  const filePath = await writeCache(filename, data);
  return {
    filename,
    filePath,
    data,
  };
}

async function fetchRotowireDailyLineups(options = {}) {
  const date = getDateKey(options.date);
  const cache = await readRotowireLineupsCache(date);

  if (cache.exists && cache.cacheStatus === 'fresh' && options.force !== true) {
    return {
      ...cache.data,
      cacheStatus: 'fresh',
      cacheOnly: options.cacheOnly === true,
      warnings: uniqueStrings(cache.data?.warnings || []),
    };
  }

  if (options.cacheOnly === true) {
    return cache.exists
      ? {
        ...cache.data,
        cacheStatus: cache.cacheStatus,
        cacheOnly: true,
        warnings: uniqueStrings([...(cache.data?.warnings || []), ...(cache.expired ? ['using_stale_cache'] : [])]),
      }
      : {
        version: VERSION,
        source: 'no_lineup_cache_available',
        cacheOnly: true,
        cacheStatus: 'miss',
        fetchedAt: '',
        totalGames: 0,
        byStatus: {},
        warnings: ['no_lineup_cache_available'],
        games: [],
      };
  }

  if (typeof fetch !== 'function') {
    return cache.exists
      ? {
        ...cache.data,
        cacheStatus: 'stale',
        cacheOnly: false,
        warnings: uniqueStrings([...(cache.data?.warnings || []), 'fetch_unavailable_using_stale_cache']),
      }
      : {
        version: VERSION,
        source: 'no_lineup_cache_available',
        cacheOnly: false,
        cacheStatus: 'miss',
        fetchedAt: '',
        totalGames: 0,
        byStatus: {},
        warnings: ['fetch_unavailable', 'no_lineup_cache_available'],
        games: [],
      };
  }

  try {
    const response = await fetch(options.url || ROTOWIRE_URL, {
      headers: {
        'user-agent': 'TaskManagerAI-LineupGate/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`RotoWire responded with status ${response.status}`);
    }

    const html = await response.text();
    const parsed = parseRotowireLineups(html, {
      fetchedAt: new Date().toISOString(),
    });
    const summary = buildRotowireLineupSummary(parsed.games);
    const payload = {
      ...parsed,
      cacheOnly: false,
      cacheStatus: 'refreshed',
      byStatus: summary.byStatus,
      warnings: uniqueStrings(parsed.warnings),
    };

    await writeRotowireLineupsCache(date, payload);
    return payload;
  } catch (error) {
    if (cache.exists) {
      return {
        ...cache.data,
        cacheStatus: 'stale',
        cacheOnly: false,
        warnings: uniqueStrings([...(cache.data?.warnings || []), 'fetch_failed_using_stale_cache', error.message]),
      };
    }

    return {
      version: VERSION,
      source: 'no_lineup_cache_available',
      cacheOnly: false,
      cacheStatus: 'miss',
      fetchedAt: '',
      totalGames: 0,
      byStatus: {},
      warnings: ['fetch_failed', error.message, 'no_lineup_cache_available'],
      games: [],
    };
  }
}

function addPlayersByTeam(target = {}, teamAbbr = '', players = []) {
  const aliases = TEAM_ALIASES[teamAbbr] || [teamAbbr];
  aliases.forEach((alias) => {
    const key = alias;
    target[key] = [
      ...(target[key] || []),
      ...players,
    ];
  });
}

function addPitcherByTeam(target = {}, teamAbbr = '', pitcher = '', status = 'expected') {
  if (!pitcher) return;
  const player = {
    name: pitcher,
    fullName: pitcher,
    status,
  };
  addPlayersByTeam(target, teamAbbr, [player]);
}

function buildLineupContext(payload = {}) {
  const confirmedBatters = { byTeam: {} };
  const expectedBatters = { byTeam: {} };
  const confirmedPitchers = { byTeam: {} };
  const expectedPitchers = { byTeam: {} };

  (payload.games || []).forEach((game) => {
    const awayBatters = (game.awayBatters || []).map((batter) => ({
      ...batter,
      fullName: batter.name,
      teamAbbr: game.awayTeamAbbr,
      lineupStatus: game.awayLineupStatus,
    }));
    const homeBatters = (game.homeBatters || []).map((batter) => ({
      ...batter,
      fullName: batter.name,
      teamAbbr: game.homeTeamAbbr,
      lineupStatus: game.homeLineupStatus,
    }));

    addPlayersByTeam(
      game.awayLineupStatus === 'confirmed' ? confirmedBatters.byTeam : expectedBatters.byTeam,
      game.awayTeamAbbr,
      awayBatters
    );
    addPlayersByTeam(
      game.homeLineupStatus === 'confirmed' ? confirmedBatters.byTeam : expectedBatters.byTeam,
      game.homeTeamAbbr,
      homeBatters
    );

    addPitcherByTeam(
      game.awayPitcherStatus === 'confirmed' ? confirmedPitchers.byTeam : expectedPitchers.byTeam,
      game.awayTeamAbbr,
      game.awayPitcher,
      game.awayPitcherStatus
    );
    addPitcherByTeam(
      game.homePitcherStatus === 'confirmed' ? confirmedPitchers.byTeam : expectedPitchers.byTeam,
      game.homeTeamAbbr,
      game.homePitcher,
      game.homePitcherStatus
    );
  });

  return {
    source: payload.source === SOURCE ? SOURCE : 'no_lineup_cache_available',
    provider: SOURCE,
    fetchedAt: payload.fetchedAt || '',
    cacheStatus: payload.cacheStatus || 'miss',
    warnings: payload.warnings || [],
    confirmedBatters,
    expectedBatters,
    confirmedPitchers,
    expectedPitchers,
  };
}

async function getRotowireLineupContext(options = {}) {
  const payload = await fetchRotowireDailyLineups(options);
  const summary = buildRotowireLineupSummary(payload.games || []);

  return {
    ...payload,
    ...summary,
    context: buildLineupContext(payload),
  };
}

function findTeamSide(game = {}, teamName = '') {
  const abbr = getTeamAbbr(teamName);
  if (!abbr) return '';
  if (abbr === game.awayTeamAbbr) return 'away';
  if (abbr === game.homeTeamAbbr) return 'home';
  return '';
}

function matchRotowireLineupForCandidate(candidate = {}, lineups = []) {
  const playerName = candidate.playerName || candidate.selectionName || '';
  const teamName = candidate.teamName || '';
  const isPitcher = candidate.marketKey === 'pitcher_strikeouts' || candidate.marketType === 'pitcher_prop';
  const isBatter = String(candidate.marketKey || '').startsWith('batter_') || candidate.marketType === 'batter_prop';

  if (!isPitcher && !isBatter) {
    return {
      status: 'not_applicable',
      source: SOURCE,
    };
  }

  const candidateGames = (lineups || []).filter((game) => (teamName ? Boolean(findTeamSide(game, teamName)) : true));
  for (const game of candidateGames) {
    const side = findTeamSide(game, teamName) || 'away';
    const line = side === 'home' ? 'home' : 'away';
    const status = game[`${line}LineupStatus`] || 'unknown';

    if (isPitcher) {
      const pitcher = game[`${line}Pitcher`] || '';
      if (namesMatch(playerName, pitcher)) {
        return {
          status: game[`${line}PitcherStatus`] === 'confirmed' ? 'pitcher_confirmed' : 'pitcher_expected',
          source: SOURCE,
          matchedPlayer: pitcher,
          teamAbbr: game[`${line}TeamAbbr`],
        };
      }
      continue;
    }

    const batters = game[`${line}Batters`] || [];
    const match = batters.find((batter) => namesMatch(playerName, batter.name));
    if (match) {
      return {
        status: status === 'confirmed' ? 'lineup_confirmed' : 'lineup_expected',
        source: SOURCE,
        matchedPlayer: match.name,
        teamAbbr: game[`${line}TeamAbbr`],
      };
    }

    if (status === 'confirmed') {
      return {
        status: 'player_not_starting',
        source: SOURCE,
        teamAbbr: game[`${line}TeamAbbr`],
      };
    }
  }

  return {
    status: isPitcher ? 'pitcher_unknown' : 'lineup_unknown',
    source: SOURCE,
    warnings: ['player_name_not_matched'],
  };
}

function increment(target, key, amount = 1) {
  const safeKey = key || 'unknown';
  target[safeKey] = (target[safeKey] || 0) + amount;
}

function buildRotowireLineupSummary(lineups = []) {
  const byStatus = {};

  (lineups || []).forEach((game) => {
    increment(byStatus, game.awayLineupStatus || 'unknown');
    increment(byStatus, game.homeLineupStatus || 'unknown');
  });

  return {
    totalGames: Array.isArray(lineups) ? lineups.length : 0,
    byStatus,
  };
}

module.exports = {
  VERSION,
  buildRotowireLineupSummary,
  fetchRotowireDailyLineups,
  getRotowireLineupContext,
  matchRotowireLineupForCandidate,
  parseRotowireLineups,
  readRotowireLineupsCache,
  writeRotowireLineupsCache,
};
