/**
 * DailyTicketView.jsx
 * Phase: React Migration v1 - Foundation
 */
export default function DailyTicketView() {
  return (
    <section
      className="app-view daily-ticket-section foundation-view is-active"
      id="daily-ticket"
      data-app-view="daily-ticket"
    >
      <div className="view-intro-panel glass-card">
        <div>
          <p className="panel-kicker">Ticket del dia</p>
          <h3>Detalle completo de los 3 tickets</h3>
          <p className="panel-subtitle">
            Vista dedicada para revisar picks, warnings compactos y el contexto del ticket actual.
          </p>
        </div>
      </div>

      <div className="daily-ticket-grid">
        <section className="ticket-panel ticket-panel-main glass-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Ticket disponible</p>
              <h3>Ticket del dia</h3>
            </div>
            <p className="panel-subtitle">Placeholder sin llamadas automaticas.</p>
          </div>

          <div className="foundation-ticket-strip">
            <button type="button" className="mini-ticket-card safe active">
              <span className="ticket-card-chip">Ticket Seguro</span>
              <strong>Slip principal</strong>
              <span>Estado: pendiente de migrar datos</span>
            </button>
            <button type="button" className="mini-ticket-card value">
              <span className="ticket-card-chip">AI Lean</span>
              <strong>Lean compacto</strong>
              <span>Sin Bedrock al abrir</span>
            </button>
            <button type="button" className="mini-ticket-card longshot">
              <span className="ticket-card-chip">Free Bet</span>
              <strong>Slip alterno</strong>
              <span>Placeholder visual</span>
            </button>
          </div>

          <div className="bet-slip-card slip-card safe foundation-slip">
            <div className="bet-slip-receipt-line">
              <span>Cache listo</span>
              <span className="bet-slip-serial">DT-REACT-FOUNDATION</span>
              <span>Sin fecha</span>
            </div>
            <div className="bet-slip-header">
              <div>
                <p className="panel-kicker">Selected bet slip</p>
                <h4>Ticket placeholder</h4>
                <p>Esta vista ya es propia de Ticket del dia. La logica real se migrara en una fase posterior.</p>
              </div>
              <span className="ui-badge pending">Pending</span>
            </div>
          </div>
        </section>

        <aside className="daily-ticket-side">
          <section className="ticket-panel glass-card compact-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Contexto</p>
                <h3>Estado del ticket</h3>
              </div>
            </div>
            <div className="foundation-list">
              <span>Selector cards visibles</span>
              <span>Leg details pendientes de migrar</span>
              <span>Team/player fallback reservado</span>
            </div>
          </section>

          <section className="ticket-panel glass-card compact-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Riesgo controlado</p>
                <h3>Mercados a evitar</h3>
              </div>
            </div>
            <div className="empty-inline rich">
              <strong>Sin warnings reales en foundation.</strong>
              <p>Los filtros y avoid markets se conectaran cuando migre el render del ticket.</p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
