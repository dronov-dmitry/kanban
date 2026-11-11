import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/providers';
import './i18n';
import './styles/globals.css';

registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing');

createRoot(container).render(
  <StrictMode>
    <Providers />
  </StrictMode>,
);
