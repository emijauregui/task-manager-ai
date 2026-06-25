const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

function isConfigured() {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

function getStatus() {
  return {
    configured: isConfigured(),
    provider: 'API-Football',
    baseUrl: API_FOOTBALL_BASE_URL,
  };
}

async function fetchJson(pathname, params = {}) {
  if (!isConfigured()) {
    throw new Error('API_FOOTBALL_KEY is not configured.');
  }

  const url = new URL(`${API_FOOTBALL_BASE_URL}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    headers: {
      'x-apisports-key': process.env.API_FOOTBALL_KEY,
    },
  });

  const rawText = await response.text();
  const payload = rawText ? JSON.parse(rawText) : null;

  if (!response.ok) {
    throw new Error(payload?.message || `API-Football request failed with status ${response.status}.`);
  }

  return payload;
}

async function getFixtures(options = {}) {
  const {
    date,
    league,
    season,
  } = options;

  return fetchJson('/fixtures', {
    date,
    league,
    season,
  });
}

module.exports = {
  getFixtures,
  getStatus,
  isConfigured,
};
