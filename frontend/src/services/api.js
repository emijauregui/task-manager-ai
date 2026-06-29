/**
 * services/api.js
 * ─────────────────────────────────────────────────────────────
 * Centralized API helper for Daily Ticket AI.
 *
 * Rules enforced here:
 *  - In development, paths are relative (/api/...) so Vite's
 *    proxy forwards them to the local backend.
 *  - In production, paths stay relative so Netlify's proxy
 *    forwards them to the Render backend.
 *  - No live Odds API or Bedrock calls are made automatically.
 *  - Only explicit user actions should trigger generate/expensive endpoints.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Build a full URL for the given API path.
 * - Local dev  -> /api/... (Vite proxy handles the rest)
 * - Production -> /api/... (Netlify proxy handles the rest)
 *
 * @param {string} path  e.g. "/api/daily-ticket/today"
 * @returns {string}
 */
export function apiUrl(path) {
  return path;
}

// ─── Safe / cheap endpoints (cache-first, never live) ──────────────────────

/**
 * GET /api/daily-ticket/today
 * Returns the cached ticket for today (no Bedrock call).
 */
export async function fetchToday() {
  const res = await fetch(apiUrl('/api/daily-ticket/today'));
  if (!res.ok) throw new Error(`fetchToday: ${res.status}`);
  return res.json();
}

/**
 * GET /api/daily-ticket/today
 * Read-only ticket lookup for the React Daily Ticket view.
 * This endpoint is cache-safe and must not generate tickets.
 */
export async function getTodayTicket() {
  try {
    const res = await fetch(apiUrl('/api/daily-ticket/today'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`getTodayTicket: ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    throw new Error(error?.message || 'getTodayTicket: request failed');
  }
}

/**
 * GET /api/daily-ticket/dashboard
 * Dashboard summary — always cache-first, never calls Bedrock or Odds API.
 */
export async function fetchDashboard() {
  const res = await fetch(apiUrl('/api/daily-ticket/dashboard'));
  if (!res.ok) throw new Error(`fetchDashboard: ${res.status}`);
  return res.json();
}

/**
 * GET /api/daily-ticket/dashboard
 * Read-only dashboard lookup for React. Cache-first only.
 */
export async function getDailyTicketDashboard() {
  try {
    const res = await fetch(apiUrl('/api/daily-ticket/dashboard'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`getDailyTicketDashboard: ${res.status}`);
    }

    const data = await res.json();
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    throw new Error(error?.message || 'getDailyTicketDashboard: request failed');
  }
}

/**
 * GET /api/mlb/scoreboard
 * Returns cached ESPN scoreboard data.
 */
export async function fetchScoreboard() {
  const res = await fetch(apiUrl('/api/mlb/scoreboard'));
  if (!res.ok) throw new Error(`fetchScoreboard: ${res.status}`);
  return res.json();
}

export async function getMlbScoreboard() {
  try {
    const res = await fetch(apiUrl('/api/mlb/scoreboard'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`getMlbScoreboard: ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    throw new Error(error?.message || 'getMlbScoreboard: request failed');
  }
}

/**
 * GET /api/daily-ticket/odds/guard
 * Returns the odds gate status — safe, no live call.
 */
export async function fetchOddsGuard() {
  const res = await fetch(apiUrl('/api/daily-ticket/odds/guard'));
  if (!res.ok) throw new Error(`fetchOddsGuard: ${res.status}`);
  return res.json();
}

/**
 * GET /api/daily-ticket/history/summary
 */
export async function fetchHistorySummary() {
  const res = await fetch(apiUrl('/api/daily-ticket/history/summary'));
  if (!res.ok) throw new Error(`fetchHistorySummary: ${res.status}`);
  return res.json();
}

export async function getHistorySummary() {
  try {
    const res = await fetch(apiUrl('/api/daily-ticket/history/summary'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`getHistorySummary: ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    throw new Error(error?.message || 'getHistorySummary: request failed');
  }
}

/**
 * GET /api/daily-ticket/history/patterns
 */
export async function fetchHistoryPatterns() {
  const res = await fetch(apiUrl('/api/daily-ticket/history/patterns'));
  if (!res.ok) throw new Error(`fetchHistoryPatterns: ${res.status}`);
  return res.json();
}

// ─── Expensive / explicit-action-only endpoints ────────────────────────────

/**
 * POST /api/daily-ticket/generate
 * Only call this from an explicit user action.
 * Never call automatically.
 * Sends an empty JSON body and never sends confirmLive.
 */
export async function generateDailyTicket() {
  try {
    const res = await fetch(apiUrl('/api/daily-ticket/generate'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      throw new Error(`generateDailyTicket: ${res.status}`);
    }

    const data = await res.json().catch(() => ({}));
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    throw new Error(error?.message || 'generateDailyTicket: request failed');
  }
}

export async function generateTicket() {
  return generateDailyTicket();
}
