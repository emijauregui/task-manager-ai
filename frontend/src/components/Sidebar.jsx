/**
 * Sidebar.jsx
 * Phase: React Migration v2 — App Shell Premium
 * Enhanced sidebar with functional collapse and improved states.
 */
import { useState } from 'react';

const NAV_ITEMS = [
  {
    hash: '#dashboard',
    view: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="4" width="7" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13.5" y="4" width="7" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3.5" y="13.5" width="7" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14.5 18.5h5.5M14.5 15.5h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    hash: '#daily-ticket',
    view: 'daily-ticket',
    label: 'Ticket del dia',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4.5 8.5A2.5 2.5 0 0 1 7 6h10a2.5 2.5 0 0 1 2.5 2.5v2a2 2 0 0 0 0 4v1.5A2.5 2.5 0 0 1 17 18.5H7A2.5 2.5 0 0 1 4.5 16v-1.5a2 2 0 0 0 0-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 9h6M9 12.5h6M9 16h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    hash: '#scoreboard',
    view: 'scoreboard',
    label: 'Scoreboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="10.5" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7.2 9h3M7.2 12h3M12 8.3v4.9M15.6 8.3v4.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.2 18.3 18.6 20.7 21 18.3 18.6 15.9 16.2 18.3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    hash: '#history',
    view: 'history',
    label: 'Historial',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M5 6.5H3.5V4m1.5 2.5a8.5 8.5 0 1 1-1.1 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 8v4l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16.5 17.5 20 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    hash: '#debug-props',
    view: 'debug-props',
    label: 'Debug props',
    id: 'nav-debug-props',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.5v9M7.5 12h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    hash: '#tasks',
    view: 'tasks',
    label: 'Tareas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4.5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="m8 10 1.8 1.8L13 8.8M8 15h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Sidebar({ activeView, onNavigate, isCollapsed, onToggleCollapse }) {
  return (
    <aside className="app-sidebar" id="app-sidebar">
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
          aria-label={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          aria-expanded={!isCollapsed}
          onClick={onToggleCollapse}
        >
          &lt;
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
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
