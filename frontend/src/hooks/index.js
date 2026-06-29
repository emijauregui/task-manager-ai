/**
 * hooks/index.js
 * Phase: React Migration v1 — Foundation
 *
 * Re-exports all custom hooks.
 * Future phases will add: useTicket, useScoreboard, useDashboard, etc.
 */

// placeholder — no hooks yet in Foundation phase
export { useHashNavigation, ROUTES, DEFAULT_VIEW, getViewFromHash, isValidView } from './useHashNavigation';
export { useMazatlanTime, MAZATLAN_TZ, formatMazatlanDate, formatMazatlanTime } from './useMazatlanTime';
