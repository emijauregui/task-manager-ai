/**
 * HistoryView.jsx
 * Phase: React Migration v5.1 - History Summary Read Only
 */
import { useEffect, useMemo, useState } from 'react';
import HistorySlipCard from '../components/HistorySlipCard';
import SharedMetricCard from '../components/MetricCard';
import SettlementBreakdown from '../components/SettlementBreakdown';
import ViewState from '../components/ViewState';
import WarningBanner from '../components/WarningBanner';
import { getHistorySummary } from '../services/api';
import { asArray, firstValue, getNumber, getText, isObject, objectEntries } from '../services/dataUtils';

const TICKET_NAME_BY_TYPE = {
  emi: 'Estilo Emi',
  free: 'Free Bet',
  free_bet: 'Free Bet',
  freebet: 'Free Bet',
  safe: 'Ticket Seguro',
  h2h: 'H2H',
  spreads: 'Spreads',
};

const PATTERN_TITLE_BY_KEY = {
  emi: 'Estilo Emi',
  free_bet: 'Free Bet',
  freebet: 'Free Bet',
  free: 'Free Bet',
  h2h: 'H2H',
  safe: 'Ticket Seguro',
  spreads: 'Spreads',
};

const PATTERN_METRIC_LABEL_BY_KEY = {
  count: 'Count',
  lost: 'Lost',
  losses: 'Lost',
  netProfit: 'Net Profit',
  older: 'Older',
  partial: 'Partial',
  payout: 'Payout',
  pending: 'Pending',
  push: 'Push',
  roi: 'ROI',
  special: 'Special',
  stake: 'Stake',
  total: 'Total',
  totalPayout: 'Payout',
  totalStake: 'Stake',
  void: 'Void',
  voids: 'Void',
  won: 'Won',
  wins: 'Won',
};

const PRIMARY_PATTERN_METRICS = new Set([
  'count',
  'lost',
  'losses',
  'netprofit',
  'pending',
  'roi',
  'total',
  'void',
  'voids',
  'won',
  'wins',
]);

function formatNumber(value, fallback = 'n/d') {
  const numeric = getNumber(value);
  if (numeric === null) return fallback;

  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
  }).format(numeric);
}

function formatMoney(value) {
  const numeric = getNumber(value);
  if (numeric === null) return 'Pendiente';

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatPercent(value) {
  const numeric = getNumber(value);
  if (numeric === null) return 'Pendiente';
  return `${formatNumber(numeric)}%`;
}

function getWinRate(won, lost) {
  const winCount = getNumber(won);
  const lossCount = getNumber(lost);
  if (winCount === null || lossCount === null || winCount + lossCount <= 0) {
    return null;
  }

  return (winCount / (winCount + lossCount)) * 100;
}

function formatRecord({ won, lost, push, void: voided, pending }) {
  const values = [
    ['W', won],
    ['L', lost],
    ['P', push],
    ['V', voided],
    ['Live', pending],
  ]
    .map(([label, value]) => [label, getNumber(value)])
    .filter(([, value]) => value !== null)
    .map(([label, value]) => (label === 'Live' ? `${label} ${value}` : `${label}${value}`));

  return values.length ? values.join(' / ') : 'Record n/d';
}

function getProfitTone(value) {
  const numeric = getNumber(value);
  if (numeric === null) return 'neutral';
  if (numeric > 0) return 'positive';
  if (numeric < 0) return 'negative';
  return 'flat';
}

function clampPercent(value) {
  const numeric = getNumber(value);
  if (numeric === null) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function getStatusDistribution(derived) {
  return [
    { key: 'won', label: 'Win', value: derived.won, tone: 'positive' },
    { key: 'lost', label: 'Loss', value: derived.lost, tone: 'negative' },
    { key: 'pending', label: 'Pending', value: derived.pending, tone: 'pending' },
    { key: 'void', label: 'Void/refund', value: derived.void, tone: 'void' },
  ].map((entry) => ({
    ...entry,
    numeric: getNumber(entry.value) || 0,
  }));
}

function getStatusTotal(entries) {
  return entries.reduce((total, entry) => total + entry.numeric, 0);
}

function getTicketTypeKey(ticket) {
  return String(ticket?.type || ticket?.ticketType || ticket?.key || '').toLowerCase();
}

function getComparableTicketTypes(ticketTypeSummaries) {
  const desiredOrder = [
    { key: 'safe', label: 'Ticket Seguro' },
    { key: 'emi', label: 'Estilo Emi' },
    { key: 'free_bet', label: 'Free Bet' },
  ];
  const lookup = new Map(
    asArray(ticketTypeSummaries).map((ticket) => [getTicketTypeKey(ticket), ticket])
  );

  const normalized = desiredOrder.map((slot) => {
    const ticket =
      lookup.get(slot.key) ||
      (slot.key === 'free_bet' ? lookup.get('free') || lookup.get('freebet') : null);
    const roi = getNumber(ticket?.roi, ticket?.ROI);
    const netProfit = getNumber(ticket?.netProfit, ticket?.profit, ticket?.net);
    const total = getNumber(ticket?.total, ticket?.count, ticket?.totalTickets);
    const won = getNumber(ticket?.won, ticket?.wins);
    const lost = getNumber(ticket?.lost, ticket?.losses);
    const voided = getNumber(ticket?.void, ticket?.voids);
    const pending = getNumber(ticket?.pending);
    const score =
      roi !== null
        ? clampPercent(50 + roi)
        : netProfit !== null
          ? clampPercent(50 + netProfit / 10)
          : total
            ? 34
            : 0;

    return {
      key: slot.key,
      label: ticket?.typeLabel || ticket?.label || slot.label,
      roi,
      netProfit,
      total,
      record: formatRecord({ won, lost, push: null, void: voided, pending }),
      score,
      hasData: Boolean(ticket),
      tone: getProfitTone(netProfit ?? roi),
    };
  });

  const extras = asArray(ticketTypeSummaries)
    .filter((ticket) => !['safe', 'emi', 'free', 'free_bet', 'freebet'].includes(getTicketTypeKey(ticket)))
    .slice(0, 2)
    .map((ticket) => {
      const roi = getNumber(ticket?.roi, ticket?.ROI);
      const netProfit = getNumber(ticket?.netProfit, ticket?.profit, ticket?.net);
      return {
        key: getTicketTypeKey(ticket) || ticket?.typeLabel || 'extra',
        label: ticket?.typeLabel || ticket?.label || getPatternTitle(getTicketTypeKey(ticket)),
        roi,
        netProfit,
        total: getNumber(ticket?.total, ticket?.count, ticket?.totalTickets),
        record: formatRecord({
          won: ticket?.won ?? ticket?.wins,
          lost: ticket?.lost ?? ticket?.losses,
          push: null,
          void: ticket?.void ?? ticket?.voids,
          pending: ticket?.pending,
        }),
        score: roi !== null ? clampPercent(50 + roi) : 34,
        hasData: true,
        tone: getProfitTone(netProfit ?? roi),
      };
    });

  return [...normalized, ...extras];
}

function getTicketStatusMeta(ticket) {
  const rawStatus = getText(ticket?.status, ticket?.result, ticket?.computedResult, ticket?.settlementType);
  const normalized = rawStatus.toLowerCase();
  const netProfit = getNumber(ticket?.netProfit, ticket?.profit, ticket?.net);
  const voided = getNumber(ticket?.void, ticket?.voids);
  const pending = getNumber(ticket?.pending);

  if (normalized.includes('won') || normalized.includes('win') || normalized.includes('gan')) {
    return { tone: 'positive', label: 'Win' };
  }
  if (normalized.includes('lost') || normalized.includes('loss') || normalized.includes('perd')) {
    return { tone: 'negative', label: 'Loss' };
  }
  if (normalized.includes('void') || normalized.includes('refund') || normalized.includes('push') || (voided !== null && voided > 0)) {
    return { tone: 'void', label: 'Void' };
  }
  if (normalized.includes('pending') || (pending !== null && pending > 0)) {
    return { tone: 'pending', label: 'Pending' };
  }
  if (netProfit !== null && netProfit > 0) return { tone: 'positive', label: 'Positive' };
  if (netProfit !== null && netProfit < 0) return { tone: 'negative', label: 'Negative' };

  return { tone: 'neutral', label: rawStatus || 'n/d' };
}

function getTicketTypeLabel(ticket) {
  const type = getTicketTypeKey(ticket);
  return getText(ticket?.typeLabel, ticket?.label, ticket?.name, ticket?.title, TICKET_NAME_BY_TYPE[type], 'Archive slip');
}

function getTicketLegs(ticket) {
  const directLegs = asArray(ticket?.legs);
  if (directLegs.length) return directLegs;
  return asArray(ticket?.tickets).flatMap((item) => asArray(item?.legs));
}

function getTicketLegLabel(leg, index) {
  return getText(leg?.pick, leg?.selection, leg?.market, leg?.game, leg?.team, `Leg ${index + 1}`);
}

function getProfitSeries(derived) {
  const ordered = asArray(derived.recentTickets).slice().reverse();
  const points = [{ label: 'Start', value: 0 }];
  let running = 0;

  ordered.forEach((ticket, index) => {
    const net = getNumber(ticket?.netProfit, ticket?.profit, ticket?.net);
    if (net === null) return;
    running += net;
    points.push({
      label: getText(ticket?.date, ticket?.ticketDate, ticket?.createdAt, ticket?.generatedAt, `Slip ${index + 1}`),
      value: running,
    });
  });

  if (points.length > 1) {
    return points.slice(-8);
  }

  if (derived.netProfit !== null) {
    return [
      { label: 'Start', value: 0 },
      { label: 'Actual', value: derived.netProfit },
    ];
  }

  return [];
}

function getCurveModel(series) {
  const width = 760;
  const height = 230;
  const padX = 28;
  const padY = 28;
  const values = series.map((point) => point.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const range = maxValue - minValue || 1;
  const step = series.length > 1 ? (width - padX * 2) / (series.length - 1) : 0;
  const yFor = (value) => padY + (1 - (value - minValue) / range) * (height - padY * 2);
  const coords = series.map((point, index) => ({
    ...point,
    x: padX + step * index,
    y: yFor(point.value),
  }));
  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const baseY = height - padY;
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseY} L ${coords[0].x.toFixed(1)} ${baseY} Z`
    : '';
  const zeroY = yFor(0);

  return {
    width,
    height,
    coords,
    linePath,
    areaPath,
    zeroY,
    minValue,
    maxValue,
  };
}

function humanizeKey(value) {
  const key = String(value || '').trim();
  if (!key) return 'Metric';

  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPatternTitle(key) {
  const normalized = String(key || '').trim();
  const lookupKey = normalized.toLowerCase();
  return PATTERN_TITLE_BY_KEY[lookupKey] || humanizeKey(normalized);
}

function getPatternMetricLabel(key) {
  const normalized = String(key || '').trim();
  return PATTERN_METRIC_LABEL_BY_KEY[normalized] || PATTERN_METRIC_LABEL_BY_KEY[normalized.toLowerCase()] || humanizeKey(normalized);
}

function formatPatternMetricValue(key, value) {
  if (value === null || value === undefined || value === '') {
    return 'n/d';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  const normalizedKey = String(key || '').toLowerCase();
  if (normalizedKey.includes('stake') || normalizedKey.includes('payout') || normalizedKey.includes('profit')) {
    return formatMoney(value);
  }

  if (normalizedKey === 'roi' || normalizedKey.includes('percent')) {
    return formatPercent(value);
  }

  const numeric = getNumber(value);
  if (numeric !== null) {
    return formatNumber(numeric);
  }

  return String(value);
}

function normalizePatternMetric(key, value, index = 0) {
  if (Array.isArray(value)) {
    return {
      key: `${key}-${index}`,
      rawKey: String(key || ''),
      label: getPatternMetricLabel(key),
      value: `${value.length} items`,
      children: value.slice(0, 8).map((item, childIndex) => {
        if (isObject(item)) {
          return {
            key: `${key}-${childIndex}`,
            rawKey: String(item.key || item.type || item.label || ''),
            label: getPatternTitle(item.label || item.key || item.type || `Item ${childIndex + 1}`),
            value: '',
            children: objectEntries(item, 8)
              .filter(([childKey]) => !['key', 'label', 'type', 'title', 'name'].includes(String(childKey)))
              .map(([childKey, childValue], nestedIndex) => normalizePatternMetric(childKey, childValue, nestedIndex)),
          };
        }

        return {
          key: `${key}-${childIndex}`,
          rawKey: String(key || ''),
          label: `Item ${childIndex + 1}`,
          value: formatPatternMetricValue(key, item),
          children: [],
        };
      }),
    };
  }

  if (isObject(value)) {
    return {
      key: `${key}-${index}`,
      rawKey: String(key || ''),
      label: getPatternMetricLabel(key),
      value: '',
      children: objectEntries(value, 10).map(([childKey, childValue], childIndex) =>
        normalizePatternMetric(childKey, childValue, childIndex)
      ),
    };
  }

  return {
    key: `${key}-${index}`,
    rawKey: String(key || ''),
    label: getPatternMetricLabel(key),
    value: formatPatternMetricValue(key, value),
    children: [],
  };
}

function formatDate(value) {
  if (!value) return 'Sin fecha';

  const parsed = new Date(String(value).includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function hasUsefulData(summary) {
  if (!isObject(summary)) return false;

  return Boolean(
    getNumber(summary.totalTickets, summary.totalPicks, summary.won, summary.lost, summary.pending) !== null ||
      asArray(summary.recentTickets).length ||
      asArray(summary.history).length ||
      asArray(summary.tickets).length ||
      isObject(summary.settlementBreakdown) ||
      isObject(summary.commonFailurePatterns) ||
      asArray(summary.warnings).length
  );
}

function getRecentTickets(summary) {
  const candidates = [
    summary?.recentTickets,
    summary?.recent,
    summary?.history,
    summary?.tickets,
    summary?.slips,
    summary?.items,
  ];

  return candidates
    .flatMap((value) => asArray(value))
    .filter((item) => isObject(item))
    .slice(0, 6);
}

function normalizeWarnings(summary) {
  return [
    ...asArray(summary?.warnings),
    ...asArray(summary?.notes),
    ...asArray(summary?.alerts),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

function normalizePatterns(summary) {
  const patternObjects = [
    summary?.patterns,
    summary?.commonFailurePatterns,
    summary?.failurePatternCounts,
    summary?.recordByTicketType,
    summary?.recordByMarket,
    summary?.byTicketType,
    summary?.byMarketCategory,
  ];

  const directPatterns = [
    ...asArray(summary?.patternSummary),
    ...asArray(summary?.patternHighlights),
  ];

  const fromObjects = patternObjects.flatMap((item) =>
    objectEntries(item).map(([key, value]) => ({
      id: `pattern-${key}`,
      label: getPatternTitle(key),
      value: Array.isArray(value) || isObject(value) ? '' : formatPatternMetricValue(key, value),
      metrics: Array.isArray(value)
        ? value.slice(0, 8).map((entry, index) => normalizePatternMetric(`${key}_${index + 1}`, entry, index))
        : isObject(value)
          ? objectEntries(value, 12).map(([metricKey, metricValue], index) => normalizePatternMetric(metricKey, metricValue, index))
          : [],
    }))
  );

  return [
    ...directPatterns.map((item, index) => {
      const value = isObject(item) || Array.isArray(item) ? '' : formatPatternMetricValue(`pattern_${index + 1}`, item);
      return {
        id: `direct-pattern-${index + 1}`,
      label: `Pattern ${index + 1}`,
        value,
        metrics: isObject(item)
          ? objectEntries(item, 12).map(([metricKey, metricValue], metricIndex) => normalizePatternMetric(metricKey, metricValue, metricIndex))
          : Array.isArray(item)
            ? item.slice(0, 8).map((metricValue, metricIndex) => normalizePatternMetric(`item_${metricIndex + 1}`, metricValue, metricIndex))
            : [],
      };
    }),
    ...fromObjects,
  ].slice(0, 6);
}

function normalizeTicketTypeSummaries(summary) {
  const source =
    firstValue(summary, ['recordByTicketType', 'byTicketType', ['metrics', 'recordByTicketType']]) || {};

  return objectEntries(source, 6).map(([type, value]) => ({
    ...(isObject(value) ? value : { total: value }),
    key: type,
    type,
    typeLabel: TICKET_NAME_BY_TYPE[String(type).toLowerCase()] || String(type).replace(/[_-]/g, ' '),
  }));
}

function getDerivedSummary(summary) {
  const recentTickets = getRecentTickets(summary);
  const totalTickets = getNumber(
    firstValue(summary, ['totalTickets', 'ticketCount', ['metrics', 'totalTickets']]),
    recentTickets.length
  );
  const totalPicks = getNumber(
    firstValue(summary, ['totalPicks', 'totalLegs', 'pickCount', ['metrics', 'totalPicks']])
  );
  const won = getNumber(summary?.won, summary?.wins, summary?.win);
  const lost = getNumber(summary?.lost, summary?.losses, summary?.loss);
  const push = getNumber(summary?.push, summary?.pushes);
  const voided = getNumber(summary?.void, summary?.voids);
  const pending = getNumber(summary?.pending);
  const partial = getNumber(summary?.partial);
  const roi = getNumber(summary?.roi, summary?.ROI, summary?.returnOnInvestment);
  const netProfit = getNumber(summary?.netProfit, summary?.profit, summary?.net);
  const totalStake = getNumber(summary?.totalStake, summary?.stake);
  const totalPayout = getNumber(summary?.totalPayout, summary?.payout);

  return {
    totalTickets,
    totalPicks,
    won,
    lost,
    push,
    void: voided,
    pending,
    partial,
    roi,
    netProfit,
    totalStake,
    totalPayout,
    winRate: getWinRate(won, lost),
    recordLabel: formatRecord({ won, lost, push, void: voided, pending }),
    recentTickets,
    ticketTypeSummaries: normalizeTicketTypeSummaries(summary),
    settlementBreakdown: firstValue(summary, ['settlementBreakdown', ['metrics', 'settlementBreakdown']]),
    patterns: normalizePatterns(summary),
    warnings: normalizeWarnings(summary),
    dateRange: {
      from: getText(summary?.from, summary?.startDate, summary?.firstDate),
      to: getText(summary?.to, summary?.endDate, summary?.lastDate),
    },
  };
}

function MetricCard({ label, value, note, tone = 'neutral' }) {
  return <SharedMetricCard baseClass="history-stat-card react-history-metric" label={label} value={value} note={note} tone={tone} />;
}

function isPrimaryPatternMetric(metric) {
  return PRIMARY_PATTERN_METRICS.has(String(metric?.rawKey || metric?.label || '').replace(/\s+/g, '').toLowerCase());
}

function getPatternSummaryMetrics(pattern) {
  const metrics = asArray(pattern?.metrics);
  const primary = metrics.filter(isPrimaryPatternMetric);

  if (primary.length) {
    return primary.slice(0, 6);
  }

  if (!metrics.length) {
    return [];
  }

  return [{
    key: `${pattern.id || pattern.label}-metric-count`,
    rawKey: 'count',
    label: 'Metrics',
    value: formatNumber(metrics.length),
    children: [],
  }];
}

function getPatternDetailMetrics(pattern, summaryMetrics) {
  const summaryKeys = new Set(summaryMetrics.map((metric) => metric.key));
  return asArray(pattern?.metrics)
    .filter((metric) => !summaryKeys.has(metric.key))
    .slice(0, 8);
}

function PatternMetricRows({ metrics, allowChildren = false }) {
  return (
    <div className="history-pattern-metric-grid">
      {metrics.map((metric, index) => (
        <article
          className={`history-pattern-row ${metric.children?.length ? 'has-children' : ''}`}
          key={`${metric.key || metric.label}-${index}`}
        >
          <div className="history-pattern-row-main">
            <span className="history-pattern-label">{metric.label}:</span>
            {metric.value ? <strong className="history-pattern-val">{metric.value}</strong> : null}
          </div>
          {allowChildren && metric.children?.length ? (
            <PatternMetricRows metrics={metric.children.slice(0, 6)} allowChildren />
          ) : null}
        </article>
      ))}
    </div>
  );
}

function PatternMetricChips({ metrics }) {
  return (
    <div className="history-pattern-chips-row">
      {metrics.map((metric, index) => (
        <div className="history-pattern-chip" key={`${metric.key || metric.label}-${index}`}>
          <span className="pattern-chip-label">{metric.label}</span>
          <strong className="pattern-chip-value">{metric.value || '-'}</strong>
        </div>
      ))}
    </div>
  );
}

function PatternCard({ pattern }) {
  const [expanded, setExpanded] = useState(false);
  const summaryMetrics = getPatternSummaryMetrics(pattern);
  const detailMetrics = getPatternDetailMetrics(pattern, summaryMetrics);
  const hasDetails = detailMetrics.length > 0;

  return (
    <article className={`desk-card history-pattern-card ${pattern.metrics.length ? 'is-group' : 'is-single'}`}>
      <div className="history-pattern-head">
        <strong>{pattern.label}</strong>
        <span className="ui-badge subtle">{pattern.metrics.length ? 'Summary' : 'Metric'}</span>
      </div>
      {!pattern.metrics.length ? (
        <div className="history-pattern-single-value">
          <em>{pattern.value || 'n/d'}</em>
        </div>
      ) : null}
      {summaryMetrics.length ? <PatternMetricChips metrics={summaryMetrics} /> : null}
      
      {hasDetails ? (
        <div className="history-pattern-footer">
          <button
            type="button"
            className="btn btn-ghost btn-sm history-pattern-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Ocultar detalles' : 'Ver detalles'}
          </button>
        </div>
      ) : null}
      
      {expanded && hasDetails ? (
        <div className="history-pattern-details">
          <PatternMetricRows metrics={detailMetrics} allowChildren />
        </div>
      ) : null}
    </article>
  );
}

function ProfitCurvePanel({ derived }) {
  const series = getProfitSeries(derived);
  const model = getCurveModel(series);
  const hasSeries = model.coords.length > 1;
  const profitTone = getProfitTone(derived.netProfit);

  return (
    <section className={`history-visual-stage history-profit-stage ${profitTone}`}>
      <div className="history-stage-head">
        <div>
          <span className="history-stage-label">Profit curve</span>
          <h4>Rendimiento acumulado</h4>
        </div>
        <strong>{formatMoney(derived.netProfit)}</strong>
      </div>

      {hasSeries ? (
        <div className="history-curve-wrap">
          <svg
            className="history-profit-curve"
            viewBox={`0 0 ${model.width} ${model.height}`}
            role="img"
            aria-label={`Curva de rendimiento con resultado final ${formatMoney(derived.netProfit)}`}
          >
            <defs>
              <linearGradient id="history-profit-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path className="history-curve-gridline" d={`M 28 ${model.zeroY.toFixed(1)} H 732`} />
            <path className="history-curve-area" d={model.areaPath} />
            <path className="history-curve-line" d={model.linePath} />
            {model.coords.map((point, index) => (
              <circle
                className="history-curve-point"
                cx={point.x}
                cy={point.y}
                r={index === model.coords.length - 1 ? 5 : 3.5}
                key={`${point.label}-${index}`}
              />
            ))}
          </svg>
          <div className="history-curve-axis">
            <span>{series[0]?.label ? formatDate(series[0].label) : 'Inicio'}</span>
            <strong>{formatMoney(model.maxValue)}</strong>
            <span>{series[series.length - 1]?.label ? formatDate(series[series.length - 1].label) : 'Actual'}</span>
          </div>
        </div>
      ) : (
        <div className="history-chart-empty">
          <strong>Curva no disponible</strong>
          <p>El summary no incluye suficientes resultados por ticket para trazar una serie.</p>
        </div>
      )}
    </section>
  );
}

function StatusDistributionPanel({ derived }) {
  const entries = getStatusDistribution(derived);
  const total = getStatusTotal(entries);

  return (
    <aside className="history-visual-stage history-status-stage">
      <div className="history-stage-head">
        <div>
          <span className="history-stage-label">Settlement mix</span>
          <h4>Distribucion</h4>
        </div>
        <strong>{formatNumber(total, '0')}</strong>
      </div>

      <div className="history-status-bar" aria-label="Distribucion de estados">
        {entries.map((entry) => (
          <span
            className={`history-status-segment ${entry.tone}`}
            style={{ '--history-segment-width': `${total ? (entry.numeric / total) * 100 : 0}%` }}
            title={`${entry.label}: ${entry.numeric}`}
            key={entry.key}
          />
        ))}
      </div>

      <div className="history-status-list">
        {entries.map((entry) => (
          <div className={`history-status-row ${entry.tone}`} key={entry.key}>
            <span>{entry.label}</span>
            <strong>{formatNumber(entry.numeric, '0')}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
}

function TicketTypeComparison({ ticketTypes }) {
  return (
    <section className="history-type-race">
      <div className="history-section-head">
        <div>
          <span className="history-stage-label">Ticket type race</span>
          <h3>Comparativa por boleto</h3>
        </div>
        <p>Lectura visual de ROI/net sin crear datos nuevos.</p>
      </div>

      <div className="history-type-lanes">
        {ticketTypes.map((ticket) => (
          <article className={`history-type-lane ${ticket.tone} ${ticket.hasData ? 'has-data' : 'is-empty'}`} key={ticket.key}>
            <div className="history-type-label">
              <strong>{ticket.label}</strong>
              <span>{ticket.hasData ? ticket.record : 'Sin data en summary'}</span>
            </div>
            <div className="history-type-track" aria-label={`${ticket.label} score ${formatNumber(ticket.score, '0')}%`}>
              <span style={{ '--history-type-score': `${ticket.score}%` }} />
            </div>
            <div className="history-type-values">
              <strong>{ticket.roi === null ? 'ROI n/d' : formatPercent(ticket.roi)}</strong>
              <span>{ticket.netProfit === null ? 'Net n/d' : formatMoney(ticket.netProfit)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecentActivityFeed({ tickets }) {
  return (
    <section className="history-activity-feed">
      <div className="history-section-head">
        <div>
          <span className="history-stage-label">Recent activity</span>
          <h3>Ticket tape</h3>
        </div>
        <p>{tickets.length ? `${tickets.length} slips recientes` : 'Sin slips recientes en summary'}</p>
      </div>

      <div className="history-feed-list">
        {tickets.length ? (
          tickets.map((ticket, index) => {
            const status = getTicketStatusMeta(ticket);
            const legs = getTicketLegs(ticket);
            const netProfit = getNumber(ticket?.netProfit, ticket?.profit, ticket?.net);
            const roi = getNumber(ticket?.roi, ticket?.ROI);
            const date = getText(ticket?.date, ticket?.ticketDate, ticket?.createdAt, ticket?.generatedAt);

            return (
              <article className={`history-feed-row ${status.tone}`} key={`${date}-${getTicketTypeLabel(ticket)}-${index}`}>
                <div className="history-feed-index">
                  <span>ARC</span>
                  <strong>{String(index + 1).padStart(2, '0')}</strong>
                </div>
                <div className="history-feed-main">
                  <div className="history-feed-title-line">
                    <strong>{getTicketTypeLabel(ticket)}</strong>
                    <span>{formatDate(date)}</span>
                  </div>
                  <div className="history-feed-meta">
                    <span>{legs.length ? `${legs.length} picks` : 'Picks n/d'}</span>
                    <span>{roi === null ? 'ROI n/d' : formatPercent(roi)}</span>
                    <span>{netProfit === null ? 'Net n/d' : formatMoney(netProfit)}</span>
                  </div>
                  <details className="history-feed-details">
                    <summary>Ver detalles</summary>
                    <div className="history-feed-leg-list">
                      {legs.length ? (
                        legs.slice(0, 5).map((leg, legIndex) => (
                          <span key={`${getTicketLegLabel(leg, legIndex)}-${legIndex}`}>
                            {getTicketLegLabel(leg, legIndex)}
                          </span>
                        ))
                      ) : (
                        <span>Sin legs detalladas en summary</span>
                      )}
                    </div>
                  </details>
                </div>
                <div className="history-feed-result">
                  <span>{status.label}</span>
                  <strong>{netProfit === null ? 'n/d' : formatMoney(netProfit)}</strong>
                </div>
              </article>
            );
          })
        ) : (
          <div className="history-chart-empty">
            <strong>Sin actividad reciente</strong>
            <p>El endpoint respondio metricas agregadas, pero no slips renderizables.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PatternIntelligence({ patterns, warnings }) {
  const topPatterns = asArray(patterns).slice(0, 3);

  if (!topPatterns.length && !warnings.length) {
    return null;
  }

  return (
    <section className="history-intelligence-strip">
      <div className="history-section-head">
        <div>
          <span className="history-stage-label">Archive intelligence</span>
          <h3>Senales del archivo</h3>
        </div>
      </div>
      <div className="history-intelligence-list">
        {topPatterns.map((pattern) => {
          const summaryMetrics = getPatternSummaryMetrics(pattern).slice(0, 3);
          return (
            <article className="history-intelligence-row" key={pattern.id || pattern.label}>
              <strong>{pattern.label}</strong>
              <div className="history-intelligence-metrics">
                {summaryMetrics.length ? (
                  summaryMetrics.map((metric) => (
                    <span key={metric.key || metric.label}>
                      {metric.label}: <b>{metric.value || '-'}</b>
                    </span>
                  ))
                ) : (
                  <span>{pattern.value || 'Sin metrica destacada'}</span>
                )}
              </div>
            </article>
          );
        })}
        {warnings.slice(0, 2).map((warning, index) => (
          <article className="history-intelligence-row warning" key={`${warning}-${index}`}>
            <strong>Nota</strong>
            <div className="history-intelligence-metrics">
              <span>{warning}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function HistoryView() {
  const [status, setStatus] = useState('loading');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setStatus('loading');
      setError('');

      try {
        const data = await getHistorySummary();
        if (cancelled) return;

        setSummary(data);
        setStatus(hasUsefulData(data) ? 'success' : 'empty');
      } catch (loadError) {
        if (cancelled) return;

        setSummary(null);
        setError(loadError?.message || 'No se pudo consultar el historial.');
        setStatus('error');
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const derived = useMemo(() => getDerivedSummary(summary || {}), [summary]);

  return (
    <section
      className="app-view history-view foundation-view is-active"
      id="history"
      data-app-view="history"
    >
      {status !== 'success' ? (
        <div className="view-intro-panel glass-card react-history-intro">
          <div className="history-intro-copy">
            <p className="panel-kicker">History ledger</p>
            <h3>Archivo de tickets</h3>
            <p className="panel-subtitle">
              Lectura premium del archivo cacheado: rendimiento, cierres y slips recientes
              sin llamadas live ni acciones automaticas.
            </p>
          </div>
          <div className="history-intro-status" aria-label="Modo de lectura">
            <div className="hero-badges">
              <span className="ui-badge cache">Cache-first</span>
              <span className="ui-badge subtle">Read-only</span>
              <span className="ui-badge subtle">No live calls</span>
            </div>
            <div className="history-mini-ledger">
              <span>Source</span>
              <strong>History summary</strong>
            </div>
          </div>
        </div>
      ) : null}

      {status === 'loading' ? (
        <ViewState
          className="ticket-panel glass-card react-history-state"
          badge="GET /history/summary"
          title="Cargando historial"
          copy="Lectura read-only del archivo. Sin generate, scoreboard, odds refresh ni Bedrock."
        />
      ) : null}
      {status === 'error' ? (
        <ViewState
          className="ticket-panel glass-card react-history-state error"
          badge="Error"
          badgeTone="warning"
          title="Error de lectura"
          copy={error || 'No se pudo cargar el resumen de historial.'}
          detail="Solo se intento GET /api/daily-ticket/history/summary."
        />
      ) : null}
      {status === 'empty' ? (
        <ViewState
          className="ticket-panel glass-card react-history-state"
          badge="Archivo vacio"
          title="Archivo sin tickets todavia"
          copy="El endpoint respondio sin metricas ni slips renderizables. La mesa queda estable en modo read-only."
        />
      ) : null}

      {status === 'success' ? (
        <section className={`history-analytics-shell ${getProfitTone(derived.netProfit)}`}>
          <section className="history-performance-hero">
            <div className="history-performance-copy">
              <span className="history-stage-label">Performance</span>
              <h3>History</h3>
              <strong className="history-net-figure">{formatMoney(derived.netProfit)}</strong>
              <p>
                {getProfitTone(derived.netProfit) === 'negative'
                  ? 'Archivo negativo: encontrar donde se escapa valor.'
                  : getProfitTone(derived.netProfit) === 'positive'
                    ? 'Archivo positivo: entender que formatos producen.'
                    : 'Archivo plano o incompleto: mostrar lo disponible sin inventar datos.'}
              </p>
            </div>

            <div className="history-performance-meta" aria-label="Resumen de rendimiento">
              <div>
                <span>Record</span>
                <strong>{derived.recordLabel}</strong>
              </div>
              <div>
                <span>ROI</span>
                <strong>{formatPercent(derived.roi)}</strong>
              </div>
              <div>
                <span>Pending exposure</span>
                <strong>{formatNumber(derived.pending, '0')}</strong>
              </div>
              <div>
                <span>Range</span>
                <strong>
                  {derived.dateRange.from || derived.dateRange.to
                    ? `${formatDate(derived.dateRange.from)} - ${formatDate(derived.dateRange.to)}`
                    : 'Fechas n/d'}
                </strong>
              </div>
            </div>
          </section>

          <div className="history-visual-grid-v2">
            <ProfitCurvePanel derived={derived} />
            <StatusDistributionPanel derived={derived} />
          </div>

          <TicketTypeComparison ticketTypes={getComparableTicketTypes(derived.ticketTypeSummaries)} />

          <div className="history-lower-grid-v2">
            <RecentActivityFeed tickets={derived.recentTickets} />
            <PatternIntelligence patterns={derived.patterns} warnings={derived.warnings} />
          </div>
        </section>
      ) : null}
    </section>
  );
}
