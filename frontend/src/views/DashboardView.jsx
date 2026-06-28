/**
 * DashboardView.jsx
 * Phase: React Migration v3.2 - Dashboard Data
 */
import { useEffect, useMemo, useState } from 'react';
import { getDailyTicketDashboard } from '../services/api';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object') || null;
}

function getCurrentTicket(dashboard) {
  return firstObject(
    dashboard?.todayTicket,
    dashboard?.ticket,
    dashboard?.upcomingTicket,
  );
}

function getLatestHistoryTicket(dashboard) {
  return asArray(dashboard?.history)[0] || null;
}

function getTicketList(ticket) {
  return asArray(ticket?.tickets).filter((item) => item && typeof item === 'object');
}

function getLegCount(ticket) {
  return getTicketList(ticket).reduce((sum, item) => {
    return sum + asArray(item?.legs).length;
  }, 0);
}

function getWarnings(dashboard, currentTicket, recentTicket) {
  const warningSets = [
    dashboard?.warnings,
    dashboard?.status?.warnings,
    currentTicket?.warnings,
    recentTicket?.warnings,
    ...getTicketList(currentTicket).map((item) => item?.warnings),
  ];

  return warningSets
    .flatMap((items) => asArray(items))
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

function formatDateLabel(value) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
}

function getStatusLabel(value, onLabel = 'Activo', offLabel = 'Off') {
  if (value === true) return onLabel;
  if (value === false) return offLabel;
  return 'n/d';
}

function hasUsefulDashboardData(dashboard) {
  return Boolean(
    dashboard &&
      typeof dashboard === 'object' &&
      (
        dashboard.status ||
        getCurrentTicket(dashboard) ||
        asArray(dashboard.history).length ||
        dashboard.summary ||
        dashboard.metrics
      )
  );
}

function LoadingState() {
  return (
    <section className="ticket-panel glass-card react-dashboard-state">
      <span className="ui-badge subtle">GET /dashboard</span>
      <h3>Cargando dashboard cacheado</h3>
      <p>Lectura read-only. No se genera ticket, no se refrescan odds y no se abre scoreboard real.</p>
    </section>
  );
}

function ErrorState({ message }) {
  return (
    <section className="ticket-panel glass-card react-dashboard-state error">
      <span className="ui-badge warning">Error</span>
      <h3>No se pudo cargar el Dashboard</h3>
      <p>{message || 'El backend no respondio el resumen cacheado.'}</p>
      <small>Solo se intento GET /api/daily-ticket/dashboard.</small>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="ticket-panel glass-card react-dashboard-state">
      <span className="ui-badge subtle">Cache vacio</span>
      <h3>Dashboard sin datos disponibles</h3>
      <p>La respuesta llego vacia o incompleta. La UI queda estable y protegida.</p>
    </section>
  );
}

function MetricCard({ label, value, note, tone = 'neutral' }) {
  return (
    <article className={`slate-desk-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

export default function DashboardView() {
  const [status, setStatus] = useState('loading');
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setStatus('loading');
      setError('');

      try {
        const data = await getDailyTicketDashboard();
        if (cancelled) return;

        if (!hasUsefulDashboardData(data)) {
          setDashboard(data || {});
          setStatus('empty');
          return;
        }

        setDashboard(data);
        setStatus('success');
      } catch (loadError) {
        if (cancelled) return;

        setDashboard(null);
        setError(loadError?.message || 'No se pudo consultar el dashboard.');
        setStatus('error');
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const derived = useMemo(() => {
    const currentTicket = getCurrentTicket(dashboard);
    const recentTicket = getLatestHistoryTicket(dashboard);
    const displayTicket = currentTicket || recentTicket;
    const ticketList = getTicketList(currentTicket);
    const recentTicketList = getTicketList(recentTicket);
    const dashboardStatus = dashboard?.status || {};
    const ticketDate =
      currentTicket?.date ||
      dashboard?.ticketDate ||
      dashboard?.date ||
      recentTicket?.date ||
      '';

    return {
      currentTicket,
      recentTicket,
      displayTicket,
      status: dashboardStatus,
      hasTicketToday: Boolean(dashboardStatus.hasTicketToday || dashboard?.todayTicket),
      ticketDate,
      currentTicketsCount: ticketList.length,
      currentLegsCount: getLegCount(currentTicket),
      recentTicketsCount: recentTicketList.length,
      recentLegsCount: getLegCount(recentTicket),
      historyCount: asArray(dashboard?.history).length,
      warnings: getWarnings(dashboard, currentTicket, recentTicket),
    };
  }, [dashboard]);

  return (
    <section
      className="app-view dashboard-view foundation-view is-active"
      id="dashboard"
      data-app-view="dashboard"
    >
      <div className="hero-panel slate-desk-hero desk-panel glass-card react-dashboard-hero">
        <div className="slate-desk-head">
          <p className="hero-kicker">Daily Slate Desk</p>
          <h2>Resumen real cacheado</h2>
          <p className="hero-description">
            Dashboard conectado solo a GET /api/daily-ticket/dashboard. Muestra estado,
            cache y lectura ejecutiva sin llamar generate, Bedrock, odds refresh ni scoreboard real.
          </p>
          <div className="hero-badges">
            <span className="ui-badge cache">Cache-first</span>
            <span className="ui-badge subtle">Read-only</span>
            <span className="ui-badge subtle">Sin live calls</span>
          </div>
        </div>

        <div className="slate-desk-metrics">
          <MetricCard
            label="Ticket hoy"
            value={derived.hasTicketToday ? 'Si' : 'No'}
            note={formatDateLabel(derived.ticketDate)}
            tone={derived.hasTicketToday ? 'success' : 'warning'}
          />
          <MetricCard
            label="Tickets"
            value={String(derived.currentTicketsCount || derived.recentTicketsCount || 0)}
            note={derived.currentTicketsCount ? 'hoy' : 'archivo reciente'}
            tone={derived.currentTicketsCount ? 'success' : 'neutral'}
          />
          <MetricCard
            label="Legs"
            value={String(derived.currentLegsCount || derived.recentLegsCount || 0)}
            note="picks disponibles"
            tone="accent"
          />
          <MetricCard
            label="Odds cache"
            value={getStatusLabel(derived.status.oddsConfigured, 'Guarded', 'Off')}
            note={derived.status.source || dashboard?.source || 'cache-first'}
            tone={derived.status.oddsConfigured ? 'neutral' : 'warning'}
          />
        </div>

        <div className="slate-desk-note">
          Modo protegido: Dashboard usa cache read-only. Generacion manual pendiente y sin llamadas live.
        </div>
        <div className="hero-actions slate-desk-actions">
          <button type="button" className="btn btn-primary btn-ticket" disabled>
            Generacion manual pendiente
          </button>
          <a className="btn btn-secondary" href="#daily-ticket">
            Ver Ticket del dia
          </a>
        </div>
      </div>

      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? <ErrorState message={error} /> : null}
      {status === 'empty' ? <EmptyState /> : null}

      {status === 'success' ? (
        <>
          <div className="dashboard-summary-grid foundation-card-grid react-dashboard-grid">
            <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Ticket disponible</p>
                  <h3>{derived.displayTicket?.title || 'Estado del slate'}</h3>
                </div>
              </div>
              <div className="empty-inline rich">
                <strong>{derived.hasTicketToday ? 'Ticket de hoy en cache.' : 'Sin ticket de hoy.'}</strong>
                <p>
                  {derived.displayTicket?.summary ||
                    'Hay estado de dashboard disponible, pero no hay resumen de ticket para hoy.'}
                </p>
              </div>
            </section>

            <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Estado protegido</p>
                  <h3>Guard / cache</h3>
                </div>
              </div>
              <div className="foundation-list">
                <span>Bedrock: {getStatusLabel(derived.status.bedrockConfigured, 'configurado', 'off')}</span>
                <span>Odds API: {getStatusLabel(derived.status.oddsConfigured, 'guarded mode', 'off')}</span>
                <span>ESPN cache: {getStatusLabel(derived.status.espnAvailable, 'disponible', 'n/d')}</span>
                <span>Source: {derived.status.source || dashboard?.source || 'n/d'}</span>
              </div>
            </section>

            <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Lectura rapida</p>
                  <h3>Resumen operativo</h3>
                </div>
              </div>
              <div className="foundation-list">
                <span>Fecha ticket: {derived.ticketDate || 'Sin fecha'}</span>
                <span>Historial cacheado: {derived.historyCount} entradas</span>
                <span>Max AI/dia: {derived.status.maxAiGenerationsPerDay ?? 'n/d'}</span>
                <span>Can generate: {getStatusLabel(derived.status.canGenerate, 'manual disponible', 'no')}</span>
              </div>
            </section>
          </div>

          {derived.warnings.length ? (
            <section className="ticket-panel glass-card compact-panel react-dashboard-warnings">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Warnings</p>
                  <h3>Notas del cache</h3>
                </div>
              </div>
              <div className="warning-chip-row">
                {derived.warnings.map((warning, index) => (
                  <span className="warning-chip" key={`${warning}-${index}`}>
                    {warning}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
