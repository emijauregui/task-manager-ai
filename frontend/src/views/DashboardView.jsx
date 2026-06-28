/**
 * DashboardView.jsx
 * Phase: React Migration v2 — App Shell Premium
 * Enhanced dashboard with improved visual hierarchy.
 */
export default function DashboardView() {
  return (
    <section
      className="app-view dashboard-view foundation-view is-active"
      id="dashboard"
      data-app-view="dashboard"
    >
      <div className="hero-panel slate-desk-hero desk-panel glass-card">
        <div className="slate-desk-head">
          <p className="hero-kicker">Daily Slate Desk</p>
          <h2>Resumen general del slate</h2>
          <p className="hero-description">
            Foundation React cache-first para revisar estado, ticket resumido y accesos rapidos.
            Scoreboard, ticket completo, historial y tareas viven en vistas separadas.
          </p>
          <div className="hero-badges">
            <span className="ui-badge cache">Cache-first</span>
            <span className="ui-badge subtle">Sin live calls al abrir</span>
            <span className="ui-badge subtle">React Foundation</span>
          </div>
        </div>

        <div className="slate-desk-metrics">
          <article className="slate-desk-metric success">
            <span>Vista</span>
            <strong>Dashboard</strong>
            <small>hash activo</small>
          </article>
          <article className="slate-desk-metric">
            <span>Ticket</span>
            <strong>Standby</strong>
            <small>sin generate auto</small>
          </article>
          <article className="slate-desk-metric accent">
            <span>Scoreboard</span>
            <strong>Cache</strong>
            <small>guardado</small>
          </article>
          <article className="slate-desk-metric warning">
            <span>Odds live</span>
            <strong>Off</strong>
            <small>modo protegido</small>
          </article>
        </div>

        <div className="slate-desk-note">
          Desk listo para migracion por fases. Esta pantalla no llama Bedrock ni Odds API live.
        </div>
        <div className="hero-actions slate-desk-actions">
          <button type="button" className="btn btn-primary btn-ticket" disabled>
            Generar despues
          </button>
          <a className="btn btn-secondary" href="#daily-ticket">
            Ver Ticket del dia
          </a>
          <a className="btn btn-ghost" href="#scoreboard">
            Abrir Scoreboard
          </a>
        </div>
      </div>

      <div className="dashboard-summary-grid foundation-card-grid">
        <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Ticket disponible</p>
              <h3>Estado foundation</h3>
            </div>
          </div>
          <div className="empty-inline rich">
            <strong>Ticket en standby.</strong>
            <p>La migracion React todavia no trae datos reales; conserva el flujo seguro y el layout final.</p>
          </div>
        </section>

        <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Lectura rapida</p>
              <h3>Resumen ejecutivo</h3>
            </div>
          </div>
          <div className="foundation-list">
            <span>Hash routing activo</span>
            <span>Una vista renderizada por vez</span>
            <span>Backend protegido</span>
          </div>
        </section>

        <section className="ticket-panel desk-panel glass-card compact-panel dashboard-focus-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Navegacion rapida</p>
              <h3>Ir directo</h3>
            </div>
          </div>
          <div className="quick-links-grid foundation-quick-links">
            <a href="#daily-ticket" className="quick-link-card" data-nav-view="daily-ticket">
              <strong>Ticket del dia</strong>
              <span>Placeholder de slips y estado.</span>
            </a>
            <a href="#scoreboard" className="quick-link-card" data-nav-view="scoreboard">
              <strong>Scoreboard</strong>
              <span>Marcador cache-first.</span>
            </a>
            <a href="#history" className="quick-link-card" data-nav-view="history">
              <strong>Historial</strong>
              <span>Archivo de tickets.</span>
            </a>
          </div>
        </section>
      </div>
    </section>
  );
}
