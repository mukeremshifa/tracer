// ---------------------------------------------------------------------------
// Audition voices on the line that matters most.
//
// Line 08 is the pivot of the whole video: "we did not build another detector,
// Tracer does not claim to stop prompt injection, nobody has". A voice that can
// carry that can carry everything else, so it is the only line worth spending
// credits on before committing.
//
// Prints the measured words per minute for each, which is the part that can be
// judged without listening: roughly 140 to 155 is documentary pace, and
// anything north of 170 is an advertising read.
//
//   node scripts/audition-voices.mjs
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(REPO, 'media/vo/audition');
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

const LINE = 'So we did not build another detector. Tracer does not claim to stop '
  + 'prompt injection. Nobody has.';

// The male, middle-aged, non-character voices in the default library. Filtered
// for this material: nothing tagged upbeat, hyped, sassy or advertisement.
const VOICES = {
  Daniel: 'onwK4e9ZLuTAKqWW03F9',  // british, informative_educational, formal
  Adam:   'pNInz6obpgDQGcFmaJgB',  // american, social_media
  George: 'JBFqnCBsd6RMkjVDRZzb',  // british, narrative_story
  Eric:   'cjVigY5qzO86Huf0OWal',  // american, conversational
  Brian:  'nPczCjzI2devNBz1zQrb',  // american, social_media
};

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const env = path.join(REPO, '.env');
  if (existsSync(env)) {
    const m = readFileSync(env, 'utf8').match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  console.error('No ELEVENLABS_API_KEY in the environment or .env');
  process.exit(1);
}

const key = apiKey();
mkdirSync(OUT, { recursive: true });
const words = LINE.split(/\s+/).length;

console.log(`\n"${LINE}"\n${words} words, 8.0s of picture to fit in.\n`);

for (const [name, id] of Object.entries(VOICES)) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: LINE,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true },
      }),
    },
  );
  if (!r.ok) {
    console.log(`${name.padEnd(8)} FAILED ${r.status} ${(await r.text()).slice(0, 90)}`);
    continue;
  }
  const file = path.join(OUT, name + '.mp3');
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));

  const probe = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const secs = parseFloat(probe.stdout.trim());
  const wpm = Math.round(words / (secs / 60));
  const read = wpm <= 155 ? 'documentary' : wpm <= 170 ? 'brisk' : 'advertising';
  console.log(`${name.padEnd(8)} ${secs.toFixed(2)}s  ${String(wpm).padStart(3)} wpm  ${read}`);
}

console.log('\nListen to media/vo/audition/ before committing. Pace is measurable,');
console.log('warmth is not, and the label on a voice is not evidence of either.');
