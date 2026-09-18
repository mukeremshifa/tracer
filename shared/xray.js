// ---------------------------------------------------------------------------
// The X-ray.
//
// Not a separate renderer and not a re-projection of coordinates: the analyser
// already stamped each span's ID onto the element it came from, so revealing
// concealed content is pure CSS over attributes that are already in the DOM.
// Detection and visualisation cannot disagree, because they are the same pass.
//
// Shared by the viewer's iframe and the browser extension's content script, so
// what a judge sees in the sandbox is literally what the extension does on a
// real page.
//
// Colour note. Everything Tracer draws elsewhere sits on ink; this sits on the
// untrusted page, which is bright and paper-like on purpose. So the X-ray is
// the one place the palette inverts: acid as the ground, ink as the text. Acid
// text on paper would be unreadable, and the contrast between "the untrusted
// thing" and "the thing telling you about it" is load-bearing.
// ---------------------------------------------------------------------------

export const ACID = '#cdfb41';
export const INK = '#131313';

export const XRAY_STYLE_ID = 'tracer-xray-style';

export const XRAY_CSS = `
@keyframes tracer-ignite {
  0%   { box-shadow: 0 0 0 0 ${INK}00; }
  35%  { box-shadow: 0 0 0 6px ${ACID}; }
  100% { box-shadow: 0 0 0 0 ${INK}00; }
}
@keyframes tracer-sweep {
  from { transform: translateY(-100%); opacity: .9; }
  to   { transform: translateY(2200px); opacity: 0; }
}

html.tracer-xray::before {
  content: '';
  position: fixed; left: 0; right: 0; top: 0; height: 200px;
  background: linear-gradient(${ACID}00, ${ACID}55 55%, ${ACID}00);
  pointer-events: none; z-index: 2147483000;
  animation: tracer-sweep 1.1s cubic-bezier(.3,.7,.4,1) forwards;
}

/* Concealed, instruction-like: the crime scene. */
html.tracer-xray [data-tracer-concealed="1"] {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  position: static !important;
  left: auto !important; top: auto !important; right: auto !important;
  width: auto !important; height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
  clip: auto !important;
  clip-path: none !important;
  text-indent: 0 !important;
  transform: none !important;
  font-size: 13.5px !important;
  line-height: 1.6 !important;
  font-weight: 500 !important;
  font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace !important;
  -webkit-text-fill-color: ${INK} !important;
  color: ${INK} !important;
  background: ${ACID} !important;
  border: 0 !important;
  border-left: 6px solid ${INK} !important;
  border-radius: 0 !important;
  padding: 14px 16px !important;
  margin: 18px 0 !important;
  white-space: pre-wrap !important;
  animation: tracer-ignite 1.1s ease-out both;
}

html.tracer-xray [data-tracer-concealed="1"]::before {
  content: 'HIDDEN FROM YOU \\2014 ' attr(data-tracer-span);
  display: block;
  font: 800 10px/1 'JetBrains Mono', ui-monospace, Menlo, monospace;
  letter-spacing: .22em;
  color: ${INK};
  opacity: .62;
  margin-bottom: 10px;
}

/* Zero-width payloads: the span looks empty, so print what it decodes to. */
html.tracer-xray [data-tracer-decoded]::after {
  content: 'DECODES TO: ' attr(data-tracer-decoded);
  display: block; margin-top: 12px;
  font: 500 12.5px/1.6 'JetBrains Mono', ui-monospace, Menlo, monospace;
  color: ${INK};
  background: transparent;
  border: 0;
  border-top: 1px solid ${INK}40;
  border-radius: 0;
  padding: 10px 0 0;
  white-space: pre-wrap;
}

/* Attribute payloads: the text is in markup, not in a text node. */
html.tracer-xray [data-tracer-attr-span][alt]::after,
html.tracer-xray [data-tracer-attr-span][title]::after {
  content: 'ATTRIBUTE PAYLOAD: ' attr(alt) attr(title);
}
html.tracer-xray img[data-tracer-attr-span] {
  outline: 4px solid ${ACID} !important;
  outline-offset: 0;
}
html.tracer-xray figure:has(img[data-tracer-attr-span])::after,
html.tracer-xray img[data-tracer-attr-span] + figcaption::after {
  content: 'This image carries an instruction in its alt text.';
  display: block; margin-top: 10px;
  font: 800 11px/1.5 'JetBrains Mono', ui-monospace, Menlo, monospace;
  letter-spacing: .06em;
  color: ${INK};
  background: ${ACID};
  padding: 8px 10px;
}

/* Materialised HTML comments. */
html.tracer-xray .tracer-comment {
  display: block !important;
  font: 500 13.5px/1.6 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace !important;
  color: ${INK}; background: ${ACID};
  border: 0; border-left: 6px solid ${INK}; border-radius: 0;
  padding: 14px 16px; margin: 18px 0; white-space: pre-wrap;
  animation: tracer-ignite 1.1s ease-out both;
}
html.tracer-xray .tracer-comment::before {
  content: 'HTML COMMENT \\2014 NEVER RENDERED';
  display: block; font: 800 10px/1 'JetBrains Mono', ui-monospace, Menlo, monospace;
  letter-spacing: .22em; color: ${INK}; opacity: .62; margin-bottom: 10px;
}

/* Accessibility patterns are flagged, never condemned. No acid, because acid
   means "this was concealed from you" and a screen-reader label is not that. */
html.tracer-xray [data-tracer-a11y="1"]:not([data-tracer-concealed="1"]) {
  display: block !important;
  position: static !important;
  width: auto !important; height: auto !important;
  clip: auto !important; clip-path: none !important;
  overflow: visible !important;
  color: ${INK} !important;
  background: transparent !important;
  border: 0 !important;
  border-left: 2px dashed ${INK}55 !important;
  border-radius: 0 !important;
  padding: 10px 14px !important;
  margin: 14px 0 !important;
  font: 500 12.5px/1.6 'JetBrains Mono', ui-monospace, Menlo, monospace !important;
  opacity: .75;
}
html.tracer-xray [data-tracer-a11y="1"]:not([data-tracer-concealed="1"])::before {
  content: 'ACCESSIBILITY PATTERN \\2014 LEGITIMATE, NOT AN ATTACK';
  display: block; font: 800 10px/1 'JetBrains Mono', ui-monospace, Menlo, monospace;
  letter-spacing: .18em; color: ${INK}; opacity: .6; margin-bottom: 8px;
}

/* The provenance target. Always on, X-ray or not. */
[data-tracer-focus="1"] {
  outline: 4px solid ${ACID} !important;
  outline-offset: 0;
  border-radius: 0;
  background: ${ACID} !important;
  color: ${INK} !important;
  box-shadow: 0 0 0 9999px ${INK}5c !important;
  scroll-margin: 90px;
  position: relative !important;
  z-index: 2147482000 !important;
}
`;

export function injectXrayStyle(doc) {
  if (!doc || doc.getElementById(XRAY_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = XRAY_STYLE_ID;
  style.textContent = XRAY_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/** HTML comments are not elements, so CSS alone cannot surface them. */
export function materialiseComments(doc) {
  if (!doc || !doc.body) return;
  if (doc.querySelector('.tracer-comment')) return;
  const walker = doc.createTreeWalker(doc.documentElement, 0x80 /* SHOW_COMMENT */);
  const found = [];
  while (walker.nextNode()) found.push(walker.currentNode);

  for (const node of found) {
    const text = (node.textContent || '').trim();
    if (!text) continue;
    const el = doc.createElement('div');
    el.className = 'tracer-comment';
    el.textContent = text;
    const host = node.parentNode;
    if (!host) continue;
    try {
      host.insertBefore(el, node.nextSibling);
    } catch {
      host.appendChild(el);
    }
  }
}

/** Turn the X-ray on or off for a document. */
export function applyXray(doc, on) {
  if (!doc || !doc.documentElement) return;
  injectXrayStyle(doc);
  if (on) materialiseComments(doc);
  doc.documentElement.classList.toggle('tracer-xray', !!on);
}
