/**
 * DebugPropsView.jsx
 * Phase: React Migration v2 — App Shell Premium
 * Enhanced debug shell with improved diagnostic cards.
 */
export default function DebugPropsView() {
  return (
    <section
      className="app-view debug-view foundation-view is-active"
      id="debug-props"
      data-app-view="debug-props"
    >
      <div className="view-intro-panel glass-card">
        <div>
          <p className="panel-kicker">Dev Debug</p>
          <h3>Player Props Pipeline</h3>
          <p className="panel-subtitle">
            Panel técnico para diagnosticar props pipeline, guard rails y salida esperada del sistema.
          </p>
        </div>
      </div>

      <section className="ticket-panel glass-card compact-panel debug-empty-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Diagnóstico</p>
            <h3>Estado del pipeline</h3>
          </div>
          <div className="hero-badges">
            <span className="ui-badge subtle">Foundation</span>
            <span className="ui-badge cache">Cache-first</span>
          </div>
        </div>
        <div className="empty-inline rich">
          <strong>Diagnóstico de props placeholder.</strong>
          <p>Esta vista ahora renderiza su propio contenido desde #debug-props. No muestra Dashboard.</p>
        </div>

        <div className="foundation-debug-grid">
          <div className="foundation-debug-item">
            <strong>Pipeline</strong>
            <p>Markets, games, players y rejections pendientes de migrar.</p>
          </div>
          <div className="foundation-debug-item">
            <strong>Guard rails</strong>
            <p>Sin Bedrock automático y sin Odds API live durante foundation.</p>
          </div>
          <div className="foundation-debug-item">
            <strong>Salida esperada</strong>
            <p>Panel técnico compacto para validar props antes de conectar datos reales.</p>
          </div>
        </div>
      </section>
    </section>
  );
}
