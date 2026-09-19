// ---------------------------------------------------------------------------
// SAMPLE: the X-ray beat, directed.
//
// Same capture as scripts/capture-product.mjs (the real UI, real clicks, the
// real reveal) with two things added on top:
//
//   a camera   captured at 2x, so pushing in to half width is still native
//              resolution at 1080p rather than an upscale
//   an overlay a spotlight matte, a box on the span that ignites, and the rule
//              name restated at a size a phone can read
//
// Every rectangle the camera and the overlay use is measured from the live DOM
// at capture time, so the framing follows the real element and survives a
// layout change. Nothing is drawn that the footage does not already show.
//
//   node scripts/capture-xray-directed.mjs
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { camera, frameOn, fullFrame } from './lib/overlay.mjs';
import { spotlight, box, ruleStamp, callout, renderMarks } from './lib/marks.mjs';
import { rasterise, composite } from './lib/compose.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(REPO, 'media');
const APP = process.env.TRACER_APP || 'http://localhost:8787';
const PORT = 9341;
const FPS = 30;
const W = 1920, H = 1080;         // output
const SCALE = 2;                  // capture at 2x for headroom
const CW = W * SCALE, CH = H * SCALE;

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));
if (!CHROME) { console.error('No Chrome found. Set CHROME_PATH.'); process.exit(1); }

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

class Session {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method && this.handlers.has(m.method)) this.handlers.get(m.method)(m.params);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej }));
  }
  on(m, f) { this.handlers.set(m, f); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr);
    return r.result.value;
  }
  async click(sel, text) {
    const needle = String(text).toLowerCase();
    const ok = await this.eval(
      '(() => { const el = [...document.querySelectorAll(' + JSON.stringify(sel) + ')]' +
      '.find(e => e.textContent.toLowerCase().includes(' + JSON.stringify(needle) + '));' +
      'if (!el) return false; el.click(); return true; })()',
    );
    if (!ok) throw new Error('nothing to click: ' + sel + ' / ' + text);
  }
  async waitFor(expr, timeout = 30000, label = expr) {
    const t0 = Date.now();
    for (;;) {
      if (await this.eval('!!(' + expr + ')')) return;
      if (Date.now() - t0 > timeout) throw new Error('timed out waiting for ' + label);
      await pause(120);
    }
  }
}

async function launch(url) {
  const profile = mkdtempSync(path.join(tmpdir(), 'tracer-xd-'));
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT,
    '--window-size=' + W + ',' + H, '--hide-scrollbars',
    '--force-device-scale-factor=' + SCALE,
    '--force-color-profile=srgb', '--font-render-hinting=none',
    '--disable-features=IsolateOrigins,site-per-process', url,
  ], { stdio: 'ignore', detached: true, windowsHide: true });

  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await pause(400);
    try {
      const list = await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json());
      page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
  }
  if (!page) throw new Error('Chrome never exposed a page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable'); await s.send('Runtime.enable');

  // Pin the viewport rather than trusting --window-size. Chrome's window size
  // includes its own chrome, so a 1920x1080 window gives a 1902x984 viewport:
  // not 16:9, and not what the camera arithmetic below assumes. Overriding the
  // metrics makes the capture exactly W x H CSS pixels at SCALE device pixels,
  // so a rect measured in the page maps onto captured pixels by one multiply.
  await s.send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: SCALE, mobile: false,
  });
  return {
    s,
    close() {
      try { ws.close(); } catch { /* fine */ }
      try { child.kill('SIGKILL'); } catch { /* fine */ }
      setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500).unref();
    },
  };
}

async function screencast(s, during, fps = FPS) {
  const frames = [];
  s.on('Page.screencastFrame', (p) => {
    frames.push({ data: Buffer.from(p.data, 'base64'), t: p.metadata.timestamp });
    s.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  });
  await s.send('Page.startScreencast', {
    format: 'jpeg', quality: 95, maxWidth: CW, maxHeight: CH, everyNthFrame: 1,
  });
  const t0 = Date.now();
  const cues = await during();
  await pause(400);
  await s.send('Page.stopScreencast');
  if (!frames.length) throw new Error('screencast produced no frames');

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
  // Where each cue landed, converted from ms-since-start into frame numbers.
  const at = {};
  for (const [k, ms] of Object.entries(cues || {})) at[k] = Math.round((ms / 1000) * fps);
  return { shots: out, fps, cues: at };
}

// --- the take ----------------------------------------------------------------

console.log('launching at ' + CW + 'x' + CH + ' (2x)');
const { s, close } = await launch(APP + '/#sandbox');
let result;
try {
  await s.waitFor('document.querySelector(".split")', 30000, 'sandbox');
  await s.waitFor('document.querySelector("iframe")', 30000, 'page frame');
  await pause(1200);

  // Run both agents first, so the right pane carries the block the overlay
  // points at rather than an empty prompt.
  await s.click('button', 'run both agents');
  // Wait for the block itself, not just for calls to appear. The rule name is
  // read off that row, and it does not exist until the protected run reaches it.
  await s.waitFor('document.querySelector(".call .call-dot.block")', 60000, 'the blocked call');
  await pause(2000);

  // Frame on the span that is about to ignite. Two scrolls, and they are not
  // interchangeable: the iframe is a fixed-height window onto a taller page, so
  // scrolling the outer document moves the frame around the screen while
  // scrolling inside it moves the article within the frame.
  const framed = await s.eval(`(() => {
    const frame = document.querySelector('iframe');
    const doc = frame && frame.contentDocument;
    const span = doc && doc.querySelector('[data-tracer-concealed="1"], [data-tracer-instruction="1"]');
    if (!frame || !span) return false;
    const win = frame.contentWindow;
    const top = span.getBoundingClientRect().top + win.scrollY;
    win.scrollTo(0, Math.max(0, top - frame.clientHeight * 0.55));
    const shellTop = frame.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, shellTop - 90));
    return true;
  })()`);
  if (!framed) throw new Error('no concealed span to frame on');
  await pause(900);

  // Measure everything the camera and the overlay need, in CSS pixels.
  const geo = await s.eval(`(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const frame = document.querySelector('iframe');
    const fb = frame.getBoundingClientRect();
    const doc = frame.contentDocument;
    const span = doc.querySelector('[data-tracer-concealed="1"], [data-tracer-instruction="1"]');
    const sb = span.getBoundingClientRect();
    // The rule has to come from the blocked call. Reading .rule-chip instead
    // gives whichever call happens to be selected, which defaults to one in the
    // unprotected pane whose chip reads "unprotected": not a rule at all, and a
    // word this overlay would then have captioned the video with.
    //
    // The blocked row is found by its dot class rather than by matching text.
    // The rendered text is letter-spaced, so a regex over textContent sees
    // "de tination-originate -from-page" and matches nothing useful.
    const blockedCall = [...document.querySelectorAll('.call')]
      .find((e) => e.querySelector('.call-dot.block'));
    const blocked = document.querySelector('.decision.block') || blockedCall;
    const meta = blockedCall && blockedCall.querySelector('.call-meta');
    // .call-meta reads "tier 2 external act · <rule>".
    const ruleText = meta && meta.textContent.includes('·')
      ? meta.textContent.split('·').pop().trim()
      : null;
    return {
      frame: r(frame),
      span: { x: fb.left + sb.left, y: fb.top + sb.top, w: sb.width, h: sb.height },
      blocked: r(blocked),
      rule: ruleText,
      banner: r(document.querySelector('.strip-banner')),
      vw: innerWidth, vh: innerHeight,
    };
  })()`);
  console.log('geometry: ' + JSON.stringify(geo));

  // The rule name is the one piece of text the overlay restates, so it has to
  // be the real one. Failing loudly here beats shipping a clip captioned with
  // whatever string happened to be first in the DOM.
  if (!geo.rule || !/^[a-z]+(?:-[a-z]+){2,}$/.test(geo.rule)) {
    throw new Error('no rule name found on the blocked call, got: ' + JSON.stringify(geo.rule));
  }

  // The X-ray grows the span: it adds a "HIDDEN FROM YOU" label through a
  // ::before and lifts the payload out of the page flow, so the box to frame on
  // does not exist until the reveal has run. Measure it by revealing once,
  // reading the real rect, then putting the page back. What gets filmed is the
  // second reveal, with the camera already knowing where to land.
  await s.click('button', 'show what the agent read');
  await pause(1500);
  const revealed = await s.eval(`(() => {
    const frame = document.querySelector('iframe');
    const fb = frame.getBoundingClientRect();
    const span = frame.contentDocument
      .querySelector('[data-tracer-concealed="1"], [data-tracer-instruction="1"]');
    const b = span.getBoundingClientRect();
    return { x: fb.left + b.left, y: fb.top + b.top, w: b.width, h: b.height };
  })()`);
  await s.click('button', 'showing what the agent read');
  await pause(1200);
  geo.revealed = revealed;
  console.log('revealed rect: ' + JSON.stringify(revealed));

  const T0 = Date.now();
  result = await screencast(s, async () => {
    const cue = {};
    await pause(1400);
    cue.reveal = Date.now() - T0;
    await s.click('button', 'show what the agent read');
    await pause(6200);
    return cue;
  });
  result.geo = geo;
} finally {
  close();
}

const { shots, cues, geo } = result;
const N = shots.length;
console.log('\ncaptured ' + N + ' frames (' + (N / FPS).toFixed(1) + 's), reveal at frame ' + cues.reveal);

// --- direct it ---------------------------------------------------------------

const aspect = W / H;
const wide = fullFrame(CW, CH);
// Frame on the span with enough margin that the article around it still reads
// as a page. maxZoom keeps the crop from going tighter than 2x, which is the
// point where a 2x capture stops being native resolution.
const target = geo.revealed || geo.span;
const onSpan = frameOn(target, {
  aspect, pad: 0.42, width: CW, height: CH, scale: SCALE, maxZoom: SCALE,
});
const rev = cues.reveal;

// Hold wide, push in as the sweep runs, hold tight on the ignited payload.
const cam = camera([
  { at: 0, rect: wide },
  { at: Math.max(1, rev - 8), rect: wide },
  { at: rev + 34, rect: onSpan },
  { at: N - 1, rect: onSpan },
], { width: CW, height: CH, aspect });

// Overlay rects live in output space, so map capture-space through the camera.
const toOut = (n, r) => {
  const c = cam(n);
  const k = W / c.w;
  return { x: (r.x * SCALE - c.x) * k, y: (r.y * SCALE - c.y) * k, w: r.w * SCALE * k, h: r.h * SCALE * k };
};
const spanOut = (n) => toOut(n, target);

const marks = [
  spotlight({ rect: spanOut, from: rev + 30, to: rev + 48, hold: N - 26, out: N - 6, strength: 0.66, radius: 6 }),
  box({ rect: spanOut, from: rev + 34, to: rev + 56, out: N - 20, width: 3, radius: 6 }),
  callout({
    anchor: spanOut, label: 'CONCEALED', sub: 'white-on-white, read by the model',
    from: rev + 50, to: rev + 76, out: N - 22, len: 120, size: 28,
  }),
  ruleStamp({
    text: geo.rule,
    kicker: 'the agent was blocked on', from: rev + 82, to: rev + 104, out: N - 14,
    x: 96, y: H - 170, size: 34,
  }),
];

console.log('rasterising overlay');
const svgs = [];
for (let n = 0; n < N; n++) svgs.push(renderMarks(marks, n, { w: W, h: H }));
const ovDir = await rasterise(svgs, { w: W, h: H, chrome: CHROME });

console.log('\ncompositing');
const { seconds } = composite({
  shots, cameraAt: cam, overlayDir: ovDir, fps: FPS, width: W, height: H,
  out: path.join(OUT, 'product-xray-directed.mp4'),
});
rmSync(ovDir, { recursive: true, force: true });
console.log('\n-> media/product-xray-directed.mp4  (' + seconds.toFixed(1) + 's)');
