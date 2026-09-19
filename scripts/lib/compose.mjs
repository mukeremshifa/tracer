// ---------------------------------------------------------------------------
// Compositing: camera crop + overlay, applied to captured frames.
//
// The overlay is rasterised in the same headless Chrome the capture already
// needs, rather than by adding a native SVG library. Chrome is the reference
// renderer for SVG, it is already a hard dependency here, and it means the
// overlay's type resolves against the very same font files the UI uses, so a
// rule name in the overlay and the rule name in the product are the same shapes.
//
// Frames are rasterised in vertical strips (many frames in one tall page) for
// the same reason the card renderer does it: one Chrome launch per strip rather
// than per frame turns minutes into seconds.
// ---------------------------------------------------------------------------

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Rasterise a list of SVG strings to transparent PNGs via Chrome.
 *
 * Returns the directory holding o%05d.png. Strips are capped by total pixel
 * height because Chrome refuses to screenshot an arbitrarily tall viewport.
 */
export async function rasterise(svgs, { w, h, chrome, port = 4413 }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracer-ov-'));
  const perStrip = Math.max(1, Math.floor(15000 / h));

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const start = Number(u.searchParams.get('start') || 0);
    const count = Number(u.searchParams.get('count') || 1);
    const body = svgs.slice(start, start + count)
      .map((s) => `<div class="f">${s}</div>`).join('');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;background:transparent}
      .f{width:${w}px;height:${h}px;overflow:hidden}
      svg{display:block}
    </style>${body}`);
  });
  await new Promise((r) => server.listen(port, r));

  try {
    for (let start = 0; start < svgs.length; start += perStrip) {
      const count = Math.min(perStrip, svgs.length - start);
      const strip = path.join(dir, 'strip.png');
      await shoot(chrome, `http://127.0.0.1:${port}/?start=${start}&count=${count}`,
        strip, w, h * count);
      for (let i = 0; i < count; i++) {
        spawnSync(FFMPEG, ['-y', '-i', strip, '-vf', `crop=${w}:${h}:0:${i * h}`,
          '-frames:v', '1', path.join(dir, 'o' + String(start + i).padStart(5, '0') + '.png')],
          { stdio: 'ignore' });
      }
      process.stdout.write('.');
    }
  } finally {
    server.close();
  }
  return dir;
}

function shoot(chrome, url, target, w, h) {
  return new Promise((resolve, reject) => {
    const profile = mkdtempSync(path.join(tmpdir(), 'tracer-ovc-'));
    const child = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', '--virtual-time-budget=4000',
      '--force-color-profile=srgb', '--font-render-hinting=none',
      `--window-size=${w},${h}`, `--screenshot=${target}`, url,
    ], { stdio: 'ignore', detached: true, windowsHide: true });
    const done = (fn, a) => {
      setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1200).unref();
      fn(a);
    };
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} done(reject, new Error('overlay strip stalled')); }, 60000);
    child.on('error', (e) => { clearTimeout(t); done(reject, e); });
    child.on('exit', () => { clearTimeout(t); done(resolve); });
  });
}

/**
 * Crop each captured frame with the camera, scale to output, composite the
 * overlay on top, and encode.
 *
 * Done per frame with ffmpeg rather than as one filtergraph: the crop rectangle
 * changes every frame, and expressing a per-frame keyframed crop inside a single
 * filter expression is far harder to read and to debug than doing the arithmetic
 * in Node where it already lives.
 */
export function composite({ shots, cameraAt, overlayDir, out, fps, width, height }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracer-cmp-'));
  try {
    shots.forEach((buf, i) => {
      writeFileSync(path.join(dir, 'src' + String(i).padStart(5, '0') + '.jpg'), buf);
    });

    for (let i = 0; i < shots.length; i++) {
      const c = cameraAt(i);
      const src = path.join(dir, 'src' + String(i).padStart(5, '0') + '.jpg');
      const dst = path.join(dir, 'out' + String(i).padStart(5, '0') + '.png');
      const ov = overlayDir && path.join(overlayDir, 'o' + String(i).padStart(5, '0') + '.png');

      const args = ['-y', '-i', src];
      let filter = `[0:v]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${width}:${height}:flags=lanczos[base]`;
      if (ov && existsSync(ov)) {
        args.push('-i', ov);
        filter += `;[base][1:v]overlay=0:0:format=auto[v]`;
      } else {
        filter += `;[base]null[v]`;
      }
      args.push('-filter_complex', filter, '-map', '[v]', '-frames:v', '1', dst);
      const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
      if (r.status !== 0) {
        const tail = (r.stderr || '').split(/\r?\n/).slice(-14).join('\n');
        throw new Error('composite failed at frame ' + i + '\n' + tail);
      }
      if (i % 30 === 0) process.stdout.write('+');
    }

    mkdirSync(path.dirname(out), { recursive: true });
    const r = spawnSync(FFMPEG, ['-y', '-framerate', String(fps), '-i', path.join(dir, 'out%05d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', out],
      { stdio: 'ignore' });
    if (r.status !== 0) throw new Error('encode failed');
    return { out, seconds: shots.length / fps };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
