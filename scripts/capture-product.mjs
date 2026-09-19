// ---------------------------------------------------------------------------
// Capture the product, in action, and direct it.
//
// This drives the real UI over the Chrome DevTools Protocol (real clicks on
// real buttons, the real agent loop, the real X-ray) and records it at 30fps.
// What comes out is footage of the thing itself, not a reconstruction of it. If
// the UI changes, the footage changes with it, which is the whole reason to do
// it this way rather than rebuilding the interface in a clip.
//
// Two things are added on top of the capture, both in scripts/lib:
//
//   a camera   scenes shoot at 2x and output 1080p, so pushing in to half width
//              is still native resolution rather than an upscale
//   an overlay a spotlight matte, boxes and callouts on the element that
//              matters, and the rule name restated at a size a phone can read
//
// Every rectangle either one uses is measured from the live DOM at capture
// time, so framing follows the real element and survives a layout change.
//
// House rule for the overlay: a mark may only restate what is already on
// screen. It may enlarge a rule name the UI prints at 11px, or dim the parts of
// the frame that are not the subject. It may not introduce a claim the footage
// does not support.
//
// Needs the server on :8787, Chrome, and ffmpeg.
//
//   node scripts/capture-product.mjs             # every scene
//   node scripts/capture-product.mjs xray        # one scene
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import http from 'node:http';
import { camera, frameOn, fullFrame } from './lib/overlay.mjs';
import { spotlight, box, callout, ruleStamp, renderMarks } from './lib/marks.mjs';
import { rasterise, composite } from './lib/compose.mjs';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(REPO, 'media');
const APP = process.env.TRACER_APP || 'http://localhost:8787';
const PORT = 9333;
const SITE_PORT = 4412;
const FPS = 30;
const W = 1920, H = 1080;          // output
const SCALE = 2;                   // capture at 2x for camera headroom
const CW = W * SCALE, CH = H * SCALE;
const ASPECT = W / H;

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

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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
           .find(e => e.textContent.toLowerCase().includes(${JSON.stringify(String(text).toLowerCase())}));
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
      await pause(120);
    }
  }
  /** Scroll the window from 0 to its full height on a fixed per-frame delta. */
  async travel(steps, ms) {
    const height = await this.eval('document.body.scrollHeight - innerHeight');
    for (let i = 0; i <= steps; i++) {
      await this.eval(`window.scrollTo(0, ${(i / steps).toFixed(5)} * ${height})`);
      await pause(ms);
    }
  }
}

/**
 * Record with Page.startScreencast.
 *
 * The obvious approach, a loop calling Page.captureScreenshot, cannot go faster
 * than about 14fps: every frame is a full round trip that encodes a large PNG,
 * base64s it and pushes it back over the socket. Video reads as smooth from
 * roughly 24fps up, so that approach produces footage that looks like a laggy
 * screen recording however carefully the scene is staged.
 *
 * Screencast is the API built for this. Chrome pushes JPEG frames as the page
 * composites them, with a timestamp on each, and holds 30fps without trouble.
 * The timestamps are what make it honest: frames arrive only when something
 * changes, so they are resampled onto a fixed 30fps timeline afterwards and a
 * still moment repeats its last frame rather than the clip racing through it.
 *
 * `during` receives a cue object. Anything marked on it is converted from
 * milliseconds-since-start into a frame number, which is how the camera and the
 * overlay know when the moment they are built around actually happened.
 */
async function screencast(s, during, fps = FPS) {
  const frames = [];
  s.on('Page.screencastFrame', (p) => {
    frames.push({ data: Buffer.from(p.data, 'base64'), t: p.metadata.timestamp });
    // Unacknowledged frames stop the stream, so this ack is not optional.
    s.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  });

  await s.send('Page.startScreencast', {
    format: 'jpeg', quality: 95, maxWidth: CW, maxHeight: CH, everyNthFrame: 1,
  });

  const at = {};
  const t0 = Date.now();
  const cue = { mark: (name) => { at[name] = Date.now() - t0; } };
  await during(cue);
  // A beat after the last interaction, so the final state is actually captured
  // rather than the stream being cut while the page is still settling.
  await pause(400);
  await s.send('Page.stopScreencast');

  if (!frames.length) throw new Error('screencast produced no frames');

  // Resample onto a fixed timeline. Screencast timestamps are seconds from an
  // arbitrary epoch, so they are normalised against the first frame.
  const base = frames[0].t;
  const span = Math.max((Date.now() - t0) / 1000, frames[frames.length - 1].t - base);
  const total = Math.max(1, Math.round(span * fps));

  const shots = [];
  let i = 0;
  for (let n = 0; n < total; n++) {
    const want = n / fps;
    while (i + 1 < frames.length && frames[i + 1].t - base <= want) i += 1;
    shots.push(frames[i].data);
  }

  const cues = {};
  for (const [k, v] of Object.entries(at)) cues[k] = Math.round((v / 1000) * fps);
  return { shots, fps, cues };
}

async function launch(url, extraArgs = []) {
  const profile = mkdtempSync(path.join(tmpdir(), 'tracer-cap-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      ...extraArgs,
      `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
      `--window-size=${W},${H}`, '--hide-scrollbars',
      `--force-device-scale-factor=${SCALE}`,
      '--force-color-profile=srgb', '--font-render-hinting=none',
      '--disable-features=IsolateOrigins,site-per-process',
      url,
    ],
    { stdio: 'ignore', detached: true, windowsHide: true },
  );

  // Wait for the debugger, then attach to the page target.
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await pause(400);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* not up yet */ }
  }
  if (!page) throw new Error('Chrome never exposed a page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');

  // Pin the viewport rather than trusting --window-size. Chrome's window size
  // includes its own chrome, so a 1920x1080 window gives a 1902x984 viewport:
  // not 16:9, and not what the camera arithmetic assumes. Overriding the
  // metrics makes capture exactly W x H CSS pixels at SCALE device pixels, so a
  // rect measured in the page maps onto captured pixels by one multiply.
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

/**
 * Turn a scene's result into an mp4.
 *
 * A scene with no camera and no marks still comes through here, with an
 * identity camera, so there is one encode path rather than two that can drift.
 */
async function render({ id, shots, fps, cam, marks }) {
  const cameraAt = cam || (() => fullFrame(CW, CH));

  let overlayDir = null;
  if (marks && marks.length) {
    process.stdout.write(' overlay');
    const svgs = [];
    for (let i = 0; i < shots.length; i++) svgs.push(renderMarks(marks, i, { w: W, h: H }));
    overlayDir = await rasterise(svgs, { w: W, h: H, chrome: CHROME });
  }

  process.stdout.write(' compose');
  try {
    return composite({
      shots, cameraAt, overlayDir, fps, width: W, height: H,
      out: path.join(OUT, id + '.mp4'),
    });
  } finally {
    if (overlayDir) rmSync(overlayDir, { recursive: true, force: true });
  }
}

/**
 * Map a rect measured in CSS pixels into output space, through the camera.
 *
 * Marks are drawn on the finished 1920x1080 frame, but the rects they point at
 * were measured in the page, so every mark needs this. Returned as a function
 * of frame index, because the camera moves.
 */
const through = (cam, r) => (n) => {
  if (!r) return null;
  const c = cam(n);
  const k = W / c.w;
  return { x: (r.x * SCALE - c.x) * k, y: (r.y * SCALE - c.y) * k, w: r.w * SCALE * k, h: r.h * SCALE * k };
};

/** Measure the blocked call, in CSS pixels. */
const blockedRect = (s) => s.eval(`(() => {
  const row = [...document.querySelectorAll('.call')]
    .find((e) => e.querySelector('.call-dot.block'));
  if (!row) return null;
  const b = row.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
})()`);

/**
 * Read the rule name off the blocked call.
 *
 * Not from .rule-chip: that reflects whichever call is selected, which defaults
 * to one in the unprotected pane whose chip reads "unprotected", a word that is
 * not a rule at all and that an earlier version captioned a clip with.
 *
 * The blocked row is found by its dot class rather than by matching text: the
 * rendered text is letter-spaced, so a regex over textContent sees
 * "de tination-originate -from-page" and matches nothing useful.
 */
const readRule = (s) => s.eval(`(() => {
  const row = [...document.querySelectorAll('.call')]
    .find((e) => e.querySelector('.call-dot.block'));
  const meta = row && row.querySelector('.call-meta');
  if (!meta || !meta.textContent.includes('\\u00B7')) return null;
  return meta.textContent.split('\\u00B7').pop().trim();
})()`);

/** The rule name is the one string the overlay restates, so it must be real. */
function assertRule(rule) {
  if (!rule || !/^[a-z]+(?:-[a-z]+){2,}$/.test(rule)) {
    throw new Error('no rule name on the blocked call, got: ' + JSON.stringify(rule));
  }
  return rule;
}

// --- the scenes --------------------------------------------------------------

const SCENES = {

  // The extension, on a page served the way the open web serves pages.
  //
  // It cannot be filmed against /range: those pages ship `script-src 'none'`,
  // which is the control that stops untrusted markup executing, and it also
  // stops the content script importing the analyser. That is the range being
  // correct rather than the extension being broken, so the scene serves the
  // same markup from a plain static host instead.
  //
  // Known to fail unattended on this setup: Chrome accepts --load-extension and
  // then does not install the unpacked MV3 build, so no isolated world is
  // created and the content script never runs. Verified in both headless and
  // headed mode by listing execution contexts: only main-world ones appear. The
  // extension is fine when loaded by hand through chrome://extensions, which is
  // what docs/BRIEF-AGENT-CAPTURE.md covers. Left in, and left out of the
  // default run, so the failure is documented rather than rediscovered.
  async extension() {
    const dist = path.join(REPO, 'adapters/browser/dist');
    if (!existsSync(path.join(dist, 'manifest.json'))) {
      throw new Error('adapters/browser/dist missing. Run: node adapters/browser/build.mjs');
    }

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
      await s.waitFor('document.querySelectorAll("[data-tracer-span]").length > 0', 30000, 'analyser');
      await pause(1800);
      await s.eval(`(() => {
        const el = document.querySelector('[data-tracer-concealed="1"]');
        if (el) el.scrollIntoView({ block: 'center' });
        return true;
      })()`);
      await pause(900);

      const cap = await screencast(s, async (cue) => {
        await pause(1400);
        cue.mark('reveal');
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

  // The whole sandbox story: run both agents and watch them diverge, the
  // unprotected one paying out while the protected one holds and then blocks.
  //
  // The camera stays wide for this one. The divergence is a comparison, and a
  // comparison needs both columns in frame; pushing in on either half would be
  // filming one side of an argument. The marks wait for the block, then name it.
  async viewer() {
    const { s, close } = await launch(APP + '/#sandbox');
    try {
      await s.waitFor('document.querySelector(".split")', 30000, 'sandbox');
      await pause(1400);

      const cap = await screencast(s, async (cue) => {
        await pause(900);
        await s.click('button', 'run both agents');
        // Both runs play on one clock. Hold once the refusal lands: that pause
        // is the moment the whole project exists for.
        await s.waitFor('document.querySelector(".call .call-dot.block")', 60000, 'the block');
        cue.mark('block');
        await pause(7000);
      });

      const rule = assertRule(await readRule(s));
      const blocked = await blockedRect(s);

      const n = cap.shots.length;
      const blk = cap.cues.block;
      const cam = camera([{ at: 0, rect: fullFrame(CW, CH) }], { width: CW, height: CH, aspect: ASPECT });
      const marks = [
        // No callout on this one. The blocked row sits in the right-hand
        // column with about 2px of gutter beside it and the unprotected pane
        // immediately to its left, so a horizontal label has nowhere to go that
        // is not on top of something. The box says which row, the UI already
        // prints BLOCKED on it, and the stamp names the rule: a callout would
        // only repeat one of the three.
        box({ rect: through(cam, blocked), from: blk + 10, to: blk + 30, out: n - 26, width: 3, radius: 6 }),
        ruleStamp({
          text: rule, kicker: 'the agent was blocked on',
          from: blk + 44, to: blk + 68, out: n - 14, x: 96, y: H - 170, size: 34,
        }),
      ];
      return { id: 'product-viewer', ...cap, cam, marks };
    } finally {
      close();
    }
  },

  // The reveal. This is the moment a still cannot carry: a 1.1s sweep, then the
  // concealed span igniting in place on the page.
  async xray() {
    const { s, close } = await launch(APP + '/#sandbox');
    try {
      await s.waitFor('document.querySelector(".split")', 30000, 'sandbox');
      await s.waitFor('document.querySelector("iframe")', 30000, 'page frame');
      await pause(1200);

      // Run first, so the right pane carries the block the overlay names rather
      // than an empty panel telling the viewer to press a button. Wait for the
      // block itself, not just for calls: the rule name is read off that row.
      await s.click('button', 'run both agents');
      await s.waitFor('document.querySelector(".call .call-dot.block")', 60000, 'the blocked call');
      await pause(2000);
      const rule = assertRule(await readRule(s));

      // Frame on the span that is about to ignite. Two scrolls are needed and
      // they are not interchangeable: the iframe is a fixed-height window onto a
      // taller page, so scrolling the outer document moves the frame around the
      // screen while scrolling inside it moves the article within the frame.
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

      // The X-ray grows the span: it adds a "HIDDEN FROM YOU" label through a
      // ::before and lifts the payload out of the page flow, so the box to frame
      // on does not exist until the reveal has run. Measure it by revealing
      // once, reading the real rect, then putting the page back. What gets
      // filmed is the second reveal, with the camera already knowing where to
      // land.
      const measure = `(() => {
        const frame = document.querySelector('iframe');
        const fb = frame.getBoundingClientRect();
        const span = frame.contentDocument
          .querySelector('[data-tracer-concealed="1"], [data-tracer-instruction="1"]');
        const b = span.getBoundingClientRect();
        return { x: fb.left + b.left, y: fb.top + b.top, w: b.width, h: b.height };
      })()`;
      await s.click('button', 'show what the agent read');
      await pause(1500);
      const target = await s.eval(measure);
      await s.click('button', 'showing what the agent read');
      await pause(1200);

      const cap = await screencast(s, async (cue) => {
        await pause(1400);
        cue.mark('reveal');
        await s.click('button', 'show what the agent read');
        await pause(6200);
      });

      const n = cap.shots.length;
      const rev = cap.cues.reveal;
      // Hold wide, push in as the sweep runs, hold tight on the ignited payload.
      // maxZoom stops the crop going tighter than a 2x capture can carry.
      const onSpan = frameOn(target, {
        aspect: ASPECT, pad: 0.42, width: CW, height: CH, scale: SCALE, maxZoom: SCALE,
      });
      const cam = camera([
        { at: 0, rect: fullFrame(CW, CH) },
        { at: Math.max(1, rev - 8), rect: fullFrame(CW, CH) },
        { at: rev + 34, rect: onSpan },
        { at: n - 1, rect: onSpan },
      ], { width: CW, height: CH, aspect: ASPECT });

      const at = through(cam, target);
      const marks = [
        spotlight({ rect: at, from: rev + 30, to: rev + 48, hold: n - 26, out: n - 6, strength: 0.66, radius: 6 }),
        box({ rect: at, from: rev + 34, to: rev + 56, out: n - 20, width: 3, radius: 6 }),
        callout({
          anchor: at, label: 'CONCEALED', sub: 'white-on-white, read by the model',
          from: rev + 50, to: rev + 76, out: n - 22, len: 120, size: 28,
        }),
        ruleStamp({
          text: rule, kicker: 'the agent was blocked on',
          from: rev + 82, to: rev + 104, out: n - 14, x: 96, y: H - 170, size: 34,
        }),
      ];
      return { id: 'product-xray', ...cap, cam, marks };
    } finally {
      close();
    }
  },

  // The landing page: what the project claims, with the evidence under it.
  //
  // This replaces the old #proxy scene, which no longer exists. That hash now
  // redirects here, because the landing page absorbed both the proxy and
  // extension sections, and it is the better shot anyway: a live sandbox, the
  // three rules, the sixteen attack classes, and the two real MCP servers.
  //
  // Filmed as one travel down the page rather than a cut between bands. The page
  // is around 8000px tall and its argument is cumulative, so the scroll is the
  // scene. The delta is fixed per frame rather than smooth-scrolled, which eases
  // at both ends and reads as a page that cannot decide whether it is moving.
  async landing() {
    // Explicitly #home: the bare root resolves through the alias table on a
    // hashchange, and the scene can attach before that has settled.
    const { s, close } = await launch(APP + '/#home');
    try {
      await s.waitFor('document.querySelector(".band")', 45000, 'landing page');
      await pause(2600);
      const cap = await screencast(s, async () => {
        await s.travel(340, 26);
        await pause(1400);
      });
      return { id: 'product-landing', ...cap };
    } finally {
      close();
    }
  },

  // The dashboard: refusals as an operations surface rather than as a story.
  //
  // This replaces the old #arena scene. It is the clip that says the project is
  // something you would run rather than something you watch once: recent
  // decisions, the destinations that were refused, and the tier breakdown
  // showing that nothing which only reads was ever stopped.
  //
  // The page labels itself a preview of a console that does not ship yet. That
  // label stays in frame. It is honest disclosure, and an assessor will look
  // for exactly that.
  async dashboard() {
    const { s, close } = await launch(APP + '/#dashboard');
    try {
      await s.waitFor('document.querySelector(".panel")', 30000, 'dashboard');
      await pause(2400);
      const cap = await screencast(s, async () => {
        await pause(1200);
        await s.travel(160, 30);
        await pause(2200);
      });
      return { id: 'product-dashboard', ...cap };
    } finally {
      close();
    }
  },

  // Somebody else's attack, planted and run live.
  //
  // The arena folded into the sandbox behind a "Write your own" toggle, so the
  // scene opens that before waiting on the textarea it types into. An earlier
  // version waited on a textarea that the default tab never renders, and timed
  // out.
  async arena() {
    const { s, close } = await launch(APP + '/#sandbox');
    try {
      await s.waitFor('document.querySelector(".split")', 30000, 'sandbox');
      await pause(1500);
      await s.click('button', 'write your own');
      await s.waitFor('document.querySelector("textarea")', 20000, 'the injection box');
      await pause(1200);

      const cap = await screencast(s, async (cue) => {
        await pause(1000);
        await s.click('button', 'plant it in a page');
        await pause(3500);
        await s.click('button', 'run both agents');
        await s.waitFor('document.querySelector(".call .call-dot.block")', 60000, 'the block');
        cue.mark('block');
        await pause(5000);
      });
      return { id: 'product-arena', ...cap };
    } finally {
      close();
    }
  },
};

// --- run ---------------------------------------------------------------------

// The extension scene is excluded from the default run: it cannot be produced
// unattended here (see its comment) and is captured by hand instead.
const DEFAULT = ['viewer', 'xray', 'landing', 'dashboard', 'arena'];

const only = process.argv[2];
const names = only ? [only] : DEFAULT;
for (const name of names) {
  if (!SCENES[name]) {
    console.error('Unknown scene: ' + name + '. Known: ' + Object.keys(SCENES).join(', '));
    process.exit(1);
  }
}

mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const name of names) {
  process.stdout.write(name.padEnd(11));
  try {
    const scene = await SCENES[name]();
    const { seconds } = await render(scene);
    console.log(` -> media/${scene.id}.mp4  (${seconds.toFixed(1)}s, ${scene.shots.length} frames)`);
  } catch (err) {
    failed += 1;
    console.log(' FAILED - ' + err.message);
  }
}
if (failed) process.exitCode = 1;
