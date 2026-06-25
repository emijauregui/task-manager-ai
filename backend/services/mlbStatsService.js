const { readCache, writeCache } = require('../utils/cache');

const MLB_STATS_BASE_URL = 'https://statsapi.mlb.com/api/v1';
const TEAM_CACHE_MINUTES = Number(process.env.MLB_TEAMS_CACHE_MINUTES || 720);
const ROSTER_CACHE_MINUTES = Number(process.env.MLB_ROSTER_CACHE_MINUTES || 180);

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function buildUrl(pathname, params = {}) {
  const url = new URL(`${MLB_STATS_BASE_URL}${pathname}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url;
}

async function fetchJson(pathname, params = {}) {
  const response = await fetch(buildUrl(pathname, params));
  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(`MLB Stats request failed with status ${response.status}.`);
  }

  return payload;
}

async function readOrFetch(filename, fetcher, maxAgeMinutes, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = await readCache(filename, {
      maxAgeMinutes,
      allowStale: false,
    });

    if (cached.hit && cached.data) {
      return cached.data;
    }
  }

  const payload = await fetcher();
  await writeCache(filename, payload);
  return payload;
}

function matchTeamName(team, requestedName) {
  const left = normalizeKey(requestedName);
  if (!left) {
    return false;
  }

  const candidates = [
    team?.name,
    team?.teamName,
    team?.clubName,
    team?.locationName,
    team?.fileCode,
    `${team?.locationName || ''} ${team?.teamName || ''}`.trim(),
    `${team?.locationName || ''} ${team?.clubName || ''}`.trim(),
  ]
    .filter(Boolean)
    .map(normalizeKey);

  return candidates.some((value) => value === left || value.includes(left) || left.includes(value));
}

function matchPlayerName(playerName, rosterEntry) {
  const target = normalizeKey(playerName);
  const values = [
    rosterEntry?.person?.fullName,
    rosterEntry?.person?.firstLastName,
    rosterEntry?.person?.firstName && rosterEntry?.person?.lastName
      ? `${rosterEntry.person.firstName} ${rosterEntry.person.lastName}`
      : '',
    rosterEntry?.person?.useName && rosterEntry?.person?.lastName
      ? `${rosterEntry.person.useName} ${rosterEntry.person.lastName}`
      : '',
  ]
    .filter(Boolean)
    .map(normalizeKey);

  return values.some((value) => value === target);
}

async function getTeams(options = {}) {
  const { forceRefresh = false } = options;
  return readOrFetch('mlb-teams.json', async () => {
    const payload = await fetchJson('/teams', {
      sportId: 1,
    });

    return {
      fetchedAt: new Date().toISOString(),
      teams: Array.isArray(payload?.teams) ? payload.teams : [],
    };
  }, TEAM_CACHE_MINUTES, forceRefresh);
}

async function findTeamByName(teamName, options = {}) {
  const teamsPayload = await getTeams(options);
  const teams = Array.isArray(teamsPayload.teams) ? teamsPayload.teams : [];
  return teams.find((team) => matchTeamName(team, teamName)) || null;
}

async function getTeamRoster(teamName, options = {}) {
  const {
    forceRefresh = false,
  } = options;

  const team = await findTeamByName(teamName, { forceRefresh });
  if (!team?.id) {
    return {
      team: null,
      roster: [],
      resolved: false,
      warning: `Could not resolve MLB team "${teamName}".`,
    };
  }

  const filename = `mlb-roster-${team.id}.json`;
  const payload = await readOrFetch(filename, async () => {
    const data = await fetchJson(`/teams/${team.id}/roster`, {
      rosterType: 'active',
      hydrate: 'person',
    });

    return {
      fetchedAt: new Date().toISOString(),
      team: {
        id: team.id,
        name: team.name,
        teamName: team.teamName,
        clubName: team.clubName,
      },
      roster: Array.isArray(data?.roster) ? data.roster : [],
    };
  }, ROSTER_CACHE_MINUTES, forceRefresh);

  return {
    team: payload.team,
    roster: Array.isArray(payload.roster) ? payload.roster : [],
    resolved: true,
    warning: '',
  };
}

async function buildEventContext(event, options = {}) {
  const [homeRoster, awayRoster] = await Promise.all([
    getTeamRoster(event?.home_team, options),
    getTeamRoster(event?.away_team, options),
  ]);

  return {
    homeTeam: event?.home_team || '',
    awayTeam: event?.away_team || '',
    homeRoster,
    awayRoster,
  };
}

function resolvePropPlayerTeam(prop, event, mlbStatsContext = {}) {
  const warningMessages = [];
  const playerName = String(prop?.playerName || '').trim();
  const homeTeam = event?.home_team || mlbStatsContext?.homeTeam || '';
  const awayTeam = event?.away_team || mlbStatsContext?.awayTeam || '';
  const homeKey = normalizeKey(homeTeam);
  const awayKey = normalizeKey(awayTeam);
  const propTeamKey = normalizeKey(prop?.team || prop?.playerTeam || '');
  const hasValidMarket = Boolean(prop?.marketCategory);

  if (!playerName) {
    warningMessages.push('Player name missing for prop.');
  }

  let resolvedTeam = prop?.team || prop?.playerTeam || null;
  let teamResolved = false;
  let probableStarter = false;

  if (propTeamKey && (propTeamKey === homeKey || propTeamKey === awayKey)) {
    resolvedTeam = propTeamKey === homeKey ? homeTeam : awayTeam;
    teamResolved = true;
  }

  const homeRoster = Array.isArray(mlbStatsContext?.homeRoster?.roster) ? mlbStatsContext.homeRoster.roster : [];
  const awayRoster = Array.isArray(mlbStatsContext?.awayRoster?.roster) ? mlbStatsContext.awayRoster.roster : [];

  if (!teamResolved && playerName && (homeRoster.length > 0 || awayRoster.length > 0)) {
    const onHomeRoster = homeRoster.find((entry) => matchPlayerName(playerName, entry));
    const onAwayRoster = awayRoster.find((entry) => matchPlayerName(playerName, entry));

    if (onHomeRoster && onAwayRoster) {
      warningMessages.push('Player was found on both team rosters for this event.');
    } else if (onHomeRoster) {
      resolvedTeam = homeTeam;
      teamResolved = true;
      probableStarter = normalizeKey(onHomeRoster?.position?.abbreviation) === 'p';
    } else if (onAwayRoster) {
      resolvedTeam = awayTeam;
      teamResolved = true;
      probableStarter = normalizeKey(onAwayRoster?.position?.abbreviation) === 'p';
    } else {
      warningMessages.push('Player does not belong to either team in this event.');
    }
  }

  if (!teamResolved && warningMessages.length === 0) {
    warningMessages.push('Player team could not be verified for this event.');
  }

  if (!resolvedTeam) {
    warningMessages.push('Player team not resolved.');
  }

  const eligibleForTicket = Boolean(
    prop?.oddsVerified === true
    && playerName
    && teamResolved
    && resolvedTeam
    && (normalizeKey(resolvedTeam) === homeKey || normalizeKey(resolvedTeam) === awayKey)
    && hasValidMarket
    && prop?.lineupRequired === true
  );

  return {
    ...prop,
    team: resolvedTeam,
    playerTeam: resolvedTeam,
    teamResolved,
    eligibleForTicket,
    probableStarter,
    lineupConfidence: eligibleForTicket ? 'unknown' : 'unknown',
    warning: warningMessages[0] || '',
    warnings: warningMessages,
  };
}

module.exports = {
  buildEventContext,
  getTeamRoster,
  resolvePropPlayerTeam,
};
