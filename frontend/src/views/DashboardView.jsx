/**
 * DashboardView.jsx
 * Phase: React Migration v1 — Foundation (placeholder)
 * Full logic will be migrated in React App Shell phase.
 */
export default function DashboardView() {
  return (
    <section
      className="app-view dashboard-view is-active"
      id="dashboard"
      data-app-view="dashboard"
    >
      <div className="hero-panel slate-desk-hero desk-panel glass-card">
        <div className="slate-desk-head">
          <p className="hero-kicker">Daily Slate Desk</p>
          <h2>Resumen ejecutivo premium para abrir, decidir y saltar a la vista correcta sin recorrer una página eterna.</h2>
          <p className="hero-description">
            Dashboard compacto con estado, ticket resumido y accesos rápidos.
            Scoreboard, ticket completo, historial y tareas viven en vistas separadas.
          </p>
          <div className="hero-badges" id="daily-ticket-ticket-flags" />
        </div>
        <div className="slate-desk-metrics" id="dashboard-slate-metrics" />
        <div className="slate-desk-note" id="dashboard-slate-note">
          Desk ready. — React v1 Foundation
        </div>
        <div className="hero-actions slate-desk-actions">
          <button type="button" className="btn btn-primary btn-ticket" id="generate-daily-ticket-btn">
            Generar Ticket del Día
          </button>
          <button type="button" className="btn btn-secondary" id="view-daily-ticket-btn">
            Ver Ticket Guardado
          </button>
        </div>
        <div id="daily-ticket-feedback" className="panel-message info" />
      </div>

      <div id="daily-ticket-api-status" className="status-grid" />

      <div className="dashboard-summary-grid">
        <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Ticket disponible</p>
              <h3>Glance del ticket</h3>
            </div>
          </div>
          <div id="daily-ticket-dashboard-glance" />
        </section>

        <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Lectura rápida</p>
              <h3>Resumen ejecutivo</h3>
            </div>
          </div>
          <div id="daily-ticket-side-summary" />
        </section>

        <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Navegación rápida</p>
              <h3>Ir directo</h3>
            </div>
          </div>
          <div className="quick-links-grid">
            <a href="#daily-ticket" className="quick-link-card" data-nav-view="daily-ticket">
              <strong>Ticket del día</strong>
              <span>Ver los 3 tickets completos.</span>
            </a>
            <a href="#scoreboard" className="quick-link-card" data-nav-view="scoreboard">
              <strong>Scoreboard</strong>
              <span>Abrir juegos, tabs y linescore full-width.</span>
            </a>
            <a href="#history" className="quick-link-card" data-nav-view="history">
              <strong>Historial</strong>
              <span>Revisar tickets recientes guardados.</span>
            </a>
          </div>
        </section>
      </div>
    </section>
  );
}
