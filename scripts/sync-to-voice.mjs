// ---------------------------------------------------------------------------
// Cut the picture to the voiceover that actually exists.
//
// The cue sheet is written before the voiceover is recorded, from an estimate
// of how long each line takes at an assumed pace. A real read never matches
// that line for line: this one came in at 161 words per minute against the 160
// it was written for, and individual lines still landed up to five seconds away
// from their cue.
//
// Rather than ask for a re-record, this measures where the lines really are and
// rewrites the picture to match: each segment is stretched or trimmed so its
// lines sit inside it. The narration is never touched, which is the point.
// Voice is the take; picture is the thing that can be rebuilt for free.
//
// Line boundaries come from the pauses the <break> tags produced. Those are
// distinctly longer than the breaths inside a line, so they can be told apart
// by duration alone: in this take, tagged pauses run 1.46s and up, while the
// longest untagged one is 1.17s.
//
//   node scripts/sync-to-voice.mjs            # report the drift, change nothing
//   node scripts/sync-to-voice.mjs --apply    # write the new segment lengths
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const VOICE = path.join(REPO, 'media/tracer-voice.mp3');
const CUES = path.join(REPO, 'media/vo-cues.json');
const PLAN = path.join(REPO, 'media/vo-sync.json');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

// Only the pauses a <break> tag produced can be identified by length alone. The
// rest of the line boundaries are ordinary breaths, indistinguishable from the
// ones inside a sentence: in this take, untagged line breaks came in at 1.16s
// against 0.9s for a mid-line pause, which is not a gap worth trusting.
//
// So the tagged pauses are the anchors, and they are enough. A line that
// follows a tag is placed exactly; a line that follows a breath is placed by
// its share of the words between two anchors. Every segment boundary in the cut
// happens to fall on a tagged pause, which is what the picture is cut to.
const TAG_GAP = 1.3;

if (!existsSync(VOICE)) {
  console.error('No media/tracer-voice.mp3. Put the narration there first.');
  process.exit(1);
}

const duration = (f) => parseFloat(spawnSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
  { encoding: 'utf8' }).stdout.trim());

/** Every silence in the narration, as {start, end}. */
function silences() {
  const out = spawnSync(FFMPEG,
    ['-hide_banner', '-i', VOICE, '-af', 'silencedetect=noise=-38dB:d=0.4', '-f', 'null', '-'],
    { encoding: 'utf8' }).stderr;
  const marks = [...out.matchAll(/silence_(start|end):\s*([0-9.]+)/g)]
    .map((m) => ({ kind: m[1], t: parseFloat(m[2]) }));
  const spans = [];
  let open = null;
  for (const m of marks) {
    if (m.kind === 'start') open = m.t;
    else if (open != null) { spans.push({ start: open, end: m.t }); open = null; }
  }
  return spans;
}

const voiceLen = duration(VOICE);
const cues = JSON.parse(readFileSync(CUES, 'utf8'));
const ids = Object.keys(cues.lines).sort();

/** Words per line, from the script the recording was read from. */
function wordsPerLine() {
  const md = readFileSync(path.join(REPO, 'docs/VOICEOVER.md'), 'utf8');
  const out = {};
  const re = /^\*\*(\d{2})\*\*(.*)$/gm;
  let m;
  while ((m = re.exec(md))) {
    const rest = md.slice(m.index + m[0].length);
    const stop = rest.search(/^\*\*\d{2}\*\*|^## /m);
    const body = stop === -1 ? rest : rest.slice(0, stop);
    const text = body.split(/\r?\n/).filter((l) => l.trim().startsWith('>'))
      .map((l) => l.replace(/^\s*>\s?/, '').trim()).join(' ').trim();
    if (text) out[m[1]] = text.split(/\s+/).length;
  }
  return out;
}

// Which lines were preceded by a break tag, and so can be anchored exactly.
//
// Read from the paste script rather than recomputed from the cue sheet. The
// cue sheet is rewritten every time the picture is rebuilt, including by a
// --sync run, so deriving the anchors from it means the second run disagrees
// with the first about what was recorded. The paste file is what was actually
// read aloud, and it does not change.
const words = wordsPerLine();
const anchored = (() => {
  const paste = path.join(REPO, 'docs/VOICEOVER-PASTE.md');
  if (!existsSync(paste)) throw new Error('docs/VOICEOVER-PASTE.md is missing');
  const body = readFileSync(paste, 'utf8');
  const fence = body.match(/```\n([\s\S]*?)```/);
  if (!fence) throw new Error('no script block in docs/VOICEOVER-PASTE.md');
  // Every paragraph in the block is either a break tag or a spoken line, in
  // order. A line is anchored when the paragraph before it was a tag.
  const paras = fence[1].split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const set = new Set();
  let n = 0;
  let tagged = false;
  for (const p of paras) {
    if (/^<break\b/.test(p)) { tagged = true; continue; }
    if (tagged) set.add(ids[n]);
    tagged = false;
    n += 1;
  }
  if (n !== ids.length) throw new Error(`script has ${n} lines, the cue sheet has ${ids.length}`);
  return set;
})();

const gaps = silences().filter((s) => s.end - s.start >= TAG_GAP);
const anchorIds = ids.filter((id) => anchored.has(id));
if (gaps.length !== anchorIds.length) {
  console.log(`\nFound ${gaps.length} tagged pauses, expected ${anchorIds.length}.`);
  gaps.forEach((g, i) => console.log(`  ${i + 1}  ${g.start.toFixed(1)} to ${g.end.toFixed(1)}  (${(g.end - g.start).toFixed(2)}s)`));
  console.log('\nAdjust TAG_GAP and run again.');
  process.exit(1);
}

// Place every line: anchored ones at the pause that precedes them, the rest by
// their share of the words spoken between the two anchors either side.
const starts = new Array(ids.length);
anchorIds.forEach((id, i) => { starts[ids.indexOf(id)] = gaps[i].end; });
starts[0] = 0;

for (let i = 0; i < ids.length; i++) {
  if (starts[i] != null) continue;
  let a = i - 1;
  while (starts[a] == null) a -= 1;
  let b = i;
  while (b < ids.length && starts[b] == null) b += 1;
  const from = starts[a];
  const to = b < ids.length ? starts[b] : voiceLen;
  const span = ids.slice(a, b);
  const totalWords = span.reduce((n, id) => n + (words[id] || 12), 0);
  let acc = 0;
  for (let k = a; k < b; k++) {
    if (k > a) starts[k] = from + (acc / totalWords) * (to - from);
    acc += words[ids[k]] || 12;
  }
}

// Group the lines into runs of consecutive lines over the same clip, not by
// clip name. product-viewer is one take used twice, at the top and again after
// the cards, so keying on the name alone merges two segments an hour apart and
// reports the whole middle of the video as one shot.
const runsOfClip = [];
ids.forEach((id, i) => {
  const clip = cues.lines[id].clip;
  const last = runsOfClip[runsOfClip.length - 1];
  if (last && last.clip === clip) last.lines.push({ id, at: starts[i] });
  else runsOfClip.push({ clip, lines: [{ id, at: starts[i] }] });
});

console.log(`\nnarration ${voiceLen.toFixed(1)}s, picture ${cues.total}s\n`);
console.log('  line  cued at   lands at   drift');
console.log('  ' + '-'.repeat(40));
ids.forEach((id, i) => {
  const d = starts[i] - cues.lines[id].at;
  console.log(
    '  ' + id.padEnd(6) +
    (cues.lines[id].at.toFixed(1) + 's').padEnd(10) +
    (starts[i].toFixed(1) + 's').padEnd(11) +
    (d >= 0 ? '+' : '') + d.toFixed(1) + 's',
  );
});

// The plan: for each segment, the first line over it starts the segment, and
// the segment runs until the next segment's first line.
const segs = runsOfClip.map((r) => ({
  clip: r.clip,
  at: r.lines[0].at,
  lines: r.lines.map((l) => l.id),
}));
segs.sort((a, b) => a.at - b.at);
segs.forEach((s, i) => {
  s.runs = (i + 1 < segs.length ? segs[i + 1].at : voiceLen + 2) - s.at;
});

console.log('\n  segment                  was      needs');
console.log('  ' + '-'.repeat(48));
for (const s of segs) {
  const first = cues.lines[s.lines[0]].at;
  const last = cues.lines[s.lines[s.lines.length - 1]].until;
  console.log('  ' + s.clip.padEnd(24) + ((last - first).toFixed(1) + 's').padEnd(9) + s.runs.toFixed(1) + 's');
}

const total = segs.reduce((a, s) => a + s.runs, 0);
console.log(`\n  total ${total.toFixed(1)}s of picture for ${voiceLen.toFixed(1)}s of voice`);

if (!process.argv.includes('--apply')) {
  console.log('\nNothing written. Pass --apply to save the plan.');
  process.exit(0);
}

writeFileSync(PLAN, JSON.stringify({
  voice: Number(voiceLen.toFixed(3)),
  segments: segs.map((s) => ({ clip: s.clip, at: Number(s.at.toFixed(3)), runs: Number(s.runs.toFixed(3)), lines: s.lines })),
}, null, 2));
console.log('\n-> media/vo-sync.json');
console.log('Now run: node scripts/assemble-cut.mjs --sync');
