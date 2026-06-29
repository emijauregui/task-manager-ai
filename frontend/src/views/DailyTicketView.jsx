/**
 * DailyTicketView.jsx
 * Phase: React Migration v3.3 - Generate Manual Button
 */
import { useEffect, useMemo, useState } from 'react';
import { generateDailyTicket, getTodayTicket } from '../services/api';
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

  if (Array.isArray(data.tickets)) {
    ticket = data;
  } else if (data.hasTicketToday === true && data.ticket) {
    ticket = data.ticket;
  } else if (data.dailyTicket) {
    ticket = data.dailyTicket;
  } else if (data.todayTicket) {
    ticket = data.todayTicket;
  } else if (data.generatedTicket) {
    ticket = data.generatedTicket;
  } else if (data.result?.ticket) {
    ticket = data.result.ticket;
  } else if (data.data?.ticket) {
    ticket = data.data.ticket;
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
  const availableIndex = tickets.findIndex((item) => item?.available !== false);
  if (availableIndex >= 0) {
    return availableIndex;
  }

  const safeIndex = tickets.findIndex((item) => item?.type === 'safe');
  return safeIndex >= 0 ? safeIndex : 0;
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

function formatTicketTimestamp(value) {
  if (!value) {
    return 'Sin registro';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function LoadingState() {
  return (
    <div className="ticket-panel ticket-panel-main glass-card react-ticket-state">
      <span className="ui-badge subtle">GET /today</span>
      <h3>Cargando ticket cacheado</h3>
      <p>Consultando cache read-only. No se genera ticket ni se refrescan odds.</p>
    </div>
  );
}

function ErrorState({ message, mode = 'read' }) {
  return (
    <div className="ticket-panel ticket-panel-main glass-card react-ticket-state error">
      <span className="ui-badge warning">Error</span>
      <h3>{mode === 'generate' ? 'No se pudo generar el Ticket del Dia' : 'No se pudo leer el Ticket del Dia'}</h3>
      <p>{message || 'El backend no respondio el cache de hoy.'}</p>
      <small>
        {mode === 'generate'
          ? 'Generate se intento solo por click manual. No se llamo odds refresh.'
          : 'Solo se intento GET /api/daily-ticket/today.'}
      </small>
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
    </div>
  );
}

function GeneratingState() {
  return (
    <div className="ticket-panel ticket-panel-main glass-card react-ticket-state generating">
      <span className="ui-badge pending">POST /generate</span>
      <h3>Generando Ticket del Dia</h3>
      <p>Generacion manual en curso. Puede usar IA configurada, pero no hace live odds ni refresh.</p>
    </div>
  );
}

function GenerateManualPanel({ disabled, isGenerating, generatedManually, onGenerate }) {
  return (
    <section className="ticket-panel glass-card react-generate-panel">
      <div>
        <p className="panel-kicker">Desk action</p>
        <h3>Generacion manual</h3>
        <p>
          Generacion manual. Puede usar IA configurada, pero no hace live odds ni refresh.
        </p>
      </div>
      <div className="react-generate-controls">
        {generatedManually ? <span className="ui-badge generated">Generado manualmente</span> : null}
        <button
          type="button"
          className="btn btn-primary btn-ticket react-generate-button"
          disabled={disabled}
          onClick={onGenerate}
        >
          {isGenerating ? 'Generando...' : 'Generar Ticket del Día'}
        </button>
      </div>
    </section>
  );
}

export default function DailyTicketView() {
  const [status, setStatus] = useState('loading');
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [errorMode, setErrorMode] = useState('read');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedManually, setGeneratedManually] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  function applyTicketData(data, { manual = false } = {}) {
    const normalized = normalizeTodayTicketResponse(data);
    const nextTickets = getRenderableTickets(normalized.ticket);

    if (!normalized.hasTicketToday || !normalized.ticket || !nextTickets.length) {
      setTicket(null);
      setSelectedIndex(0);
      setGeneratedManually(false);
      setStatus('empty');
      return false;
    }

    setTicket(normalized.ticket);
    setSelectedIndex(getDefaultTicketIndex(nextTickets));
    setGeneratedManually(manual);
    setStatus('success');
    return true;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTicket() {
      setStatus('loading');
      setError('');
      setErrorMode('read');
      setGeneratedManually(false);

      try {
        const data = await getTodayTicket();
        if (cancelled) {
          return;
        }

        applyTicketData(data);
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

  async function handleGenerateTicket() {
    if (isGenerating || status === 'loading') {
      return;
    }

    setIsGenerating(true);
    setError('');
    setErrorMode('generate');
    setGeneratedManually(false);
    setStatus('generating');

    try {
      const generated = await generateDailyTicket();
      let rendered = applyTicketData(generated, { manual: true });

      if (!rendered && generated?.success === true) {
        const refreshed = await getTodayTicket();
        rendered = applyTicketData(refreshed, { manual: true });
      }

      if (!rendered) {
        setTicket(null);
        setSelectedIndex(0);
        setGeneratedManually(false);
        setStatus('empty');
      }
    } catch (generateError) {
      setTicket(null);
      setError(
        'No se pudo generar el ticket del dia. El backend no devolvio un ticket renderizable; revisa el cache de odds o intenta mas tarde.'
      );
      setErrorMode('generate');
      setGeneratedManually(false);
      setStatus('error');
    } finally {
      setIsGenerating(false);
    }
  }

  const tickets = useMemo(() => getRenderableTickets(ticket), [ticket]);
  const selectedTicket = tickets[selectedIndex] || tickets[0] || null;
  const totalLegs = tickets.reduce((sum, item) => {
    return sum + (Array.isArray(item?.legs) ? item.legs.length : 0);
  }, 0);
  const actionDisabled = status === 'loading' || isGenerating;

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
            Vista conectada a cache read-only y generate manual. Sin generate automatico,
            sin Bedrock y sin Odds API live al abrir.
          </p>
        </div>
        <div className="react-ticket-intro-badges">
          <span className="ui-badge cache">Cache listo</span>
          <span className="ui-badge subtle">Read-only</span>
          <span className="ui-badge subtle">No live calls</span>
        </div>
      </div>

      <GenerateManualPanel
        disabled={actionDisabled}
        isGenerating={isGenerating}
        generatedManually={generatedManually}
        onGenerate={handleGenerateTicket}
      />

      {status === 'loading' ? <LoadingState /> : null}
      {status === 'generating' ? <GeneratingState /> : null}
      {status === 'error' ? <ErrorState message={error} mode={errorMode} /> : null}
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
                <span>Generado: {formatTicketTimestamp(ticket?.generatedAt)}</span>
                <span>Tickets disponibles: {tickets.length}</span>
                <span>Legs renderizadas: {totalLegs}</span>
                <span>Generacion: {generatedManually ? 'manual completada' : 'manual disponible'}</span>
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
