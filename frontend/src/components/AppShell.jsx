/**
 * AppShell.jsx
 * Phase: React Migration v1 - Foundation
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

const DEFAULT_VIEW = 'dashboard';
const ROUTES = [
  { hash: '#dashboard', view: 'dashboard', label: 'Home' },
  { hash: '#daily-ticket', view: 'daily-ticket', label: 'Ticket' },
  { hash: '#scoreboard', view: 'scoreboard', label: 'Board' },
  { hash: '#history', view: 'history', label: 'Historial' },
  { hash: '#debug-props', view: 'debug-props', label: 'Debug' },
  { hash: '#tasks', view: 'tasks', label: 'Tareas' },
];

const HASH_TO_VIEW = ROUTES.reduce((map, route) => {
  map[route.hash] = route.view;
  return map;
}, {});

const VIEW_COMPONENTS = {
  dashboard: DashboardView,
  'daily-ticket': DailyTicketView,
  scoreboard: ScoreboardView,
  history: HistoryView,
  'debug-props': DebugPropsView,
  tasks: TasksView,
};

function getViewFromHash() {
  if (typeof window === 'undefined') {
    return DEFAULT_VIEW;
  }

  return HASH_TO_VIEW[window.location.hash] ?? DEFAULT_VIEW;
}

function isValidView(view) {
  return Object.prototype.hasOwnProperty.call(VIEW_COMPONENTS, view);
}

export default function AppShell() {
  const [activeView, setActiveView] = useState(() => getViewFromHash());
  const ActiveView = VIEW_COMPONENTS[activeView] ?? DashboardView;

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(getViewFromHash());
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function handleNavigate(view) {
    setActiveView(isValidView(view) ? view : DEFAULT_VIEW);
  }

  return (
    <div className="app-shell react-foundation" id="app-shell">
      <Sidebar activeView={activeView} onNavigate={handleNavigate} />

      <div className="app-main">
        <DeskChrome />

        <main className="page-content">
          <ActiveView />
        </main>
      </div>

      <nav className="mobile-nav">
        {ROUTES.map((item) => (
          <a
            key={item.view}
            href={item.hash}
            className={`mobile-nav-link${activeView === item.view ? ' is-active' : ''}`}
            data-nav-view={item.view}
            aria-label={item.label}
            onClick={() => handleNavigate(item.view)}
          >
            <span className="mobile-nav-icon" aria-hidden="true" />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <div id="toast-container" />

      <div id="loading-spinner" className="spinner" style={{ display: 'none' }}>
        <div className="spinner-circle" />
        <p>Procesando...</p>
      </div>

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
