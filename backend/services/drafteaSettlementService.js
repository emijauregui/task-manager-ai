'use strict';

const VOID_LIKE_RESULTS = new Set([
  'void',
  'cancelled',
  'canceled',
  'postponed',
  'push',
  'refund',
]);

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hasExplicitNumericValue(ticket = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(ticket, key)
    && ticket[key] !== ''
    && ticket[key] !== null
    && ticket[key] !== undefined
    && Number.isFinite(Number(ticket[key]));
}

function normalizeLegResult(result, fallback = 'pending') {
  const normalized = String(result || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === 'won' || normalized === 'lost' || normalized === 'pending') {
    return normalized;
  }

  if (normalized === 'push') {
    return 'push';
  }

  if (normalized === 'void' || normalized === 'cancelled' || normalized === 'canceled' || normalized === 'postponed' || normalized === 'refund') {
    return 'void';
  }

  return fallback;
}

function normalizeTicketResult(result, fallback = 'pending') {
  const normalized = String(result || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === 'won' || normalized === 'lost' || normalized === 'pending' || normalized === 'partial') {
    return normalized;
  }

  if (normalized === 'push') {
    return 'push';
  }

  if (normalized === 'void' || normalized === 'cancelled' || normalized === 'canceled' || normalized === 'postponed' || normalized === 'refund') {
    return 'void';
  }

  return fallback;
}

function isVoidLikeResult(result) {
  return VOID_LIKE_RESULTS.has(String(result || '').trim().toLowerCase());
}

function settleTicketByLegResults(ticket = {}) {
  const legs = Array.isArray(ticket.legs) ? ticket.legs : [];
  const normalizedLegResults = legs.map((leg) => normalizeLegResult(leg?.result, 'pending'));
  const totalLegs = normalizedLegResults.length;
  const wonLegs = normalizedLegResults.filter((result) => result === 'won').length;
  const lostLegs = normalizedLegResults.filter((result) => result === 'lost').length;
  const pendingLegs = normalizedLegResults.filter((result) => result === 'pending').length;
  const pushLegs = normalizedLegResults.filter((result) => result === 'push').length;
  const voidLegs = normalizedLegResults.filter((result) => result === 'void' || result === 'push').length;
  const activeLegs = totalLegs - voidLegs;
  const explicitPayoutProvided = hasExplicitNumericValue(ticket, 'payout');
  const stake = safeNumber(ticket.stake, 0);
  const payout = safeNumber(ticket.payout, 0);

  let computedResult = 'pending';
  let settlementType = 'pending';

  if (totalLegs > 0 && activeLegs === 0) {
    computedResult = 'void';
    settlementType = 'all_void_refund';
  } else if (lostLegs > 0) {
    computedResult = 'lost';
    settlementType = 'lost';
  } else if (pendingLegs > 0) {
    computedResult = 'pending';
    settlementType = 'pending';
  } else if (wonLegs > 0 && voidLegs > 0) {
    computedResult = 'won';
    settlementType = 'reduced_multiplier';
  } else if (wonLegs > 0) {
    computedResult = 'won';
    settlementType = 'full_multiplier';
  } else if (totalLegs === 0) {
    computedResult = normalizeTicketResult(ticket.result || ticket.status, 'pending');
    settlementType = computedResult === 'won'
      ? 'full_multiplier'
      : computedResult === 'lost'
        ? 'lost'
        : computedResult === 'void'
          ? 'all_void_refund'
          : 'pending';
  }

  const effectivePayout = settlementType === 'all_void_refund' && !explicitPayoutProvided
    ? stake
    : payout;
  const netProfit = Number((effectivePayout - stake).toFixed(2));

  return {
    computedResult,
    settlementType,
    totalLegs,
    activeLegs,
    voidLegs,
    wonLegs,
    lostLegs,
    pendingLegs,
    pushLegs,
    effectivePayout: Number(effectivePayout.toFixed(2)),
    netProfit,
  };
}

module.exports = {
  isVoidLikeResult,
  normalizeLegResult,
  normalizeTicketResult,
  settleTicketByLegResults,
};
