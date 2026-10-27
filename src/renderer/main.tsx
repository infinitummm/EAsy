import React from 'react';
import ReactDOM from 'react-dom/client';
import './services/puenteNativo';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
