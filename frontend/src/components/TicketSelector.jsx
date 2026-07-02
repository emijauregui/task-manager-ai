const TICKET_NAME_BY_TYPE = {
  safe: 'Ticket Seguro',
  emi: 'Estilo Emi',
  free: 'Free Bet',
  free_bet: 'Free Bet',
  freebet: 'Free Bet',
};

function getTicketName(ticket, index) {
  const type = String(ticket?.type || '').toLowerCase();
  return ticket?.name || ticket?.title || TICKET_NAME_BY_TYPE[type] || `Ticket ${index + 1}`;
}

function getTicketOdds(ticket) {
  return ticket?.odds || ticket?.targetOdds || 'Sin rango';
}

function getTicketLegs(ticket) {
  return Array.isArray(ticket?.legs) ? ticket.legs.filter(Boolean) : [];
}

function getTicketMeta(ticket) {
  const legs = Array.isArray(ticket?.legs) ? ticket.legs.length : 0;
  const risk = ticket?.risk || ticket?.riskLevel || 'Riesgo n/d';
  return `${legs} legs | ${String(risk).replace(/_/g, ' ')}`;
}

function getTicketSummary(ticket, parentTicket) {
  if (ticket?.available === false) {
    return ticket?.reason || 'Sin suficientes picks validos para este slip.';
  }

  return ticket?.summary || ticket?.reason || parentTicket?.summary || '';
}

function getConfidence(ticket) {
  const scores = getTicketLegs(ticket)
    .map((leg) => Number(leg?.confidence))
    .filter((value) => Number.isFinite(value));

  if (!scores.length) {
    return 'n/d';
  }

  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return `${Math.round(average)}%`;
}

function getConfidenceNumber(ticket) {
  const scores = getTicketLegs(ticket)
    .map((leg) => Number(leg?.confidence))
    .filter((value) => Number.isFinite(value));

  if (!scores.length) {
    return 0;
  }

  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return Math.max(0, Math.min(100, Math.round(average)));
}

function getRiskLabel(ticket) {
  return String(ticket?.risk || ticket?.riskLevel || 'n/d').replace(/_/g, ' ');
}

function summarizeWarningChip(text) {
  const value = String(text || '').trim();
  if (!value) {
    return '';
  }

  return value.length > 34 ? `${value.slice(0, 31).trim()}...` : value;
}

function getTicketWarnings(ticket) {
  const warnings = [
    ...(Array.isArray(ticket?.warnings) ? ticket.warnings : []),
    ...(Array.isArray(ticket?.ruleWarnings) ? ticket.ruleWarnings : []),
  ]
    .map(summarizeWarningChip)
    .filter(Boolean);

  return Array.from(new Set(warnings)).slice(0, 2);
}

function getTicketVisualType(ticket) {
  const type = String(ticket?.type || '').toLowerCase();
  if (type.includes('free')) return 'free';
  if (type.includes('emi')) return 'emi';
  return 'safe';
}

function TicketSelectorIcon({ type }) {
  if (type === 'emi') {
    return (
      <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">
        <path d="M16 4.5l2.9 8.4h8.8l-7.1 5.1 2.8 8.5-7.4-5.2-7.4 5.2 2.8-8.5-7.1-5.1h8.8L16 4.5Z" />
      </svg>
    );
  }

  if (type === 'free') {
    return (
      <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">
        <path d="M7 13h18v14H7V13Z" />
        <path d="M5.5 9h21v5H5.5V9Z" />
        <path d="M16 9v18" />
        <path d="M16 9c-3.9 0-6.2-1.6-6.2-3.3 0-1.1.9-2 2.1-2C14.2 3.7 16 9 16 9Z" />
        <path d="M16 9c3.9 0 6.2-1.6 6.2-3.3 0-1.1-.9-2-2.1-2C17.8 3.7 16 9 16 9Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">
      <path d="M16 4.5l10 3.7v6.9c0 6.4-3.9 10.9-10 12.6C9.9 26 6 21.5 6 15.1V8.2l10-3.7Z" />
      <path d="M11.5 16.2l3 3 6.2-7" />
    </svg>
  );
}

export default function TicketSelector({ tickets, selectedIndex, onSelect, parentTicket }) {
  if (!tickets.length) {
    return (
      <div className="empty-inline rich">
        <strong>Sin tickets listos para mostrar.</strong>
        <p>El endpoint respondio sin slips disponibles para hoy.</p>
      </div>
    );
  }

  return (
    <div className="ticket-selector-grid react-ticket-selector">
      {tickets.map((ticket, index) => {
        const active = index === selectedIndex;
        const unavailable = ticket?.available === false;
        const warnings = getTicketWarnings(ticket);
        const legs = getTicketLegs(ticket);
        const summary = getTicketSummary(ticket, parentTicket);
        const confidence = getConfidenceNumber(ticket);
        const visualType = getTicketVisualType(ticket);

        return (
          <button
            key={`${ticket?.type || 'ticket'}-${index}`}
            type="button"
            className={`ticket-selector-card mini-ticket-card ${ticket?.type || 'safe'}${active ? ' active' : ''}${unavailable ? ' is-unavailable' : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(index)}
            style={{ '--selector-confidence': `${confidence}%` }}
          >
            <span className="ticket-selector-rail" aria-hidden="true" />
            <span className={`ticket-selector-mark ${visualType}`} aria-hidden="true">
              <TicketSelectorIcon type={visualType} />
            </span>
            <div className="ticket-selector-top">
              <span className="ticket-card-chip">{getTicketOdds(ticket)}</span>
              <span className="risk-pill subtle">{ticket?.stake || ticket?.stakeSuggestion || 'Stake libre'}</span>
            </div>
            <div className="ticket-selector-title-row">
              <strong>{getTicketName(ticket, index)}</strong>
              <span>{active ? 'Activo' : `Slip ${index + 1}`}</span>
            </div>
            <div className="ticket-selector-meta">
              <span>{getTicketMeta(ticket)}</span>
              <span>{unavailable ? 'No disponible' : 'Read-only'}</span>
            </div>
            <div className="ticket-selector-stat-grid" aria-label="Datos clave del ticket">
              <span>
                Legs
                <strong>{legs.length}</strong>
              </span>
              <span>
                Riesgo
                <strong>{getRiskLabel(ticket)}</strong>
              </span>
              <span>
                Conf.
                <strong>{getConfidence(ticket)}</strong>
              </span>
            </div>
            <div className="ticket-selector-confidence-bar" aria-hidden="true">
              <span />
            </div>
            {summary ? <p className="ticket-selector-summary">{summary}</p> : null}
            {warnings.length ? (
              <div className="ticket-selector-warnings" aria-label="Warnings del ticket">
                {warnings.map((warning) => (
                  <span className="warning-chip" key={warning}>{warning}</span>
                ))}
              </div>
            ) : null}
            <div className="ticket-selector-serial-row">
              <span className="ticket-card-copy">Cache listo</span>
              <span className="ticket-card-serial">{String(ticket?.type || `slip-${index + 1}`).toUpperCase()}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
