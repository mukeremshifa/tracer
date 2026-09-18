// ---------------------------------------------------------------------------
// Capture the product, in action.
//
// This drives the real UI over the Chrome DevTools Protocol -- real clicks on
// real buttons, the real agent loop, the real X-ray -- and screenshots it at
// 30fps. What comes out is footage of the thing itself, not a reconstruction of
// it. If the UI changes, the footage changes with it, which is the whole reason
// to do it this way rather than rebuilding the interface in a clip.
//
// Needs the server on :8787, Chrome, and ffmpeg.
//
//   node scripts/capture-product.mjs             # every scene
//   node scripts/capture-product.mjs xray        # one scene
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(REPO, 'media');
const APP = process.env.TRACER_APP || 'http://localhost:8787';
const PORT = 9333;
const FPS = 30;

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));
if (!CHROME) {
  console.error('No Chrome found. Set CHROME_PATH.');
  process.exit(1);
}
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// --- a minimal CDP client ----------------------------------------------------

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method && this.handlers.has(msg.method)) {
        this.handlers.get(msg.method)(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    this.handlers.set(method, fn);
  }
  /** Evaluate in the page and return the value. */
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr);
    return r.result.value;
  }
  /** Click the first element matching a selector, or one containing text. */
  async click(selector, text) {
    const expr = text
      ? `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
           .find(e => e.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
           if (!el) return false; el.click(); return true; })()`
      : `(() => { const el = document.querySelector(${JSON.stringify(selector)});
           if (!el) return false; el.click(); return true; })()`;
    const ok = await this.eval(expr);
    if (!ok) throw new Error('nothing to click: ' + selector + (text ? ' / ' + text : ''));
  }
  /** Resolve once the expression is truthy, or throw. */
  async waitFor(expr, timeout = 30000, label = expr) {
    const started = Date.now();
    for (;;) {
      if (await this.eval(`!!(${expr})`)) return;
      if (Date.now() - started > timeout) throw new Error('timed out waiting for ' + label);
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  async shot() {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }
}

async function launch(url) {
  const profile = mkdtempSync(path.join(tmpdir(), 'tracer-cap-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
      '--window-size=1920,1080', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--force-color-profile=srgb', '--font-render-hinting=none',
      '--disable-features=IsolateOrigins,site-per-process',
      url,
    ],
    { stdio: 'ignore', detached: true, windowsHide: true },
  );

  // Wait for the debugger, then attach to the page target.
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
  }
  if (!page) throw new Error('Chrome never exposed a page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  return {
    s,
    close() {
      try { ws.close(); } catch { /* fine */ }
      try { child.kill('SIGKILL'); } catch { /* fine */ }
      setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500).unref();
    },
  };
}

/**
 * Screenshot on a fixed cadence while `during` runs.
 *
 * Capture is wall-clock rather than frame-locked: we are filming a live UI whose
 * animations are driven by real timers, so the honest thing is to sample it at a
 * steady rate and accept the frames that result. Dropped frames show up as a
 * slightly short clip, never as a stutter.
 */
async function record(s, during) {
  const shots = [];
  const started = Date.now();
  let running = true;
  const loop = (async () => {
    while (running) shots.push(await s.shot());
  })();
  await during();
  running = false;
  await loop;
  const seconds = (Date.now() - started) / 1000;
  // The true rate, so the clip plays back at the speed it was filmed rather
  // than whatever the screenshot loop happened to manage.
  return { shots, fps: Math.max(1, shots.length / seconds) };
}

function encode(shots, id, fps) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracer-pf-'));
  shots.forEach((buf, i) => writeFileSync(path.join(dir, 'f' + String(i).padStart(5, '0') + '.png'), buf));
  mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, id + '.mp4');
  const r = spawnSync(
    FFMPEG,
    ['-y', '-framerate', fps.toFixed(3), '-i', path.join(dir, 'f%05d.png'),
     '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', mp4],
    { stdio: 'ignore' },
  );
  rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) throw new Error('ffmpeg failed for ' + id);
  return { mp4, seconds: shots.length / fps };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// --- the scenes --------------------------------------------------------------

const SCENES = {
  // The whole sandbox story: load the recorded run, watch both agents play out
  // side by side, and let the provenance line draw itself on the block.
  async viewer() {
    const { s, close } = await launch(APP + '/#sandbox');
    try {
      await s.waitFor('document.querySelector(".viewer-head, .split")', 30000, 'viewer');
      await pause(1200);
      const cap = await record(s, async () => {
        await pause(800);
        await s.click('button', 'load recorded demo');
        // Both runs play on one clock; the protected side holds ~2.6s on the
        // hard block, and the provenance line draws itself 420ms later.
        await pause(26000);
      });
      return { id: 'product-viewer', ...cap };
    } finally {
      close();
    }
  },

  // The reveal. This is the moment a still cannot carry: a 1.1s sweep, then the
  // concealed span igniting in place on the page.
  async xray() {
    const { s, close } = await launch(APP + '/#sandbox');
    try {
      await s.waitFor('document.querySelector(".split")', 30000, 'viewer');
      await s.waitFor(
        'document.querySelector("iframe") && document.querySelector(".btn.primary-xray, button")',
        30000,
        'page frame',
      );
      await pause(2500);

      // Put the concealed span in shot before revealing it. The payload sits
      // below the fold on a 1080-tall window, and an ignite nobody can see is
      // the one thing this scene cannot afford.
      await s.eval('window.scrollTo(0, 520)');
      await pause(900);

      const cap = await record(s, async () => {
        await pause(1200);
        await s.click('button', 'show what the agent read');
        await pause(5200);
      });
      return { id: 'product-xray', ...cap };
    } finally {
      close();
    }
  },

  // The integration surface: what you actually put in front of your own agent.
  async proxy() {
    const { s, close } = await launch(APP + '/#proxy');
    try {
      await s.waitFor('document.querySelector(".panel")', 30000, 'proxy page');
      await pause(2000);
      const cap = await record(s, async () => {
        // A slow scroll down the page: the tier table, then the real refusal.
        const steps = 150;
        for (let i = 0; i <= steps; i++) {
          await s.eval(`window.scrollTo(0, ${i} * (document.body.scrollHeight - innerHeight) / ${steps})`);
          await pause(60);
        }
        await pause(1500);
      });
      return { id: 'product-proxy', ...cap };
    } finally {
      close();
    }
  },

  // Someone else's attack, run live against both agents.
  async arena() {
    const { s, close } = await launch(APP + '/#arena');
    try {
      await s.waitFor('document.querySelector("textarea")', 30000, 'arena');
      await pause(2000);
      const cap = await record(s, async () => {
        await pause(1000);
        await s.click('button', 'plant it in a page');
        await pause(3500);
        await s.click('button', 'run both agents');
        await pause(14000);
      });
      return { id: 'product-arena', ...cap };
    } finally {
      close();
    }
  },
};

// --- run ---------------------------------------------------------------------

const only = process.argv[2];
const names = only ? [only] : Object.keys(SCENES);
for (const name of names) {
  if (!SCENES[name]) {
    console.error('Unknown scene: ' + name + '. Known: ' + Object.keys(SCENES).join(', '));
    process.exit(1);
  }
}

for (const name of names) {
  process.stdout.write(name.padEnd(10));
  try {
    const { id, shots, fps } = await SCENES[name]();
    const { seconds } = encode(shots, id, fps);
    console.log(`${shots.length} frames @ ${fps.toFixed(1)}fps -> media/${id}.mp4  (${seconds.toFixed(1)}s)`);
  } catch (err) {
    console.log('FAILED - ' + err.message);
  }
}
