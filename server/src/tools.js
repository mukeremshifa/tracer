// ---------------------------------------------------------------------------
// Tool implementations. Every one is a mock.
//
// Note what this file does NOT do: it never parses HTML. Page content arrives
// already analysed, as spans, from the analyser that ran where the page
// rendered. In a browser agent the agent *is* the browser, so the analyser
// belongs in the page, not on the server. The server's job is to reason about
// provenance, not to re-derive it.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data');

const INBOX = JSON.parse(readFileSync(join(DATA, 'inbox.json'), 'utf8')).messages;
const FILES = JSON.parse(readFileSync(join(DATA, 'files.json'), 'utf8')).files;

let RANGE_INDEX = [];
try {
  RANGE_INDEX = JSON.parse(readFileSync(join(here, 'range', 'index.json'), 'utf8'));
} catch {
  RANGE_INDEX = [];
}

export const MOCK_INBOX = INBOX;
export const MOCK_FILES = FILES;
export const RANGE_PAGES = RANGE_INDEX;

// --- secret tracking ---------------------------------------------------------
// When a tier-1 tool hands the agent something sensitive, we remember the
// literal value. That lets the policy engine answer a sharper question than
// "where is this going": it can say *what* is going there.

const SECRET_PATTERNS = [
  { kind: 'one-time passcode', re: /\b\d{3}[- ]\d{3}\b/g },
  { kind: 'one-time passcode', re: /\b\d{6}\b/g },
  { kind: 'account fragment', re: /\bending \d{4}\b/gi },
  { kind: 'credential', re: /[a-z]+-[a-z]+-[a-z0-9]+/g },
];

export function extractSecrets(text, source) {
  const found = [];
  for (const { kind, re } of SECRET_PATTERNS) {
    for (const m of String(text).matchAll(re)) {
      const value = m[0];
      if (value.length < 5) continue;
      if (!found.some((f) => f.value === value)) found.push({ value, kind, source });
    }
  }
  return found;
}

// Span registration and secret bookkeeping live on the run context that
// @mukeremshifa/tracer-core hands every tool implementation. See core/src/loop.js.

function spanDigest(spans) {
  return spans
    .filter((s) => (s.decoded || s.text || '').trim().length > 0)
    .map((s) => {
      const body = s.decoded ? s.decoded : s.text;
      const marks = [];
      if (!s.visible) marks.push('hidden');
      if (s.flags && s.flags.length) marks.push(s.flags.join(','));
      return '[' + s.id + (marks.length ? ' ' + marks.join(' ') : '') + '] ' + body;
    })
    .join('\n');
}

// --- executors ---------------------------------------------------------------

export function execute(call, ctx) {
  const fn = IMPL[call.name];
  if (!fn) return { ok: false, error: 'unknown tool: ' + call.name };
  try {
    return fn(call.arguments || {}, ctx);
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

const IMPL = {
  read_page(args, ctx) {
    const url = normaliseRangePath(args.url);
    const entry = ctx.host.pageStore[url];
    if (!entry) {
      return {
        ok: false,
        error:
          'No analysed content for ' +
          url +
          '. Tracer only reads pages that have been analysed in the sandboxed renderer. Available: ' +
          Object.keys(ctx.host.pageStore).join(', '),
      };
    }
    if (ctx.readSources.includes(url)) {
      const existing = ctx.spans.filter((s) => s.url === url);
      return { ok: true, url, spans: existing, content: spanDigest(existing), cached: true };
    }
    ctx.readSources.push(url);
    const added = ctx.registerSpans(entry.spans, url);
    return {
      ok: true,
      url,
      report: entry.report,
      spans: added,
      content: spanDigest(added),
    };
  },

  search_range(args, ctx) {
    const q = String(args.query || '').toLowerCase();
    const hits = RANGE_INDEX.filter(
      (p) =>
        !q ||
        p.headline.toLowerCase().includes(q) ||
        p.dek.toLowerCase().includes(q) ||
        p.kicker.toLowerCase().includes(q) ||
        p.id.includes(q),
    ).slice(0, 8);
    ctx.host.searches.push(q);
    return {
      ok: true,
      results: hits.map((h) => ({ path: h.path, headline: h.headline })),
      content: hits.map((h) => h.path + ' — ' + h.headline).join('\n') || 'no matches',
    };
  },

  read_email(args, ctx) {
    const q = String(args.query || '').toLowerCase();
    const terms = q.split(/\s+/).filter((t) => t.length > 2);
    const hits = INBOX.filter((m) => {
      const hay = (m.subject + ' ' + m.body + ' ' + m.labels.join(' ')).toLowerCase();
      return terms.length === 0 || terms.some((t) => hay.includes(t));
    });
    const chosen = hits.length ? hits : INBOX.slice(0, 1);

    for (const m of chosen) {
      if (!m.sensitive) continue;
      for (const s of extractSecrets(m.body, 'inbox:' + m.id)) ctx.noteSecret(s);
    }
    ctx.privateReads.push({ tool: 'read_email', query: args.query, ids: chosen.map((m) => m.id) });

    return {
      ok: true,
      messages: chosen.map((m) => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        date: m.date,
        body: m.body,
      })),
      content: chosen
        .map((m) => 'From: ' + m.from + '\nSubject: ' + m.subject + '\n\n' + m.body)
        .join('\n\n---\n\n'),
      privacy: 'This is private user data from a mock inbox.',
    };
  },

  read_file(args, ctx) {
    const path = String(args.path || '');
    const f = FILES[path];
    if (!f) {
      return { ok: false, error: 'no such file: ' + path + '. Available: ' + Object.keys(FILES).join(', ') };
    }
    ctx.privateReads.push({ tool: 'read_file', path });

    if (f.untrusted) {
      // A fetched file is untrusted content just like a web page. It gets span
      // IDs, so anything derived from it stays attributable.
      const paras = f.content
        .split(/\n{2,}/)
        .map((p) => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const spans = paras.map((text, i) => ({
        id: 'F' + (i + 1),
        text,
        flags: ['fetched-file'],
        visible: false,
        concealed: false,
        accessibility: null,
        path: path,
        origin: 'file',
        instructionLike: /\b(system|must|send_email|read_email|verification code)\b/i.test(text),
        reasons: [],
        style: null,
        decoded: null,
      }));
      const added = ctx.registerSpans(spans, path);
      return { ok: true, path, spans: added, content: spanDigest(added), untrusted: true };
    }

    if (f.sensitive) {
      for (const s of extractSecrets(f.content, 'file:' + path)) ctx.noteSecret(s);
    }
    return { ok: true, path, content: f.content, privacy: 'Private user file from a mock filesystem.' };
  },

  send_email(args, ctx) {
    const record = {
      tool: 'send_email',
      to: String(args.to || ''),
      subject: String(args.subject || ''),
      body: String(args.body || ''),
      at: ctx.step,
    };
    ctx.sink.push(record);
    return {
      ok: true,
      delivered: false,
      content:
        'Queued in the mock outbound sink (nothing was transmitted). Recipient: ' + record.to + '.',
      record,
    };
  },

  http_post(args, ctx) {
    const record = {
      tool: 'http_post',
      url: String(args.url || ''),
      data: String(args.data || ''),
      at: ctx.step,
    };
    ctx.sink.push(record);
    return {
      ok: true,
      delivered: false,
      content: 'Queued in the mock outbound sink (nothing was transmitted). Target: ' + record.url + '.',
      record,
    };
  },
};

export function normaliseRangePath(url) {
  let u = String(url || '').trim();
  u = u.replace(/^https?:\/\/[^/]+/i, '');
  if (!u.startsWith('/')) u = '/' + u;
  return u.replace(/\/+$/, '') || '/';
}
