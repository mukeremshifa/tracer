// ---------------------------------------------------------------------------
// Render the video clips.
//
// Each clip is an HTML page that takes a frame number in the query string and
// draws exactly that frame -- no clocks, no requestAnimationFrame, no CSS
// animation. Chrome screenshots each frame, ffmpeg encodes the sequence. The
// result is deterministic: the same command produces the same MP4, byte for
// byte, however slow the machine is.
//
// That matters more than it sounds. Recording a real browser means re-recording
// every time a number changes; this way a clip is a build artifact, and a
// scorecard that moves is one command away from correct footage.
//
// Needs Chrome and ffmpeg.
//
//   node scripts/render-clips.mjs            # every clip
//   node scripts/render-clips.mjs stats-01   # just one
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLIPS = path.join(REPO, 'web/tools/clips');
const OUT = path.join(REPO, 'media');
const PORT = 4407;
const FPS = 30;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chrome = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome found. Set CHROME_PATH.');
  process.exit(1);
}
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error('ffmpeg not on PATH. Set FFMPEG_PATH.');
  process.exit(1);
}

// Each clip: the html file under web/tools/clips, and how many frames it runs.
// Durations are chosen for the cut in docs/SHOTLIST.md.
const CLIPS_LIST = JSON.parse(readFileSync(path.join(CLIPS, 'clips.json'), 'utf8'));

const only = process.argv[2];
const todo = only ? CLIPS_LIST.filter((c) => c.id === only) : CLIPS_LIST;
if (!todo.length) {
  console.error('No clip matches ' + only + '. Known: ' + CLIPS_LIST.map((c) => c.id).join(', '));
  process.exit(1);
}

// Serve the clip pages plus the repo's real fonts, so the footage uses the same
// typefaces as the product rather than a fallback.
const FONTS = path.join(REPO, 'web/dist/assets');
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = url === '/' ? null : path.join(url.startsWith('/assets/') ? REPO + '/web/dist' : CLIPS, url.replace(/^\//, ''));
  if (file && existsSync(file)) {
    const ext = path.extname(file);
    const type =
      { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
        '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' }[ext] ||
      'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    return res.end(readFileSync(file));
  }
  return res.writeHead(404).end('not found');
});
await new Promise((r) => server.listen(PORT, r));

function shot(url, target, height = 1080) {
  return new Promise((resolve, reject) => {
    const profile = mkdtempSync(path.join(tmpdir(), 'tracer-clip-'));
    const child = spawn(
      chrome,
      [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-device-scale-factor=1',
        '--virtual-time-budget=2500', `--window-size=1920,${height}`,
        `--screenshot=${target}`, url,
      ],
      { stdio: 'ignore', detached: true, windowsHide: true },
    );
    const cleanup = () => setTimeout(() => {
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* the OS will */ }
    }, 1500).unref();
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} cleanup(); reject(new Error('chrome stalled')); }, 45000);
    child.on('error', (e) => { clearTimeout(timer); cleanup(); reject(e); });
    child.on('exit', () => { clearTimeout(timer); cleanup(); resolve(); });
  });
}

mkdirSync(OUT, { recursive: true });

for (const clip of todo) {
  const frames = mkdtempSync(path.join(tmpdir(), 'tracer-frames-'));
  process.stdout.write(`${clip.id}  ${clip.frames} frames `);

  // Frames are rendered in strips: one Chrome launch draws STRIP frames stacked
  // vertically, and ffmpeg cuts them apart. Launching a browser per frame spent
  // about two seconds of process startup for each 33ms of animation.
  const STRIP = 20;
  let made = 0;
  for (let start = 0; start < clip.frames; start += STRIP) {
    const count = Math.min(STRIP, clip.frames - start);
    const stripPng = path.join(frames, 'strip' + String(start).padStart(4, '0') + '.png');
    await shot(
      `http://127.0.0.1:${PORT}/_strip.html?page=${encodeURIComponent(clip.page)}` +
        `&start=${start}&count=${count}&n=${clip.frames}`,
      stripPng,
      1080 * count,
    );
    // Cut the strip into its frames, numbered to continue the sequence.
    const cut = spawnSync(
      ffmpeg,
      ['-y', '-i', stripPng, '-vf', `crop=1920:1080:0:0*n,select='lt(n\,${count})'`,
       '-vsync', '0', '-start_number', String(start),
       path.join(frames, 'f%04d.png')],
      { stdio: 'ignore' },
    );
    if (cut.status !== 0) {
      // crop with a per-frame offset is not expressible in one filter, so fall
      // back to one crop per frame -- still one browser launch, just more cuts.
      for (let i = 0; i < count; i++) {
        spawnSync(
          ffmpeg,
          ['-y', '-i', stripPng, '-vf', `crop=1920:1080:0:${i * 1080}`, '-frames:v', '1',
           path.join(frames, 'f' + String(start + i).padStart(4, '0') + '.png')],
          { stdio: 'ignore' },
        );
      }
    }
    made += count;
    process.stdout.write('.');
  }

  const mp4 = path.join(OUT, clip.id + '.mp4');
  const enc = spawnSync(
    ffmpeg,
    ['-y', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'),
     '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', mp4],
    { stdio: 'ignore' },
  );
  rmSync(frames, { recursive: true, force: true });

  if (enc.status !== 0) {
    console.log(' ENCODE FAILED');
    continue;
  }
  console.log(` -> media/${clip.id}.mp4  (${(clip.frames / FPS).toFixed(1)}s)`);
}

server.close();
console.log('\nDone. Clips are in media/ at 1920x1080, ' + FPS + 'fps.');
