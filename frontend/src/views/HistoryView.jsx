/**
 * HistoryView.jsx
 * Phase: React Migration v1 — Foundation (placeholder)
 */
export default function HistoryView() {
  return (
    <section
      className="app-view history-view"
      id="history"
      data-app-view="history"
      hidden
    >
      <section
        className="ticket-panel glass-card compact-panel history-panel-full"
        id="daily-ticket-history-panel"
      >
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Memoria local</p>
            <h3>Historial reciente</h3>
          </div>
        </div>
        <div id="daily-ticket-history" />
      </section>
    </section>
  );
}
