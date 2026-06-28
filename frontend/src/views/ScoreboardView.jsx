/**
 * ScoreboardView.jsx
 * Phase: React Migration v1 — Foundation (placeholder)
 */
export default function ScoreboardView() {
  return (
    <section
      className="app-view scoreboard-view"
      id="scoreboard"
      data-app-view="scoreboard"
      hidden
    >
      <section
        className="ticket-panel glass-card scoreboard-panel scoreboard-panel-full"
        id="daily-ticket-games-panel"
      >
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Scoreboard</p>
            <h3>MLB Scoreboard</h3>
          </div>
          <div className="scoreboard-panel-badges">
            <span className="ui-badge subtle">ESPN cacheado</span>
            <span
              className="ui-badge subtle"
              id="daily-ticket-games-live-refresh"
              hidden
            >
              Actualizando en vivo cada 60s
            </span>
          </div>
        </div>

        <div id="daily-ticket-games-meta" />

        <div
          className="scoreboard-tabs"
          id="daily-ticket-scoreboard-tabs"
          role="tablist"
          aria-label="Secciones del scoreboard"
        >
          <button
            type="button"
            className="scoreboard-tab is-active"
            data-scoreboard-tab="live"
            role="tab"
            aria-controls="daily-ticket-live-panel"
            aria-selected="true"
          >
            <span className="scoreboard-tab-label">En vivo</span>
            <span className="scoreboard-tab-count">0</span>
          </button>
          <button
            type="button"
            className="scoreboard-tab"
            data-scoreboard-tab="today"
            role="tab"
            aria-controls="daily-ticket-today-panel"
            aria-selected="false"
          >
            <span className="scoreboard-tab-label">Hoy</span>
            <span className="scoreboard-tab-count">0</span>
          </button>
          <button
            type="button"
            className="scoreboard-tab"
            data-scoreboard-tab="upcoming"
            role="tab"
            aria-controls="daily-ticket-upcoming-panel"
            aria-selected="false"
          >
            <span className="scoreboard-tab-label">Próximos</span>
            <span className="scoreboard-tab-count">0</span>
          </button>
          <button
            type="button"
            className="scoreboard-tab"
            data-scoreboard-tab="recent"
            role="tab"
            aria-controls="daily-ticket-recent-results-panel"
            aria-selected="false"
          >
            <span className="scoreboard-tab-label">Resultados recientes</span>
            <span className="scoreboard-tab-count">0</span>
          </button>
        </div>

        <div className="scoreboard-sections">
          <section
            className="scoreboard-group scoreboard-section-shell"
            id="daily-ticket-live-panel"
            data-scoreboard-section="live"
          >
            <div className="scoreboard-group-header">
              <div>
                <p className="panel-kicker">Live</p>
                <h4>Juegos en vivo</h4>
              </div>
            </div>
            <div id="daily-ticket-live-games" />
          </section>

          <section
            className="scoreboard-group scoreboard-section-shell"
            id="daily-ticket-today-panel"
            data-scoreboard-section="today"
            hidden
          >
            <div className="scoreboard-group-header">
              <div>
                <p className="panel-kicker">Hoy</p>
                <h4>Juegos de hoy</h4>
              </div>
            </div>
            <div id="daily-ticket-games" />
          </section>

          <section
            className="scoreboard-group scoreboard-section-shell"
            id="daily-ticket-upcoming-panel"
            data-scoreboard-section="upcoming"
            hidden
          >
            <div className="scoreboard-group-header">
              <div>
                <p className="panel-kicker">Mañana</p>
                <h4>Próximos juegos</h4>
              </div>
            </div>
            <div id="daily-ticket-upcoming-games" />
          </section>

          <section
            className="scoreboard-group scoreboard-section-shell"
            id="daily-ticket-recent-results-panel"
            data-scoreboard-section="recent"
            hidden
          >
            <div className="scoreboard-group-header">
              <div>
                <p className="panel-kicker">Cierre reciente</p>
                <h4>Resultados recientes</h4>
              </div>
            </div>
            <div id="daily-ticket-recent-results-meta" />
            <div id="daily-ticket-recent-results" />
          </section>
        </div>
      </section>
    </section>
  );
}
