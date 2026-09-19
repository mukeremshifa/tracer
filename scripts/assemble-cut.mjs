// ---------------------------------------------------------------------------
// Assemble the silent cut: every clip in media/, in order, as one mp4.
//
// The order and the two viewer splits live in ORDER below, which is the single
// place the cut is described. Running this prints a timing table keyed to the
// voiceover lines in docs/VOICEOVER.md, so the script and the picture can be
// checked against each other without scrubbing a timeline.
//
// Segments are cut with a stream copy where the cut lands on a keyframe and
// re-encoded where it does not, so a split never silently shifts by half a
// second. Everything is already 1920x1080 yuv420p at 30fps, so the final
// concatenation is a stream copy and the picture is bit-for-bit what the
// capture produced.
//
//   node scripts/assemble-cut.mjs              # media/tracer-silent.mp4
//   node scripts/assemble-cut.mjs --timing     # print the table, build nothing
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const MEDIA = path.join(REPO, 'media');
const OUT = path.join(MEDIA, 'tracer-silent.mp4');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

/**
 * The cut.
 *
 * `vo` names the voiceover lines that sit over each segment, so the timing
 * table can say where each line starts in the finished file. `from`/`to` are
 * seconds within the source clip, and exist only for product-viewer, which is
 * one take used twice: the robbery up front, the divergence after the cards.
 */
const ORDER = [
  { clip: 'product-viewer',    from: 0,  to: 10, vo: ['01', '02'], note: 'the robbery' },
  { clip: 'product-xray',                        vo: ['03', '04'], note: 'the reveal' },
  { clip: 'stats-01-owasp',                      vo: ['05'] },
  { clip: 'stats-02-echoleak',                   vo: ['06'] },
  { clip: 'stats-03-defences',                   vo: ['07'] },
  { clip: 'honesty',                             vo: ['08'], note: 'hold, no music' },
  { clip: 'product-viewer',    from: 10,         vo: ['09', '10', '11'], note: 'the divergence' },
  { clip: 'product-arena',                       vo: ['12'] },
  { clip: 'product-landing',                     vo: ['13'] },
  { clip: 'product-client',                      vo: ['14'], note: 'the strongest beat' },
  { clip: 'product-dashboard',                   vo: ['15'] },
  { clip: 'stats-04-gap',                        vo: ['16'] },
  { clip: 'closing',                             vo: ['17'], note: 'last 2s silent' },
];

const duration = (file) => {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat(r.stdout.trim());
};

const hhmmss = (s) => {
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${rest}`;
};

// --- resolve the cut ---------------------------------------------------------

const segments = ORDER.map((seg) => {
  const src = path.join(MEDIA, seg.clip + '.mp4');
  if (!existsSync(src)) throw new Error('missing clip: media/' + seg.clip + '.mp4');
  const full = duration(src);
  const from = seg.from || 0;
  const to = seg.to == null ? full : seg.to;
  return { ...seg, src, full, from, to, runs: to - from };
});

let t = 0;
const timed = segments.map((s) => {
  const row = { ...s, at: t };
  t += s.runs;
  return row;
});
const total = t;

// --- the timing table --------------------------------------------------------

console.log('\n  at      runs   clip                     voiceover');
console.log('  ' + '-'.repeat(68));
for (const s of timed) {
  const span = s.from || s.to !== s.full ? ` [${s.from}-${s.to === s.full ? 'end' : s.to}s]` : '';
  console.log(
    '  ' + hhmmss(s.at).padEnd(8) +
    (s.runs.toFixed(1) + 's').padEnd(7) +
    (s.clip + span).padEnd(25) +
    s.vo.map((v) => 'vo-' + v).join(' ') +
    (s.note ? '   (' + s.note + ')' : ''),
  );
}
console.log('  ' + '-'.repeat(68));
console.log('  ' + hhmmss(total).padEnd(8) + 'total\n');

if (process.argv.includes('--timing')) process.exit(0);

// --- build -------------------------------------------------------------------

const dir = mkdtempSync(path.join(tmpdir(), 'tracer-cut-'));
try {
  const parts = [];
  timed.forEach((s, i) => {
    const out = path.join(dir, 'p' + String(i).padStart(2, '0') + '.mp4');
    if (s.from === 0 && s.to === s.full) {
      parts.push(s.src);
      return;
    }
    // A trim. Re-encoded rather than stream-copied: a copy can only cut on a
    // keyframe, so it would quietly move the split to the nearest one and the
    // narration would drift against the picture from there on.
    process.stdout.write('  trimming ' + s.clip + ' ' + s.from + '-' + s.to + 's\n');
    const args = ['-y', '-ss', String(s.from)];
    if (s.to !== s.full) args.push('-to', String(s.to));
    args.push('-i', s.src, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
      '-pix_fmt', 'yuv420p', '-r', '30', '-an', out);
    const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('trim failed for ' + s.clip + '\n' + (r.stderr || '').split('\n').slice(-8).join('\n'));
    parts.push(out);
  });

  const list = path.join(dir, 'list.txt');
  writeFileSync(list, parts.map((p) => "file '" + p.replace(/\\/g, '/') + "'").join('\n'));

  process.stdout.write('  concatenating\n');
  const r = spawnSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', list,
    '-c', 'copy', '-movflags', '+faststart', '-an', OUT], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error('concat failed\n' + (r.stderr || '').split('\n').slice(-12).join('\n'));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const got = duration(OUT);
console.log('\n-> media/tracer-silent.mp4  (' + hhmmss(got) + ')');
if (Math.abs(got - total) > 0.5) {
  console.log('   NOTE: expected ' + hhmmss(total) + '. A trim landed off its mark.');
  process.exitCode = 1;
}
