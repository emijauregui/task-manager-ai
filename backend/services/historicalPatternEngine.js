'use strict';

const mlbTicketHistoryService = require('./mlbTicketHistoryService');

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function parseOddsDecimal(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function isResolvedResult(result) {
  return ['won', 'lost', 'push'].includes(String(result || '').toLowerCase());
}

function hasProtectedSpreadMention(text) {
  const normalized = normalizeText(text);
  return normalized.includes('+1.5')
    || normalized.includes('1.5 habria ganado')
    || normalized.includes('preferir spread')
    || normalized.includes('run line');
}

function buildEmptyPatternSnapshot() {
  return {
    totalPatterns: 0,
    riskFlags: [],
    positiveSignals: [],
    topPatternCodes: [],
  };
}

function buildPatternSnapshot(report = {}) {
  return {
    totalPatterns: Array.isArray(report.patterns) ? report.patterns.length : 0,
    riskFlags: (Array.isArray(report.riskFlags) ? report.riskFlags : [])
      .map((item) => item.code)
      .filter(Boolean)
      .slice(0, 5),
    positiveSignals: (Array.isArray(report.positiveSignals) ? report.positiveSignals : [])
      .map((item) => item.code)
      .filter(Boolean)
      .slice(0, 5),
    topPatternCodes: (Array.isArray(report.patterns) ? report.patterns : [])
      .map((item) => item.code)
      .filter(Boolean)
      .slice(0, 8),
  };
}

function buildLegRows(tickets = []) {
  const rows = [];

  tickets.forEach((ticket) => {
    const legs = Array.isArray(ticket.legs) ? ticket.legs : [];
    legs.forEach((leg) => {
      const oddsDecimal = parseOddsDecimal(leg.odds);
      const marketKey = String(leg.marketCategory || leg.market || 'unknown').trim() || 'unknown';
      const ticketNotes = String(ticket.notes || '').trim();
      const legNotes = String(leg.notes || '').trim();
      rows.push({
        date: String(ticket.date || ''),
        ticketType: String(ticket.ticketType || 'unknown'),
        ticketStatus: String(ticket.status || 'pending'),
        marketKey,
        market: String(leg.market || '').trim(),
        result: String(leg.result || 'pending'),
        pick: String(leg.pick || '').trim(),
        game: String(leg.game || '').trim(),
        oddsDecimal,
        notes: [ticketNotes, legNotes].filter(Boolean).join(' | '),
      });
    });
  });

  return rows.sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
}

function buildMarketInsights(rows = []) {
  const insights = {};

  rows.forEach((row) => {
    const key = row.marketKey || 'unknown';
    if (!insights[key]) {
      insights[key] = {
        market: key,
        count: 0,
        won: 0,
        lost: 0,
        push: 0,
        pending: 0,
        void: 0,
        resolvedCount: 0,
        stakedUnits: 0,
        payoutUnits: 0,
        netUnits: 0,
        roi: 0,
        winRate: 0,
        lossRate: 0,
        avgOdds: 0,
        recentResults: [],
        recentWon: 0,
        recentLost: 0,
        lowPerformance: false,
        positivePerformance: false,
      };
    }

    const current = insights[key];
    current.count += 1;
    if (current[row.result] !== undefined) {
      current[row.result] += 1;
    } else {
      current.pending += 1;
    }

    if (isResolvedResult(row.result)) {
      current.resolvedCount += 1;
      current.stakedUnits += 1;
      if (row.result === 'won') {
        current.payoutUnits += row.oddsDecimal || 1;
      } else if (row.result === 'push') {
        current.payoutUnits += 1;
      }

      if (Number.isFinite(row.oddsDecimal)) {
        current.avgOdds += row.oddsDecimal;
      }
    }

    if (current.recentResults.length < 5 && row.result !== 'pending') {
      current.recentResults.push({
        date: row.date,
        result: row.result,
        pick: row.pick,
        game: row.game,
      });
    }
  });

  Object.values(insights).forEach((item) => {
    const gradedCount = item.won + item.lost + item.push;
    item.netUnits = Number((item.payoutUnits - item.stakedUnits).toFixed(2));
    item.roi = item.stakedUnits > 0
      ? Number((((item.payoutUnits - item.stakedUnits) / item.stakedUnits) * 100).toFixed(2))
      : 0;
    item.winRate = gradedCount > 0 ? Number((item.won / gradedCount).toFixed(3)) : 0;
    item.lossRate = gradedCount > 0 ? Number((item.lost / gradedCount).toFixed(3)) : 0;
    item.avgOdds = gradedCount > 0 ? Number((item.avgOdds / gradedCount).toFixed(2)) : 0;
    item.recentWon = item.recentResults.filter((entry) => entry.result === 'won').length;
    item.recentLost = item.recentResults.filter((entry) => entry.result === 'lost').length;
    item.lowPerformance = item.resolvedCount >= 1 && item.roi < 0 && item.lost >= item.won;
    item.positivePerformance = item.resolvedCount >= 1 && item.roi > 0 && item.won >= item.lost;
  });

  return insights;
}

function buildTicketTypeInsights(summary = {}) {
  const record = summary.recordByTicketType || {};
  return Object.entries(record).reduce((accumulator, [ticketType, item]) => {
    const totalResolved = safeNumber(item.won) + safeNumber(item.lost) + safeNumber(item.push);
    accumulator[ticketType] = {
      total: safeNumber(item.total),
      won: safeNumber(item.won),
      lost: safeNumber(item.lost),
      push: safeNumber(item.push),
      pending: safeNumber(item.pending),
      void: safeNumber(item.void),
      partial: safeNumber(item.partial),
      totalStake: safeNumber(item.totalStake),
      totalPayout: safeNumber(item.totalPayout),
      netProfit: safeNumber(item.netProfit),
      roi: safeNumber(item.roi),
      winRate: totalResolved > 0 ? Number((safeNumber(item.won) / totalResolved).toFixed(3)) : 0,
      lossRate: totalResolved > 0 ? Number((safeNumber(item.lost) / totalResolved).toFixed(3)) : 0,
      lowPerformance: safeNumber(item.total) > 0 && safeNumber(item.roi) < 0 && safeNumber(item.lost) >= safeNumber(item.won),
      positivePerformance: safeNumber(item.total) > 0 && safeNumber(item.roi) > 0 && safeNumber(item.won) >= safeNumber(item.lost),
    };
    return accumulator;
  }, {});
}

function pushUniqueSignal(targetList, allPatterns, signal) {
  if (!signal || !signal.code) {
    return;
  }

  if (!targetList.some((item) => item.code === signal.code)) {
    targetList.push(signal);
  }

  if (!allPatterns.some((item) => item.code === signal.code)) {
    allPatterns.push(signal);
  }
}

function detectPatterns(summary = {}, tickets = [], marketInsights = {}, ticketTypeInsights = {}) {
  const patterns = [];
  const riskFlags = [];
  const positiveSignals = [];
  const rows = buildLegRows(tickets);
  const h2hInsight = marketInsights.h2h;
  const spreadInsight = marketInsights.spreads;

  if (h2hInsight && h2hInsight.resolvedCount > 0 && h2hInsight.roi < 0 && h2hInsight.recentLost >= 2) {
    pushUniqueSignal(riskFlags, patterns, {
      code: 'ml_negative_recent_losses',
      type: 'risk',
      severity: 'medium',
      title: 'Money Line con perdidas recientes',
      message: 'h2h viene con ROI negativo y varias perdidas recientes; conviene bajar exposicion ML.',
      evidence: {
        market: 'h2h',
        roi: h2hInsight.roi,
        recentLost: h2hInsight.recentLost,
        resolvedCount: h2hInsight.resolvedCount,
      },
    });
  }

  const underdogMlProtectedRows = rows.filter((row) => (
    row.market === 'h2h'
      && row.result === 'lost'
      && Number.isFinite(row.oddsDecimal)
      && row.oddsDecimal >= 2
      && hasProtectedSpreadMention(row.notes)
  ));

  if (underdogMlProtectedRows.length > 0) {
    pushUniqueSignal(positiveSignals, patterns, {
      code: 'prefer_protected_spread_for_competitive_underdogs',
      type: 'positive',
      severity: 'high',
      title: 'Spread +1.5 preferible en underdogs competitivos',
      message: 'El historial sugiere preferir spread +1.5 sobre ML cuando el underdog pierde cerrado.',
      evidence: {
        matches: underdogMlProtectedRows.length,
        sampleNotes: uniqueStrings(underdogMlProtectedRows.map((row) => row.notes)).slice(0, 3),
      },
    });
  }

  if (spreadInsight && h2hInsight && spreadInsight.resolvedCount > 0 && h2hInsight.resolvedCount > 0) {
    const betterRoi = spreadInsight.roi > h2hInsight.roi;
    const fewerLosses = spreadInsight.lossRate < h2hInsight.lossRate;

    if (betterRoi || fewerLosses) {
      pushUniqueSignal(positiveSignals, patterns, {
        code: 'protected_spreads_outperform_ml',
        type: 'positive',
        severity: 'medium',
        title: 'Spreads protegidos con mejor perfil',
        message: 'Spreads muestra mejor rendimiento o menos perdidas que h2h en el historial actual.',
        evidence: {
          spreadsRoi: spreadInsight.roi,
          h2hRoi: h2hInsight.roi,
          spreadsLossRate: spreadInsight.lossRate,
          h2hLossRate: h2hInsight.lossRate,
        },
      });
    }
  }

  Object.values(marketInsights).forEach((market) => {
    if (market.lowPerformance) {
      pushUniqueSignal(riskFlags, patterns, {
        code: `market_low_performance_${market.market}`,
        type: 'risk',
        severity: 'low',
        title: `Mercado flojo: ${market.market}`,
        message: `${market.market} tiene ROI negativo en el historial reciente.`,
        evidence: {
          market: market.market,
          roi: market.roi,
          lost: market.lost,
          won: market.won,
        },
      });
    }

    if (market.positivePerformance) {
      pushUniqueSignal(positiveSignals, patterns, {
        code: `market_positive_performance_${market.market}`,
        type: 'positive',
        severity: 'low',
        title: `Mercado consistente: ${market.market}`,
        message: `${market.market} tiene ROI positivo y mas aciertos que fallas.`,
        evidence: {
          market: market.market,
          roi: market.roi,
          lost: market.lost,
          won: market.won,
        },
      });
    }
  });

  if (ticketTypeInsights.emi && ticketTypeInsights.emi.lowPerformance) {
    pushUniqueSignal(riskFlags, patterns, {
      code: 'ticket_type_emi_low_roi',
      type: 'risk',
      severity: 'low',
      title: 'Estilo Emi con ROI negativo',
      message: 'El historial real de Estilo Emi viene en negativo; conviene controlar el riesgo.',
      evidence: {
        ticketType: 'emi',
        roi: ticketTypeInsights.emi.roi,
        lost: ticketTypeInsights.emi.lost,
        won: ticketTypeInsights.emi.won,
      },
    });
  }

  if (summary.failurePatternCounts?.protected_spread_preferred > 0) {
    pushUniqueSignal(positiveSignals, patterns, {
      code: 'history_failure_pattern_protected_spread_preferred',
      type: 'positive',
      severity: 'medium',
      title: 'Patron historico a favor del spread protegido',
      message: 'El historial ya registra tickets donde el spread protegido habria evitado la perdida del ML.',
      evidence: {
        count: safeNumber(summary.failurePatternCounts.protected_spread_preferred),
      },
    });
  }

  return {
    patterns,
    riskFlags,
    positiveSignals,
  };
}

async function summarizeHistoricalPatterns(options = {}) {
  const summary = options.summary || await mlbTicketHistoryService.summarizeHistoricalTickets();
  const tickets = options.tickets || await mlbTicketHistoryService.loadHistoricalTickets({
    includeGenerated: true,
  });
  const rows = buildLegRows(tickets);
  const marketInsights = buildMarketInsights(rows);
  const ticketTypeInsights = buildTicketTypeInsights(summary);
  const detected = detectPatterns(summary, tickets, marketInsights, ticketTypeInsights);

  const report = {
    totalTickets: safeNumber(summary.totalTickets),
    totalMarkets: Object.keys(marketInsights).length,
    patterns: detected.patterns,
    riskFlags: detected.riskFlags,
    positiveSignals: detected.positiveSignals,
    marketInsights,
    ticketTypeInsights,
  };

  console.log('[outcome-learning] PATTERN_ENGINE', {
    totalTickets: report.totalTickets,
    totalMarkets: report.totalMarkets,
    patterns: report.patterns.length,
    riskFlags: report.riskFlags.length,
    positiveSignals: report.positiveSignals.length,
  });

  return report;
}

module.exports = {
  buildEmptyPatternSnapshot,
  buildPatternSnapshot,
  summarizeHistoricalPatterns,
};
