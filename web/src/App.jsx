import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { Viewer } from './components/Viewer.jsx';
import { Arena } from './components/Arena.jsx';
import { Scorecard } from './components/Scorecard.jsx';
import { About } from './components/About.jsx';

const TABS = [
  { id: 'viewer', label: 'Viewer' },
  { id: 'arena', label: 'Arena' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'about', label: 'How it works' },
];

function hashTab() {
  const h = (window.location.hash || '').replace('#', '');
  return TABS.some((t) => t.id === h) ? h : 'viewer';
}

export default function App() {
  const [tab, setTab] = useState(hashTab);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .meta()
      .then(setMeta)
      .catch((err) => setError(String(err.message || err)));
  }, []);

  useEffect(() => {
    const onHash = () => setTab(hashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id) => {
    window.location.hash = id;
    setTab(id);
  };

  const provider = meta && (meta.providers || []).find((p) => p.id === meta.activeProvider);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 15h4l2-8 2.6 13L15 13l2 2h4"
                stroke="#34d3c8"
                strokeWidth="2"
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>
            <span className="brand-name">Tracer</span>
            <span className="brand-sub" style={{ display: 'block', marginTop: 2 }}>
              a provenance firewall for AI agents
            </span>
          </span>
        </div>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="tab"
              role="tab"
              aria-selected={tab === t.id ? 'true' : 'false'}
              onClick={() => go(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          {provider && (
            <span className="provider-chip" title={provider.ready ? 'ready' : 'not configured'}>
              <span className={'dot ' + (meta.activeProvider === 'simulated' ? 'sim' : 'live')} />
              {provider.label}
            </span>
          )}
          <a className="tiny faint" href="/range" target="_blank" rel="noreferrer">
            attack range &#8599;
          </a>
        </div>
      </header>

      <main className="page">
        {error && (
          <div className="wrap narrow">
            <div className="notice">
              Could not reach the Tracer API: {error}
              <div className="tiny" style={{ marginTop: 6 }}>
                Start it with <span className="mono">npm run dev</span>.
              </div>
            </div>
          </div>
        )}

        {!meta && !error && (
          <div className="wrap narrow row faint">
            <span className="spinner" /> connecting
          </div>
        )}

        {meta && tab === 'viewer' && <Viewer meta={meta} />}
        {meta && tab === 'arena' && <Arena meta={meta} />}
        {meta && tab === 'scorecard' && <Scorecard />}
        {meta && tab === 'about' && <About meta={meta} />}
      </main>

      <footer className="page" style={{ paddingTop: 0 }}>
        <div className="wrap tiny faint" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          Tracer is defensive. The attack range is self-contained and every destination on it is
          non-resolvable; nothing here targets infrastructure we do not own. All agent tools are mocks and
          perform no network I/O.
        </div>
      </footer>
    </div>
  );
}
