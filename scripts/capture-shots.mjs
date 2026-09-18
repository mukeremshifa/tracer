// ---------------------------------------------------------------------------
// Regenerate the X-ray screenshots on the #extension page.
//
// The extension's content script does exactly three things to a page: analyse
// it, inject the X-ray stylesheet, and turn the X-ray on. This script does the
// same three things to the same range pages and screenshots the result, so the
// pictures on #extension are renders of the shipped code rather than mockups.
//
// It imports from adapters/browser/dist -- the bundle the extension itself
// loads -- so a change to the analyser or the X-ray shows up here or the
// screenshots are stale. Run `node adapters/browser/build.mjs` first.
//
// Needs Chrome. This is a build-time tool for maintaining a doc page; it is not
// part of the product, and nothing at runtime depends on a browser being
// installed. That is why it lives in scripts/ and not in the server.
//
//   node scripts/capture-shots.mjs
// ---------------------------------------------------------------------------

import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RANGE = path.join(REPO, 'server/src/range');
const DIST = path.join(REPO, 'adapters/browser/dist');
const OUT = path.join(REPO, 'web/public/shots');
const PORT = 4399;

// Each shot earns its place by making a different claim.
const SHOTS = [
  { page: 'white-on-white', name: 'xray-before', xray: false, height: 1050 },
  { page: 'white-on-white', name: 'xray-after', xray: true, height: 1050 },
  { page: 'zero-width', name: 'xray-zero-width', xray: true, height: 980 },
  { page: 'html-comment', name: 'xray-html-comment', xray: true, height: 980 },
  { page: 'base64-payload', name: 'xray-base64-payload', xray: true, height: 980 },
  { page: 'alt-attribute', name: 'xray-alt-attribute', xray: true, height: 980 },
  { page: 'clean', name: 'xray-clean', xray: true, height: 860 },
];

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const chrome = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.');
  process.exit(1);
}
if (!existsSync(path.join(DIST, 'analyser.js'))) {
  console.error('adapters/browser/dist is missing. Run: node adapters/browser/build.mjs');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// The page under test is loaded in an iframe so the analyser sees a real
// document with real computed styles, exactly as the content script does. No
// CSP is set here: this server exists only to feed Chrome for a screenshot, and
// the analyser has to be able to reach into the frame. The range pages the
// product serves keep their `script-src 'none'`.
function shim({ page, xray, height }) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'html,body{margin:0;padding:0;background:#fff}'
    + 'iframe{border:0;width:1280px;height:' + height + 'px;display:block}'
    + '</style></head><body>'
    + '<iframe id="f" src="/range/' + page + '.html"></iframe>'
    + '<script type="module">'
    + 'const { analyse } = await import("/ext/analyser.js");'
    + 'const { applyXray } = await import("/ext/xray.js");'
    + 'const f = document.getElementById("f");'
    + 'if (!f.contentDocument || f.contentDocument.readyState !== "complete") {'
    + '  await new Promise(r => f.addEventListener("load", r, { once: true }));'
    + '}'
    + 'const doc = f.contentDocument;'
    + 'const result = analyse(doc, { url: f.src, window: f.contentWindow });'
    + (xray ? 'applyXray(doc, true);' : '')
    + 'document.title = "spans:" + result.spans.length;'
    + '</script></body></html>';
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  // Each shot has its own URL: nothing about which page is being captured lives
  // in server state, so a fast-starting Chrome cannot race the next assignment.
  if (url.startsWith('/shot/')) {
    const shot = SHOTS.find((s) => s.name === url.slice(6));
    if (!shot) return res.writeHead(404).end('no such shot');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(shim(shot));
  }
  let file = null;
  if (url.startsWith('/range/')) file = path.join(RANGE, url.slice(7));
  else if (url.startsWith('/ext/')) file = path.join(DIST, url.slice(5));
  if (file && existsSync(file)) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    return res.end(readFileSync(file));
  }
  res.writeHead(404).end('not found');
});


// Chrome is spawned detached rather than run with execFileSync: the sync call
// hands the child this process's open handles, the listening socket among them,
// and Chrome then does not exit even once the screenshot is on disk.
function runChrome(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'ignore', detached: true, windowsHide: true });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Chrome did not exit within 60s'));
    }, 60000);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', () => { clearTimeout(timer); resolve(); });
  });
}

mkdirSync(OUT, { recursive: true });

await new Promise((r) => server.listen(PORT, r));

for (const shot of SHOTS) {
  const target = path.join(OUT, shot.name + '.png');
  // A throwaway profile per shot. Without it Chrome finds the previous
  // instance's lock, attaches to it and never exits, which hangs the run.
  const profile = mkdtempSync(path.join(tmpdir(), 'tracer-shot-'));
  try {
    await runChrome(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--virtual-time-budget=8000',
      `--window-size=1280,${shot.height}`,
      `--screenshot=${target}`,
      `http://127.0.0.1:${PORT}/shot/${shot.name}`,
    ]);
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  console.log(`  ${shot.name}.png  ${shot.page}${shot.xray ? '' : '  (x-ray off)'}`);
}

server.close();

// The before/after pair is the argument this page makes, and its failure mode is
// silent: if the X-ray does not apply, both frames still render and both still
// look like a page. Identical bytes mean the reveal did not happen.
const before = readFileSync(path.join(OUT, 'xray-before.png'));
const after = readFileSync(path.join(OUT, 'xray-after.png'));
if (before.equals(after)) {
  console.error('\nxray-before.png and xray-after.png are identical - the X-ray did not apply.');
  process.exit(1);
}

console.log(`\n${SHOTS.length} shots -> web/public/shots`);
