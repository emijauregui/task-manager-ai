/**
 * HistoryView.jsx
 * Phase: React Migration v1 - Foundation
 */
export default function HistoryView() {
  return (
    <section
      className="app-view history-view foundation-view is-active"
      id="history"
      data-app-view="history"
    >
      <section className="ticket-panel glass-card compact-panel history-panel-full">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Memoria local</p>
            <h3>Historial reciente</h3>
          </div>
        </div>
        <div className="status-grid foundation-history-metrics">
          <article>
            <span>Slips</span>
            <strong>0</strong>
            <p>Placeholder</p>
          </article>
          <article>
            <span>Filtros</span>
            <strong>All</strong>
            <p>Foundation</p>
          </article>
          <article>
            <span>Patterns</span>
            <strong>Cache</strong>
            <p>Sin live calls</p>
          </article>
        </div>
        <div className="foundation-archive-grid">
          <article className="ticket-panel glass-card compact-panel">
            <p className="panel-kicker">Archive slip</p>
            <h4>Ticket Seguro - placeholder</h4>
            <p className="panel-subtitle">Aqui viviran slips historicos con metricas y filtros.</p>
          </article>
          <article className="ticket-panel glass-card compact-panel">
            <p className="panel-kicker">Patterns</p>
            <h4>Lectura de historial</h4>
            <p className="panel-subtitle">Resumen de tendencias listo para migrar sin tocar backend.</p>
          </article>
        </div>
      </section>
    </section>
  );
}
