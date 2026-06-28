/**
 * AppShell.jsx
 * Phase: React Migration v1 — Foundation
 *
 * Top-level layout shell — mirrors the vanilla <div class="app-shell">.
 * Handles hash-based navigation (reads window.location.hash, updates on change).
 * Renders the correct view based on the current hash.
 */
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import DeskChrome from './DeskChrome';
import DashboardView from '../views/DashboardView';
import DailyTicketView from '../views/DailyTicketView';
import ScoreboardView from '../views/ScoreboardView';
import HistoryView from '../views/HistoryView';
import DebugPropsView from '../views/DebugPropsView';
import TasksView from '../views/TasksView';

/** Map hash fragment → view key */
const HASH_TO_VIEW = {
  '#dashboard': 'dashboard',
  '#daily-ticket': 'daily-ticket',
  '#scoreboard': 'scoreboard',
  '#history': 'history',
  '#debug-props': 'debug-props',
  '#tasks': 'tasks',
};

const DEFAULT_VIEW = 'dashboard';

function getViewFromHash() {
  return HASH_TO_VIEW[window.location.hash] ?? DEFAULT_VIEW;
}

export default function AppShell() {
  const [activeView, setActiveView] = useState(getViewFromHash);

  // Sync state when the hash changes (browser back/forward or link clicks)
  useEffect(() => {
    const handleHashChange = () => setActiveView(getViewFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Navigate programmatically (called by Sidebar)
  function handleNavigate(view) {
    setActiveView(view);
  }

  return (
    <div className="app-shell" id="app-shell">
      <Sidebar activeView={activeView} onNavigate={handleNavigate} />

      <div className="app-main">
        <DeskChrome />

        <main className="page-content">
          {/* All views are rendered; visibility is controlled by
              the `hidden` attribute on each section — same as vanilla.
              This means IDs remain in the DOM for the vanilla app.js
              to find during the transition period. */}
          <DashboardView active={activeView === 'dashboard'} />
          <DailyTicketView active={activeView === 'daily-ticket'} />
          <ScoreboardView active={activeView === 'scoreboard'} />
          <HistoryView active={activeView === 'history'} />
          <DebugPropsView active={activeView === 'debug-props'} />
          <TasksView active={activeView === 'tasks'} />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-nav">
        {[
          { hash: '#dashboard', view: 'dashboard', label: 'Home' },
          { hash: '#daily-ticket', view: 'daily-ticket', label: 'Ticket' },
          { hash: '#scoreboard', view: 'scoreboard', label: 'Board' },
          { hash: '#history', view: 'history', label: 'Historial' },
          { hash: '#tasks', view: 'tasks', label: 'Tareas' },
        ].map((item) => (
          <a
            key={item.view}
            href={item.hash}
            className={`mobile-nav-link${activeView === item.view ? ' is-active' : ''}`}
            data-nav-view={item.view}
            aria-label={item.label}
            onClick={(e) => {
              e.preventDefault();
              handleNavigate(item.view);
              window.location.hash = item.hash;
            }}
          >
            <span className="mobile-nav-icon" aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Toast container — vanilla app.js still writes here */}
      <div id="toast-container" />

      {/* Loading spinner — vanilla app.js still controls this */}
      <div id="loading-spinner" className="spinner" style={{ display: 'none' }}>
        <div className="spinner-circle" />
        <p>Procesando...</p>
      </div>

      {/* Subtasks modal — preserved for Tasks view compatibility */}
      <div id="subtasks-modal" className="modal">
        <div className="modal-content">
          <div className="modal-header">
            <h2>Subtareas sugeridas</h2>
            <button className="modal-close" id="modal-close">&times;</button>
          </div>
          <div className="modal-body">
            <div id="subtasks-reasoning" />
            <div id="subtasks-list" />
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" id="modal-cancel">Cerrar</button>
            <button className="btn btn-primary" id="modal-create-all">Crear Todas</button>
          </div>
        </div>
      </div>
    </div>
  );
}
