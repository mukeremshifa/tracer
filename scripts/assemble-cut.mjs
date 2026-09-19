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
// `hold` freezes the segment's last frame for that many seconds.
//
// product-viewer carries five of the seventeen lines across two uses, 33s of
// narration over a 19s take, and the stat cards are cut to their own animation
// rather than to a sentence. Rather than cut words that are doing work, the
// shots that need air get it: a still hold reads as deliberate on a UI that has
// stopped moving anyway, and it is the same choice an editor would make on the
// timeline. The arena and landing shots have slack and get none.
const ORDER = [
  { clip: 'product-viewer',    from: 0,  to: 10, hold: 5,   vo: ['01', '02'], note: 'the robbery' },
  { clip: 'product-xray',                        hold: 2.5, vo: ['03', '04'], note: 'the reveal' },
  { clip: 'stats-01-owasp',                      hold: 0.5, vo: ['05'] },
  { clip: 'stats-02-echoleak',                   hold: 2,   vo: ['06'] },
  { clip: 'stats-03-defences',                              vo: ['07'] },
  { clip: 'honesty',                                        vo: ['08'], note: 'hold, no music' },
  { clip: 'product-viewer',    from: 10,         hold: 10,  vo: ['09', '10', '11'], note: 'the divergence' },
  { clip: 'product-arena',                                  vo: ['12'] },
  { clip: 'product-landing',                                vo: ['13'] },
  { clip: 'product-client',                                 vo: ['14'], note: 'the strongest beat' },
  { clip: 'product-dashboard',                              vo: ['15'] },
  { clip: 'stats-04-gap',                        hold: 1.8, vo: ['16'] },
  { clip: 'closing',                             hold: 1,   vo: ['17'], note: 'last 2s silent' },
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
  const hold = seg.hold || 0;
  return { ...seg, src, full, from, to, hold, runs: to - from + hold };
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

// Where each voiceover line starts, and the shot it has to finish inside.
//
// Written out so make-voiceover.mjs can lay the spoken lines onto one track the
// length of the picture, instead of the timings living in two places and
// drifting apart the first time a clip is re-captured.
//
// Lines sharing a segment split it in proportion to how long they actually take
// to say, when the takes exist to measure. Splitting evenly instead put three
// lines into 3.1 seconds each on the divergence shot while the arena and
// landing shots sat on six to nine seconds of slack, and reported eight
// overruns for a script whose words fit the picture with two seconds to spare.
const spoken = (id) => {
  const f = path.join(MEDIA, 'vo', 'vo-' + id + '.mp3');
  if (!existsSync(f)) return null;
  const d = duration(f);
  return Number.isFinite(d) ? d : null;
};

const cues = { total: Number(total.toFixed(3)), lines: {} };
for (const s of timed) {
  const takes = s.vo.map(spoken);
  const measured = takes.every((t) => t != null);
  // Leave a breath between lines that share a shot, and after the last one.
  const gap = 0.35;
  const weights = measured
    ? takes.map((t) => t + gap)
    : s.vo.map(() => 1);
  const sum = weights.reduce((a, b) => a + b, 0);

  let at = s.at;
  s.vo.forEach((v, i) => {
    const share = (weights[i] / sum) * s.runs;
    cues.lines[v] = {
      at: Number(at.toFixed(3)),
      until: Number((at + share).toFixed(3)),
      clip: s.clip,
      ...(measured ? { spoken: Number(takes[i].toFixed(2)) } : {}),
    };
    at += share;
  });
}
writeFileSync(path.join(MEDIA, 'vo-cues.json'), JSON.stringify(cues, null, 2));

if (process.argv.includes('--timing')) process.exit(0);

// --- build -------------------------------------------------------------------

const dir = mkdtempSync(path.join(tmpdir(), 'tracer-cut-'));
try {
  const parts = [];
  timed.forEach((s, i) => {
    const out = path.join(dir, 'p' + String(i).padStart(2, '0') + '.mp4');
    if (s.from === 0 && s.to === s.full && !s.hold) {
      parts.push(s.src);
      return;
    }
    // A trim, a hold, or both. Re-encoded rather than stream-copied: a copy can
    // only cut on a keyframe, so it would quietly move the split to the nearest
    // one and the narration would drift against the picture from there on.
    const what = [];
    if (s.from || s.to !== s.full) what.push('trim ' + s.from + '-' + s.to + 's');
    if (s.hold) what.push('hold ' + s.hold + 's');
    process.stdout.write('  ' + s.clip.padEnd(20) + what.join(', ') + '\n');

    const args = ['-y', '-ss', String(s.from)];
    if (s.to !== s.full) args.push('-to', String(s.to));
    args.push('-i', s.src);
    // tpad clones the final frame. The picture is a UI that has already stopped
    // moving by then, so the freeze reads as the shot being held rather than as
    // playback stalling.
    if (s.hold) args.push('-vf', `tpad=stop_mode=clone:stop_duration=${s.hold}`);
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
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
