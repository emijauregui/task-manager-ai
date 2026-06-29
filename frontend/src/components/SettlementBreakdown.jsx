import Badge from './Badge';
import { asArray, isObject, objectEntries } from '../services/dataUtils';

const LABEL_BY_KEY = {
  all_void_refund: 'Refund void',
  full_multiplier: 'Full multiplier',
  lost: 'Loss',
  loss: 'Loss',
  pending: 'Pending',
  push: 'Push',
  reduced_multiplier: 'Reduced multiplier',
  refund: 'Refund',
  settled: 'Settled',
  void: 'Void',
  won: 'Win',
  win: 'Win',
};

function humanizeKey(value) {
  const key = String(value || '').trim();
  if (!key) return 'Breakdown';
  return LABEL_BY_KEY[key] || key.replace(/[_-]/g, ' ');
}

function formatNestedValue(value) {
  if (!isObject(value)) return value;

  return objectEntries(value, 4)
    .map(([key, entryValue]) => `${humanizeKey(key)} ${String(entryValue)}`)
    .join(' | ');
}

function getTone(key) {
  const value = String(key || '').toLowerCase();
  if (value.includes('win') || value.includes('won') || value.includes('full')) return 'won';
  if (value.includes('lost') || value.includes('loss')) return 'lost';
  if (value.includes('void') || value.includes('refund') || value.includes('push') || value.includes('reduced')) return 'void';
  if (value.includes('pending')) return 'pending';
  return 'subtle';
}

function normalizeBreakdown(value) {
  if (Array.isArray(value)) {
    return asArray(value)
      .map((item, index) => {
        if (isObject(item)) {
          const key = item.key || item.type || item.status || item.result || `entry_${index + 1}`;
          const count = item.count ?? item.total ?? item.value ?? item.amount ?? 0;
          return { key, label: item.label || humanizeKey(key), value: count };
        }

        return { key: `entry_${index + 1}`, label: String(item), value: '' };
      })
      .slice(0, 8);
  }

  return objectEntries(value, 8).map(([key, count]) => ({
    key,
    label: humanizeKey(key),
    value: formatNestedValue(count),
  }));
}

export default function SettlementBreakdown({ breakdown }) {
  const entries = normalizeBreakdown(breakdown);

  return (
    <section className="ticket-panel glass-card compact-panel react-history-breakdown history-settlement-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Settlement</p>
          <h3>Estado de cierre</h3>
        </div>
        <Badge tone="subtle">Read-only</Badge>
      </div>

      {entries.length ? (
        <div className="history-settlement-grid">
          {entries.map((entry) => (
            <article className="history-settlement-chip" key={entry.key}>
              <Badge tone={getTone(entry.key)}>{entry.label}</Badge>
              <strong>{String(entry.value || 0)}</strong>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-inline rich">
          <strong>Sin settlementBreakdown.</strong>
          <p>El summary no incluyo estados de cierre para este archivo.</p>
        </div>
      )}
    </section>
  );
}
