/**
 * HistoryView.jsx
 * Phase: React Migration v5.1 - History Summary Read Only
 */
import { useEffect, useMemo, useState } from 'react';
import Badge from '../components/Badge';
import SharedMetricCard from '../components/MetricCard';
import ViewState from '../components/ViewState';
import WarningBanner from '../components/WarningBanner';
import { getHistorySummary } from '../services/api';
import { asArray, firstValue, getNumber, getText, isObject, objectEntries } from '../services/dataUtils';

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

function getTicketDate(ticket) {
  return getText(ticket.date, ticket.ticketDate, ticket.createdAt, ticket.generatedAt);
}

function getTicketTitle(ticket, index) {
  return getText(ticket.title, ticket.name, ticket.type, `Archive slip ${index + 1}`);
}

function getTicketStatus(ticket) {
  const status = getText(ticket.status, ticket.result, ticket.computedResult, ticket.settlementType).toLowerCase();

  if (status.includes('won') || status.includes('win') || status.includes('gan')) {
    return { key: 'won', label: 'Win' };
  }
  if (status.includes('lost') || status.includes('loss') || status.includes('perd')) {
    return { key: 'lost', label: 'Loss' };
  }
  if (status.includes('push')) {
    return { key: 'push', label: 'Push' };
  }
  if (status.includes('void') || status.includes('refund') || status.includes('cancel')) {
    return { key: 'void', label: 'Void' };
  }

  return { key: 'pending', label: 'Pending' };
}

function getTicketLegs(ticket) {
  const directLegs = asArray(ticket.legs);
  if (directLegs.length) return directLegs;

  return asArray(ticket.tickets).flatMap((item) => asArray(item?.legs));
}

function getTicketPreviewPicks(ticket) {
  return getTicketLegs(ticket)
    .map((leg) => getText(leg?.pick, leg?.selection, leg?.market))
    .filter(Boolean)
    .slice(0, 3);
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
      label: key,
      value: isObject(value) ? JSON.stringify(value) : String(value),
    }))
  );

  return [
    ...directPatterns.map((item, index) => ({
      label: `Pattern ${index + 1}`,
      value: String(item),
    })),
    ...fromObjects,
  ].slice(0, 6);
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
    settlement: objectEntries(summary?.settlementBreakdown),
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

function StatusBadge({ status }) {
  return <Badge tone={status.key}>{status.label}</Badge>;
}

function ArchiveSlipCard({ ticket, index }) {
  const status = getTicketStatus(ticket);
  const previewPicks = getTicketPreviewPicks(ticket);
  const legsCount = getTicketLegs(ticket).length;
  const netProfit = getNumber(ticket.netProfit, ticket.profit, ticket.net);
  const stake = getNumber(ticket.stake, ticket.totalStake);

  return (
    <article className={`history-ticket-card archive-slip-card react-history-slip ${status.key}`}>
      <div className="history-ticket-top">
        <div>
          <span className="history-ticket-serial">ARC-{String(index + 1).padStart(3, '0')}</span>
          <strong>{formatDate(getTicketDate(ticket))}</strong>
          <h4>{getTicketTitle(ticket, index)}</h4>
        </div>
        <div className="history-ticket-badges">
          <StatusBadge status={status} />
          <span className="ui-badge subtle">Read-only</span>
        </div>
      </div>

      <div className="history-ticket-metrics">
        <span>{legsCount || formatNumber(ticket.totalPicks, '0')} picks</span>
        <span>{stake === null ? 'Stake n/d' : formatMoney(stake)}</span>
        <span>{netProfit === null ? 'Profit n/d' : formatMoney(netProfit)}</span>
      </div>

      <p>{getText(ticket.summary, ticket.note, ticket.description, 'Slip historico del archivo cacheado.')}</p>

      {previewPicks.length ? (
        <div className="history-preview-row">
          {previewPicks.map((pick) => (
            <span className="history-preview-pill" key={pick}>{pick}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function BreakdownPanel({ title, kicker, entries, emptyCopy }) {
  return (
    <section className="ticket-panel glass-card compact-panel react-history-breakdown">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">{kicker}</p>
          <h3>{title}</h3>
        </div>
      </div>
      {entries.length ? (
        <div className="foundation-list">
          {entries.map(([key, value]) => (
            <span key={key}>
              <strong>{key}</strong> {isObject(value) ? JSON.stringify(value) : String(value)}
            </span>
          ))}
        </div>
      ) : (
        <div className="empty-inline rich">
          <strong>{emptyCopy}</strong>
          <p>El summary no incluyo este bloque.</p>
        </div>
      )}
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
          title="Sin historial disponible"
          copy="El endpoint respondio sin metricas ni slips renderizables. La vista queda estable en modo read-only."
        />
      ) : null}

      {status === 'success' ? (
        <section className="ticket-panel glass-card compact-panel history-panel-full react-history-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Ticket archive</p>
              <h3>Resumen cacheado</h3>
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
            <BreakdownPanel
              title="Settlement"
              kicker="Breakdown"
              entries={derived.settlement}
              emptyCopy="Sin settlementBreakdown."
            />
            <section className="ticket-panel glass-card compact-panel react-history-breakdown">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Patterns</p>
                  <h3>Resumen incluido</h3>
                </div>
              </div>
              {derived.patterns.length ? (
                <div className="react-history-pattern-list">
                  {derived.patterns.map((pattern) => (
                    <article className="foundation-debug-item" key={`${pattern.label}-${pattern.value}`}>
                      <strong>{pattern.label}</strong>
                      <p>{pattern.value}</p>
                    </article>
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

          <div className="foundation-archive-grid react-history-archive">
            {derived.recentTickets.length ? (
              derived.recentTickets.map((ticket, index) => (
                <ArchiveSlipCard ticket={ticket} index={index} key={`${getTicketDate(ticket)}-${getTicketTitle(ticket, index)}-${index}`} />
              ))
            ) : (
              <article className="ticket-panel glass-card compact-panel react-history-slip">
                <p className="panel-kicker">Archive slip</p>
                <h4>Sin slips recientes incluidos</h4>
                <p className="panel-subtitle">El summary trae metricas, pero no incluyo recent tickets/slips renderizables.</p>
              </article>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}
