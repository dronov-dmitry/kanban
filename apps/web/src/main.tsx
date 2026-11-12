import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/providers';
import './i18n';
import './styles/globals.css';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('kanban:update-ready'));
  },
});

(
  window as unknown as {
    __kanbanUpdateSW?: (reloadPage?: boolean) => Promise<void>;
  }
).__kanbanUpdateSW = updateSW;

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing');

createRoot(container).render(
  <StrictMode>
    <Providers />
  </StrictMode>,
);
