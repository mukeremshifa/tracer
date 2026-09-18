// ---------------------------------------------------------------------------
// The terminal scene: `tracer prove`, as it actually runs.
//
// Runs the real command, captures its real stdout, and types that output into a
// terminal window frame by frame. The only thing added is colour, and only on
// lines the run already distinguishes (the refusal, the tier lines, the
// prompt). Nothing is rewritten, and nothing is staged: if the command's output
// changes, re-running this changes the clip.
//
// Needs Chrome, ffmpeg, and whatever `tracer prove` needs (uvx and npx).
//
//   node scripts/make-terminal-clip.mjs
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLIPS = path.join(REPO, 'web/tools/clips');
const OUT = path.join(REPO, 'media');
const PORT = 4409;
const FPS = 30;
const CPF = 14; // characters revealed per frame

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
if (!CHROME) { console.error('No Chrome found.'); process.exit(1); }

// --- 1. run the real thing ---------------------------------------------------

console.log('running: tracer prove');
const run = spawnSync(process.execPath, [path.join(REPO, 'cli/tracer.mjs'), 'prove'], {
  cwd: REPO, encoding: 'utf8', timeout: 300000,
});
const raw = (run.stdout || '') + (run.stderr || '');
if (!raw.trim()) { console.error('no output from tracer prove'); process.exit(1); }

// The command prints absolute paths from this machine. Keep the shape, drop the
// part that is only true here.
const lines = ['$ npx tracer prove', ''].concat(
  raw.replace(/\r/g, '').split('\n').map((l) => l.replace(new RegExp(REPO.replace(/[\/]/g, '[\\/]'), 'g'), '.')),
);
writeFileSync(path.join(CLIPS, 'terminal-lines.json'), JSON.stringify(lines, null, 0));

const chars = lines.reduce((n, l) => n + l.length + 1, 0);
const frames = Math.ceil(chars / CPF) + 70; // a beat to read the refusal at the end
console.log(`${lines.length} lines, ${chars} chars -> ${frames} frames (${(frames / FPS).toFixed(1)}s)`);

// --- 2. serve and shoot ------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = url.startsWith('/assets/')
    ? path.join(REPO, 'web/dist', url)
    : path.join(CLIPS, url.replace(/^\/clips\//, '').replace(/^\//, ''));
  if (existsSync(file)) {
    const t = { '.html': 'text/html; charset=utf-8', '.json': 'application/json',
                '.woff': 'font/woff', '.woff2': 'font/woff2', '.css': 'text/css',
                '.js': 'text/javascript' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': t });
    return res.end(readFileSync(file));
  }
  return res.writeHead(404).end('nope');
});
await new Promise((r) => server.listen(PORT, r));

function shoot(url, target, height) {
  return new Promise((resolve, reject) => {
    const profile = mkdtempSync(path.join(tmpdir(), 'tracer-term-'));
    const child = spawn(CHROME, [
      '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
      `--user-data-dir=${profile}`,'--hide-scrollbars','--force-device-scale-factor=1',
      '--virtual-time-budget=2500',`--window-size=1920,${height}`,
      `--screenshot=${target}`, url,
    ], { stdio: 'ignore', detached: true, windowsHide: true });
    const done = (fn, a) => {
      setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500).unref();
      fn(a);
    };
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} done(reject, new Error('stalled')); }, 45000);
    child.on('error', (e) => { clearTimeout(t); done(reject, e); });
    child.on('exit', () => { clearTimeout(t); done(resolve); });
  });
}

const dir = mkdtempSync(path.join(tmpdir(), 'tracer-tf-'));
const STRIP = 20;
for (let start = 0; start < frames; start += STRIP) {
  const count = Math.min(STRIP, frames - start);
  const strip = path.join(dir, 's' + String(start).padStart(5, '0') + '.png');
  await shoot(
    `http://127.0.0.1:${PORT}/_strip.html?page=terminal.html&start=${start}&count=${count}&n=${frames}&cpf=${CPF}`,
    strip, 1080 * count,
  );
  for (let i = 0; i < count; i++) {
    spawnSync(FFMPEG, ['-y','-i',strip,'-vf',`crop=1920:1080:0:${i * 1080}`,'-frames:v','1',
      path.join(dir, 'f' + String(start + i).padStart(5, '0') + '.png')], { stdio: 'ignore' });
  }
  process.stdout.write('.');
}
server.close();

mkdirSync(OUT, { recursive: true });
const mp4 = path.join(OUT, 'product-terminal.mp4');
spawnSync(FFMPEG, ['-y','-framerate',String(FPS),'-i',path.join(dir,'f%05d.png'),
  '-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium', mp4], { stdio: 'ignore' });
rmSync(dir, { recursive: true, force: true });
console.log(`\n-> media/product-terminal.mp4  (${(frames / FPS).toFixed(1)}s)`);
