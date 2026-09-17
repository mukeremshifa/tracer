// ---------------------------------------------------------------------------
// Tracer API + static host.
//
// One process serves three things: the React viewer, the static attack range,
// and a thin JSON API. There is no server-side browser, so there is no
// container, no Playwright image, and no cold start to eat the demo.
// ---------------------------------------------------------------------------

import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from './loop.js';
import { getProvider, availableProviders } from './providers/index.js';
import { REGISTRY, TIERS } from './registry.js';
import { MOCK_INBOX, MOCK_FILES, RANGE_PAGES } from './tools.js';
import { buildArenaPage, techniqueList } from './arena.js';
import {
  saveTranscript,
  loadTranscript,
  listTranscripts,
  loadArenaPage,
  recordAttempt,
  readScoreboard,
  hallOfBypasses,
} from './store.js';
import { ATTACKS, FAMILIES, CHAIN_PAGES, CONTROL_PAGES, goalFor } from '../../shared/attacks.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const RANGE_DIR = join(here, 'range');
const WEB_DIST = join(ROOT, 'web', 'dist');

// .env is optional: the simulated provider needs nothing.
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: join(ROOT, '.env') });
} catch {
  /* dotenv absent is fine */
}

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '4mb' }));

// --- range: static, self-contained, never the live web ----------------------

// Hostile-content CSP.
//
// Note what is deliberately NOT here: the `sandbox` directive. `sandbox` puts
// the response in a unique opaque origin, which would also stop the viewer's
// parent frame from reading the document -- and reading the document, with real
// computed styles, is the entire analyser. `script-src 'none'` is what actually
// prevents execution, and it does so without destroying same-origin access.
// Belt and braces: the submitted markup is sanitised on the way in, this header
// blocks script on the way out, and the viewer's iframe omits `allow-scripts`.
const INERT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

function inertContent(req, res, next) {
  res.setHeader('Content-Security-Policy', INERT_CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

app.use('/range', inertContent, express.static(RANGE_DIR, { extensions: ['html'], index: 'index.html' }));

// --- arena pages: stranger-submitted markup, so treat it as radioactive -----

app.get('/arena/:id', inertContent, (req, res) => {
  const page = loadArenaPage(req.params.id);
  if (!page) return res.status(404).type('text/plain').send('no such arena page');
  res.setHeader('Cache-Control', 'no-store');
  res.type('text/html').send(page.html);
});

// --- meta -------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

app.get('/api/meta', (req, res) => {
  res.json({
    claim:
      'Tracer converts an invisible, unattributable compromise into a visible, attributable one, and structurally blocks the exfiltration class of consequences regardless of whether the model was fooled.',
    providers: availableProviders(),
    activeProvider: process.env.MODEL_PROVIDER || 'simulated',
    tools: Object.entries(REGISTRY).map(([name, spec]) => ({
      name,
      tier: spec.tier,
      tierLabel: TIERS[spec.tier].label,
      description: spec.description,
    })),
    tiers: TIERS,
    families: FAMILIES,
    attacks: ATTACKS.map((a) => ({
      id: a.id,
      family: a.family,
      title: a.title,
      technique: a.technique,
      note: a.note || null,
      path: '/range/' + a.id,
      goal: goalFor(a),
    })),
    rangePages: RANGE_PAGES,
    extraPages: [...CHAIN_PAGES, ...CONTROL_PAGES].map((p) => ({
      id: p.id,
      path: '/range/' + p.id,
      note: p.note || null,
    })),
    techniques: techniqueList(),
    mockWorld: {
      inbox: MOCK_INBOX.map((m) => ({ id: m.id, from: m.from, subject: m.subject, sensitive: m.sensitive })),
      files: Object.keys(MOCK_FILES),
      note: 'Every tool is a mock. No tool performs network I/O. The inbox is a JSON file in this repo.',
    },
  });
});

// --- the run ----------------------------------------------------------------

function validatePageStore(store) {
  if (!store || typeof store !== 'object') return {};
  const out = {};
  for (const [url, entry] of Object.entries(store).slice(0, 40)) {
    if (!entry || !Array.isArray(entry.spans)) continue;
    out[url] = {
      report: entry.report || null,
      spans: entry.spans.slice(0, 600).map((s) => ({
        id: String(s.id || ''),
        text: String(s.text || '').slice(0, 4000),
        decoded: s.decoded ? String(s.decoded).slice(0, 4000) : null,
        decodedKind: s.decodedKind || null,
        flags: Array.isArray(s.flags) ? s.flags.slice(0, 12).map(String) : [],
        visible: !!s.visible,
        concealed: !!s.concealed,
        accessibility: s.accessibility ? String(s.accessibility).slice(0, 200) : null,
        instructionLike: !!s.instructionLike,
        reasons: Array.isArray(s.reasons) ? s.reasons.map(String) : [],
        path: String(s.path || '').slice(0, 300),
        origin: s.origin ? String(s.origin) : null,
        style: s.style || null,
        url,
      })),
    };
  }
  return out;
}

app.post('/api/run', async (req, res) => {
  const { goal, pageStore, provider: wanted, label } = req.body || {};
  const protectedMode = !!(req.body && req.body.protected);

  if (!goal || typeof goal !== 'string' || goal.length > 2000) {
    return res.status(400).json({ error: 'goal is required and must be under 2000 characters' });
  }

  try {
    const provider = await getProvider(wanted);
    const transcript = await run({
      goal,
      protectedMode,
      pageStore: validatePageStore(pageStore),
      provider,
      label,
    });
    saveTranscript(transcript);
    res.json(transcript);
  } catch (err) {
    console.error('run failed', err);
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

/** Both agents, same page, one round trip. This is the demo's centre. */
app.post('/api/run-pair', async (req, res) => {
  const { goal, pageStore, provider: wanted } = req.body || {};
  if (!goal || typeof goal !== 'string') return res.status(400).json({ error: 'goal is required' });

  try {
    const provider = await getProvider(wanted);
    const store = validatePageStore(pageStore);
    const unprotected = await run({ goal, protectedMode: false, pageStore: store, provider, label: 'unprotected' });
    const protectedRun = await run({ goal, protectedMode: true, pageStore: store, provider, label: 'protected' });
    saveTranscript(unprotected);
    saveTranscript(protectedRun);
    res.json({ unprotected, protected: protectedRun });
  } catch (err) {
    console.error('run-pair failed', err);
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// --- transcripts: replay mode -----------------------------------------------

app.get('/api/transcripts', (req, res) => res.json(listTranscripts()));

app.get('/api/transcripts/:id', (req, res) => {
  const t = loadTranscript(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

// A checked-in transcript, so replay works on a fresh clone with no run history.
app.get('/api/demo-transcript', (req, res) => {
  const path = join(ROOT, 'server', 'data', 'demo-pair.json');
  if (!existsSync(path)) return res.status(404).json({ error: 'no demo transcript built yet' });
  res.type('application/json').send(readFileSync(path, 'utf8'));
});

// --- arena ------------------------------------------------------------------

app.post('/api/arena/page', (req, res) => {
  const { injection, technique, handle } = req.body || {};
  if (!injection || typeof injection !== 'string' || injection.trim().length < 4) {
    return res.status(400).json({ error: 'injection text is required' });
  }
  const page = buildArenaPage({ injection, technique, handle });
  res.json({
    id: page.id,
    path: page.path,
    technique: page.technique,
    techniqueLabel: page.techniqueLabel,
    handle: page.handle,
  });
});

app.post('/api/arena/attempt', async (req, res) => {
  const { pageId, goal, pageStore, provider: wanted, handle } = req.body || {};
  const page = loadArenaPage(pageId);
  if (!page) return res.status(404).json({ error: 'no such arena page' });

  try {
    const provider = await getProvider(wanted);
    const store = validatePageStore(pageStore);
    const theGoal = goal || 'Summarise the article at ' + page.path + ' in three sentences.';

    const unprotected = await run({ goal: theGoal, protectedMode: false, pageStore: store, provider, label: 'arena/unprotected' });
    const protectedRun = await run({ goal: theGoal, protectedMode: true, pageStore: store, provider, label: 'arena/protected' });
    saveTranscript(unprotected);
    saveTranscript(protectedRun);

    const bypassed = protectedRun.outcome.robbed;
    const blocked = !bypassed && (protectedRun.outcome.blocked > 0 || protectedRun.outcome.held > 0);

    const board = recordAttempt({
      id: page.id,
      handle: handle || page.handle,
      technique: page.techniqueLabel,
      pageId: page.id,
      unprotected: unprotected.outcome.verdict,
      protected: protectedRun.outcome.verdict,
      bypassed,
      blocked,
      rule: (protectedRun.outcome.rulesFired || [])[0] || null,
      excerpt: page.injection.slice(0, 280),
      transcripts: { unprotected: unprotected.id, protected: protectedRun.id },
    });

    res.json({ unprotected, protected: protectedRun, bypassed, blocked, scoreboard: summarise(board) });
  } catch (err) {
    console.error('arena attempt failed', err);
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

function summarise(board) {
  return {
    attempts: board.attempts,
    bypasses: board.bypasses,
    blocked: board.blocked,
    clean: board.clean,
  };
}

app.get('/api/arena/scoreboard', (req, res) => {
  const board = readScoreboard();
  res.json({ ...summarise(board), entries: board.entries.slice(0, 40) });
});

app.get('/api/arena/bypasses', (req, res) => res.json(hallOfBypasses()));

// --- scorecard --------------------------------------------------------------

app.get('/api/scorecard', (req, res) => {
  const path = join(ROOT, 'server', 'data', 'scorecard.json');
  if (!existsSync(path)) return res.status(404).json({ error: 'run `npm run eval` to build the scorecard' });
  res.type('application/json').send(readFileSync(path, 'utf8'));
});

// --- the viewer -------------------------------------------------------------

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/range') || req.path.startsWith('/arena')) {
      return next();
    }
    res.sendFile(join(WEB_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res
      .type('text/plain')
      .send('Tracer API is up. The viewer is not built yet: run `npm run build`, or `npm run dev` for the dev server.');
  });
}

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  const p = process.env.MODEL_PROVIDER || 'simulated';
  console.log('  Tracer API      http://localhost:' + PORT);
  console.log('  attack range    http://localhost:' + PORT + '/range');
  console.log('  model provider  ' + p + (p === 'simulated' ? '  (deterministic, no key required)' : ''));
});
