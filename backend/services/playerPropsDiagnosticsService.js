const dailyTicketService = require('./dailyTicketService');
const oddsService = require('./oddsService');

const TARGET_TIME_ZONE = process.env.DAILY_TICKET_TIME_ZONE || 'America/Mazatlan';
const DEFAULT_LIMIT_EVENTS = 3;
const LOCK_MINUTES_BEFORE_START = Number(process.env.DAILY_TICKET_LOCK_MINUTES_BEFORE_START || 10);
const PROPS_BLOCKED_TIME_LOCK_MESSAGE = 'Player props no disponibles porque el juego ya empezo o esta dentro del limite de bloqueo.';

function getDateKeyInTimeZone(date = new Date(), timeZone = TARGET_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function clampLimitEvents(limitEvents, fallback = DEFAULT_LIMIT_EVENTS) {
  const parsed = Number(limitEvents);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(20, Math.max(1, Math.trunc(parsed)));
}

function logDiagnosticsStage(stage, payload) {
  console.log(`[prop-diagnostics] ${stage}`, payload);
}

function isPlayerPropCandidate(candidate) {
  return candidate?.candidateType === 'player_prop'
    || Boolean(candidate?.playerName)
    || candidate?.lineupRequired === true
    || String(candidate?.market || '').startsWith('batter_')
    || String(candidate?.market || '').startsWith('pitcher_');
}

function buildPropIdentity(prop) {
  if (!prop) {
    return '';
  }

  if (prop.candidateId) {
    return String(prop.candidateId);
  }

  return [
    normalizeKey(prop.eventId || prop.game),
    normalizeKey(prop.market),
    normalizeKey(prop.playerName),
    normalizeKey(prop.side || prop.pick),
    normalizeKey(prop.line || prop.point),
  ].join('|');
}

function createEmptyDiagnostics(targetDate, options = {}) {
  return {
    targetDate,
    useLive: options.useLive === true,
    oddsSource: options.oddsSource || 'unavailable',
    quotaReached: options.quotaReached === true,
    warning: options.warning || '',
    feed: {
      eventsFound: 0,
      eventsWithMarkets: 0,
      eventsWithProps: 0,
      totalPropsFetched: 0,
    },
    pipeline: {
      eligibleRaw: 0,
      afterRosterValidation: 0,
      afterStatusFilter: 0,
      afterTimeFilter: 0,
      afterOddsFilter: 0,
      promptCandidates: 0,
      finalTicketProps: 0,
    },
    propsAvailabilityStatus: '',
    propsAvailabilityMessage: '',
    propsAvailabilityDetails: null,
    humanSummary: {
      status: '',
      title: '',
      message: '',
      recommendation: '',
    },
    markets: {},
    rankings: {
      byFetched: [],
      bySurvivalRate: [],
      byPromptUsage: [],
      byFinalUsage: [],
      byRejected: [],
      topRejectedReasons: [],
    },
    rejectedReasons: {},
    primaryRejectedReasons: {},
    topGames: [],
    topPlayers: [],
    topMarkets: [],
    sampleEligibleProps: [],
    sampleRejectedProps: [],
  };
}

function incrementCounter(target, key, amount = 1) {
  if (!key) {
    return;
  }

  target[key] = (target[key] || 0) + amount;
}

function sortObjectEntries(target, mapper) {
  return Object.entries(target)
    .map(([key, value]) => mapper(key, value))
    .sort((left, right) => {
      const rightMetric = Number(right.metric ?? right.count ?? 0);
      const leftMetric = Number(left.metric ?? left.count ?? 0);
      if (rightMetric !== leftMetric) {
        return rightMetric - leftMetric;
      }

      return String(left.key || left.market || '').localeCompare(String(right.key || right.market || ''));
    });
}

function normalizeRejectedReason(input = {}) {
  const source = String(
    input.reason
      || input.warning
      || input.message
      || input.statusPassReason
      || ''
  ).toLowerCase();

  if (input.rejectedAt === 'status') {
    return 'game_started';
  }

  if (input.rejectedAt === 'time') {
    return 'game_started';
  }

  if (input.rejectedAt === 'odds') {
    return 'odds_filter';
  }

  if (source.includes('does not belong to either team')) {
    return 'player_not_on_roster';
  }

  if (source.includes('could not be verified') || source.includes('team not resolved') || source.includes('team could not be resolved')) {
    return 'team_unresolved';
  }

  if (source.includes('lineup')) {
    return 'lineup_required';
  }

  if (source.includes('same team player prop') || source.includes('duplicate player')) {
    return 'duplicate_player';
  }

  if (source.includes('draftea') || source.includes('market') || source.includes('correlation') || source.includes('one_pick_per_game')) {
    return 'market_rules';
  }

  if (!source) {
    return 'unknown';
  }

  return source
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'unknown';
}

function buildPropSample(prop, rejectedReason = '') {
  return {
    candidateId: prop.candidateId || buildPropIdentity(prop),
    eventId: prop.eventId || '',
    game: prop.game || '',
    player: prop.playerName || '',
    team: prop.candidateTeam || prop.playerTeam || prop.team || null,
    market: prop.market || '',
    pick: prop.pick || '',
    line: prop.line ?? prop.point ?? '',
    startTime: prop.startTime || prop.commenceTime || '',
    odds: Number.isFinite(Number(prop.oddsDecimal)) ? Number(prop.oddsDecimal).toFixed(2) : '',
    decimalOdds: Number.isFinite(Number(prop.oddsDecimal)) ? Number(prop.oddsDecimal) : null,
    eligible: prop.eligibleForTicket === true,
    rejectedReason,
    voidRisk: prop.voidRisk || 'unknown',
    lineupRequired: prop.lineupRequired === true,
    teamResolved: prop.teamResolved === true,
    oddsVerified: prop.oddsVerified === true,
  };
}

function buildLegSample(leg, rejectedReason = '') {
  return {
    candidateId: leg.candidateId || buildPropIdentity(leg),
    eventId: leg.eventId || '',
    game: leg.game || '',
    player: leg.playerName || '',
    team: leg.candidateTeam || leg.team || null,
    market: leg.market || '',
    pick: leg.pick || '',
    line: leg.line ?? leg.point ?? '',
    startTime: leg.startTime || '',
    odds: String(leg.odds || leg.oddsDecimal || ''),
    decimalOdds: Number.isFinite(Number(leg.oddsDecimal)) ? Number(leg.oddsDecimal) : Number.isFinite(Number(leg.odds)) ? Number(leg.odds) : null,
    eligible: true,
    rejectedReason,
    voidRisk: leg.voidRisk || 'unknown',
    lineupRequired: leg.lineupRequired === true,
    teamResolved: leg.teamResolved === true,
    oddsVerified: leg.oddsVerified === true,
  };
}

function extractFinalTicketPropLegs(ticket) {
  const tickets = Array.isArray(ticket?.tickets) ? ticket.tickets : [];
  return tickets.flatMap((item) => (Array.isArray(item?.legs) ? item.legs : []))
    .filter((leg) => (
      String(leg?.candidateId || '').startsWith('pp-')
      || leg?.candidateType === 'player_prop'
      || leg?.lineupRequired === true
      || String(leg?.market || '').startsWith('batter_')
      || String(leg?.market || '').startsWith('pitcher_')
    ));
}

function buildTopCounts(items, keyGetter, valueBuilder, limit = 5) {
  const counts = new Map();

  items.forEach((item) => {
    const key = keyGetter(item);
    if (!key) {
      return;
    }

    const current = counts.get(key) || {
      key,
      count: 0,
      sample: item,
    };
    current.count += 1;
    counts.set(key, current);
  });

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || String(left.key).localeCompare(String(right.key)))
    .slice(0, limit)
    .map((entry) => valueBuilder(entry));
}

function buildMarketRankings(markets) {
  const entries = Object.entries(markets).map(([market, stats]) => ({
    market,
    ...stats,
    survivalRate: stats.fetched > 0 ? Number((stats.afterOddsFilter / stats.fetched).toFixed(3)) : 0,
  }));

  const sortBy = (selector) => [...entries]
    .sort((left, right) => selector(right) - selector(left) || left.market.localeCompare(right.market))
    .slice(0, 5);

  return {
    byFetched: sortBy((entry) => entry.fetched),
    bySurvivalRate: sortBy((entry) => entry.survivalRate),
    byPromptUsage: sortBy((entry) => entry.prompt),
    byFinalUsage: sortBy((entry) => entry.used),
    byRejected: sortBy((entry) => entry.rejected),
    topRejectedReasons: [],
  };
}

function ensureMarket(markets, market) {
  const key = String(market || 'unknown');
  if (!markets[key]) {
    markets[key] = {
      fetched: 0,
      eligible: 0,
      afterOddsFilter: 0,
      prompt: 0,
      used: 0,
      rejected: 0,
      survivalRate: 0,
    };
  }

  return markets[key];
}

function applyMarketCounts(markets, items, field, options = {}) {
  items.forEach((item) => {
    const marketStats = ensureMarket(markets, item.market);
    marketStats[field] += 1;
  });
}

function buildWarningFromError(error, useLive) {
  if (oddsService.isQuotaError?.(error) || error?.code === 'ODDS_API_QUOTA_REACHED') {
    return {
      warning: 'The Odds API quota has been reached. Showing cached data if available.',
      quotaReached: true,
      oddsSource: 'unavailable',
    };
  }

  if (oddsService.isLiveDisabledError?.(error) || error?.code === 'ODDS_API_LIVE_DISABLED') {
    return {
      warning: 'Live The Odds API is disabled. Showing cached data if available.',
      quotaReached: false,
      oddsSource: 'unavailable',
    };
  }

  if (error?.code === 'ODDS_API_CACHE_UNAVAILABLE') {
    return {
      warning: useLive
        ? 'The live props diagnostics request could not be completed.'
        : 'No cached props diagnostics payload is available for this date.',
      quotaReached: false,
      oddsSource: 'unavailable',
    };
  }

  return {
    warning: error?.message || 'Unable to build player props diagnostics.',
    quotaReached: false,
    oddsSource: 'unavailable',
  };
}

function buildPrimaryRejectedReasons(feedRejectedProps = [], pipeline = {}, drafteaRejectedCount = 0) {
  const primary = {};

  feedRejectedProps.forEach((prop) => {
    const reason = normalizeRejectedReason(prop);
    if (reason === 'duplicate_player' || reason === 'market_rules' || reason === 'game_started' || reason === 'odds_filter') {
      return;
    }
    incrementCounter(primary, reason);
  });

  const afterRosterValidation = Number(pipeline.afterRosterValidation || 0);
  const afterStatusFilter = Number(pipeline.afterStatusFilter || 0);
  const afterTimeFilter = Number(pipeline.afterTimeFilter || 0);
  const afterOddsFilter = Number(pipeline.afterOddsFilter || 0);

  const blockedByStatus = Math.max(0, afterRosterValidation - afterStatusFilter);
  const blockedByTime = Math.max(0, afterStatusFilter - afterTimeFilter);
  const blockedByOdds = Math.max(0, afterTimeFilter - afterOddsFilter);

  if (blockedByStatus > 0) {
    incrementCounter(primary, 'game_started', blockedByStatus);
  }

  if (blockedByTime > 0) {
    incrementCounter(primary, 'game_started', blockedByTime);
  }

  if (blockedByOdds > 0) {
    incrementCounter(primary, 'odds_filter', blockedByOdds);
  }

  if (afterOddsFilter > 0 && drafteaRejectedCount > 0) {
    incrementCounter(primary, 'duplicate_player', drafteaRejectedCount);
  }

  return primary;
}

function buildPropsAvailabilitySummary(diagnostics) {
  const totalPropsFetched = Number(diagnostics?.feed?.totalPropsFetched || 0);
  const afterRosterValidation = Number(diagnostics?.pipeline?.afterRosterValidation || 0);
  const afterStatusFilter = Number(diagnostics?.pipeline?.afterStatusFilter || 0);
  const afterTimeFilter = Number(diagnostics?.pipeline?.afterTimeFilter || 0);

  if (totalPropsFetched > 0 && afterRosterValidation > 0 && afterStatusFilter > 0 && afterTimeFilter === 0) {
    return {
      propsAvailabilityStatus: 'blocked_by_time',
      propsAvailabilityMessage: PROPS_BLOCKED_TIME_LOCK_MESSAGE,
      propsAvailabilityDetails: {
        fetchedProps: totalPropsFetched,
        rosterValidatedProps: afterRosterValidation,
        blockedByTime: afterStatusFilter,
        lockMinutesBeforeStart: LOCK_MINUTES_BEFORE_START,
      },
      humanSummary: {
        status: 'blocked_by_time',
        title: 'Props bloqueadas por horario',
        message: 'Se encontraron player props en el feed, pero ninguna puede usarse porque los juegos ya empezaron o estan dentro del limite de bloqueo.',
        recommendation: 'Genera el ticket antes del inicio de los juegos o usa una fecha con partidos futuros.',
      },
    };
  }

  return {
    propsAvailabilityStatus: '',
    propsAvailabilityMessage: '',
    propsAvailabilityDetails: null,
    humanSummary: {
      status: '',
      title: '',
      message: diagnostics?.warning || '',
      recommendation: '',
    },
  };
}

async function loadPropsFeed(targetDate, options) {
  try {
    const payload = await oddsService.getMlbPropsByDateViaEvents(targetDate, {
      forceRefresh: options.useLive === true,
      useCache: true,
      cacheOnly: options.useLive !== true,
      limitEvents: options.limitEvents,
    });

    return { payload, error: null };
  } catch (error) {
    return { payload: null, error };
  }
}

async function loadCandidatePipeline(targetDate, options) {
  try {
    const payload = await dailyTicketService.getBettableCandidatesForDate(targetDate, {
      force: options.useLive === true,
      useCache: true,
      cacheOnly: options.useLive !== true,
      limitPropEvents: options.limitEvents,
    });

    return { payload, error: null };
  } catch (error) {
    return { payload: null, error };
  }
}

function collectSelectionRejectedItems(selectionDiagnostics = {}) {
  const rejections = Array.isArray(selectionDiagnostics?.rejections) ? selectionDiagnostics.rejections : [];
  return rejections.map((item) => ({
    market: item.market || '',
    game: item.game || '',
    playerName: item.playerName || '',
    candidateId: item.candidateId || buildPropIdentity(item),
    rejectedReason: normalizeRejectedReason(item),
    rejectedAt: item.rejectedAt || 'unknown',
    sample: item,
  }));
}

async function getPlayerPropsDiagnostics(options = {}) {
  const targetDate = options.targetDate || getDateKeyInTimeZone(new Date());
  const useLive = options.useLive === true;
  const limitEvents = clampLimitEvents(options.limitEvents);

  const propsFeedResult = await loadPropsFeed(targetDate, {
    useLive,
    limitEvents,
  });

  if (!propsFeedResult.payload) {
    const fallback = buildWarningFromError(propsFeedResult.error, useLive);
    const empty = createEmptyDiagnostics(targetDate, {
      useLive,
      warning: fallback.warning,
      quotaReached: fallback.quotaReached,
      oddsSource: fallback.oddsSource,
    });
    logDiagnosticsStage('FEED', {
      targetDate,
      source: empty.oddsSource,
      warning: empty.warning,
    });
    return empty;
  }

  const feedPayload = propsFeedResult.payload;
  const targetResult = (await loadCandidatePipeline(targetDate, {
    useLive,
    limitEvents,
  })).payload;
  const finalTicket = await dailyTicketService.getTicketByDate(targetDate);

  const rawProps = Array.isArray(feedPayload.allProps) ? feedPayload.allProps : [];
  const afterRosterValidation = Array.isArray(targetResult?.propsPayload?.eligibleProps)
    ? targetResult.propsPayload.eligibleProps
    : Array.isArray(feedPayload.eligibleProps)
      ? feedPayload.eligibleProps
      : [];
  const bettableProps = Array.isArray(targetResult?.bettablePlayerPropCandidates)
    ? targetResult.bettablePlayerPropCandidates
    : [];
  const promptPropCandidates = Array.isArray(targetResult?.promptCandidates)
    ? targetResult.promptCandidates.filter((candidate) => isPlayerPropCandidate(candidate))
    : [];
  const finalTicketProps = extractFinalTicketPropLegs(finalTicket);
  const selectionDiagnostics = targetResult?.playerPropSelectionDiagnostics || {};
  const selectionRejected = collectSelectionRejectedItems(selectionDiagnostics);
  const drafteaRejected = Array.isArray(targetResult?.diagnostics?.drafteaRules?.rejectedSameTeamPlayerProps)
    ? targetResult.diagnostics.drafteaRules.rejectedSameTeamPlayerProps
    : [];

  const diagnostics = createEmptyDiagnostics(targetDate, {
    useLive,
    oddsSource: targetResult?.diagnostics?.oddsSource || feedPayload.source || 'unavailable',
    quotaReached: feedPayload.quotaReached === true,
    warning: targetResult?.diagnostics?.warning || feedPayload.warning || '',
  });

  diagnostics.feed = {
    eventsFound: Number(feedPayload.eventsFound || 0),
    eventsWithMarkets: Array.isArray(feedPayload.marketsByEvent)
      ? feedPayload.marketsByEvent.filter((event) => Array.isArray(event.availableMarkets) && event.availableMarkets.length > 0).length
      : 0,
    eventsWithProps: Array.isArray(feedPayload.marketsByEvent)
      ? feedPayload.marketsByEvent.filter((event) => Array.isArray(event.propMarketsFound) && event.propMarketsFound.length > 0).length
      : 0,
    totalPropsFetched: rawProps.length,
  };

  diagnostics.pipeline = {
    eligibleRaw: rawProps.length,
    afterRosterValidation: afterRosterValidation.length,
    afterStatusFilter: Number(targetResult?.propsPayload?.pipeline?.afterStatusFilter || 0),
    afterTimeFilter: Number(targetResult?.propsPayload?.pipeline?.afterTimeFilter || 0),
    afterOddsFilter: Number(targetResult?.propsPayload?.pipeline?.afterOddsFilter || 0),
    promptCandidates: promptPropCandidates.length,
    finalTicketProps: finalTicketProps.length,
  };

  const markets = {};
  applyMarketCounts(markets, rawProps, 'fetched');
  applyMarketCounts(markets, afterRosterValidation, 'eligible');
  applyMarketCounts(markets, bettableProps, 'afterOddsFilter');
  applyMarketCounts(markets, promptPropCandidates, 'prompt');
  applyMarketCounts(markets, finalTicketProps, 'used');
  applyMarketCounts(
    markets,
    [
      ...Array.isArray(feedPayload.rejectedProps) ? feedPayload.rejectedProps : [],
      ...selectionRejected,
      ...drafteaRejected,
    ],
    'rejected'
  );

  Object.values(markets).forEach((stats) => {
    stats.survivalRate = stats.fetched > 0 ? Number((stats.afterOddsFilter / stats.fetched).toFixed(3)) : 0;
  });

  diagnostics.markets = markets;

  const rejectedReasons = {};
  (Array.isArray(feedPayload.rejectedProps) ? feedPayload.rejectedProps : []).forEach((prop) => {
    incrementCounter(rejectedReasons, normalizeRejectedReason(prop));
  });
  selectionRejected.forEach((item) => {
    incrementCounter(rejectedReasons, item.rejectedReason);
  });
  drafteaRejected.forEach(() => {
    incrementCounter(rejectedReasons, 'duplicate_player');
  });
  diagnostics.rejectedReasons = rejectedReasons;
  diagnostics.primaryRejectedReasons = buildPrimaryRejectedReasons(
    Array.isArray(feedPayload.rejectedProps) ? feedPayload.rejectedProps : [],
    diagnostics.pipeline,
    drafteaRejected.length
  );
  Object.assign(diagnostics, buildPropsAvailabilitySummary(diagnostics));

  diagnostics.topGames = buildTopCounts(
    rawProps,
    (prop) => prop.game,
    (entry) => ({
      game: entry.key,
      props: entry.count,
    })
  );

  diagnostics.topPlayers = buildTopCounts(
    rawProps.filter((prop) => prop.playerName),
    (prop) => prop.playerName,
    (entry) => ({
      player: entry.key,
      props: entry.count,
    })
  );

  diagnostics.topMarkets = Object.entries(markets)
    .map(([market, stats]) => ({
      market,
      ...stats,
    }))
    .sort((left, right) => right.fetched - left.fetched || left.market.localeCompare(right.market))
    .slice(0, 8);

  diagnostics.rankings = buildMarketRankings(markets);
  diagnostics.rankings.topRejectedReasons = sortObjectEntries(diagnostics.primaryRejectedReasons, (key, count) => ({
    key,
    count,
    metric: count,
  })).slice(0, 8);

  diagnostics.sampleEligibleProps = bettableProps.slice(0, 5).map((prop) => buildPropSample(prop));
  diagnostics.sampleRejectedProps = [
    ...(Array.isArray(feedPayload.rejectedProps) ? feedPayload.rejectedProps.map((prop) => ({
      ...buildPropSample(prop, normalizeRejectedReason(prop)),
    })) : []),
    ...selectionRejected.map((item) => ({
      ...buildPropSample(item.sample, item.rejectedReason),
      rejectedAt: item.rejectedAt,
    })),
  ].slice(0, 5);

  logDiagnosticsStage('FEED', {
    targetDate,
    source: diagnostics.oddsSource,
    eventsFound: diagnostics.feed.eventsFound,
    eventsWithProps: diagnostics.feed.eventsWithProps,
    totalPropsFetched: diagnostics.feed.totalPropsFetched,
  });
  logDiagnosticsStage('PIPELINE', {
    targetDate,
    ...diagnostics.pipeline,
  });
  logDiagnosticsStage('MARKETS', {
    targetDate,
    topMarkets: diagnostics.topMarkets.slice(0, 5),
  });
  logDiagnosticsStage('REJECTIONS', {
    targetDate,
    rejectedReasons: diagnostics.rejectedReasons,
    primaryRejectedReasons: diagnostics.primaryRejectedReasons,
  });
  logDiagnosticsStage('PROMPT', {
    targetDate,
    promptCandidates: diagnostics.pipeline.promptCandidates,
    promptPropsCount: promptPropCandidates.length,
  });
  logDiagnosticsStage('FINAL', {
    targetDate,
    finalTicketProps: diagnostics.pipeline.finalTicketProps,
    finalMarkets: finalTicketProps.slice(0, 5).map((leg) => leg.market),
  });

  return diagnostics;
}

async function getPlayerPropsByGame(eventId, options = {}) {
  const targetDate = options.targetDate || getDateKeyInTimeZone(new Date());
  const useLive = options.useLive === true;
  const limitEvents = clampLimitEvents(options.limitEvents, 12);
  const result = await loadPropsFeed(targetDate, {
    useLive,
    limitEvents,
  });

  if (!result.payload) {
    const fallback = buildWarningFromError(result.error, useLive);
    return {
      targetDate,
      eventId,
      game: '',
      startTime: '',
      props: [],
      count: 0,
      warning: fallback.warning,
      oddsSource: fallback.oddsSource,
      quotaReached: fallback.quotaReached,
    };
  }

  const props = (Array.isArray(result.payload.allProps) ? result.payload.allProps : [])
    .filter((prop) => String(prop.eventId || '') === String(eventId || ''));

  return {
    targetDate,
    eventId,
    game: props[0]?.game || '',
    startTime: props[0]?.startTime || '',
    props: props.map((prop) => buildPropSample(prop, prop.eligibleForTicket === true ? '' : normalizeRejectedReason(prop))),
    count: props.length,
    warning: result.payload.warning || '',
    oddsSource: result.payload.source || 'unavailable',
    quotaReached: result.payload.quotaReached === true,
  };
}

async function getPlayerPropsByPlayer(playerName, options = {}) {
  const targetDate = options.targetDate || getDateKeyInTimeZone(new Date());
  const useLive = options.useLive === true;
  const limitEvents = clampLimitEvents(options.limitEvents, 12);
  const result = await loadPropsFeed(targetDate, {
    useLive,
    limitEvents,
  });

  if (!result.payload) {
    const fallback = buildWarningFromError(result.error, useLive);
    return {
      targetDate,
      player: playerName,
      props: [],
      games: [],
      markets: [],
      picks: [],
      count: 0,
      warning: fallback.warning,
      oddsSource: fallback.oddsSource,
      quotaReached: fallback.quotaReached,
    };
  }

  const normalizedPlayer = normalizeKey(playerName);
  const props = (Array.isArray(result.payload.allProps) ? result.payload.allProps : [])
    .filter((prop) => normalizeKey(prop.playerName) === normalizedPlayer);

  return {
    targetDate,
    player: playerName,
    props: props.map((prop) => buildPropSample(prop, prop.eligibleForTicket === true ? '' : normalizeRejectedReason(prop))),
    games: Array.from(new Set(props.map((prop) => prop.game).filter(Boolean))),
    markets: Array.from(new Set(props.map((prop) => prop.market).filter(Boolean))),
    picks: props.map((prop) => prop.pick).filter(Boolean),
    count: props.length,
    warning: result.payload.warning || '',
    oddsSource: result.payload.source || 'unavailable',
    quotaReached: result.payload.quotaReached === true,
  };
}

module.exports = {
  getPlayerPropsByGame,
  getPlayerPropsByPlayer,
  getPlayerPropsDiagnostics,
};
