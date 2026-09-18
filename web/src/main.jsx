import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted, bundled by Vite. No runtime CDN dependency: the viewer has to
// render identically on a laptop with no network, because that is where demos
// get given.
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';

import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
