// Flat-file persistence. Transcripts, Arena submissions, scoreboard.
// Small enough that a database would be a liability rather than an asset.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data');
const TRANSCRIPTS = join(DATA, 'transcripts');
const ARENA = join(DATA, 'arena');
const SCOREBOARD = join(DATA, 'scoreboard.json');

for (const dir of [DATA, TRANSCRIPTS, ARENA]) mkdirSync(dir, { recursive: true });

function writeAtomic(path, value) {
  const tmp = path + '.' + process.pid + '.tmp';
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, path);
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

// --- transcripts -------------------------------------------------------------

export function saveTranscript(transcript) {
  const safe = String(transcript.id).replace(/[^\w-]/g, '');
  writeAtomic(join(TRANSCRIPTS, safe + '.json'), transcript);
  return safe;
}

export function loadTranscript(id) {
  const safe = String(id).replace(/[^\w-]/g, '');
  const path = join(TRANSCRIPTS, safe + '.json');
  return existsSync(path) ? readJson(path, null) : null;
}

export function listTranscripts(limit = 40) {
  if (!existsSync(TRANSCRIPTS)) return [];
  return readdirSync(TRANSCRIPTS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(join(TRANSCRIPTS, f), null))
    .filter(Boolean)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      at: t.at,
      label: t.label,
      goal: t.goal,
      protected: t.protected,
      provider: t.provider,
      verdict: t.outcome && t.outcome.verdict,
    }));
}

// --- arena pages -------------------------------------------------------------

export function saveArenaPage(page) {
  writeAtomic(join(ARENA, page.id + '.json'), page);
  return page;
}

export function loadArenaPage(id) {
  const safe = String(id).replace(/[^\w-]/g, '');
  const path = join(ARENA, safe + '.json');
  return existsSync(path) ? readJson(path, null) : null;
}

// --- scoreboard --------------------------------------------------------------

const EMPTY_BOARD = { attempts: 0, bypasses: 0, blocked: 0, clean: 0, entries: [] };

export function readScoreboard() {
  const board = readJson(SCOREBOARD, EMPTY_BOARD);
  return { ...EMPTY_BOARD, ...board, entries: board.entries || [] };
}

/**
 * Bypasses are recorded and published. A defence that displays its own failures
 * reads as engineering; one claiming a clean sweep reads as a rigged demo.
 */
export function recordAttempt(entry) {
  const board = readScoreboard();
  board.attempts += 1;
  if (entry.bypassed) board.bypasses += 1;
  else if (entry.blocked) board.blocked += 1;
  else board.clean += 1;

  board.entries.unshift({
    id: entry.id,
    at: new Date().toISOString(),
    handle: entry.handle,
    technique: entry.technique,
    pageId: entry.pageId,
    unprotected: entry.unprotected,
    protected: entry.protected,
    bypassed: !!entry.bypassed,
    blocked: !!entry.blocked,
    rule: entry.rule || null,
    excerpt: entry.excerpt || null,
    transcripts: entry.transcripts || null,
  });
  board.entries = board.entries.slice(0, 300);
  writeAtomic(SCOREBOARD, board);
  return board;
}

export function hallOfBypasses(limit = 25) {
  return readScoreboard()
    .entries.filter((e) => e.bypassed)
    .slice(0, limit);
}
