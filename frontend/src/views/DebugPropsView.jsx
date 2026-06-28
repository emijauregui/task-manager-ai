/**
 * DebugPropsView.jsx
 * Phase: React Migration v1 — Foundation (placeholder)
 * Hidden by default — only visible in dev mode.
 */
export default function DebugPropsView() {
  return (
    <section
      className="app-view debug-view"
      id="debug-props"
      data-app-view="debug-props"
      hidden
    >
      <section
        className="ticket-panel glass-card compact-panel debug-empty-panel"
        id="debug-props-empty-panel"
      >
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Dev Debug</p>
            <h3>Player Props Pipeline</h3>
          </div>
        </div>
        <div className="empty-inline rich">
          <strong>Debug props disponible solo en desarrollo.</strong>
          <p>
            Cuando esta vista se habilita, aquí aparece el pipeline completo de
            props, filtros y ticket final.
          </p>
        </div>
      </section>

      <section
        className="ticket-panel glass-card diagnostics-panel"
        id="player-props-diagnostics-panel"
        hidden
      >
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Dev Debug</p>
            <h3>Player Props Pipeline</h3>
          </div>
          <span className="ui-badge subtle">Solo desarrollo / debug</span>
        </div>
        <div
          id="player-props-diagnostics-warning"
          className="panel-message info compact"
        />
        <div
          id="player-props-diagnostics-pipeline"
          className="props-pipeline-grid"
        />
        <div className="props-diagnostics-grid">
          <div className="props-diagnostics-block">
            <h4>Top mercados</h4>
            <div id="player-props-diagnostics-markets" />
          </div>
          <div className="props-diagnostics-block">
            <h4>Top juegos</h4>
            <div id="player-props-diagnostics-games" />
          </div>
          <div className="props-diagnostics-block">
            <h4>Top jugadores</h4>
            <div id="player-props-diagnostics-players" />
          </div>
          <div className="props-diagnostics-block">
            <h4>Rejected reasons</h4>
            <div id="player-props-diagnostics-rejections" />
          </div>
        </div>
      </section>
    </section>
  );
}
