/**
 * DailyTicketView.jsx
 * Phase: React Migration v1 — Foundation (placeholder)
 */
export default function DailyTicketView() {
  return (
    <section
      className="app-view daily-ticket-section"
      id="daily-ticket"
      data-app-view="daily-ticket"
      hidden
    >
      <div className="view-intro-panel glass-card">
        <div>
          <p className="panel-kicker">Ticket del día</p>
          <h3>Detalle completo de los 3 tickets</h3>
          <p className="panel-subtitle">
            Vista dedicada para revisar picks, warnings compactos y el contexto del ticket actual.
          </p>
        </div>
      </div>

      <div className="daily-ticket-grid">
        <section
          className="ticket-panel ticket-panel-main glass-card"
          id="daily-ticket-current-panel"
        >
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Ticket disponible</p>
              <h3>Ticket del día</h3>
            </div>
            <p id="daily-ticket-summary" className="panel-subtitle">
              Sin ticket guardado.
            </p>
          </div>
          <div id="daily-ticket-current" />
        </section>

        <aside className="daily-ticket-side">
          <section className="ticket-panel glass-card compact-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Contexto</p>
                <h3>Estado del ticket</h3>
              </div>
            </div>
            <div id="daily-ticket-ticket-meta" />
          </section>

          <section className="ticket-panel glass-card compact-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Riesgo controlado</p>
                <h3>Mercados a evitar</h3>
              </div>
            </div>
            <div id="daily-ticket-avoid" />
          </section>
        </aside>
      </div>
    </section>
  );
}
