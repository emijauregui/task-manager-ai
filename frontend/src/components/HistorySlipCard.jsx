import Badge from './Badge';
import { asArray, getNumber, getText } from '../services/dataUtils';

const TICKET_NAME_BY_TYPE = {
  emi: 'Estilo Emi',
  free: 'Free Bet',
  free_bet: 'Free Bet',
  freebet: 'Free Bet',
  safe: 'Ticket Seguro',
};

function formatNumber(value, fallback = 'n/d') {
  const numeric = getNumber(value);
  if (numeric === null) return fallback;

  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
  }).format(numeric);
}

function formatMoney(value) {
  const numeric = getNumber(value);
  if (numeric === null) return 'n/d';

  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatPercent(value) {
  const numeric = getNumber(value);
  if (numeric === null) return 'n/d';
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

function getTicketType(ticket) {
  const type = String(ticket?.type || ticket?.ticketType || ticket?.key || '').toLowerCase();
  return type || 'archive';
}

function getTicketTypeLabel(ticket) {
  const type = getTicketType(ticket);
  return getText(ticket?.typeLabel, ticket?.label, ticket?.name, ticket?.title, TICKET_NAME_BY_TYPE[type], 'Archive slip');
}

function getStatusMeta(ticket) {
  const rawStatus = getText(ticket?.status, ticket?.result, ticket?.computedResult, ticket?.settlementType);
  const status = rawStatus.toLowerCase();
  const won = getNumber(ticket?.won, ticket?.wins);
  const lost = getNumber(ticket?.lost, ticket?.losses);
  const pending = getNumber(ticket?.pending);
  const voided = getNumber(ticket?.void, ticket?.voids);
  const netProfit = getNumber(ticket?.netProfit, ticket?.profit, ticket?.net);

  if (status.includes('won') || status.includes('win') || status.includes('gan')) {
    return { tone: 'won', label: 'Win' };
  }
  if (status.includes('lost') || status.includes('loss') || status.includes('perd')) {
    return { tone: 'lost', label: 'Loss' };
  }
  if (status.includes('push')) {
    return { tone: 'push', label: 'Push' };
  }
  if (status.includes('void') || status.includes('refund') || status.includes('cancel') || (voided !== null && voided > 0)) {
    return { tone: 'void', label: 'Void/refund' };
  }
  if (status.includes('pending')) {
    return { tone: 'pending', label: 'Pending' };
  }
  if (!rawStatus && netProfit !== null && netProfit > 0) {
    return { tone: 'won', label: 'Positive' };
  }
  if (!rawStatus && netProfit !== null && netProfit < 0) {
    return { tone: 'lost', label: 'Negative' };
  }
  if (!rawStatus && voided !== null && voided > 0) {
    return { tone: 'void', label: 'Void/refund' };
  }
  if (!rawStatus && pending !== null && pending > 0) {
    return { tone: 'pending', label: 'Pending' };
  }
  if (!rawStatus && won !== null && won > 0 && !lost) {
    return { tone: 'won', label: 'Positive' };
  }

  return { tone: 'subtle', label: 'Settled n/d' };
}

function getLegs(ticket) {
  const directLegs = asArray(ticket?.legs);
  if (directLegs.length) return directLegs;

  return asArray(ticket?.tickets).flatMap((item) => asArray(item?.legs));
}

function getLegLabel(leg, index) {
  return getText(
    leg?.pick,
    leg?.selection,
    leg?.market,
    leg?.game,
    leg?.team,
    `Leg ${index + 1}`
  );
}

function getCompactRecord(ticket) {
  const pieces = [
    ['W', getNumber(ticket?.won, ticket?.wins)],
    ['L', getNumber(ticket?.lost, ticket?.losses)],
    ['P', getNumber(ticket?.push, ticket?.pushes)],
    ['V', getNumber(ticket?.void, ticket?.voids)],
  ]
    .filter(([, value]) => value !== null)
    .map(([label, value]) => `${label}${value}`);

  return pieces.length ? pieces.join(' / ') : 'Record n/d';
}

export default function HistorySlipCard({ ticket, index = 0, variant = 'ticket' }) {
  const status = getStatusMeta(ticket);
  const legs = getLegs(ticket);
  const ticketType = getTicketType(ticket);
  const totalPicks = getNumber(ticket?.totalPicks, ticket?.totalLegs, ticket?.count, ticket?.total, legs.length);
  const netProfit = getNumber(ticket?.netProfit, ticket?.profit, ticket?.net);
  const roi = getNumber(ticket?.roi, ticket?.ROI);
  const multiplier = getText(ticket?.multiplier, ticket?.settlementMultiplier, ticket?.odds, ticket?.targetOdds);
  const date = getText(ticket?.date, ticket?.ticketDate, ticket?.createdAt, ticket?.generatedAt);

  return (
    <article className={`history-ticket-card archive-slip-card react-history-slip history-premium-slip ${status.tone} ${ticketType}`}>
      <div className="history-slip-stub" aria-hidden="true" />

      <div className="history-ticket-top">
        <div>
          <span className="history-ticket-serial">
            {variant === 'type' ? 'TYPE' : 'ARC'}-{String(index + 1).padStart(3, '0')}
          </span>
          <strong>{variant === 'type' ? getTicketTypeLabel(ticket) : formatDate(date)}</strong>
          <h4>{variant === 'type' ? getCompactRecord(ticket) : getTicketTypeLabel(ticket)}</h4>
        </div>
        <div className="history-ticket-badges">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone="subtle">{variant === 'type' ? 'Tipo ticket' : 'Read-only'}</Badge>
        </div>
      </div>

      <div className="history-slip-ledger">
        <span>
          <small>Picks</small>
          <strong>{formatNumber(totalPicks, '0')}</strong>
        </span>
        <span>
          <small>Net</small>
          <strong>{formatMoney(netProfit)}</strong>
        </span>
        <span>
          <small>ROI</small>
          <strong>{formatPercent(roi)}</strong>
        </span>
        <span>
          <small>Mult.</small>
          <strong>{multiplier || 'n/d'}</strong>
        </span>
      </div>

      <p>
        {getText(
          ticket?.summary,
          ticket?.note,
          ticket?.description,
          variant === 'type'
            ? `${getTicketTypeLabel(ticket)} archivado con lectura de rendimiento por tipo.`
            : 'Slip historico del archivo cacheado.'
        )}
      </p>

      {legs.length ? (
        <div className="history-leg-strip">
          {legs.slice(0, 4).map((leg, legIndex) => (
            <span key={`${getLegLabel(leg, legIndex)}-${legIndex}`}>
              {getLegLabel(leg, legIndex)}
            </span>
          ))}
        </div>
      ) : (
        <div className="history-leg-strip is-empty">
          <span>Sin legs detalladas en summary</span>
        </div>
      )}
    </article>
  );
}
