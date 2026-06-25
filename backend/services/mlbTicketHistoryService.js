'use strict';

const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'mlb-ticket-history.json');
const GENERATED_RESULTS_FILE = path.join(DATA_DIR, 'mlb-generated-ticket-results.json');

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeNullableNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function ensureEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function buildHistoryId(prefix = 'manual') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${stamp}-${randomPart}`;
}

function extractPlayerFromPick(pick = '', market = '') {
  const text = String(pick || '').trim();
  const marketKey = String(market || '').toLowerCase();
  if (!text) {
    return '';
  }

  if (marketKey === 'pitcher_strikeouts' || marketKey.startsWith('batter_')) {
    const overIndex = text.toLowerCase().indexOf(' over ');
    const underIndex = text.toLowerCase().indexOf(' under ');
    const cutIndex = overIndex >= 0 ? overIndex : underIndex;
    if (cutIndex > 0) {
      return text.slice(0, cutIndex).trim();
    }
  }

  return '';
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function ensureDataFile(filePath) {
  await ensureDataDir();
  try {
    await fs.access(filePath);
  } catch (error) {
    await fs.writeFile(filePath, '[]\n', 'utf8');
  }
}

async function readArrayFile(filePath) {
  await ensureDataFile(filePath);
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function writeArrayFile(filePath, items) {
  await ensureDataFile(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(Array.isArray(items) ? items : [], null, 2)}\n`, 'utf8');
}

function normalizeHistoricalLeg(rawLeg = {}) {
  return {
    game: String(rawLeg.game || '').trim(),
    team: String(rawLeg.team || rawLeg.candidateTeam || '').trim(),
    player: String(rawLeg.player || rawLeg.playerName || '').trim(),
    market: String(rawLeg.market || '').trim(),
    marketCategory: String(rawLeg.marketCategory || '').trim(),
    pick: String(rawLeg.pick || '').trim(),
    odds: String(rawLeg.odds || '').trim(),
    result: ensureEnum(rawLeg.result, ['won', 'lost', 'void', 'pending'], 'pending'),
    lostByMargin: safeNullableNumber(rawLeg.lostByMargin),
    wouldProtectedSpreadHaveWon: rawLeg.wouldProtectedSpreadHaveWon === true,
    lineupIssue: rawLeg.lineupIssue === true,
    notes: String(rawLeg.notes || '').trim(),
  };
}

function inferTicketTypeFromTickets(rawTicket = {}) {
  if (rawTicket.ticketType) {
    return ensureEnum(rawTicket.ticketType, ['safe', 'emi', 'free_bet', 'unknown'], 'unknown');
  }

  if (Array.isArray(rawTicket.tickets) && rawTicket.tickets.length === 1) {
    return ensureEnum(rawTicket.tickets[0]?.type, ['safe', 'emi', 'free_bet', 'unknown'], 'unknown');
  }

  return 'unknown';
}

function normalizeHistoricalTicket(rawTicket = {}, options = {}) {
  const source = ensureEnum(rawTicket.source || options.sourceHint, ['manual', 'generated', 'draftea_screenshot'], 'manual');
  const ticketType = inferTicketTypeFromTickets(rawTicket);
  const legs = Array.isArray(rawTicket.legs)
    ? rawTicket.legs.map(normalizeHistoricalLeg)
    : Array.isArray(rawTicket.tickets)
      ? rawTicket.tickets.flatMap((ticketItem) => (Array.isArray(ticketItem?.legs) ? ticketItem.legs.map((leg) => normalizeHistoricalLeg(leg)) : []))
      : [];

  return {
    id: String(rawTicket.id || buildHistoryId(source)).trim(),
    source,
    date: safeDate(rawTicket.date),
    sport: 'mlb',
    ticketType,
    stake: safeNumber(rawTicket.stake, 0),
    potentialPayout: safeNumber(rawTicket.potentialPayout, 0),
    odds: String(rawTicket.odds || '').trim(),
    status: ensureEnum(rawTicket.status, ['won', 'lost', 'pending', 'void', 'partial'], 'pending'),
    legs,
    lessons: uniqueStrings(rawTicket.lessons),
    tags: uniqueStrings(rawTicket.tags),
  };
}

function getSingleLostLeg(ticket) {
  const legs = Array.isArray(ticket?.legs) ? ticket.legs : [];
  const lostLegs = legs.filter((leg) => leg.result === 'lost');
  return lostLegs.length === 1 ? lostLegs[0] : null;
}

function classifyTicketPattern(ticket = {}) {
  const patterns = new Set();
  const legs = Array.isArray(ticket.legs) ? ticket.legs : [];
  const singleLostLeg = getSingleLostLeg(ticket);

  legs.forEach((leg) => {
    const market = String(leg.market || '').toLowerCase();
    const category = String(leg.marketCategory || '').toLowerCase();
    const odds = safeNumber(leg.odds, NaN);
    const pickText = String(leg.pick || '').toLowerCase();
    const notesKey = normalizeKey(leg.notes);

    if (market === 'h2h' && leg.result === 'lost' && leg.lostByMargin === 1) {
      patterns.add('ml_one_run_loss_risk');
    }

    if (market === 'h2h' && leg.wouldProtectedSpreadHaveWon === true) {
      patterns.add('protected_spread_preferred');
    }

    if (leg.lineupIssue === true) {
      patterns.add('player_prop_requires_lineup_confirmation');
    }

    if (market === 'spreads' && (pickText.includes('-1.5') || pickText.includes('- 1.5')) && leg.result === 'lost') {
      patterns.add('high_risk_minus_one_half_spread');
    }

    if (category === 'player_hrr' || market === 'batter_home_runs') {
      patterns.add('home_run_market_high_volatility');
    }

    if (market === 'h2h' && Number.isFinite(odds) && odds > 0 && odds <= 1.6 && leg.result === 'lost') {
      patterns.add('low_value_favorite_ml');
    }

    if ((market === 'totals' || category === 'total') && (notesKey.includes('sincontexto') || notesKey.includes('limitedoffensivecontext'))) {
      patterns.add('totals_with_limited_context');
    }
  });

  if (ticket.status === 'lost' && legs.length >= 4 && singleLostLeg) {
    patterns.add('long_parlay_one_leg_loss');
  }

  return Array.from(patterns);
}

function summarizeByTicketType(tickets = []) {
  return tickets.reduce((accumulator, ticket) => {
    const key = ensureEnum(ticket.ticketType, ['safe', 'emi', 'free_bet', 'unknown'], 'unknown');
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function getMarketPerformanceSummary(tickets = []) {
  const summary = {};

  tickets.forEach((ticket) => {
    (Array.isArray(ticket.legs) ? ticket.legs : []).forEach((leg) => {
      const key = leg.marketCategory || leg.market || 'unknown';
      if (!summary[key]) {
        summary[key] = {
          count: 0,
          won: 0,
          lost: 0,
          pending: 0,
          void: 0,
        };
      }

      summary[key].count += 1;
      if (summary[key][leg.result] !== undefined) {
        summary[key][leg.result] += 1;
      } else {
        summary[key].pending += 1;
      }
    });
  });

  return summary;
}

function getTeamExposureSummary(tickets = []) {
  const summary = new Map();

  tickets.forEach((ticket) => {
    (Array.isArray(ticket.legs) ? ticket.legs : []).forEach((leg) => {
      const team = String(leg.team || '').trim();
      if (!team) {
        return;
      }

      const current = summary.get(team) || {
        team,
        legs: 0,
        lostLegs: 0,
        wonLegs: 0,
      };
      current.legs += 1;
      if (leg.result === 'lost') {
        current.lostLegs += 1;
      }
      if (leg.result === 'won') {
        current.wonLegs += 1;
      }
      summary.set(team, current);
    });
  });

  return Array.from(summary.values())
    .map((item) => ({
      ...item,
      lossRate: item.legs > 0 ? Number((item.lostLegs / item.legs).toFixed(3)) : 0,
    }))
    .sort((left, right) => right.legs - left.legs)
    .slice(0, 15);
}

function getPlayerPropExposureSummary(tickets = []) {
  const summary = new Map();

  tickets.forEach((ticket) => {
    (Array.isArray(ticket.legs) ? ticket.legs : []).forEach((leg) => {
      const player = String(leg.player || '').trim();
      if (!player) {
        return;
      }

      const current = summary.get(player) || {
        player,
        marketCategories: new Set(),
        legs: 0,
        lostLegs: 0,
        lineupIssues: 0,
      };
      current.legs += 1;
      current.marketCategories.add(leg.marketCategory || leg.market || 'unknown');
      if (leg.result === 'lost') {
        current.lostLegs += 1;
      }
      if (leg.lineupIssue === true) {
        current.lineupIssues += 1;
      }
      summary.set(player, current);
    });
  });

  return Array.from(summary.values())
    .map((item) => ({
      player: item.player,
      marketCategories: Array.from(item.marketCategories),
      legs: item.legs,
      lostLegs: item.lostLegs,
      lineupIssues: item.lineupIssues,
      lossRate: item.legs > 0 ? Number((item.lostLegs / item.legs).toFixed(3)) : 0,
    }))
    .sort((left, right) => right.legs - left.legs)
    .slice(0, 15);
}

function getCommonFailurePatterns(tickets = []) {
  const counts = {};

  tickets.forEach((ticket) => {
    classifyTicketPattern(ticket).forEach((pattern) => {
      counts[pattern] = (counts[pattern] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .map(([pattern, count]) => ({
      pattern,
      count,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);
}

async function loadHistoricalTickets(options = {}) {
  const {
    includeGenerated = true,
    manualOnly = false,
  } = options;

  const manualTickets = (await readArrayFile(HISTORY_FILE)).map((ticket) => normalizeHistoricalTicket(ticket, {
    sourceHint: 'manual',
  }));

  if (manualOnly || !includeGenerated) {
    return manualTickets.sort((left, right) => right.date.localeCompare(left.date));
  }

  const generatedTickets = (await readArrayFile(GENERATED_RESULTS_FILE)).flatMap((ticket) => {
    const ticketItems = Array.isArray(ticket?.tickets) ? ticket.tickets : [];
    if (!ticketItems.length) {
      return [normalizeHistoricalTicket({
        id: ticket.id,
        source: ticket.source || 'generated',
        date: ticket.date,
        sport: 'mlb',
        ticketType: 'unknown',
        stake: 0,
        potentialPayout: 0,
        odds: '',
        status: ticket.status || 'pending',
        legs: [],
        lessons: [],
        tags: [],
      }, {
        sourceHint: 'generated',
      })];
    }

    return ticketItems.map((ticketItem) => normalizeHistoricalTicket({
      id: `${ticket.id}-${ticketItem?.type || 'unknown'}`,
      source: ticket.source || 'generated',
      date: ticket.date,
      sport: 'mlb',
      ticketType: ticketItem?.type || 'unknown',
      stake: 0,
      potentialPayout: 0,
      odds: ticketItem?.odds || '',
      status: ticket.status || 'pending',
      legs: Array.isArray(ticketItem?.legs) ? ticketItem.legs.map((leg) => ({
        game: leg.game,
        team: leg.candidateTeam || leg.team || '',
        player: leg.player || '',
        market: leg.market,
        marketCategory: leg.marketCategory || '',
        pick: leg.pick,
        odds: leg.odds || '',
        result: leg.result || 'pending',
        lostByMargin: null,
        wouldProtectedSpreadHaveWon: false,
        lineupIssue: false,
        notes: '',
      })) : [],
      lessons: [],
      tags: [],
    }, {
      sourceHint: 'generated',
    }));
  });

  return [...manualTickets, ...generatedTickets]
    .sort((left, right) => right.date.localeCompare(left.date));
}

async function saveHistoricalTicket(ticket) {
  const items = await readArrayFile(HISTORY_FILE);
  const normalized = normalizeHistoricalTicket(ticket, {
    sourceHint: 'manual',
  });
  const nextItems = items.filter((item) => String(item?.id || '') !== normalized.id);
  nextItems.push(normalized);
  await writeArrayFile(HISTORY_FILE, nextItems);
  return normalized;
}

function buildGeneratedHistoryRecord(ticket) {
  const date = safeDate(ticket?.date);
  const id = `generated-${date}`;
  return {
    id,
    date,
    status: ensureEnum(ticket?.status, ['won', 'lost', 'pending', 'void', 'partial'], 'pending'),
    source: 'generated',
    ticketMeta: {
      targetDate: ticket?.targetDate || date,
      source: ticket?.meta?.source || 'generated',
      promptCandidateCount: safeNumber(ticket?.meta?.promptCandidateCount, 0),
      promptPropsCount: safeNumber(ticket?.meta?.promptPropsCount, 0),
      finalPropsUsed: safeNumber(ticket?.meta?.finalPropsUsed, 0),
      avgTicketConfidence: safeNumber(ticket?.meta?.avgTicketConfidence, 0),
      lowestLegConfidence: safeNumber(ticket?.meta?.lowestLegConfidence, 0),
      historicalLearningEnabled: ticket?.meta?.historicalLearningEnabled === true,
      historicalPatternsApplied: safeNumber(ticket?.meta?.historicalPatternsApplied, 0),
      historicalRiskFlags: uniqueStrings(ticket?.meta?.historicalRiskFlags),
    },
    tickets: Array.isArray(ticket?.tickets) ? ticket.tickets.map((ticketItem) => ({
      type: ensureEnum(ticketItem?.type, ['safe', 'emi', 'free_bet', 'unknown'], 'unknown'),
      available: ticketItem?.available !== false,
      warnings: uniqueStrings(ticketItem?.warnings),
      legs: Array.isArray(ticketItem?.legs) ? ticketItem.legs.map((leg) => ({
        candidateId: String(leg?.candidateId || '').trim(),
        game: String(leg?.game || '').trim(),
        team: String(leg?.candidateTeam || leg?.team || '').trim(),
        player: String(leg?.player || leg?.playerName || '').trim() || extractPlayerFromPick(leg?.pick, leg?.market),
        market: String(leg?.market || '').trim(),
        marketCategory: String(leg?.marketCategory || '').trim(),
        pick: String(leg?.pick || '').trim(),
        odds: String(leg?.odds || '').trim(),
        result: ensureEnum(leg?.result, ['won', 'lost', 'void', 'pending'], 'pending'),
      })) : [],
    })) : [],
  };
}

async function saveGeneratedTicketResult(ticket) {
  const items = await readArrayFile(GENERATED_RESULTS_FILE);
  const record = buildGeneratedHistoryRecord(ticket);
  const nextItems = items.filter((item) => String(item?.id || '') !== record.id);
  nextItems.push(record);
  await writeArrayFile(GENERATED_RESULTS_FILE, nextItems);
  return record;
}

async function listHistoricalTickets(options = {}) {
  return loadHistoricalTickets(options);
}

async function summarizeHistoricalTickets() {
  const tickets = await loadHistoricalTickets({
    includeGenerated: true,
  });
  const totalTickets = tickets.length;
  const won = tickets.filter((ticket) => ticket.status === 'won').length;
  const lost = tickets.filter((ticket) => ticket.status === 'lost').length;
  const pending = tickets.filter((ticket) => ticket.status === 'pending').length;
  const byTicketType = summarizeByTicketType(tickets);
  const byMarketCategory = getMarketPerformanceSummary(tickets);
  const commonFailurePatterns = getCommonFailurePatterns(tickets);
  const teamExposure = getTeamExposureSummary(tickets);
  const playerPropExposure = getPlayerPropExposureSummary(tickets);

  const summary = {
    totalTickets,
    won,
    lost,
    pending,
    byTicketType,
    byMarketCategory,
    commonFailurePatterns,
    teamExposure,
    playerPropExposure,
    learningEnabled: true,
    failurePatternCounts: commonFailurePatterns.reduce((accumulator, item) => {
      accumulator[item.pattern] = item.count;
      return accumulator;
    }, {}),
    teamExposureMap: teamExposure.reduce((accumulator, item) => {
      accumulator[normalizeKey(item.team)] = item;
      return accumulator;
    }, {}),
    playerPropExposureMap: playerPropExposure.reduce((accumulator, item) => {
      accumulator[normalizeKey(item.player)] = item;
      return accumulator;
    }, {}),
  };

  console.log('[outcome-learning] HISTORY_SUMMARY', {
    totalTickets: summary.totalTickets,
    lost: summary.lost,
    patterns: summary.commonFailurePatterns.length,
  });

  return summary;
}

module.exports = {
  GENERATED_RESULTS_FILE,
  HISTORY_FILE,
  classifyTicketPattern,
  getCommonFailurePatterns,
  getMarketPerformanceSummary,
  getPlayerPropExposureSummary,
  getTeamExposureSummary,
  listHistoricalTickets,
  loadHistoricalTickets,
  normalizeHistoricalTicket,
  saveGeneratedTicketResult,
  saveHistoricalTicket,
  summarizeHistoricalTickets,
};
