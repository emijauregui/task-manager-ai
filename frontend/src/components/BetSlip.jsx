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

function compactText(value, maxLength = 96) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function getTicketSummary(ticket, parentTicket) {
  if (ticket?.available === false) {
    return ticket?.reason || 'No hay suficientes picks validos para este ticket.';
  }

  return ticket?.summary || parentTicket?.summary || 'Ticket cacheado listo para revisar en modo read-only.';
}

function getTicketConfidence(ticket, parentTicket) {
  const legs = Array.isArray(ticket?.legs) ? ticket.legs.filter(Boolean) : [];
  const legScores = legs
    .map((leg) => Number(leg?.confidence))
    .filter((value) => Number.isFinite(value));

  if (legScores.length) {
    const average = legScores.reduce((sum, value) => sum + value, 0) / legScores.length;
    return `${Math.round(average)}%`;
  }

  const parentScore = Number(parentTicket?.meta?.avgTicketConfidence);
  return Number.isFinite(parentScore) ? `${Math.round(parentScore)}%` : 'n/d';
}

function getTicketStake(ticket) {
  return ticket?.stake || ticket?.stakeSuggestion || 'Libre';
}

function getTicketOdds(ticket) {
  return ticket?.odds || ticket?.targetOdds || 'Sin rango';
}

function getTicketRisk(ticket) {
  return ticket?.risk || ticket?.riskLevel || 'Sin riesgo';
}

function getTicketStatus(generatedManually) {
  return generatedManually ? 'Manual' : 'Cache-first';
}

function getCacheStatus(generatedManually) {
  return generatedManually ? 'Manual cache write' : 'Cache-first read-only';
}

function getReadableDate(value) {
  const text = String(value || '').trim();
  return text || 'n/d';
}

export default function BetSlip({ ticket, parentTicket, selectedIndex, generatedManually = false }) {
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
  const statusCopy = getCacheStatus(generatedManually);
  const metrics = [
    { label: 'Stake', value: getTicketStake(ticket) },
    { label: 'Momio', value: getTicketOdds(ticket), tone: 'odds' },
    { label: 'Confianza', value: getTicketConfidence(ticket, parentTicket) },
    { label: 'Picks', value: String(legs.length) },
    { label: 'Riesgo', value: getTicketRisk(ticket) },
  ];
  const ledgerMetrics = metrics.slice(0, 3);
  const supportMetrics = metrics.slice(3);

  return (
    <section className={`bet-slip-card slip-card subtle-grain-overlay daily-ticket-slip ${ticket?.type || 'safe'}${unavailable ? ' is-unavailable' : ''}`}>
      <span className="slip-side-notch left" aria-hidden="true" />
      <span className="slip-side-notch right" aria-hidden="true" />
      <div className="bet-slip-receipt-line">
        <span>{statusCopy}</span>
        <span className="bet-slip-serial">{String(ticket?.type || `ticket-${selectedIndex + 1}`).toUpperCase()}</span>
        <span>{parentTicket?.date || 'Sin fecha'}</span>
      </div>

      <div className="bet-slip-header">
        <div>
          <p className="panel-kicker">Daily slip</p>
          <div className="bet-slip-title-row">
            <h4>{getTicketName(ticket, selectedIndex)}</h4>
            <span className="ui-badge subtle">Slip {selectedIndex + 1}</span>
          </div>
          <p>{compactText(getTicketSummary(ticket, parentTicket))}</p>
        </div>
        <div className="bet-slip-status-stack">
          <span className="status-pill pending stamp-badge">{getTicketStatus(generatedManually)}</span>
          <span className="ui-badge cache">Cache listo</span>
        </div>
      </div>

      <div className="bet-slip-metrics bet-slip-ledger daily-ticket-ledger" aria-label="Resumen del boleto">
        {ledgerMetrics.map((item) => (
          <div className={`bet-slip-metric${item.tone ? ` ${item.tone}` : ''}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="bet-slip-support-metrics" aria-label="Datos secundarios del boleto">
        {supportMetrics.map((item) => (
          <span key={item.label}>
            {item.label}
            <strong>{item.value}</strong>
          </span>
        ))}
        <span>
          Estado
          <strong>{unavailable ? 'No disponible' : getTicketStatus(generatedManually)}</strong>
        </span>
      </div>

      <div className="compact-divider ticket-perforation" aria-hidden="true" />

      {unavailable ? (
        <div className="ticket-unavailable">
          <span className="ui-badge subtle">No disponible</span>
          <p>{ticket?.reason || 'No hay suficientes picks validos para este ticket.'}</p>
        </div>
      ) : legs.length ? (
        <section className="bet-slip-leg-section" aria-label="Picks del ticket seleccionado">
          <div className="bet-slip-section-header">
            <div>
              <span className="summary-rail-label">Picks del boleto</span>
              <strong>{legs.length} picks listos</strong>
            </div>
            <span className="ui-badge subtle">Analisis oculto</span>
          </div>
          <div className="bet-slip-body">
            {legs.map((leg, index) => (
              <LegRow key={`${leg?.pick || leg?.market || 'leg'}-${index}`} leg={leg} index={index} />
            ))}
          </div>
        </section>
      ) : (
        <div className="empty-inline rich">
          <strong>Sin legs disponibles para este ticket.</strong>
          <p>La respuesta vino incompleta, pero la vista queda estable.</p>
        </div>
      )}

      <div className="bet-slip-report-strip bet-slip-meta-footer">
        <span>
          Cache
          <strong>{getReadableDate(parentTicket?.cacheDate || parentTicket?.date)}</strong>
        </span>
        <span>
          Target
          <strong>{getReadableDate(parentTicket?.targetDate || parentTicket?.date)}</strong>
        </span>
        <span>
          Estado
          <strong>{unavailable ? 'No disponible' : 'Disponible'}</strong>
        </span>
      </div>

      <div className="receipt-footer">
        <span>Read-only</span>
        <span>{legs.length} picks</span>
        <span>{ticket?.type || 'ticket'}</span>
      </div>
    </section>
  );
}
