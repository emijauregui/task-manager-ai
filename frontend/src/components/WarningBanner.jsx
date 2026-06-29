export default function WarningBanner({ className = '', kicker = 'Warnings', title, warnings }) {
  if (!warnings?.length) return null;

  return (
    <section className={`ticket-panel glass-card compact-panel ${className}`.trim()}>
      <div className="panel-header">
        <div>
          <p className="panel-kicker">{kicker}</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="warning-chip-row">
        {warnings.map((warning, index) => (
          <span className="warning-chip" key={`${warning}-${index}`}>
            {warning}
          </span>
        ))}
      </div>
    </section>
  );
}
