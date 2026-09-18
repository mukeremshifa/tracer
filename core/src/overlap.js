// ---------------------------------------------------------------------------
// Layer B: enforced overlap.
//
// Layer A asks the model where its information came from. A sufficiently clever
// injection can instruct the model to lie about that, so Layer A is never
// load-bearing on its own.
//
// Layer B is this file. It takes the tool arguments the model produced and,
// without consulting the model about anything, asks whether they overlap with
// untrusted content -- after that content has been normalised, so that encoding
// the payload does not make it invisible to the scan. An injection cannot talk
// its way past code it never sees.
//
// Two kinds of match:
//   - full-token artifacts: addresses, URLs, hosts, IPs, paths, phone numbers,
//     crypto addresses. High precision, because these are the things that
//     determine *where* an action lands.
//   - n-gram overlap: 5+ consecutive tokens shared with an untrusted span.
//     Lower precision, so it never blocks on its own -- quoting a page you were
//     asked to summarise is not an attack, it is the job.
// ---------------------------------------------------------------------------

const RE = {
  email: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi,
  url: /\bhttps?:\/\/[^\s"'<>)\]]+/gi,
  bareHost: /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:tld|com|net|org|io|co|dev|ai|example|invalid|local|info|xyz)\b/gi,
  ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  path: /(?:^|\s)((?:\/[\w.@~-]+){2,}\/?)/g,
  winPath: /\b[a-z]:\\[\w\\.-]+/gi,
  phone: /\+?\d[\d\s().-]{8,}\d/g,
  crypto: /\b(?:0x[a-fA-F0-9]{40}|(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39})\b/g,
};

const ARTIFACT_KINDS = [
  ['email address', RE.email],
  ['URL', RE.url],
  ['hostname', RE.bareHost],
  ['IP address', RE.ipv4],
  ['file path', RE.path],
  ['file path', RE.winPath],
  ['phone number', RE.phone],
  ['crypto address', RE.crypto],
];

const STOP_HOSTS = new Set(['www.w3.org', 'localhost']);

// --- normalisation -----------------------------------------------------------
// A verbatim overlap check is defeated by encoding: base64 the recipient and
// the address no longer appears in the page, so a naive scan finds nothing.
// The CSA guidance is to normalise untrusted content before it reaches the
// context window, which is exactly the right answer here. We already decode
// zero-width; base64 is the same class of problem, so it gets the same
// treatment. Anything that does not decode to plausible text is discarded.

const B64_BLOB = /[A-Za-z0-9+/]{24,}={0,2}/g;

// Core runs in Node, in jsdom and inside a browser extension's content script,
// so it decodes through whichever primitive the host actually has rather than
// assuming Buffer.
const fromBase64 =
  typeof atob === 'function'
    ? (s) => {
        const bin = atob(s);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      }
    : (s) => Buffer.from(s, 'base64').toString('utf8');

export function decodedForms(text) {
  const out = [];
  for (const m of String(text || '').matchAll(B64_BLOB)) {
    try {
      const decoded = fromBase64(m[0]);
      if (decoded.length < 8) continue;
      const printable = decoded.replace(/[^\x20-\x7e]/g, '');
      if (printable.length / decoded.length < 0.9) continue;
      if (!/[\s@.]/.test(printable)) continue;
      out.push(printable);
    } catch {
      /* not base64 */
    }
  }
  return out;
}

/**
 * Everything a span effectively says: what it renders as, what it decodes to,
 * and what an encoded blob inside it decodes to. This is the text every
 * provenance question is asked against.
 */
export function searchableText(span) {
  const base = (span.decoded ? span.decoded + ' ' : '') + (span.text || '');
  const decoded = decodedForms(base);
  return (decoded.length ? base + ' ' + decoded.join(' ') : base).toLowerCase();
}

export function extractArtifacts(text) {
  const out = [];
  const seen = new Set();
  const s = String(text || '');
  for (const [kind, re] of ARTIFACT_KINDS) {
    re.lastIndex = 0;
    for (const m of s.matchAll(re)) {
      const value = (m[1] || m[0]).trim().replace(/[.,;:)\]]+$/, '');
      if (!value || value.length < 4) continue;
      const key = kind + '|' + value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind, value });
    }
  }
  return out;
}

export function hostOf(value) {
  const v = String(value || '').trim();
  const at = v.lastIndexOf('@');
  if (at > 0 && !v.includes('://')) return v.slice(at + 1).toLowerCase();
  try {
    return new URL(v.includes('://') ? v : 'https://' + v).hostname.toLowerCase();
  } catch {
    return v.toLowerCase();
  }
}

// --- tokens ------------------------------------------------------------------

export function tokenise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@._:/+-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  return out;
}

// --- the scan ----------------------------------------------------------------

/**
 * @param {object} args     tool arguments as the model produced them
 * @param {Array}  spans    untrusted spans currently in context
 * @param {{ ngram?: number }} opts
 * @returns {{hits: Array, artifacts: Array, byKind: object}}
 */
export function overlapScan(args, spans, opts = {}) {
  const n = opts.ngram || 5;
  const argText = Object.entries(args || {})
    .filter(([k]) => k !== 'derived_from')
    .map(([, v]) => (typeof v === 'string' ? v : JSON.stringify(v)))
    .join(' \n ');

  const artifacts = extractArtifacts(argText).filter((a) => !STOP_HOSTS.has(a.value.toLowerCase()));
  const hits = [];

  // 1. full-token artifacts
  for (const a of artifacts) {
    const needle = a.value.toLowerCase();
    for (const s of spans) {
      if (searchableText(s).includes(needle)) {
        hits.push({
          type: 'artifact',
          kind: a.kind,
          value: a.value,
          spanId: s.id,
          span: s,
          weight: 'high',
        });
      }
    }
  }

  // 2. n-gram overlap
  const argGrams = new Set(ngrams(tokenise(argText), n));
  if (argGrams.size) {
    for (const s of spans) {
      const spanGrams = ngrams(tokenise(searchableText(s)), n);
      const shared = [];
      for (const g of spanGrams) {
        if (argGrams.has(g) && !shared.includes(g)) shared.push(g);
        if (shared.length >= 3) break;
      }
      if (shared.length) {
        hits.push({
          type: 'ngram',
          kind: n + '-gram overlap',
          value: shared[0],
          samples: shared,
          spanId: s.id,
          span: s,
          weight: 'low',
        });
      }
    }
  }

  const byKind = {};
  for (const h of hits) byKind[h.type] = (byKind[h.type] || 0) + 1;
  return { hits, artifacts, byKind, argText };
}

// --- destinations ------------------------------------------------------------

/**
 * The destination is the field that decides where an action lands: the
 * recipient, the host, the path. It is the only thing the hard block keys on.
 *
 * Which argument that is depends entirely on the host's tools, so the registry
 * owns the answer and this is a thin pass-through kept for callers that already
 * have a call and a registry in hand.
 */
export function extractDestination(call, registry) {
  if (!registry || typeof registry.destinationOf !== 'function') return null;
  return registry.destinationOf(call);
}

/**
 * The forms of a destination worth looking for in text.
 *
 * A file path is the case that breaks naive matching. A tool is called with
 * `D:/work/demo/workspace/public-share/audit.txt`; the page that dictated it
 * said `public-share/audit.txt`, because that is how a human writes a path. The
 * absolute string appears nowhere, so a scan for the absolute string finds
 * nothing and the strongest rule Tracer has silently misses.
 *
 * So a path also matches by its tail. Only the tail: the leading directories are
 * the host's, not the attacker's, and matching a shared prefix would fire on
 * every write in the workspace. The bare filename is included, and is safe to
 * include, because the destination rule fires only when the destination is
 * *also* absent from the user's instruction -- a file the user asked for is
 * named in the goal, and never reaches this comparison.
 */
export function destinationForms(dest) {
  if (!dest) return [];
  const forms = [String(dest.value || '').toLowerCase()];
  if (dest.host && dest.host.length > 3) forms.push(dest.host);

  if (dest.kind === 'file path' || /[\\/]/.test(String(dest.value || ''))) {
    const parts = String(dest.value)
      .toLowerCase()
      .split(/[\\/]+/)
      .filter(Boolean);
    for (let n = 1; n <= Math.min(3, parts.length - 1); n += 1) {
      const tail = parts.slice(-n).join('/');
      if (tail.length > 3) forms.push(tail);
    }
  }
  return [...new Set(forms)].filter(Boolean);
}

/** Did the user actually mention this destination? Host-level, case-folded. */
export function mentionedInGoal(dest, goal) {
  if (!dest) return false;
  const g = String(goal || '').toLowerCase();
  // The goal is checked against every form for the same reason the spans are:
  // "write it to public-share/audit.txt" is the user naming the destination,
  // even though the tool call spells it out absolutely.
  return destinationForms(dest).some((f) => g.includes(f));
}

export function spansContaining(value, spans) {
  const needle = String(value || '').toLowerCase();
  if (!needle) return [];
  return spans.filter((s) => searchableText(s).includes(needle));
}

// --- output-channel scan -----------------------------------------------------
// Exfiltration does not require a tool call. A markdown image in the model's
// answer makes the *rendering client* issue the request. This is a real and
// widely exploited channel, so the final answer gets scanned too.

const MD_IMAGE = /!\[[^\]]*\]\(\s*(<?)(https?:\/\/[^\s)>]+)\1[^)]*\)/gi;
const MD_LINK = /(?<!!)\[[^\]]*\]\(\s*(https?:\/\/[^\s)>]+)[^)]*\)/gi;
const RAW_IMG = /<img[^>]+src\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi;

export function scanOutputChannels(text, ctx) {
  const findings = [];
  const seen = new Set();

  const consider = (url, channel) => {
    const host = hostOf(url);
    if (!host || seen.has(channel + host + url)) return;
    seen.add(channel + host + url);

    const fromPage = spansContaining(host, ctx.untrustedSpans());
    const inGoal = String(ctx.goal || '').toLowerCase().includes(host);
    const leaked = (ctx.secrets || []).filter((s) => url.includes(s.value));

    if (fromPage.length && !inGoal) {
      findings.push({
        channel,
        url,
        host,
        spanIds: fromPage.map((s) => s.id),
        secrets: leaked.map((s) => ({ kind: s.kind, source: s.source })),
        reason:
          'The host ' +
          host +
          ' appears nowhere in your instruction and does appear in untrusted page content.' +
          (leaked.length ? ' The URL also carries a value read from your private data.' : ''),
      });
    } else if (leaked.length) {
      findings.push({
        channel,
        url,
        host,
        spanIds: [],
        secrets: leaked.map((s) => ({ kind: s.kind, source: s.source })),
        reason: 'This URL carries a value read from your private data.',
      });
    }
  };

  for (const m of String(text || '').matchAll(MD_IMAGE)) consider(m[2], 'markdown image');
  for (const m of String(text || '').matchAll(RAW_IMG)) consider(m[1], 'html image');
  for (const m of String(text || '').matchAll(MD_LINK)) consider(m[1], 'markdown link');

  return findings;
}

export function redactOutput(text, findings) {
  let out = String(text || '');
  for (const f of findings) {
    out = out.split(f.url).join('[redacted by Tracer: ' + f.host + ']');
  }
  return out;
}
