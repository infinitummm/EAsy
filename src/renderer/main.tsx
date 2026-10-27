import React from 'react';
import ReactDOM from 'react-dom/client';
import './services/puenteNativo';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Error al iniciar EAsy">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
