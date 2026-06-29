export default function MetricCard({
  label,
  value,
  note,
  tone = 'neutral',
  baseClass = 'slate-desk-metric',
  className = '',
}) {
  const classes = [baseClass, tone, className].filter(Boolean).join(' ');

  return (
    <article className={classes}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
