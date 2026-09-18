import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { Home } from './components/Home.jsx';
import { Sandbox } from './components/Sandbox.jsx';
import { Dashboard } from './components/Dashboard.jsx';
import { Scorecard } from './components/Scorecard.jsx';
import { About } from './components/About.jsx';

// One row, four destinations. The old nav grouped seven tabs under three
// headings to argue that Tracer was more than a demo -- an argument the
// landing page now makes by showing the thing instead of labelling it.
const NAV = [
  { id: 'sandbox', label: 'Sandbox' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'how', label: 'How it works' },
];

const ROUTES = ['home', ...NAV.map((n) => n.id)];

// Old hashes stay live. Links get shared, and a 404 on a link someone posted is
// a worse outcome than a redirect nobody notices. The proxy and extension pages
// folded into the landing page's install section; the arena folded into the
// sandbox.
const ALIASES = {
  viewer: 'sandbox',
  arena: 'sandbox',
  proxy: 'home',
  extension: 'home',
  about: 'how',
  '': 'home',
};

const REPO = 'https://github.com/mukeremshifa/tracer';

function parseHash() {
  const raw = (window.location.hash || '').replace('#', '');
  const [path, query] = raw.split('?');
  const resolved = ALIASES[path] != null ? ALIASES[path] : path;
  return {
    tab: ROUTES.includes(resolved) ? resolved : 'home',
    params: new URLSearchParams(query || ''),
  };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  const { tab, params } = route;

  useEffect(() => {
    api
      .meta()
      .then(setMeta)
      .catch((err) => setError(String(err.message || err)));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Rewrite an alias in the address bar so the canonical hash is what gets
  // copied out of it next time. Query strings are left alone -- #sandbox?attack=x
  // is canonical, not an alias.
  useEffect(() => {
    const raw = (window.location.hash || '').replace('#', '');
    const [path] = raw.split('?');
    if (path !== tab && !raw.includes('?')) window.location.hash = tab;
  }, [tab]);

  const go = (id) => {
    window.location.hash = id;
    setRoute(parseHash());
    window.scrollTo({ top: 0 });
  };

  // The install section lives on the landing page. From anywhere else, go there
  // first and then scroll -- the hash change has to land before the element
  // exists to scroll to.
  const goInstall = () => {
    if (tab !== 'home') {
      go('home');
      setTimeout(() => scrollToInstall(), 80);
    } else {
      scrollToInstall();
    }
  };

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
          {NAV.map((t) => (
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
          <a className="tiny faint" href={REPO} target="_blank" rel="noreferrer noopener">
            GitHub &#8599;
          </a>
          <button className="btn sm" onClick={goInstall}>
            Install
          </button>
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
        {meta && tab === 'sandbox' && (
          <Sandbox meta={meta} go={go} initialAttack={params.get('attack')} />
        )}
        {meta && tab === 'dashboard' && <Dashboard go={go} />}
        {meta && tab === 'scorecard' && <Scorecard go={go} />}
        {meta && tab === 'how' && <About meta={meta} />}
      </main>

      <footer className="page" style={{ paddingTop: 0 }}>
        <div
          className="wrap tiny faint"
          style={{ borderTop: '1px solid var(--hair)', paddingTop: 22, maxWidth: '72ch' }}
        >
          Tracer is defensive. The attack range is self-contained, every destination on it is
          non-resolvable, and in the sandbox all six agent tools are mocks that perform no network I/O.
        </div>
      </footer>
    </div>
  );
}

function scrollToInstall() {
  const el = document.getElementById('install');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
