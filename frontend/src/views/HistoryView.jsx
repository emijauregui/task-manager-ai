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

  return {
    totalTickets,
    totalPicks,
    won: getNumber(summary?.won, summary?.wins, summary?.win),
    lost: getNumber(summary?.lost, summary?.losses, summary?.loss),
    push: getNumber(summary?.push, summary?.pushes),
    void: getNumber(summary?.void, summary?.voids),
    pending: getNumber(summary?.pending),
    partial: getNumber(summary?.partial),
    roi: getNumber(summary?.roi, summary?.ROI, summary?.returnOnInvestment),
    netProfit: getNumber(summary?.netProfit, summary?.profit, summary?.net),
    totalStake: getNumber(summary?.totalStake, summary?.stake),
    totalPayout: getNumber(summary?.totalPayout, summary?.payout),
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
      <div className="view-intro-panel glass-card react-history-intro">
        <div>
          <p className="panel-kicker">Historial</p>
          <h3>Archivo de tickets y resumen real</h3>
          <p className="panel-subtitle">
            Vista conectada solo a GET /api/daily-ticket/history/summary. Sin generate,
            sin scoreboard, sin Odds API live y sin Bedrock.
          </p>
        </div>
        <div className="hero-badges">
          <span className="ui-badge cache">Cache-first</span>
          <span className="ui-badge subtle">Read-only</span>
          <span className="ui-badge subtle">No live calls</span>
        </div>
      </div>

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
        <section className="ticket-panel glass-card compact-panel history-panel-full react-history-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Ticket archive</p>
              <h3>Archivo premium cacheado</h3>
            </div>
            <div className="hero-badges">
              <span className="ui-badge cache">Summary read</span>
              <span className="ui-badge subtle">
                {derived.dateRange.from || derived.dateRange.to
                  ? `${formatDate(derived.dateRange.from)} - ${formatDate(derived.dateRange.to)}`
                  : 'Fechas n/d'}
              </span>
            </div>
          </div>

          <div className="history-ledger-strip">
            <article>
              <span>Resultado neto</span>
              <strong>{formatMoney(derived.netProfit)}</strong>
              <small>{formatPercent(derived.roi)} ROI</small>
            </article>
            <article>
              <span>Volumen</span>
              <strong>{formatNumber(derived.totalTickets, '0')}</strong>
              <small>{formatNumber(derived.totalStake, '0')} stake total</small>
            </article>
            <article>
              <span>Boletos vivos</span>
              <strong>{formatNumber(derived.pending, '0')}</strong>
              <small>{formatNumber(derived.void, '0')} void/refund</small>
            </article>
          </div>

          <div className="history-stats-grid react-history-metrics">
            <MetricCard label="Tickets" value={formatNumber(derived.totalTickets, '0')} note="registrados" />
            <MetricCard label="Picks" value={formatNumber(derived.totalPicks, 'n/d')} note="legs/picks" />
            <MetricCard label="Win" value={formatNumber(derived.won, '0')} note="settled" tone="won" />
            <MetricCard label="Loss" value={formatNumber(derived.lost, '0')} note="settled" tone="lost" />
            <MetricCard label="Push/Void" value={`${formatNumber(derived.push, '0')}/${formatNumber(derived.void, '0')}`} note="refunds" tone="void" />
            <MetricCard label="Pending" value={formatNumber(derived.pending, '0')} note="por cerrar" />
            <MetricCard label="Partial" value={formatNumber(derived.partial, '0')} note="ajustes" />
            <MetricCard
              label="ROI"
              value={formatPercent(derived.roi)}
              note="realizado"
              tone={derived.roi === null ? 'neutral' : derived.roi >= 0 ? 'won' : 'lost'}
            />
            <MetricCard
              label="Net profit"
              value={formatMoney(derived.netProfit)}
              note="acumulado"
              tone={derived.netProfit === null ? 'neutral' : derived.netProfit >= 0 ? 'won' : 'lost'}
            />
            <MetricCard label="Stake" value={formatMoney(derived.totalStake)} note="total" />
            <MetricCard label="Payout" value={formatMoney(derived.totalPayout)} note="total" />
          </div>

          <div className="react-history-grid">
            <SettlementBreakdown breakdown={derived.settlementBreakdown} />
            <section className="ticket-panel glass-card compact-panel react-history-breakdown history-pattern-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Patterns</p>
                  <h3>Resumen incluido</h3>
                </div>
              </div>
              {derived.patterns.length ? (
                <div className="react-history-pattern-list">
                  {derived.patterns.map((pattern) => (
                    <PatternCard pattern={pattern} key={pattern.id || pattern.label} />
                  ))}
                </div>
              ) : (
                <div className="empty-inline rich">
                  <strong>Sin patterns en summary.</strong>
                  <p>No se llamo al endpoint de patterns en esta fase.</p>
                </div>
              )}
            </section>
          </div>

          <WarningBanner
            className="react-history-warnings"
            title="Notas del archivo"
            warnings={derived.warnings}
          />

          <section className="ticket-panel glass-card compact-panel history-type-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Ticket types</p>
                <h3>Rendimiento por boleto</h3>
              </div>
              <span className="ui-badge subtle">Ticket Seguro / Estilo Emi / Free Bet</span>
            </div>
            {derived.ticketTypeSummaries.length ? (
              <div className="foundation-archive-grid react-history-archive history-type-grid">
                {derived.ticketTypeSummaries.map((ticket, index) => (
                  <HistorySlipCard ticket={ticket} index={index} variant="type" key={ticket.key || index} />
                ))}
              </div>
            ) : (
              <div className="empty-inline rich">
                <strong>Sin resumen por tipo.</strong>
                <p>El summary no incluyo recordByTicketType/byTicketType.</p>
              </div>
            )}
          </section>

          <div className="history-archive-heading">
            <div>
              <p className="panel-kicker">Archive slips</p>
              <h3>Boletos recientes</h3>
            </div>
            <span className="ui-badge subtle">{derived.recentTickets.length || 0} slips</span>
          </div>

          <div className="foundation-archive-grid react-history-archive">
            {derived.recentTickets.length ? (
              derived.recentTickets.map((ticket, index) => (
                <HistorySlipCard ticket={ticket} index={index} key={`${getText(ticket.date, ticket.ticketDate, ticket.createdAt)}-${getText(ticket.title, ticket.name, ticket.type)}-${index}`} />
              ))
            ) : (
              <article className="ticket-panel glass-card compact-panel react-history-slip history-premium-slip history-empty-slip">
                <p className="panel-kicker">Archive slip</p>
                <h4>Sin slips recientes incluidos</h4>
                <p className="panel-subtitle">El summary trae metricas de archivo, pero no incluyo recent tickets/slips renderizables.</p>
                <div className="history-leg-strip is-empty">
                  <span>Usa el panel de tipos para revisar rendimiento agregado.</span>
                </div>
              </article>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}
