/**
 * services/api.js
 * ─────────────────────────────────────────────────────────────
 * Centralized API helper for Daily Ticket AI.
 *
 * Rules enforced here:
 *  - In development (localhost) calls go to http://localhost:3000
 *  - In production, paths are relative (/api/…) so Netlify's
 *    proxy redirect forwards them to the Render backend.
 *  - No live Odds API or Bedrock calls are made automatically.
 *  - Only explicit user actions should trigger generate/expensive endpoints.
 * ─────────────────────────────────────────────────────────────
 */

const IS_LOCAL =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

/**
 * Build a full URL for the given API path.
 * - Local dev  → http://localhost:3000/api/…
 * - Production → /api/…  (Netlify proxy handles the rest)
 *
 * @param {string} path  e.g. "/api/daily-ticket/today"
 * @returns {string}
 */
export function apiUrl(path) {
  if (IS_LOCAL) {
    // Vite dev server proxies /api to localhost:3000, but we can also
    // use the direct URL to make the intent explicit.
    return `http://localhost:3000${path}`;
  }
  // In production, use relative path — Netlify rewrites /api/* → backend
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

    return await res.json();
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
 * GET /api/mlb/scoreboard
 * Returns cached ESPN scoreboard data.
 */
export async function fetchScoreboard() {
  const res = await fetch(apiUrl('/api/mlb/scoreboard'));
  if (!res.ok) throw new Error(`fetchScoreboard: ${res.status}`);
  return res.json();
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
 * ⚠️  ONLY call this from an explicit user action (button click).
 * Triggers Bedrock + Odds API — never call automatically.
 *
 * @param {{ confirmLive?: boolean }} [opts]
 */
export async function generateTicket(opts = {}) {
  const res = await fetch(apiUrl('/api/daily-ticket/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`generateTicket: ${res.status}`);
  return res.json();
}
