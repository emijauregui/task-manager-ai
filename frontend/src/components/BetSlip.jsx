import LegRow from './LegRow';

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

function getTicketSummary(ticket, parentTicket) {
  if (ticket?.available === false) {
    return ticket?.reason || 'No hay suficientes picks validos para este ticket.';
  }

  return ticket?.summary || parentTicket?.summary || 'Ticket cacheado listo para revisar en modo read-only.';
}

function summarizeWarningChip(text) {
  const value = String(text || '').trim();
  if (!value) {
    return '';
  }

  return value.length > 38 ? `${value.slice(0, 35).trim()}...` : value;
}

function getTicketWarnings(parentTicket, ticket) {
  const warnings = [
    ...(Array.isArray(parentTicket?.warnings) ? parentTicket.warnings : []),
    ...(Array.isArray(ticket?.warnings) ? ticket.warnings : []),
    ...(Array.isArray(ticket?.ruleWarnings) ? ticket.ruleWarnings : []),
  ]
    .map(summarizeWarningChip)
    .filter(Boolean);

  return Array.from(new Set(warnings));
}

export default function BetSlip({ ticket, parentTicket, selectedIndex }) {
  if (!ticket) {
    return (
      <div className="empty-inline rich">
        <strong>No hay un ticket seleccionable por ahora.</strong>
        <p>El endpoint respondio sin slips renderizables.</p>
      </div>
    );
  }

  const legs = Array.isArray(ticket.legs) ? ticket.legs.filter(Boolean) : [];
  const unavailable = ticket.available === false;
  const warnings = getTicketWarnings(parentTicket, ticket);
  const metrics = [
    { label: 'Stake', value: ticket.stake || ticket.stakeSuggestion || 'Libre' },
    { label: 'Momio', value: ticket.odds || ticket.targetOdds || 'Sin rango' },
    { label: 'Riesgo', value: ticket.risk || ticket.riskLevel || 'Sin riesgo' },
    { label: 'Legs', value: String(legs.length) },
  ];

  return (
    <section className={`bet-slip-card slip-card subtle-grain-overlay ${ticket?.type || 'safe'}${unavailable ? ' is-unavailable' : ''}`}>
      <div className="bet-slip-receipt-line">
        <span>Cache listo | read-only</span>
        <span className="bet-slip-serial">{String(ticket?.type || `ticket-${selectedIndex + 1}`).toUpperCase()}</span>
        <span>{parentTicket?.date || 'Sin fecha'}</span>
      </div>

      <div className="bet-slip-header">
        <div>
          <p className="panel-kicker">Bet slip cacheado</p>
          <h4>{getTicketName(ticket, selectedIndex)}</h4>
          <p>{getTicketSummary(ticket, parentTicket)}</p>
        </div>
        <div className="bet-slip-status-stack">
          <span className="status-pill pending stamp-badge">Read-only</span>
          <span className="ui-badge subtle">Ticket {selectedIndex + 1}</span>
        </div>
      </div>

      <div className="bet-slip-metrics">
        {metrics.map((item) => (
          <div className="bet-slip-metric" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="compact-divider ticket-perforation" aria-hidden="true" />

      {warnings.length ? (
        <div className="warning-chip-row react-ticket-warning-row">
          {warnings.map((warning) => (
            <span className="warning-chip" key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}

      {unavailable ? (
        <div className="ticket-unavailable">
          <span className="ui-badge subtle">No disponible</span>
          <p>{ticket?.reason || 'No hay suficientes picks validos para este ticket.'}</p>
        </div>
      ) : legs.length ? (
        <div className="bet-slip-body">
          {legs.map((leg, index) => (
            <LegRow key={`${leg?.pick || leg?.market || 'leg'}-${index}`} leg={leg} index={index} />
          ))}
        </div>
      ) : (
        <div className="empty-inline rich">
          <strong>Sin legs disponibles para este ticket.</strong>
          <p>La respuesta vino incompleta, pero la vista queda estable.</p>
        </div>
      )}

      <div className="compact-divider" aria-hidden="true" />
      <div className="receipt-footer">
        <span>Read-only</span>
        <span>{legs.length} legs</span>
        <span>{ticket?.type || 'ticket'}</span>
      </div>
    </section>
  );
}
