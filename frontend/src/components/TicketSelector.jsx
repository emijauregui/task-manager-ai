function getTicketName(ticket, index) {
  return ticket?.name || ticket?.title || `Ticket ${index + 1}`;
}

function getTicketOdds(ticket) {
  return ticket?.odds || ticket?.targetOdds || 'Sin rango';
}

function getTicketMeta(ticket) {
  const legs = Array.isArray(ticket?.legs) ? ticket.legs.length : 0;
  const risk = ticket?.risk || ticket?.riskLevel || 'Riesgo n/d';
  return `${legs} legs | ${risk}`;
}

export default function TicketSelector({ tickets, selectedIndex, onSelect }) {
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

        return (
          <button
            key={`${ticket?.type || 'ticket'}-${index}`}
            type="button"
            className={`ticket-selector-card mini-ticket-card ${ticket?.type || 'safe'}${active ? ' active' : ''}${unavailable ? ' is-unavailable' : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(index)}
          >
            <div className="ticket-selector-top">
              <span className="ticket-card-chip">{getTicketOdds(ticket)}</span>
              <span className="risk-pill subtle">{ticket?.stake || ticket?.stakeSuggestion || 'Stake libre'}</span>
            </div>
            <strong>{getTicketName(ticket, index)}</strong>
            <div className="ticket-selector-meta">
              <span>{getTicketMeta(ticket)}</span>
              <span>{unavailable ? 'No disponible' : 'Read-only'}</span>
            </div>
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
