/**
 * DeskChrome.jsx
 * Phase: React Migration v2 — App Shell Premium
 *
 * Enhanced scorebar showing:
 *   - Slate MLB title
 *   - Current date (Mazatlán timezone)
 *   - Current time (Mazatlán timezone)
 *   - Cache status
 *   - API call status
 */
import { useMazatlanTime } from '../hooks';

export default function DeskChrome() {
  const { date, time } = useMazatlanTime();

  return (
    <header className="topbar desk-scorebar">
      <div className="desk-scorebar-track">
        <div className="desk-scorebar-item is-title">
          <span className="desk-scorebar-label">Slate MLB</span>
          <strong id="desk-scorebar-title">Daily Ticket AI Desk</strong>
        </div>
        <div className="desk-scorebar-item">
          <span className="desk-scorebar-label">Fecha</span>
          <strong id="desk-scorebar-date">{date}</strong>
        </div>
        <div className="desk-scorebar-item">
          <span className="desk-scorebar-label">Hora Mazatlán</span>
          <strong id="desk-scorebar-time">{time}</strong>
        </div>
        <div className="desk-scorebar-item">
          <span className="desk-scorebar-label">Cache status</span>
          <strong id="desk-scorebar-cache">Cache read</strong>
        </div>
        <div className="desk-scorebar-item">
          <span className="desk-scorebar-label">Calls</span>
          <strong id="desk-scorebar-calls">No live calls</strong>
        </div>
      </div>
    </header>
  );
}
