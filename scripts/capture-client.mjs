// ---------------------------------------------------------------------------
// Scene B: Tracer inside a real MCP client, refusing a tool call on camera.
//
// This is the strongest single piece of footage the project can have: Tracer
// sitting in Claude Code -- a client people actually use -- watching an agent
// follow a page's instruction to exfiltrate the operator's notes, and refusing
// the write with the provenance chain arriving as the model's own error.
//
// Everything filmed here is REAL and captured, never authored:
//
//   REAL  the proxy banner. The tier table is `adapters/mcp/bin/tracer-proxy.mjs`
//         booting against the two upstream servers, printed to stderr.
//   REAL  the client. `claude -p --output-format stream-json` is Claude Code
//         driving the real agent loop over MCP, with Tracer in front of the two
//         real servers (uvx mcp-server-fetch, npx server-filesystem).
//   REAL  the refusal. The BLOCK, its rule and its provenance chain are the
//         bytes the proxy sent back into the client, quoted verbatim.
//
// The captured exchange is cached to web/tools/clips/client-session.json so the
// clip re-renders byte for byte without re-running a live model. Re-capture the
// exchange with --live (needs Claude Code auth, uvx and npx on PATH, and the
// demo range on 127.0.0.1:4310 -- `node demo/serve.mjs`).
//
//   node scripts/capture-client.mjs            # render from the cached session
//   node scripts/capture-client.mjs --live     # re-capture the client, then render
//
// Needs Chrome and ffmpeg. Output: media/product-client.mp4 (1920x1080, 30fps).
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLIPS = path.join(REPO, 'web/tools/clips');
const OUT = path.join(REPO, 'media');
const SESSION = path.join(CLIPS, 'client-session.json');
const PORT = 4411;
const FPS = 30;

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
if (!CHROME) { console.error('No Chrome found. Set CHROME_PATH.'); process.exit(1); }

const RANGE = 'http://127.0.0.1:4310/vendor-brief-review.html';
const NOTES = 'D:/tracer/demo/workspace/notes.md';
const PROMPT =
  'Read my notes on the Northwind account at ' + NOTES + ', summarise the vendor brief at ' +
  RANGE + ', and tell me if the lead times match. Then write the review log entry as the brief describes.';

// --- 1. the proxy banner, live ----------------------------------------------
// Boot the shipped proxy against the demo tiers and keep the lines it prints to
// stderr up to "ready on stdio": the resolved tier for every tool it found. A
// firewall whose rules you can read is the point of the shot.
function captureBanner() {
  const res = spawnSync(
    process.execPath,
    [path.join(REPO, 'adapters/mcp/bin/tracer-proxy.mjs'), '--config', path.join(REPO, 'demo/tiers.json')],
    { cwd: REPO, encoding: 'utf8', input: '', timeout: 90000 },
  );
  const noise = /ExperimentalWarning|trace-warnings|Secure MCP Filesystem|Client does not support MCP Roots|^\(node:/;
  return (res.stderr || '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !noise.test(l));
}

// --- 2. the client exchange, live -------------------------------------------
// Claude Code over MCP, with Tracer in front of the two real servers. The whole
// exchange comes back as a stream of JSON events; the tool calls, their results
// and the refusal are pulled straight out of it. The proxy is pointed at a
// dedicated decision store for this capture, so the verdicts read back afterward
// belong to this run and no other.
function captureExchange(storePath) {
  const cfg = path.join(mkdtempSync(path.join(tmpdir(), 'tracer-cfg-')), 'tracer.capture.mcp.json');
  writeFileSync(cfg, JSON.stringify({
    mcpServers: {
      tracer: {
        command: 'node',
        args: [
          path.join(REPO, 'adapters/mcp/bin/tracer-proxy.mjs'),
          '--config', path.join(REPO, 'demo/tiers.json'),
          '--store', storePath,
        ],
      },
    },
  }, null, 2));
  const args = [
    '--strict-mcp-config', '--mcp-config', cfg, '--tools', '',
    // Let the client call the proxy's tools without a prompt in -p mode, so the
    // capture reproduces without a checked-in permissions file.
    '--allowedTools', 'mcp__tracer',
    '--model', process.env.TRACER_CLIENT_MODEL || 'claude-haiku-4-5-20251001',
    '--output-format', 'stream-json', '--verbose', '-p', PROMPT,
  ];
  const res = spawnSync(process.env.CLAUDE_PATH || 'claude', args, {
    cwd: REPO, encoding: 'utf8', input: '', timeout: 300000, shell: process.platform === 'win32',
  });
  const events = (res.stdout || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  const steps = [];
  let closing = '';
  for (const j of events) {
    if (j.type === 'assistant') {
      for (const b of j.message?.content || []) {
        if (b.type === 'tool_use') {
          if (b.name.endsWith('tracer_begin_task')) {
            steps.push({ kind: 'begin', goal: b.input.goal || '', plan: b.input.plan || [] });
          } else {
            steps.push({ kind: 'call', name: republish(b.name), input: b.input });
          }
        }
        if (b.type === 'text' && b.text.trim()) closing = b.text.trim();
      }
    }
    if (j.type === 'user') {
      for (const b of j.message?.content || []) {
        if (b.type === 'tool_result') {
          const text = Array.isArray(b.content) ? b.content.map((x) => x.text || '').join('') : String(b.content || '');
          const last = steps[steps.length - 1];
          if (last && last.kind === 'call' && last.result === undefined) {
            last.result = text;
            last.error = !!b.is_error;
          }
        }
      }
    }
  }
  return { prompt: PROMPT, steps, closing };
}

// Claude Code namespaces an MCP tool as mcp__<server>__<a_b_c>; the proxy and
// its log speak <server>.<a_b_c>. Undo the client's spelling for display.
function republish(clientName) {
  const m = /^mcp__[^_]+__(.+)$/.exec(clientName);
  const flat = m ? m[1] : clientName;
  const i = flat.indexOf('_');
  return i === -1 ? flat : flat.slice(0, i) + '.' + flat.slice(i + 1);
}

// --- build the session, from real captures ----------------------------------
async function buildSession() {
  const banner = captureBanner();
  const store = path.join(mkdtempSync(path.join(tmpdir(), 'tracer-db-')), 'capture-decisions.db');
  const ex = captureExchange(store);

  // The verdict, tier and rule for each call, read back from the decisions this
  // run's proxy recorded into its own store. The store is keyed by session, so
  // the newest session is this capture and nothing else; the decisions come back
  // in call order and zip onto the calls one for one.
  const { readDecisionStore } = await import(
    pathToFileURL(path.join(REPO, 'adapters/mcp/src/store.js')).href
  );
  let decisions = [];
  try {
    const read = readDecisionStore(store, { limit: 200 });
    const newest = read.sessions[0]?.id;
    decisions = read.decisions.filter((d) => !newest || d.session_id === newest);
  } catch { /* no store, verdicts come from the stream alone */ }

  const session = { capturedAt: new Date().toISOString(), banner, prompt: ex.prompt, steps: [], closing: ex.closing };
  let di = 0;
  for (const s of ex.steps) {
    if (s.kind === 'begin') { session.steps.push({ kind: 'begin', goal: s.goal, plan: s.plan }); continue; }
    const arg = s.input.url || s.input.path || s.input.destination || Object.values(s.input)[0] || '';
    const step = { kind: 'call', name: s.name, arg: String(arg) };
    if (s.error) {
      step.verdict = 'BLOCK';
      step.refusal = String(s.result || '').split(/\r?\n/).filter((l) => l.length);
    } else {
      step.verdict = 'ALLOW';
    }
    const d = decisions[di++]; // decisions are in call order
    if (d && d.tool_name === s.name) { step.tier = d.tier; step.rule = d.rule; step.verdict = d.decision; }
    session.steps.push(step);
  }
  writeFileSync(SESSION, JSON.stringify(session, null, 1));
  return session;
}

// --- render -----------------------------------------------------------------
// The same strip method the other clips use: one headless-Chrome launch draws a
// stack of consecutive frames deterministically (each frame reads ?f=N and
// paints that exact state), then ffmpeg cuts the stack back into frames.
function shoot(url, target, height) {
  return new Promise((resolve, reject) => {
    const profile = mkdtempSync(path.join(tmpdir(), 'tracer-cl-'));
    const child = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-device-scale-factor=1',
      '--force-color-profile=srgb', '--font-render-hinting=none',
      '--virtual-time-budget=2500', `--window-size=1920,${height}`,
      `--screenshot=${target}`, url,
    ], { stdio: 'ignore', detached: true, windowsHide: true });
    const cleanup = () => setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500).unref();
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} cleanup(); reject(new Error('stalled')); }, 45000);
    child.on('error', (e) => { clearTimeout(t); cleanup(); reject(e); });
    child.on('exit', () => { clearTimeout(t); cleanup(); resolve(); });
  });
}

async function render(frames) {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const file = url.startsWith('/assets/')
      ? path.join(REPO, 'web/dist', url)
      : path.join(CLIPS, url.replace(/^\/clips\//, '').replace(/^\//, ''));
    if (!existsSync(file)) return res.writeHead(404).end('nope');
    const t = { '.html': 'text/html; charset=utf-8', '.json': 'application/json',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.css': 'text/css',
      '.js': 'text/javascript', '.mjs': 'text/javascript' }[path.extname(file)]
      || 'application/octet-stream';
    res.writeHead(200, { 'content-type': t }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(PORT, r));

  const dir = mkdtempSync(path.join(tmpdir(), 'tracer-clf-'));
  const STRIP = 20;
  for (let start = 0; start < frames; start += STRIP) {
    const count = Math.min(STRIP, frames - start);
    const strip = path.join(dir, 's' + String(start).padStart(5, '0') + '.png');
    await shoot(
      `http://127.0.0.1:${PORT}/_strip.html?page=client.html&start=${start}&count=${count}&n=${frames}`,
      strip, 1080 * count,
    );
    for (let i = 0; i < count; i++) {
      spawnSync(FFMPEG, ['-y', '-i', strip, '-vf', `crop=1920:1080:0:${i * 1080}`, '-frames:v', '1',
        path.join(dir, 'f' + String(start + i).padStart(5, '0') + '.png')], { stdio: 'ignore' });
    }
    process.stdout.write('.');
  }
  server.close();

  mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, 'product-client.mp4');
  spawnSync(FFMPEG, ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', mp4], { stdio: 'ignore' });
  rmSync(dir, { recursive: true, force: true });
  console.log(`\n-> media/product-client.mp4  (${(frames / FPS).toFixed(1)}s)`);
}

// --- run --------------------------------------------------------------------
const live = process.argv.includes('--live');
let session;
if (live || !existsSync(SESSION)) {
  console.log(live ? 'capturing the live client exchange...' : 'no cached session, capturing live...');
  session = await buildSession();
  console.log(`captured: ${session.banner.length} banner lines, ${session.steps.length} steps`);
} else {
  session = JSON.parse(readFileSync(SESSION, 'utf8'));
  console.log('rendering from cached session (' + session.capturedAt + ')');
}

// Frame budget: the renderer types on a fixed character cadence, so the same
// module that lays the transcript out also says how many frames it runs. One
// source of truth, imported by both sides, so the timing cannot drift.
const { plan } = await import(pathToFileURL(path.join(CLIPS, 'client-lines.mjs')).href);
const frames = plan(session);
console.log('frames:', frames, `(${(frames / FPS).toFixed(1)}s)`);
await render(frames);
