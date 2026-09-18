import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { Home } from './components/Home.jsx';
import { Viewer } from './components/Viewer.jsx';
import { Arena } from './components/Arena.jsx';
import { Scorecard } from './components/Scorecard.jsx';
import { Proxy } from './components/Proxy.jsx';
import { Extension } from './components/Extension.jsx';
import { About } from './components/About.jsx';

// The nav is the argument. A visitor who reads nothing else should be able to
// tell from these three groups that Tracer is more than a demo: one surface to
// try, one to test your own agent with, one to put in front of it.
//
// The labels say that in words rather than in our words for it. "Range" is
// firing-range jargon and "sandbox" reads as toy -- which is the exact
// impression the rest of the project works to escape.
const NAV = [
  {
    group: 'Try it',
    items: [
      { id: 'sandbox', label: 'Viewer' },
      { id: 'arena', label: 'Arena' },
    ],
  },
  {
    group: 'Test your agent',
    items: [{ id: 'scorecard', label: 'Scorecard' }],
  },
  {
    group: 'Protect your agent',
    items: [
      { id: 'proxy', label: 'MCP proxy' },
      { id: 'extension', label: 'Extension' },
    ],
  },
  {
    group: null,
    items: [{ id: 'how', label: 'How it works' }],
  },
];

const ROUTES = ['home', ...NAV.flatMap((g) => g.items.map((i) => i.id))];

// Old hashes stay live. Links get shared, and a 404 on a link someone posted is
// a worse outcome than a redirect nobody notices.
const ALIASES = { viewer: 'sandbox', about: 'how', '': 'home' };

function hashTab() {
  const h = (window.location.hash || '').replace('#', '');
  const resolved = ALIASES[h] || h;
  return ROUTES.includes(resolved) ? resolved : 'home';
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

  // Rewrite an alias in the address bar so the canonical hash is what gets
  // copied out of it next time.
  useEffect(() => {
    const raw = (window.location.hash || '').replace('#', '');
    if (raw !== tab) window.location.hash = tab;
  }, [tab]);

  const go = (id) => {
    window.location.hash = id;
    setTab(id);
    window.scrollTo({ top: 0 });
  };

  const provider = meta && (meta.providers || []).find((p) => p.id === meta.activeProvider);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go('home')} title="Tracer">
          <span className="brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M2 16h4l2.2-9 2.6 14L14 11l1.6 2.4H22"
                stroke="currentColor"
                strokeWidth="2.2"
                fill="none"
                strokeLinejoin="miter"
                strokeLinecap="butt"
              />
            </svg>
          </span>
          <span>
            <span className="brand-name">Tracer</span>
            <span className="brand-sub" style={{ display: 'block', marginTop: 5 }}>
              provenance firewall
            </span>
          </span>
        </button>

        <nav className="tabs" role="tablist">
          {NAV.map((g, i) => (
            <span className="nav-group" key={g.group || 'x' + i}>
              {g.group && <span className="nav-group-label">{g.group}</span>}
              <span className="nav-group-items">
                {g.items.map((t) => (
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
              </span>
            </span>
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

        {meta && tab === 'home' && <Home meta={meta} go={go} />}
        {meta && tab === 'sandbox' && <Viewer meta={meta} go={go} />}
        {meta && tab === 'arena' && <Arena meta={meta} go={go} />}
        {meta && tab === 'scorecard' && <Scorecard go={go} />}
        {meta && tab === 'proxy' && <Proxy go={go} />}
        {meta && tab === 'extension' && <Extension go={go} />}
        {meta && tab === 'how' && <About meta={meta} />}
      </main>

      <footer className="page" style={{ paddingTop: 0 }}>
        <div className="wrap tiny faint" style={{ borderTop: '1px solid var(--hair)', paddingTop: 22, maxWidth: '72ch' }}>
          Tracer is defensive. The attack range is self-contained and every destination on it is
          non-resolvable; nothing here targets infrastructure we do not own. In the sandbox, all six agent
          tools are mocks and perform no network I/O.
        </div>
      </footer>
    </div>
  );
}
