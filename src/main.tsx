import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { installViewportFix } from './lib/viewport';
import './styles.css';

installViewportFix();
registerSW({ immediate: true });

// Ask the browser not to evict our IndexedDB under storage pressure — the data lives only here.
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
