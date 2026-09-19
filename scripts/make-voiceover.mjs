// ---------------------------------------------------------------------------
// Generate the voiceover from docs/VOICEOVER.md, one file per line.
//
// The script is parsed out of the markdown rather than duplicated here, so
// there is one copy of the words. Editing docs/VOICEOVER.md and re-running this
// is the whole workflow; a line whose text has not changed is not re-generated
// and not re-billed.
//
// Needs ELEVENLABS_API_KEY in the environment or in .env.
//
//   node scripts/make-voiceover.mjs                 # generate what is missing
//   node scripts/make-voiceover.mjs --force         # regenerate everything
//   node scripts/make-voiceover.mjs --line 08       # just that one
//   node scripts/make-voiceover.mjs --voices        # list voices, generate nothing
//   node scripts/make-voiceover.mjs --voice <id>    # use a specific voice
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCRIPT = path.join(REPO, 'docs/VOICEOVER.md');
const OUT = path.join(REPO, 'media/vo');
const API = 'https://api.elevenlabs.io/v1';

// --- key ---------------------------------------------------------------------

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const envFile = path.join(REPO, '.env');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  console.error('No ELEVENLABS_API_KEY. Put it in .env as:\n\n  ELEVENLABS_API_KEY=...\n');
  process.exit(1);
}

// --- settings ----------------------------------------------------------------

// Adam: low, measured, documentary. See docs/VOICEOVER.md for why, and for the
// alternatives worth auditioning before committing.
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';

const SETTINGS = {
  // Low enough to keep inflection across a three minute read, high enough not
  // to wander between paragraphs generated in separate requests.
  stability: 0.5,
  similarity_boost: 0.8,
  // Anything above zero pushes this towards an advertising read, which is the
  // one tone this material cannot survive.
  style: 0,
  use_speaker_boost: true,
};
const MODEL = 'eleven_multilingual_v2';

// --- parse the script --------------------------------------------------------

/**
 * Pull the numbered lines out of the markdown.
 *
 * A line is a `**NN**` marker followed by one or more blockquote paragraphs.
 * Everything else in the file (headings, tables, the bracketed staging notes)
 * is for the person assembling the cut and must never reach the API.
 */
function parseScript() {
  const md = readFileSync(SCRIPT, 'utf8');
  const lines = [];
  const re = /^\*\*(\d{2})\*\*(.*)$/gm;
  let m;
  while ((m = re.exec(md))) {
    const id = m[1];
    const rest = md.slice(m.index + m[0].length);
    const stop = rest.search(/^\*\*\d{2}\*\*|^## /m);
    const body = stop === -1 ? rest : rest.slice(0, stop);
    const text = body
      .split('\n')
      .filter((l) => l.trim().startsWith('>'))
      .map((l) => l.replace(/^\s*>\s?/, '').trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) lines.push({ id, text, note: m[2].replace(/`/g, '').trim() });
  }
  return lines;
}

// --- generate ----------------------------------------------------------------

async function listVoices(key) {
  const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`voices: ${r.status} ${await r.text()}`);
  const { voices } = await r.json();
  for (const v of voices) {
    const labels = Object.values(v.labels || {}).join(', ');
    console.log(`${v.voice_id}  ${(v.name || '').padEnd(18)} ${labels}`);
  }
}

async function speak(key, voice, text, out) {
  const r = await fetch(`${API}/text-to-speech/${voice}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  if (!r.ok) throw new Error(`tts: ${r.status} ${await r.text()}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

// --- run ---------------------------------------------------------------------

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i === -1 ? null : argv[i + 1]; };

const key = apiKey();
if (has('--voices')) { await listVoices(key); process.exit(0); }

const voice = valOf('--voice') || DEFAULT_VOICE;
const only = valOf('--line');
const force = has('--force');

let lines = parseScript();
if (!lines.length) { console.error('No numbered lines found in docs/VOICEOVER.md'); process.exit(1); }
if (only) lines = lines.filter((l) => l.id === only.padStart(2, '0'));
if (!lines.length) { console.error('No such line: ' + only); process.exit(1); }

mkdirSync(OUT, { recursive: true });

// A hash of the words next to each file, so an unchanged line is neither
// re-generated nor re-billed, and a changed one is caught without being asked.
const stampFile = path.join(OUT, '.hashes.json');
const stamps = existsSync(stampFile) ? JSON.parse(readFileSync(stampFile, 'utf8')) : {};

let made = 0, kept = 0;
for (const l of lines) {
  const out = path.join(OUT, `vo-${l.id}.mp3`);
  const hash = createHash('sha1').update(voice + '\n' + l.text).digest('hex').slice(0, 12);
  if (!force && existsSync(out) && stamps[l.id] === hash) {
    kept += 1;
    continue;
  }
  process.stdout.write(`${l.id}  ${l.text.slice(0, 64)}${l.text.length > 64 ? '...' : ''}`);
  await speak(key, voice, l.text, out);
  stamps[l.id] = hash;
  made += 1;
  console.log('  -> media/vo/vo-' + l.id + '.mp3');
}
writeFileSync(stampFile, JSON.stringify(stamps, null, 2));

const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
console.log(`\n${made} generated, ${kept} unchanged.`);
console.log(`${words} words total, roughly ${Math.round(words / 150 * 60)}s at a documentary pace.`);
