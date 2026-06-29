/**
 * AppShell.jsx
 * Phase: React Migration v2 — App Shell Premium
 * Enhanced shell with functional collapse and improved layout.
 */
import Sidebar from './Sidebar';
import DeskChrome from './DeskChrome';
import DashboardView from '../views/DashboardView';
import DailyTicketView from '../views/DailyTicketView';
import ScoreboardView from '../views/ScoreboardView';
import HistoryView from '../views/HistoryView';
import DebugPropsView from '../views/DebugPropsView';
import TasksView from '../views/TasksView';
import { useHashNavigation } from '../hooks';
import { useState } from 'react';

const VIEW_COMPONENTS = {
  dashboard: DashboardView,
  'daily-ticket': DailyTicketView,
  scoreboard: ScoreboardView,
  history: HistoryView,
  'debug-props': DebugPropsView,
  tasks: TasksView,
};

export default function AppShell() {
  const { activeView, navigate, routes } = useHashNavigation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const ActiveView = VIEW_COMPONENTS[activeView] ?? DashboardView;

  function handleToggleCollapse() {
    setIsCollapsed((prev) => !prev);
  }

  return (
    <div
      className={`app-shell react-foundation${isCollapsed ? ' is-collapsed' : ''}`}
      id="app-shell"
    >
      <Sidebar
        activeView={activeView}
        onNavigate={navigate}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <div className="app-main">
        <DeskChrome />

        <main className="page-content">
          <ActiveView />
        </main>
      </div>

      <nav className="mobile-nav">
        {routes.map((item) => (
          <a
            key={item.view}
            href={item.hash}
            className={`mobile-nav-link${activeView === item.view ? ' is-active' : ''}`}
            data-nav-view={item.view}
            aria-label={item.label}
            onClick={() => navigate(item.view)}
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
