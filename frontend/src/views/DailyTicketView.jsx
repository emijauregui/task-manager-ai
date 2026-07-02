/**
 * DailyTicketView.jsx
 * Phase: React Migration v3.3 - Generate Manual Button
 */
import { useEffect, useMemo, useState } from 'react';
import { generateDailyTicket, getTodayTicket } from '../services/api';
import BetSlip from '../components/BetSlip';
import TicketSelector from '../components/TicketSelector';
import ViewState from '../components/ViewState';

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

function formatShortTicketDate(dateKey) {
  if (!dateKey) {
    return 'Sin fecha';
  }

  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}

function formatMazatlanTime(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'n/d';
  }

  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Mazatlan',
  }).format(parsed);
}

function getTicketLegs(ticket) {
  return Array.isArray(ticket?.legs) ? ticket.legs.filter(Boolean) : [];
}

function getTicketName(ticket, index = 0) {
  const type = String(ticket?.type || '').toLowerCase();
  const names = {
    safe: 'Ticket Seguro',
    emi: 'Estilo Emi',
    free: 'Free Bet',
    free_bet: 'Free Bet',
    freebet: 'Free Bet',
  };

  return ticket?.name || ticket?.title || names[type] || `Ticket ${index + 1}`;
}

function normalizeDisplayValue(value, fallback = 'n/d') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value).replace(/_/g, ' ');
}

function compactText(value, maxLength = 132) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function getTicketConfidence(ticket, parentTicket) {
  const legs = getTicketLegs(ticket);
  const legScores = legs
    .map((leg) => Number(leg?.confidence))
    .filter((value) => Number.isFinite(value));

  if (legScores.length) {
    const average = legScores.reduce((sum, value) => sum + value, 0) / legScores.length;
    return `${Math.round(average)}%`;
  }

  const parentScore = Number(parentTicket?.meta?.avgTicketConfidence);
  if (Number.isFinite(parentScore)) {
    return `${Math.round(parentScore)}%`;
  }

  return 'n/d';
}

function getTicketConfidenceTrack(ticket, parentTicket) {
  const value = getTicketConfidence(ticket, parentTicket);
  return /^\d+%$/.test(value) ? value : '0%';
}

function getTicketStake(ticket) {
  return ticket?.stake || ticket?.stakeSuggestion || 'Libre';
}

function getTicketOdds(ticket) {
  return ticket?.odds || ticket?.targetOdds || 'Sin rango';
}

function getTicketRisk(ticket) {
  return normalizeDisplayValue(ticket?.risk || ticket?.riskLevel, 'n/d');
}

function collectTicketInsights(ticket, parentTicket) {
  const parentWarnings = Array.isArray(parentTicket?.warnings) ? parentTicket.warnings : [];
  const ticketWarnings = Array.isArray(ticket?.warnings) ? ticket.warnings : [];
  const historicalWarnings = Array.isArray(parentTicket?.meta?.historicalInfluenceWarnings)
    ? parentTicket.meta.historicalInfluenceWarnings
    : [];
  const positiveSignals = Array.isArray(parentTicket?.meta?.historicalPatternSummary?.positiveSignals)
    ? parentTicket.meta.historicalPatternSummary.positiveSignals
    : [];
  const sourceReason = parentTicket?.sourceDateReason || ticket?.sourceDateReason || '';
  const candidates = [
    ticket?.summary,
    ticket?.reason,
    parentTicket?.summary,
    ...historicalWarnings,
    ...ticketWarnings,
    ...parentWarnings,
    ...positiveSignals.map((signal) => normalizeDisplayValue(signal)),
    sourceReason ? normalizeDisplayValue(sourceReason) : '',
  ]
    .map((item) => compactText(item, 86))
    .filter(Boolean);

  return Array.from(new Set(candidates)).slice(0, 1);
}

function getTicketStatusLabel(generatedManually) {
  return generatedManually ? 'Manual cache write' : 'Cache-first read-only';
}

function DailyTicketHero({
  ticket,
  selectedTicket,
  selectedIndex = 0,
  ticketsCount,
  totalLegs,
  generatedManually,
}) {
  const activeLegs = getTicketLegs(selectedTicket);
  const cacheStatus = generatedManually ? 'Manual cache write' : 'Cache read';

  return (
    <section className="view-intro-panel glass-card react-ticket-intro daily-ticket-hero-panel daily-ticket-desk-hero">
      <div className="daily-ticket-hero-header">
        <div className="daily-ticket-brand-lockup">
          <h2>
            DAILY TICKET <span>AI</span>
          </h2>
          <p>MLB Analytics Control Room</p>
        </div>

        <div className="daily-ticket-control-strip" aria-label="Estado operativo del Daily Ticket">
          <span>
            Slate
            <strong>MLB / {formatShortTicketDate(ticket?.date)}</strong>
          </span>
          <span>
            Cache status
            <strong>{cacheStatus}</strong>
          </span>
          <span>
            Hora Mazatlan
            <strong>{formatMazatlanTime()}</strong>
          </span>
          <span>
            Calls
            <strong>No live calls</strong>
          </span>
        </div>
      </div>

      <div className="daily-ticket-hero-metrics" aria-label="Resumen operativo del Daily Ticket">
        <span>
          <strong>{getTicketStake(selectedTicket)}</strong>
          Stake
        </span>
        <span>
          <strong>{getTicketOdds(selectedTicket)}</strong>
          Momio
        </span>
        <span>
          <strong>{getTicketConfidence(selectedTicket, ticket)}</strong>
          Confianza
        </span>
        <span>
          <strong>{activeLegs.length || totalLegs || '0'}</strong>
          Picks
        </span>
      </div>

      <div className="react-ticket-intro-badges">
        <strong>{selectedTicket ? getTicketName(selectedTicket, selectedIndex) : 'Ticket del dia'}</strong>
        <span className="ui-badge cache">Cache-first</span>
        <span className="ui-badge subtle">Ticket {selectedIndex + 1} / {Math.max(ticketsCount, 1)}</span>
        <span className="ui-badge subtle">{getTicketRisk(selectedTicket)}</span>
        {generatedManually ? <span className="ui-badge generated">Manual</span> : null}
      </div>
    </section>
  );
}

function SummaryMetric({ label, value, tone = '' }) {
  return (
    <div className={`summary-rail-metric${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DailyTicketSummaryPanel({
  ticket,
  selectedTicket,
  selectedIndex,
  generatedManually,
  totalTickets,
}) {
  const legs = getTicketLegs(selectedTicket);
  const insights = collectTicketInsights(selectedTicket, ticket);
  const cacheDate = ticket?.cacheDate || ticket?.date || 'n/d';
  const targetDate = ticket?.targetDate || ticket?.date || 'n/d';
  const aliasDate = ticket?.aliasForDate || '';
  const statusLabel = getTicketStatusLabel(generatedManually);

  return (
    <section className="daily-ticket-summary-rail glass-card daily-ticket-summary-slip" aria-label="Resumen del ticket seleccionado">
      <div className="summary-rail-topline">
        <span className="panel-kicker">Resumen del ticket</span>
        <span className="ui-badge subtle">Ticket {selectedIndex + 1} / {totalTickets}</span>
      </div>

      <div className="summary-rail-title-block">
        <span className="summary-rail-pick-count">{legs.length} picks</span>
        <h3>{getTicketName(selectedTicket, selectedIndex)}</h3>
      </div>

      <div className="summary-rail-score">
        <span>Confianza</span>
        <strong>{getTicketConfidence(selectedTicket, ticket)}</strong>
      </div>

      <div className="summary-rail-confidence-track" aria-hidden="true">
        <span style={{ '--summary-confidence': getTicketConfidenceTrack(selectedTicket, ticket) }} />
      </div>

      <div className="summary-rail-metrics">
        <SummaryMetric label="Stake" value={getTicketStake(selectedTicket)} />
        <SummaryMetric label="Momio" value={getTicketOdds(selectedTicket)} />
        <SummaryMetric label="Riesgo" value={getTicketRisk(selectedTicket)} />
        <SummaryMetric label="Legs" value={String(legs.length)} tone="accent" />
      </div>

      <div className="summary-rail-chip-row">
        <span className="ui-badge cache">{statusLabel}</span>
        <span className="ui-badge subtle">{normalizeDisplayValue(selectedTicket?.type || 'ticket')}</span>
        {selectedTicket?.available === false ? <span className="ui-badge warning">No disponible</span> : null}
      </div>

      {insights.length ? (
        <div className="summary-rail-insights">
          <span className="summary-rail-label">Lectura rapida</span>
          {insights.map((insight) => (
            <p key={insight}>{insight}</p>
          ))}
        </div>
      ) : null}

      <div className="summary-rail-date-grid">
        <span>
          Cache date
          <strong>{cacheDate}</strong>
        </span>
        <span>
          Target date
          <strong>{targetDate}</strong>
        </span>
        <span>
          Generated
          <strong>{formatTicketTimestamp(ticket?.generatedAt)}</strong>
        </span>
        {aliasDate ? (
          <span>
            Alias for
            <strong>{aliasDate}</strong>
          </span>
        ) : null}
      </div>
    </section>
  );
}

function GenerateManualPanel({ disabled, isGenerating, generatedManually, onGenerate }) {
  return (
    <section className="ticket-panel glass-card react-generate-panel daily-ticket-action-panel daily-ticket-action-strip">
      <div>
        <p className="panel-kicker">Control manual</p>
        <h3>Generate solo por click</h3>
        <p>
          La lectura del ticket no dispara cuotas live ni generate automatico.
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

    const confirmed = window.confirm(
      'Esto generará un ticket manual usando la configuración actual. No activará live odds ni refresh de cuotas. ¿Continuar?'
    );
    if (!confirmed) {
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
  const hasTicket = status === 'success';
  const stateContent = (
    <>
      {status === 'loading' ? (
        <ViewState
          as="div"
          className="ticket-panel ticket-panel-main glass-card react-ticket-state"
          badge="GET /today"
          title="Cargando ticket cacheado"
          copy="Consultando cache read-only. No se genera ticket ni se refrescan odds."
        />
      ) : null}
      {status === 'generating' ? (
        <ViewState
          as="div"
          className="ticket-panel ticket-panel-main glass-card react-ticket-state generating"
          badge="POST /generate"
          badgeTone="pending"
          title="Generando Ticket del Dia"
          copy="Generacion manual en curso. Puede usar IA configurada, pero no hace live odds ni refresh."
        />
      ) : null}
      {status === 'error' ? (
        <ViewState
          as="div"
          className="ticket-panel ticket-panel-main glass-card react-ticket-state error"
          badge="Error"
          badgeTone="warning"
          title={errorMode === 'generate' ? 'No se pudo generar el Ticket del Dia' : 'No se pudo leer el Ticket del Dia'}
          copy={error || 'El backend no respondio el cache de hoy.'}
          detail={
            errorMode === 'generate'
              ? 'Generate se intento solo por click manual. No se llamo odds refresh.'
              : 'Solo se intento GET /api/daily-ticket/today.'
          }
        />
      ) : null}
      {status === 'empty' ? (
        <ViewState
          as="div"
          className="ticket-panel ticket-panel-main glass-card react-ticket-state"
          badge="Cache vacio"
          title="Todavia no hay ticket guardado para hoy"
          copy="Esta fase no genera tickets automaticamente. Cuando exista un ticket cacheado, aqui apareceran sus slips y legs en modo lectura."
        />
      ) : null}
    </>
  );

  return (
    <section
      className="app-view daily-ticket-section foundation-view is-active"
      id="daily-ticket"
      data-app-view="daily-ticket"
    >
      {hasTicket ? (
        <div className="daily-ticket-grid react-ticket-grid daily-ticket-layout">
          <div className="daily-ticket-main-column">
            <DailyTicketHero
              ticket={ticket}
              selectedTicket={selectedTicket}
              selectedIndex={selectedIndex}
              ticketsCount={tickets.length}
              totalLegs={totalLegs}
              generatedManually={generatedManually}
            />

            <GenerateManualPanel
              disabled={actionDisabled}
              isGenerating={isGenerating}
              generatedManually={generatedManually}
              onGenerate={handleGenerateTicket}
            />

            <section className="ticket-panel ticket-panel-main daily-ticket-report-panel">
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
              parentTicket={ticket}
            />

            <BetSlip
              ticket={selectedTicket}
              parentTicket={ticket}
              selectedIndex={selectedIndex}
              generatedManually={generatedManually}
            />

            {ticket?.disclaimer ? (
              <p className="ticket-disclaimer ticket-disclaimer-bottom">{ticket.disclaimer}</p>
            ) : null}
            </section>
          </div>

          <aside className="daily-ticket-side">
            <DailyTicketSummaryPanel
              ticket={ticket}
              selectedTicket={selectedTicket}
              selectedIndex={selectedIndex}
              generatedManually={generatedManually}
              totalTickets={tickets.length}
            />
          </aside>
        </div>
      ) : (
        <>
          <DailyTicketHero
            ticket={ticket}
            selectedTicket={selectedTicket}
            selectedIndex={selectedIndex}
            ticketsCount={tickets.length}
            totalLegs={totalLegs}
            generatedManually={generatedManually}
          />
          <GenerateManualPanel
            disabled={actionDisabled}
            isGenerating={isGenerating}
            generatedManually={generatedManually}
            onGenerate={handleGenerateTicket}
          />
          {stateContent}
        </>
      )}
    </section>
  );
}
