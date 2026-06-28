/**
 * ScoreboardView.jsx
 * Phase: React Migration v1 - Foundation
 */
export default function ScoreboardView() {
  return (
    <section
      className="app-view scoreboard-view foundation-view is-active"
      id="scoreboard"
      data-app-view="scoreboard"
    >
      <section className="ticket-panel glass-card scoreboard-panel scoreboard-panel-full">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Scoreboard</p>
            <h3>Marcador cache-first</h3>
          </div>
          <div className="scoreboard-panel-badges">
            <span className="ui-badge subtle">ESPN cacheado</span>
            <span className="ui-badge subtle">No Odds API live</span>
          </div>
        </div>

        <div
          className="scoreboard-tabs"
          role="tablist"
          aria-label="Secciones del scoreboard"
        >
          <button
            type="button"
            className="scoreboard-tab is-active"
            data-scoreboard-tab="live"
            role="tab"
            aria-selected="true"
          >
            <span className="scoreboard-tab-label">En vivo</span>
            <span className="scoreboard-tab-count">0</span>
          </button>
          <button type="button" className="scoreboard-tab" data-scoreboard-tab="today" role="tab" aria-selected="false">
            <span className="scoreboard-tab-label">Hoy</span>
            <span className="scoreboard-tab-count">0</span>
          </button>
          <button type="button" className="scoreboard-tab" data-scoreboard-tab="upcoming" role="tab" aria-selected="false">
            <span className="scoreboard-tab-label">Proximos</span>
            <span className="scoreboard-tab-count">0</span>
          </button>
          <button type="button" className="scoreboard-tab" data-scoreboard-tab="recent" role="tab" aria-selected="false">
            <span className="scoreboard-tab-label">Resultados recientes</span>
            <span className="scoreboard-tab-count">0</span>
          </button>
        </div>

        <div className="scoreboard-sections">
          <section className="scoreboard-group scoreboard-section-shell">
            <div className="scoreboard-group-header">
              <div>
                <p className="panel-kicker">Hoy</p>
                <h4>Game cards placeholder</h4>
              </div>
              <span className="ui-badge cache">Cache listo</span>
            </div>
            <div className="foundation-scoreboard-grid">
              <article className="foundation-game-card">
                <div>
                  <span className="panel-kicker">Final</span>
                  <strong>NYY 4 - BOS 2</strong>
                </div>
                <p>Scorebug visual reservado para la migracion del scoreboard real.</p>
              </article>
              <article className="foundation-game-card">
                <div>
                  <span className="panel-kicker">Preview</span>
                  <strong>LAD vs SF</strong>
                </div>
                <p>AI Lean y Ver tendencias se conectaran sin llamadas live al abrir.</p>
              </article>
            </div>
          </section>

          <section className="scoreboard-group scoreboard-section-shell">
            <div className="scoreboard-group-header">
              <div>
                <p className="panel-kicker">AI Lean</p>
                <h4>Tendencias placeholder</h4>
              </div>
            </div>
            <div className="empty-inline rich">
              <strong>Lean panel listo para migrar.</strong>
              <p>Esta foundation solo muestra estructura: tabs, game cards y panel de lectura sin endpoints live.</p>
            </div>
          </section>
          <section className="scoreboard-group scoreboard-section-shell">
            <div className="scoreboard-group-header">
              <div>
                <p className="panel-kicker">Cierre reciente</p>
                <h4>Resultados recientes</h4>
              </div>
            </div>
            <p className="panel-subtitle">Archivo cacheado pendiente de conectar en la fase Scoreboard React.</p>
          </section>
        </div>
      </section>
    </section>
  );
}
