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
import http from 'node:http';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(REPO, 'media');
const APP = process.env.TRACER_APP || 'http://localhost:8787';
const PORT = 9333;
const SITE_PORT = 4412;
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

/**
 * Record with Page.startScreencast.
 *
 * The obvious approach, a loop calling Page.captureScreenshot, cannot go faster
 * than about 14fps: every frame is a full round trip that encodes a 1920x1080
 * PNG, base64s it and pushes it back over the socket. Video reads as smooth from
 * roughly 24fps up, so that approach produces footage that looks like a laggy
 * screen recording however carefully the scene is staged.
 *
 * Screencast is the API built for this. Chrome pushes JPEG frames as the page
 * composites them, with a timestamp on each, and holds 30fps without trouble.
 * The timestamps are what make it honest: frames arrive only when something
 * changes, so they are resampled onto a fixed 30fps timeline afterwards and a
 * still moment repeats its last frame rather than the clip racing through it.
 */
async function screencast(s, during, fps = 30) {
  const frames = [];
  s.on('Page.screencastFrame', (p) => {
    frames.push({ data: Buffer.from(p.data, 'base64'), t: p.metadata.timestamp });
    // Unacknowledged frames stop the stream, so this ack is not optional.
    s.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  });

  await s.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });

  const t0 = Date.now();
  await during();
  // A beat after the last interaction, so the final state is actually captured
  // rather than the stream being cut while the page is still settling.
  await new Promise((r) => setTimeout(r, 400));
  await s.send('Page.stopScreencast');

  if (!frames.length) throw new Error('screencast produced no frames');

  // Resample onto a fixed timeline. Screencast timestamps are seconds from an
  // arbitrary epoch, so they are normalised against the first frame.
  const base = frames[0].t;
  const span = Math.max((Date.now() - t0) / 1000, frames[frames.length - 1].t - base);
  const total = Math.max(1, Math.round(span * fps));

  const out = [];
  let i = 0;
  for (let n = 0; n < total; n++) {
    const want = n / fps;
    while (i + 1 < frames.length && frames[i + 1].t - base <= want) i += 1;
    out.push(frames[i].data);
  }
  return { shots: out, fps };
}

async function launch(url, extraArgs = []) {
  const profile = mkdtempSync(path.join(tmpdir(), 'tracer-cap-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      ...extraArgs,
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
function encode(shots, id, fps) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracer-pf-'));
  shots.forEach((buf, i) => writeFileSync(path.join(dir, 'f' + String(i).padStart(5, '0') + '.jpg'), buf));
  mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, id + '.mp4');
  const r = spawnSync(
    FFMPEG,
    ['-y', '-framerate', fps.toFixed(3), '-i', path.join(dir, 'f%05d.jpg'),
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

  // The extension, on a page served the way the open web serves pages.
  //
  // It cannot be filmed against /range: those pages ship `script-src 'none'`,
  // which is the control that stops untrusted markup executing, and it also
  // stops the content script importing the analyser. That is the range being
  // correct rather than the extension being broken, so the scene serves the
  // same markup from a plain static host instead.
  async extension() {
    const dist = path.join(REPO, 'adapters/browser/dist');
    if (!existsSync(path.join(dist, 'manifest.json'))) {
      throw new Error('adapters/browser/dist missing. Run: node adapters/browser/build.mjs');
    }
    // Known to fail unattended on this setup: Chrome accepts --load-extension
    // and then does not install it, so no isolated world is created and the
    // content script never runs. Verified in both headless and headed mode by
    // listing execution contexts: only main-world ones appear. The extension
    // itself is fine when loaded by hand through chrome://extensions, which is
    // what docs/BRIEF-AGENT-CAPTURE.md covers.

    const html = await fetch(APP + '/range/white-on-white.html').then((r) => r.text());
    const site = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    await new Promise((r) => site.listen(SITE_PORT, r));

    const { s, close } = await launch(`http://127.0.0.1:${SITE_PORT}/article.html`, [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
    ]);
    try {
      // The content script analyses on load and stamps what it finds.
      await s.waitFor('document.querySelectorAll("[data-tracer-span]").length > 0', 30000, 'analyser');
      await pause(1800);

      await s.eval(`(() => {
        const el = document.querySelector('[data-tracer-concealed="1"]');
        if (el) el.scrollIntoView({ block: 'center' });
        return true;
      })()`);
      await pause(900);

      const cap = await screencast(s, async () => {
        await pause(1400);
        // What the toolbar button does, done directly: headless has no toolbar,
        // and the popup is a separate target that cannot be filmed with the page.
        await s.eval(`(async () => {
          const { applyXray } = await import(chrome.runtime.getURL('xray.js'));
          applyXray(document, true);
        })()`);
        await pause(5200);
      });
      return { id: 'product-extension', ...cap };
    } finally {
      close();
      site.close();
    }
  },
  // The whole sandbox story: load the recorded run, watch both agents play out
  // side by side, and let the provenance line draw itself on the block.
  async viewer() {
    const { s, close } = await launch(APP + '/#sandbox');
    try {
      await s.waitFor('document.querySelector(".viewer-head, .split")', 30000, 'viewer');
      await pause(1200);
      const cap = await screencast(s, async () => {
        await pause(800);
        await s.click('button', 'play recorded run');
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

      // Load the run before revealing anything. Without it the right half of
      // the frame is an empty panel telling the viewer to press a button, which
      // wastes half the screen on the one scene that has to sell the mechanism.
      await s.click('button', 'play recorded run');
      await s.waitFor('document.querySelectorAll(".call-row, .callrow, .call").length > 2', 30000, 'calls');
      await pause(2500);

      // Frame the shot on the span that is about to ignite. Two scrolls are
      // needed and they are not interchangeable: the iframe is a fixed-height
      // window onto a taller page, so scrolling the outer document moves the
      // frame around the screen while scrolling inside it moves the article
      // within the frame. An earlier version only did the first, with a
      // hardcoded offset, and clipped the payload against the frame's edge.
      await s.eval(`(() => {
        const frame = document.querySelector('iframe');
        const doc = frame && frame.contentDocument;
        const span = doc && doc.querySelector('[data-tracer-concealed="1"], [data-tracer-instruction="1"]');
        if (!frame || !span) return false;

        // Inside the frame: sit the span just below the middle, so the article
        // above it still reads as an ordinary page.
        const win = frame.contentWindow;
        const top = span.getBoundingClientRect().top + win.scrollY;
        win.scrollTo(0, Math.max(0, top - frame.clientHeight * 0.55));

        // Outside: bring the frame itself fully into view, header included.
        const shellTop = frame.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, shellTop - 90));
        return true;
      })()`);
      await pause(900);

      const cap = await screencast(s, async () => {
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
      const cap = await screencast(s, async () => {
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
      const cap = await screencast(s, async () => {
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
