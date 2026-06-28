/**
 * DailyTicketView.jsx
 * Phase: React Migration v3.1 - Daily Ticket Read Only
 */
import { useEffect, useMemo, useState } from 'react';
import { getTodayTicket } from '../services/api';
import BetSlip from '../components/BetSlip';
import TicketSelector from '../components/TicketSelector';

function normalizeTodayTicketResponse(data) {
  if (!data || typeof data !== 'object') {
    return { hasTicketToday: false, ticket: null };
  }

  if (data.hasTicketToday === false) {
    return { hasTicketToday: false, ticket: null };
  }

  let ticket = null;

  if (data.hasTicketToday === true && data.ticket) {
    ticket = data.ticket;
  } else if (data.todayTicket) {
    ticket = data.todayTicket;
  } else if (data.ticket?.ticket) {
    ticket = data.ticket.ticket;
  } else if (data.ticket) {
    ticket = data.ticket;
  }

  if (ticket && !Array.isArray(ticket.tickets) && ticket.ticket && typeof ticket.ticket === 'object') {
    ticket = ticket.ticket;
  }

  if (!ticket || typeof ticket !== 'object') {
    return { hasTicketToday: false, ticket: null };
  }

  return { hasTicketToday: true, ticket };
}

function getRenderableTickets(ticket) {
  return Array.isArray(ticket?.tickets)
    ? ticket.tickets.filter((item) => item && typeof item === 'object')
    : [];
}

function getDefaultTicketIndex(tickets) {
  const safeIndex = tickets.findIndex((item) => item?.type === 'safe');
  if (safeIndex >= 0) {
    return safeIndex;
  }

  const availableIndex = tickets.findIndex((item) => item?.available !== false);
  return availableIndex >= 0 ? availableIndex : 0;
}

function formatTicketDate(dateKey) {
  if (!dateKey) {
    return 'Sin fecha';
  }

  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
}

function LoadingState() {
  return (
    <div className="ticket-panel ticket-panel-main glass-card react-ticket-state">
      <span className="ui-badge subtle">GET /today</span>
      <h3>Cargando Ticket del Dia</h3>
      <p>Consultando cache read-only. No se genera ticket ni se refrescan odds.</p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="ticket-panel ticket-panel-main glass-card react-ticket-state error">
      <span className="ui-badge warning">Error</span>
      <h3>No se pudo leer el Ticket del Dia</h3>
      <p>{message || 'El backend no respondio el cache de hoy.'}</p>
      <small>Solo se intento GET /api/daily-ticket/today.</small>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ticket-panel ticket-panel-main glass-card react-ticket-state">
      <span className="ui-badge subtle">Cache vacio</span>
      <h3>Todavia no hay ticket guardado para hoy</h3>
      <p>
        Esta fase no genera tickets automaticamente. Cuando exista un ticket cacheado,
        aqui apareceran sus slips y legs en modo lectura.
      </p>
      <button type="button" className="btn btn-primary btn-ticket" disabled>
        Generacion manual pendiente
      </button>
    </div>
  );
}

export default function DailyTicketView() {
  const [status, setStatus] = useState('loading');
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadTicket() {
      setStatus('loading');
      setError('');

      try {
        const data = await getTodayTicket();
        if (cancelled) {
          return;
        }

        const normalized = normalizeTodayTicketResponse(data);
        const tickets = getRenderableTickets(normalized.ticket);

        if (!normalized.hasTicketToday || !normalized.ticket || !tickets.length) {
          setTicket(null);
          setSelectedIndex(0);
          setStatus('empty');
          return;
        }

        setTicket(normalized.ticket);
        setSelectedIndex(getDefaultTicketIndex(tickets));
        setStatus('success');
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setTicket(null);
        setError(loadError?.message || 'No se pudo consultar el ticket de hoy.');
        setStatus('error');
      }
    }

    loadTicket();

    return () => {
      cancelled = true;
    };
  }, []);

  const tickets = useMemo(() => getRenderableTickets(ticket), [ticket]);
  const selectedTicket = tickets[selectedIndex] || tickets[0] || null;
  const totalLegs = tickets.reduce((sum, item) => {
    return sum + (Array.isArray(item?.legs) ? item.legs.length : 0);
  }, 0);

  return (
    <section
      className="app-view daily-ticket-section foundation-view is-active"
      id="daily-ticket"
      data-app-view="daily-ticket"
    >
      <div className="view-intro-panel glass-card react-ticket-intro">
        <div>
          <p className="panel-kicker">Ticket del dia</p>
          <h3>Lectura read-only del ticket cacheado</h3>
          <p className="panel-subtitle">
            Vista conectada solo a GET /api/daily-ticket/today. Sin generate,
            sin Bedrock y sin Odds API live al abrir.
          </p>
        </div>
        <div className="react-ticket-intro-badges">
          <span className="ui-badge cache">Cache listo</span>
          <span className="ui-badge subtle">Read-only</span>
          <span className="ui-badge subtle">No live calls</span>
        </div>
      </div>

      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? <ErrorState message={error} /> : null}
      {status === 'empty' ? <EmptyState /> : null}

      {status === 'success' ? (
        <div className="daily-ticket-grid react-ticket-grid">
          <section className="ticket-panel ticket-panel-main glass-card">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Ticket disponible</p>
                <h3>{ticket?.title || 'Ticket del dia'}</h3>
              </div>
              <p className="panel-subtitle">
                {formatTicketDate(ticket?.date)} | {tickets.length} tickets | {totalLegs} legs
              </p>
            </div>

            {ticket?.summary ? (
              <div className="ticket-hero-summary react-ticket-summary">
                <div>
                  <h3>Resumen del slate</h3>
                  <p>{ticket.summary}</p>
                </div>
              </div>
            ) : null}

            <TicketSelector
              tickets={tickets}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />

            <BetSlip
              ticket={selectedTicket}
              parentTicket={ticket}
              selectedIndex={selectedIndex}
            />

            {ticket?.disclaimer ? (
              <p className="ticket-disclaimer ticket-disclaimer-bottom">{ticket.disclaimer}</p>
            ) : null}
          </section>

          <aside className="daily-ticket-side">
            <section className="ticket-panel glass-card compact-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Contexto</p>
                  <h3>Estado del ticket</h3>
                </div>
              </div>
              <div className="foundation-list">
                <span>Fecha cache: {ticket?.date || 'Sin fecha'}</span>
                <span>Tickets disponibles: {tickets.length}</span>
                <span>Legs renderizadas: {totalLegs}</span>
                <span>Generacion: manual pendiente</span>
              </div>
            </section>

            <section className="ticket-panel glass-card compact-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Seguridad/costos</p>
                  <h3>Modo protegido</h3>
                </div>
              </div>
              <div className="empty-inline rich">
                <strong>Sin llamadas caras en esta vista.</strong>
                <p>Solo lectura del cache de hoy. No se llama generate, odds refresh, Bedrock ni Odds API live.</p>
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
