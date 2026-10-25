import React from 'react';
import ReactDOM from 'react-dom/client';
import { OverlayApp } from './OverlayApp';
import '../styles/index.css';

const rootEl = document.getElementById('overlay-root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <OverlayApp />
    </React.StrictMode>
  );
}
