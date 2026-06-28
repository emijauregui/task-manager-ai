/**
 * DebugPropsView.jsx
 * Phase: React Migration v1 - Foundation
 */
export default function DebugPropsView() {
  return (
    <section
      className="app-view debug-view foundation-view is-active"
      id="debug-props"
      data-app-view="debug-props"
    >
      <section className="ticket-panel glass-card compact-panel debug-empty-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Dev Debug</p>
            <h3>Player Props Pipeline</h3>
          </div>
        </div>
        <div className="empty-inline rich">
          <strong>Diagnostico de props placeholder.</strong>
          <p>Esta vista ahora renderiza su propio contenido desde #debug-props. No muestra Dashboard.</p>
        </div>

        <div className="props-diagnostics-grid foundation-debug-grid">
          <div className="props-diagnostics-block">
            <h4>Pipeline</h4>
            <p>Markets, games, players y rejections pendientes de migrar.</p>
          </div>
          <div className="props-diagnostics-block">
            <h4>Guard rails</h4>
            <p>Sin Bedrock automatico y sin Odds API live durante foundation.</p>
          </div>
          <div className="props-diagnostics-block">
            <h4>Salida esperada</h4>
            <p>Panel tecnico compacto para validar props antes de conectar datos reales.</p>
          </div>
        </div>
      </section>
    </section>
  );
}
