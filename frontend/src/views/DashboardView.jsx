/**
 * DashboardView.jsx
 * Phase: React Migration v3.2 - Dashboard Data
 */
import { useEffect, useMemo, useState } from 'react';
import MetricCard from '../components/MetricCard';
import ViewState from '../components/ViewState';
import WarningBanner from '../components/WarningBanner';
import { getDailyTicketDashboard } from '../services/api';
import { asArray } from '../services/dataUtils';

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
      className="app-view dashboard-view foundation-view is-active react-foundation"
      id="dashboard"
      data-app-view="dashboard"
    >
      {/* Hero Editorial */}
      <header className="dashboard-desk-hero">
        <div className="desk-hero-header">
          <div>
            <p className="hero-kicker">Daily Ticket AI</p>
            <h2 className="desk-title">Ballpark Betting Desk</h2>
            <p className="hero-subtitle">
              {derived.ticketDate ? formatDateLabel(derived.ticketDate) : "Today's Desk"}
            </p>
          </div>
          <div className="hero-badges">
            <span className="ui-badge protected">Protected Mode</span>
            <span className="ui-badge cache-first">Cache-first</span>
            <span className="ui-badge read-only">Read-only</span>
          </div>
        </div>
        <p className="desk-hero-summary">
          Control room para Daily Ticket AI. Dashboard conectado a cache read-only sin llamadas live.
          Generación manual pendiente.
        </p>
      </header>

      {/* Loading / Error / Empty States */}
      {status === 'loading' ? (
        <ViewState
          className="ticket-panel glass-card react-dashboard-state"
          badge="GET /dashboard"
          title="Cargando dashboard cacheado"
          copy="Lectura read-only. No se genera ticket, no se refrescan odds y no se abre scoreboard real."
        />
      ) : null}
      {status === 'error' ? (
        <ViewState
          className="ticket-panel glass-card react-dashboard-state error"
          badge="Error"
          badgeTone="warning"
          title="No se pudo cargar el Dashboard"
          copy={error || 'El backend no respondio el resumen cacheado.'}
          detail="Solo se intento GET /api/daily-ticket/dashboard."
        />
      ) : null}
      {status === 'empty' ? (
        <ViewState
          className="ticket-panel glass-card react-dashboard-state"
          badge="Cache vacio"
          title="Dashboard sin datos disponibles"
          copy="La respuesta llego vacia o incompleta. La UI queda estable y protegida."
        />
      ) : null}

      {/* Executive Desk - 4 Card Control Room */}
      {status === 'success' ? (
        <>
          <div className="dashboard-executive-desk">
            {/* Ticket Window Card */}
            <section className="desk-card-premium ticket-window-card">
              <div className="desk-card-header">
                <p className="panel-kicker">Ticket Window</p>
                <h3 className="card-title">
                  {derived.displayTicket?.title || 'Estado del slate'}
                </h3>
              </div>
              <div className="desk-card-body">
                <div className="desk-metric-row">
                  <div className="desk-metric">
                    <span>Ticket hoy</span>
                    <strong className={derived.hasTicketToday ? 'text-success' : 'text-warning'}>
                      {derived.hasTicketToday ? 'Disponible' : 'No disponible'}
                    </strong>
                  </div>
                  <div className="desk-metric">
                    <span>Tickets</span>
                    <strong>
                      {derived.currentTicketsCount || derived.recentTicketsCount || 0}
                    </strong>
                  </div>
                  <div className="desk-metric">
                    <span>Legs</span>
                    <strong className="text-accent">
                      {derived.currentLegsCount || derived.recentLegsCount || 0}
                    </strong>
                  </div>
                </div>
                {derived.displayTicket?.summary ? (
                  <p className="desk-card-summary">{derived.displayTicket.summary}</p>
                ) : (
                  <p className="desk-card-summary text-dim">
                    {derived.currentTicketsCount
                      ? 'Ticket disponible en cache.'
                      : 'Sin ticket de hoy. Mostrando último disponible del archivo.'}
                  </p>
                )}
              </div>
              <div className="desk-card-actions">
                <button type="button" className="btn btn-secondary btn-sm" disabled>
                  Generación manual pendiente
                </button>
                <a className="btn btn-ghost btn-sm" href="#daily-ticket">
                  Ver Daily Ticket →
                </a>
              </div>
            </section>

            {/* Market Guard Card */}
            <section className="desk-card-premium market-guard-card">
              <div className="desk-card-header">
                <p className="panel-kicker">Market Guard</p>
                <h3 className="card-title">Config / Cache</h3>
              </div>
              <div className="desk-card-body">
                <div className="desk-status-list">
                  <div className="desk-status-item">
                    <span>Bedrock AI</span>
                    <strong className={derived.status.bedrockConfigured ? 'text-success' : 'text-dim'}>
                      {getStatusLabel(derived.status.bedrockConfigured, 'Configurado', 'Off')}
                    </strong>
                  </div>
                  <div className="desk-status-item">
                    <span>Odds API</span>
                    <strong className={derived.status.oddsConfigured ? 'text-protected' : 'text-dim'}>
                      {getStatusLabel(derived.status.oddsConfigured, 'Guarded', 'Off')}
                    </strong>
                  </div>
                  <div className="desk-status-item">
                    <span>ESPN Cache</span>
                    <strong className={derived.status.espnAvailable ? 'text-success' : 'text-dim'}>
                      {getStatusLabel(derived.status.espnAvailable, 'Disponible', 'n/d')}
                    </strong>
                  </div>
                  <div className="desk-status-item">
                    <span>Source</span>
                    <strong className="text-cache">
                      {derived.status.source || dashboard?.source || 'cache-first'}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            {/* Slate Status Card */}
            <section className="desk-card-premium slate-status-card">
              <div className="desk-card-header">
                <p className="panel-kicker">Slate Status</p>
                <h3 className="card-title">Operación</h3>
              </div>
              <div className="desk-card-body">
                <div className="desk-status-list">
                  <div className="desk-status-item">
                    <span>Fecha ticket</span>
                    <strong>{derived.ticketDate || 'Sin fecha'}</strong>
                  </div>
                  <div className="desk-status-item">
                    <span>Historial</span>
                    <strong>{derived.historyCount} {derived.historyCount === 1 ? 'entrada' : 'entradas'}</strong>
                  </div>
                  <div className="desk-status-item">
                    <span>Max AI/día</span>
                    <strong>{derived.status.maxAiGenerationsPerDay ?? 'n/d'}</strong>
                  </div>
                  <div className="desk-status-item">
                    <span>Can generate</span>
                    <strong className={derived.status.canGenerate ? 'text-success' : 'text-warning'}>
                      {getStatusLabel(derived.status.canGenerate, 'Disponible', 'No')}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            {/* AI Notes Card */}
            <section className="desk-card-premium ai-notes-card">
              <div className="desk-card-header">
                <p className="panel-kicker">AI Notes</p>
                <h3 className="card-title">Warnings</h3>
              </div>
              <div className="desk-card-body">
                {derived.warnings.length > 0 ? (
                  <div className="desk-warnings-list">
                    {derived.warnings.map((warning, index) => (
                      <div className="desk-warning-item" key={`warning-${index}`}>
                        <span className="warning-bullet">⚠</span>
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="desk-card-empty">
                    <p className="text-dim">Sin warnings. Sistema operando en cache-first mode.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
