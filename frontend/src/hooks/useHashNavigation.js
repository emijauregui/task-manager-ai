import { useEffect, useState } from 'react';

export const DEFAULT_VIEW = 'dashboard';

export const ROUTES = [
  { hash: '#dashboard', view: 'dashboard', label: 'Home', sidebarLabel: 'Dashboard' },
  { hash: '#daily-ticket', view: 'daily-ticket', label: 'Ticket', sidebarLabel: 'Ticket del dia' },
  { hash: '#scoreboard', view: 'scoreboard', label: 'Board', sidebarLabel: 'Scoreboard' },
  { hash: '#history', view: 'history', label: 'Historial', sidebarLabel: 'Historial' },
  { hash: '#debug-props', view: 'debug-props', label: 'Debug', sidebarLabel: 'Debug props', id: 'nav-debug-props' },
  { hash: '#tasks', view: 'tasks', label: 'Tareas', sidebarLabel: 'Tareas' },
];

const HASH_TO_VIEW = ROUTES.reduce((map, route) => {
  map[route.hash] = route.view;
  return map;
}, {});

const VALID_VIEWS = new Set(ROUTES.map((route) => route.view));

export function getViewFromHash(hash) {
  const currentHash = hash ?? (typeof window === 'undefined' ? '' : window.location.hash);
  return HASH_TO_VIEW[currentHash] ?? DEFAULT_VIEW;
}

export function isValidView(view) {
  return VALID_VIEWS.has(view);
}

export function useHashNavigation() {
  const [activeView, setActiveView] = useState(() => getViewFromHash());

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(getViewFromHash());
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function navigate(view) {
    setActiveView(isValidView(view) ? view : DEFAULT_VIEW);
  }

  return {
    activeView,
    navigate,
    routes: ROUTES,
  };
}
