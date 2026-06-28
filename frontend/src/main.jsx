/**
 * main.jsx
 * Phase: React Migration v1 — Foundation
 *
 * React entry point. Mounts <App /> into #root.
 * CSS is imported here so Vite processes it.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
