/**
 * Sidebar.jsx
 * Phase: React Migration v6 - shared navigation metadata.
 */
import { ROUTES } from '../hooks';

const NAV_ICONS = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4.5 11.8 12 5.6l7.5 6.2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.2 10.8v7.1c0 .9.7 1.6 1.6 1.6h8.4c.9 0 1.6-.7 1.6-1.6v-7.1" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M9.3 19.2v-4.8h5.4v4.8" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
      <circle cx="17.7" cy="6.4" r="1.3" fill="currentColor" />
    </svg>
  ),
  'daily-ticket': (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M5 8.2c0-1.2 1-2.2 2.2-2.2h9.6c1.2 0 2.2 1 2.2 2.2v1.5a2 2 0 0 0 0 4v2.1c0 1.2-1 2.2-2.2 2.2H7.2C6 18 5 17 5 15.8v-2.1a2 2 0 0 0 0-4V8.2Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
      <path d="M8.9 9.4h6.2M8.9 12h5M8.9 14.6h6.2" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M12 6v12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="1.2 3.2" opacity="0.65" />
    </svg>
  ),
  scoreboard: (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="3.9" y="5.2" width="16.2" height="11.2" rx="2.6" stroke="currentColor" strokeWidth="1.55" />
      <path d="M7.2 9.1h3M7.2 12.4h3M13.4 8.6v4.3M16.7 8.6v4.3" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M8 19h8" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <circle cx="18" cy="18.8" r="1.4" fill="currentColor" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M6.4 5.7h9.7c1.2 0 2.1.9 2.1 2.1v10.1c0 1.2-.9 2.1-2.1 2.1H6.4a2.1 2.1 0 0 1-2.1-2.1V7.8c0-1.2.9-2.1 2.1-2.1Z" stroke="currentColor" strokeWidth="1.55" />
      <path d="M7.7 9.2h7.4M7.7 12.5h5.7M7.7 15.8h6.8" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M18.2 8.4h1.7a1.5 1.5 0 0 1 1.5 1.5v5.2a1.5 1.5 0 0 1-1.5 1.5h-1.7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.7" />
    </svg>
  ),
  'debug-props': (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M7 8.1a5 5 0 0 1 10 0v1.2h.4c1.1 0 2 .9 2 2v4.8c0 2.2-1.8 4-4 4H8.6a4 4 0 0 1-4-4v-4.8c0-1.1.9-2 2-2H7V8.1Z" stroke="currentColor" strokeWidth="1.55" />
      <path d="M9.2 8.8h5.6M8.1 13h7.8M8.1 16h5.3" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <circle cx="16.4" cy="16" r="1.4" fill="currentColor" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M7.2 5.2h9.6c1.2 0 2.2 1 2.2 2.2v9.2c0 1.2-1 2.2-2.2 2.2H7.2c-1.2 0-2.2-1-2.2-2.2V7.4c0-1.2 1-2.2 2.2-2.2Z" stroke="currentColor" strokeWidth="1.55" />
      <path d="m8.5 10.6 1.6 1.6 3-3.2M8.5 15.4h7" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.1 3.8h5.8" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  ),
};

const NAV_ITEMS = ROUTES.map((route) => ({
  ...route,
  label: route.sidebarLabel,
  icon: NAV_ICONS[route.view],
}));

export default function Sidebar({ activeView, onNavigate, isCollapsed, onToggleCollapse }) {
  return (
    <aside
      className={`app-sidebar${isCollapsed ? ' is-collapsed' : ''}`}
      id="app-sidebar"
      data-sidebar-state={isCollapsed ? 'collapsed' : 'expanded'}
    >
      <div className="sidebar-top">
        <div className="brand-lockup">
          <div className="brand-mark brand-logo-frame brand-logo-frame-sidebar">
            <img
              src="/assets/newlogo-nbck.png"
              alt="Daily Ticket AI"
              className="brand-logo brand-logo-sidebar"
            />
          </div>
          <div className="brand-copy">
            <p className="brand-kicker">Premium MLB Analytics</p>
            <h1>Daily Ticket AI</h1>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          id="sidebar-toggle-btn"
          aria-label={isCollapsed ? 'Abrir menu' : 'Cerrar menu'}
          aria-controls="app-sidebar"
          aria-expanded={!isCollapsed}
          onClick={onToggleCollapse}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
              event.preventDefault();
              onToggleCollapse();
            }
          }}
        >
          <svg className="sidebar-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="4.8" y="4.5" width="14.4" height="15" rx="4" stroke="currentColor" strokeWidth="1.55" />
            <path d="M9.4 7.7v8.6" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" opacity="0.7" />
            <path d="m15 8.9-3.2 3.1 3.2 3.1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Navegacion principal">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.view}
            href={item.hash}
            className={`nav-link${activeView === item.view ? ' is-active' : ''}`}
            data-nav-view={item.view}
            aria-label={item.label}
            aria-current={activeView === item.view ? 'page' : undefined}
            id={item.id}
            onClick={() => onNavigate(item.view)}
          >
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="nav-label">{item.label}</span>
          </a>
        ))}
      </nav>

      <details className="sidebar-card sidebar-card-collapsible glass-card">
        <summary className="sidebar-card-summary">
          <div className="sidebar-card-heading">
            <p className="sidebar-card-title">Flujo seguro</p>
            <span className="sidebar-card-chip">Cache-first</span>
          </div>
          <span className="sidebar-card-toggle" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </summary>
        <p className="sidebar-card-copy">
          El dashboard carga solo cache y estado. Bedrock y Odds API se usan unicamente cuando generas ticket.
        </p>
      </details>
    </aside>
  );
}
