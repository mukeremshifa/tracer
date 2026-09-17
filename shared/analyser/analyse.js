// ---------------------------------------------------------------------------
// Tracer analyser
//
// Runs where the page renders. In the browser that is a sandboxed same-origin
// iframe; in the eval harness it is jsdom. It walks every text node, asks the
// rendering engine whether a human could actually have seen it, and emits a
// numbered span store.
//
// The same flags that mark a span as concealed are the ones the X-ray uses to
// light it up, so detection and visualisation can never disagree.
// ---------------------------------------------------------------------------

import { ZW_CLASS, decodeZeroWidth, stripZeroWidth } from './zerowidth.js';

// --- colour -----------------------------------------------------------------

function parseColour(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const named = { white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0] };
  if (named[s]) return { r: named[s][0], g: named[s][1], b: named[s][2], a: 1 };
  return null;
}

function relativeLuminance({ r, g, b }) {
  const chan = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

export function contrastRatio(fg, bg) {
  const a = parseColour(fg);
  const b = parseColour(bg);
  if (!a || !b) return null;
  // Composite a translucent foreground over the background first.
  const alpha = a.a == null ? 1 : a.a;
  const comp = {
    r: a.r * alpha + b.r * (1 - alpha),
    g: a.g * alpha + b.g * (1 - alpha),
    b: a.b * alpha + b.b * (1 - alpha),
  };
  const l1 = relativeLuminance(comp);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Walk ancestors for the first background that actually paints something.
function effectiveBackground(el, getStyle) {
  let node = el;
  while (node && node.nodeType === 1) {
    const c = parseColour(getStyle(node).backgroundColor);
    if (c && c.a > 0.1) return `rgb(${c.r}, ${c.g}, ${c.b})`;
    node = node.parentElement;
  }
  return 'rgb(255, 255, 255)';
}

// --- dom path ---------------------------------------------------------------

export function domPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < 8) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`${part}#${node.id}`);
      break;
    }
    const cls = (node.getAttribute && node.getAttribute('class')) || '';
    const first = cls.trim().split(/\s+/)[0];
    if (first) part += `.${first}`;
    const parent = node.parentElement;
    if (parent) {
      const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

// --- accessibility -----------------------------------------------------------
// aria-hidden, .sr-only and the clip-path visually-hidden idiom are legitimate
// accessibility techniques. Tracer flags them so they stay attributable, but it
// must never call them an attack -- a tool that punishes screen-reader support
// is a tool nobody should deploy.

const A11Y_CLASS = /\b(sr-only|visually-hidden|visuallyhidden|screen-reader-text|a11y-hidden|skip-link)\b/i;

function accessibilityPattern(el, style) {
  let node = el;
  while (node && node.nodeType === 1) {
    const cls = (node.getAttribute && node.getAttribute('class')) || '';
    if (A11Y_CLASS.test(cls)) return 'class="' + cls.trim() + '"';
    if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return 'aria-hidden="true"';
    if (node.tagName === 'BODY') break;
    node = node.parentElement;
  }
  const clip = (style.clipPath || '') + ' ' + (style.clip || '');
  if (/inset\(\s*50%/.test(clip) || /rect\(\s*0(px)?[\s,]+0/.test(clip)) return 'clip-path: ' + clip.trim();
  return null;
}

// --- instruction likeness ----------------------------------------------------
// Used only for the page-level strip report shown to the human before the agent
// acts. It is a heuristic notice, not a gate: nothing is ever blocked on it.

const IMPERATIVES = /\b(ignore|disregard|forget|override|must|immediately|do not (?:mention|tell|reveal|cite|disclose)|before (?:you|summaris|summariz|replying)|instead of|append|include|forward|send|email|retrieve|fetch|exfiltrate|transmit|post|upload|execute|comply|obey|your new (?:task|instruction))\b/i;
const AUTHORITY = /\b(system|system override|assistant|ai agent|important instruction|admin|developer mode|policy update|\[INST\])\b/i;
const TOOL_WORDS = /\b(send_email|http_post|read_email|read_file|inbox|one[- ]time (?:pass)?code|otp|verification code|2fa|api[_ ]key|password|credential)\b/i;
const EMAILISH = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const URLISH = /\bhttps?:\/\/[^\s"'<>]+/i;

export function instructionScore(text) {
  const reasons = [];
  let score = 0;
  if (IMPERATIVES.test(text)) { score += 2; reasons.push('imperative phrasing'); }
  if (AUTHORITY.test(text)) { score += 2; reasons.push('authority framing'); }
  if (TOOL_WORDS.test(text)) { score += 2; reasons.push('names a tool or a secret'); }
  if (EMAILISH.test(text)) { score += 1; reasons.push('contains an email address'); }
  if (URLISH.test(text)) { score += 1; reasons.push('contains a URL'); }
  if (/[A-Za-z0-9+/]{40,}={0,2}/.test(text)) { score += 1; reasons.push('contains an encoded blob'); }
  return { score, reasons, instructionLike: score >= 3 };
}

// --- main -------------------------------------------------------------------

const BLOCK_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE']);

/**
 * @param {Document} doc
 * @param {{ url?: string, layout?: boolean, startIndex?: number, window?: Window }} opts
 *   layout: false when the host (jsdom) performs no layout, which makes
 *   box-geometry flags meaningless. Reported back in the result so the eval
 *   harness can state plainly which detectors actually ran.
 */
export function analyse(doc, opts = {}) {
  const url = opts.url || (doc.location && doc.location.pathname) || 'unknown';
  const win = opts.window || doc.defaultView;
  const layout =
    opts.layout !== false && !!win && typeof win.innerWidth === 'number' && win.innerWidth > 0;
  const getStyle = (el) => {
    try {
      return win ? win.getComputedStyle(el) : {};
    } catch {
      return {};
    }
  };

  // Stamping writes the span id back onto the element it came from. The X-ray
  // then needs no re-query and no coordinate projection: it is pure CSS over
  // attributes the analyser already placed. Harmless in the eval harness.
  const stamp = opts.stamp !== false;

  const spans = [];
  let i = opts.startIndex || 0;
  const push = (span, el, attr) => {
    const id = 'S' + ++i;
    spans.push({ id, url, trust: 'untrusted', ...span });
    if (stamp && el && el.setAttribute) {
      try {
        const key = attr ? 'data-tracer-attr-span' : 'data-tracer-span';
        const prior = el.getAttribute(key);
        el.setAttribute(key, prior ? prior + ' ' + id : id);
        if (span.concealed) el.setAttribute('data-tracer-concealed', '1');
        if (span.accessibility) el.setAttribute('data-tracer-a11y', '1');
        if (span.instructionLike) el.setAttribute('data-tracer-instruction', '1');
        if (span.decoded) el.setAttribute('data-tracer-decoded', span.decoded);
      } catch {
        /* read-only DOM: stamping is an optimisation, never a requirement */
      }
    }
  };

  const walker = doc.createTreeWalker(doc.body, 0x4 /* SHOW_TEXT */);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!el || BLOCK_TAGS.has(el.tagName)) continue;

    const raw = node.textContent || '';
    const zw = decodeZeroWidth(raw);
    const text = stripZeroWidth(raw).replace(/\s+/g, ' ').trim();
    if (!text && !zw) continue;

    const cs = getStyle(el);
    const flags = [];

    if (cs.display === 'none') flags.push('display-none');
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') flags.push('visibility-hidden');
    if (parseFloat(cs.opacity) === 0) flags.push('opacity-zero');
    const fontSize = parseFloat(cs.fontSize);
    if (!Number.isNaN(fontSize) && fontSize < 2) flags.push('font-size-zero');
    if (/scale\(\s*0\s*[,)]/.test(cs.transform || '')) flags.push('scaled-to-zero');
    if (parseFloat(cs.textIndent) <= -1000) flags.push('text-indent-offscreen');
    if ((cs.webkitTextFillColor || '') === 'transparent') flags.push('text-fill-transparent');

    if (layout) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) flags.push('zero-box');
      if (
        box.right < -1 ||
        box.bottom < -1 ||
        box.left > win.innerWidth * 3 ||
        box.top > win.innerHeight * 12
      ) {
        flags.push('off-screen');
      }
    }

    const bg = effectiveBackground(el, getStyle);
    const ratio = contrastRatio(cs.color, bg);
    if (ratio != null && ratio < 1.25) flags.push('colour-matches-background');

    if (ZW_CLASS.test(raw)) flags.push('zero-width-chars');

    const a11y = accessibilityPattern(el, cs);
    const hidden = flags.length > 0;
    const info = instructionScore(zw ? text + ' ' + zw.decoded : text);

    push({
      text: text || '(' + zw.count + ' zero-width characters)',
      decoded: zw ? zw.decoded : null,
      decodedKind: zw ? zw.kind : null,
      flags,
      visible: !hidden,
      concealed: hidden && !a11y,
      accessibility: a11y,
      path: domPath(el),
      origin: el.tagName.toLowerCase(),
      style: {
        color: cs.color || null,
        background: bg,
        contrast: ratio == null ? null : Math.round(ratio * 100) / 100,
        fontSize: cs.fontSize || null,
        display: cs.display || null,
      },
      ...info,
    }, el);
  }

  // --- HTML comments: invisible to the user, plain text to the model --------
  const markup = doc.documentElement ? doc.documentElement.innerHTML : '';
  for (const m of markup.matchAll(/<!--([\s\S]*?)-->/g)) {
    const body = stripZeroWidth(m[1]).replace(/\s+/g, ' ').trim();
    if (!body) continue;
    push({
      text: body,
      decoded: null,
      decodedKind: null,
      flags: ['html-comment'],
      visible: false,
      concealed: true,
      accessibility: null,
      path: 'HTML comment',
      origin: 'comment',
      style: null,
      ...instructionScore(body),
    });
  }

  // --- attribute payloads: alt / title / aria-label / data-* ---------------
  const ATTRS = ['alt', 'title', 'aria-label', 'data-note', 'data-instructions', 'placeholder'];
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of ATTRS) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (!v) continue;
      const body = stripZeroWidth(v).replace(/\s+/g, ' ').trim();
      if (body.length < 12) continue;
      const info = instructionScore(body);
      if (!info.instructionLike) continue; // ordinary alt text is not evidence
      push({
        text: body,
        decoded: null,
        decodedKind: null,
        flags: ['attribute:' + attr],
        visible: false,
        concealed: true,
        accessibility: attr === 'alt' || attr === 'aria-label' ? attr + ' attribute' : null,
        path: domPath(el) + '[' + attr + ']',
        origin: el.tagName.toLowerCase(),
        style: null,
        ...info,
      }, el, attr);
    }
  }

  return { url, spans, report: stripReport(spans, { layout }) };
}

export function stripReport(spans, meta = {}) {
  const concealed = spans.filter((s) => s.concealed);
  const concealedInstructions = concealed.filter((s) => s.instructionLike);
  const a11y = spans.filter((s) => s.accessibility && !s.visible);
  const techniques = {};
  for (const s of concealed) for (const f of s.flags) techniques[f] = (techniques[f] || 0) + 1;

  const n = concealedInstructions.length;
  return {
    total: spans.length,
    visible: spans.filter((s) => s.visible).length,
    concealed: concealed.length,
    concealedInstructionLike: n,
    accessibilityPatterns: a11y.length,
    techniques,
    layoutAware: meta.layout !== false,
    headline:
      n > 0
        ? 'This page contains ' + n + ' instruction-like element' + (n === 1 ? '' : 's') + ' you cannot see.'
        : concealed.length > 0
          ? 'This page contains ' + concealed.length + ' hidden element' + (concealed.length === 1 ? '' : 's') + ', none of which look like instructions.'
          : 'No concealed content found on this page.',
  };
}
