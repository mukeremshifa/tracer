// ---------------------------------------------------------------------------
// The page, as the human sees it -- and, on demand, as the agent read it.
//
// Moment 1 lives here. The X-ray is not a separate renderer or a re-projection
// of server-side coordinates: the analyser already stamped each span's ID onto
// the element it came from, so revealing concealed content is pure CSS over
// attributes that are already in the DOM. Detection and visualisation cannot
// disagree, because they are the same pass.
// ---------------------------------------------------------------------------

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { analyse } from '@shared/analyser/analyse.js';

const XRAY_STYLE_ID = 'tracer-xray-style';

const XRAY_CSS = `
@keyframes tracer-ignite {
  0%   { box-shadow: 0 0 0 0 #ff47c300; filter: brightness(2.4); }
  35%  { box-shadow: 0 0 26px 5px #ff47c3aa; filter: brightness(1.25); }
  100% { box-shadow: 0 0 12px 1px #ff47c355; filter: none; }
}
@keyframes tracer-sweep {
  from { transform: translateY(-100%); opacity: .85; }
  to   { transform: translateY(2200px); opacity: 0; }
}

html.tracer-xray body { background: #fbf7fb !important; }

html.tracer-xray::before {
  content: '';
  position: fixed; left: 0; right: 0; top: 0; height: 220px;
  background: linear-gradient(#ff47c300, #ff47c31f 55%, #ff47c300);
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
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace !important;
  -webkit-text-fill-color: #2b0720 !important;
  color: #2b0720 !important;
  background: linear-gradient(97deg, #ffe0f6, #ffd0ef) !important;
  border: 1px solid #ff47c3 !important;
  border-left: 3px solid #ff47c3 !important;
  border-radius: 3px !important;
  padding: 9px 11px !important;
  margin: 12px 0 !important;
  white-space: pre-wrap !important;
  animation: tracer-ignite 1.1s ease-out both;
}

html.tracer-xray [data-tracer-concealed="1"]::before {
  content: 'HIDDEN FROM YOU \\2014 ' attr(data-tracer-span);
  display: block;
  font: 700 9.5px/1 ui-monospace, Menlo, monospace;
  letter-spacing: .16em;
  color: #b0007e;
  margin-bottom: 7px;
}

/* Zero-width payloads: the span looks empty, so print what it decodes to. */
html.tracer-xray [data-tracer-decoded]::after {
  content: 'DECODES TO: ' attr(data-tracer-decoded);
  display: block; margin-top: 8px;
  font: 12.5px/1.55 ui-monospace, Menlo, monospace;
  color: #7a0057;
  background: #fff4fc;
  border: 1px dashed #ff47c3;
  border-radius: 3px;
  padding: 7px 9px;
  white-space: pre-wrap;
}

/* Attribute payloads: the text is in markup, not in a text node. */
html.tracer-xray [data-tracer-attr-span][alt]::after,
html.tracer-xray [data-tracer-attr-span][title]::after {
  content: 'ATTRIBUTE PAYLOAD: ' attr(alt) attr(title);
}
html.tracer-xray img[data-tracer-attr-span] {
  outline: 2px solid #ff47c3 !important;
  outline-offset: 2px;
}
html.tracer-xray figure:has(img[data-tracer-attr-span])::after,
html.tracer-xray img[data-tracer-attr-span] + figcaption::after {
  content: 'This image carries an instruction in its alt text.';
  display: block; margin-top: 8px;
  font: 700 11px/1.5 ui-monospace, Menlo, monospace;
  color: #b0007e;
}

/* Materialised HTML comments. */
html.tracer-xray .tracer-comment {
  display: block !important;
  font: 13.5px/1.6 ui-monospace, 'SF Mono', Menlo, monospace !important;
  color: #2b0720; background: linear-gradient(97deg, #ffe0f6, #ffd0ef);
  border: 1px solid #ff47c3; border-left: 3px solid #ff47c3; border-radius: 3px;
  padding: 9px 11px; margin: 12px 0; white-space: pre-wrap;
  animation: tracer-ignite 1.1s ease-out both;
}
html.tracer-xray .tracer-comment::before {
  content: 'HTML COMMENT \\2014 NEVER RENDERED';
  display: block; font: 700 9.5px/1 ui-monospace, Menlo, monospace;
  letter-spacing: .16em; color: #b0007e; margin-bottom: 7px;
}

/* Accessibility patterns are flagged, never condemned. Different colour,
   different label, and the label says so in words. */
html.tracer-xray [data-tracer-a11y="1"]:not([data-tracer-concealed="1"]) {
  display: block !important;
  position: static !important;
  width: auto !important; height: auto !important;
  clip: auto !important; clip-path: none !important;
  overflow: visible !important;
  color: #04403c !important;
  background: #dbfbf7 !important;
  border: 1px dashed #0f9c92 !important;
  border-radius: 3px !important;
  padding: 8px 10px !important;
  margin: 10px 0 !important;
  font: 12.5px/1.55 ui-monospace, Menlo, monospace !important;
}
html.tracer-xray [data-tracer-a11y="1"]:not([data-tracer-concealed="1"])::before {
  content: 'ACCESSIBILITY PATTERN \\2014 LEGITIMATE, NOT AN ATTACK';
  display: block; font: 700 9.5px/1 ui-monospace, Menlo, monospace;
  letter-spacing: .13em; color: #0b7d74; margin-bottom: 6px;
}

/* The provenance target, for Moment 2. Always on, X-ray or not. */
[data-tracer-focus="1"] {
  outline: 3px solid #ff47c3 !important;
  outline-offset: 3px;
  border-radius: 2px;
  background: #ffe6f8 !important;
  box-shadow: 0 0 0 9999px #0a0d1233, 0 0 30px 6px #ff47c377 !important;
  scroll-margin: 90px;
  position: relative !important;
  z-index: 2147482000 !important;
}
`;

function injectStyle(doc) {
  if (!doc || doc.getElementById(XRAY_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = XRAY_STYLE_ID;
  style.textContent = XRAY_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/** HTML comments are not elements, so CSS alone cannot surface them. */
function materialiseComments(doc) {
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

export const PageFrame = forwardRef(function PageFrame(
  { url, onAnalysed, revealed, onRevealChange, height },
  ref,
) {
  const frameRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [focused, setFocused] = useState(null);

  const doc = () => {
    try {
      return frameRef.current && frameRef.current.contentDocument;
    } catch {
      return null;
    }
  };

  const applyReveal = useCallback((on) => {
    const d = doc();
    if (!d || !d.documentElement) return;
    injectStyle(d);
    if (on) materialiseComments(d);
    d.documentElement.classList.toggle('tracer-xray', !!on);
  }, []);

  const handleLoad = useCallback(() => {
    const d = doc();
    setLoading(false);
    if (!d || !d.body) {
      setError('The page could not be read for analysis.');
      return;
    }
    try {
      const result = analyse(d, { url, window: frameRef.current.contentWindow });
      setReport(result.report);
      setError(null);
      injectStyle(d);
      applyReveal(revealed);
      if (onAnalysed) onAnalysed({ url, spans: result.spans, report: result.report });
    } catch (err) {
      setError(String(err && err.message ? err.message : err));
    }
  }, [url, onAnalysed, applyReveal, revealed]);

  useEffect(() => {
    setLoading(true);
    setReport(null);
    setFocused(null);
  }, [url]);

  useEffect(() => {
    applyReveal(revealed);
  }, [revealed, applyReveal]);

  useImperativeHandle(ref, () => ({
    /** Ring a span and return its rect in viewport coordinates, for the trace line. */
    focusSpan(localId) {
      const d = doc();
      if (!d) return null;
      for (const el of d.querySelectorAll('[data-tracer-focus]')) el.removeAttribute('data-tracer-focus');
      if (!localId) {
        setFocused(null);
        return null;
      }
      const el =
        d.querySelector('[data-tracer-span~="' + localId + '"]') ||
        d.querySelector('[data-tracer-attr-span~="' + localId + '"]');
      if (!el) {
        setFocused(null);
        return null;
      }
      injectStyle(d);
      el.setAttribute('data-tracer-focus', '1');
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        /* older engines */
      }
      setFocused(localId);
      return this.rectFor(localId);
    },
    /** Where that span is on screen right now, including the iframe's offset. */
    rectFor(localId) {
      const d = doc();
      const frame = frameRef.current;
      if (!d || !frame) return null;
      const el =
        d.querySelector('[data-tracer-span~="' + localId + '"]') ||
        d.querySelector('[data-tracer-attr-span~="' + localId + '"]');
      if (!el) return null;
      const inner = el.getBoundingClientRect();
      const outer = frame.getBoundingClientRect();
      const clampTop = Math.max(outer.top, Math.min(outer.bottom, outer.top + inner.top));
      return {
        left: outer.left + inner.left,
        top: clampTop,
        width: inner.width,
        height: Math.min(inner.height, outer.height),
        right: outer.left + inner.right,
        bottom: Math.max(outer.top, Math.min(outer.bottom, outer.top + inner.bottom)),
      };
    },
    clearFocus() {
      const d = doc();
      if (d) for (const el of d.querySelectorAll('[data-tracer-focus]')) el.removeAttribute('data-tracer-focus');
      setFocused(null);
    },
    report,
  }));

  const concealedCount = report ? report.concealedInstructionLike : 0;

  return (
    <div className="panel">
      <div className="frame-chrome">
        <span className="dot" style={{ background: '#ff5f57' }} />
        <span className="dot" style={{ background: '#febc2e' }} />
        <span className="dot" style={{ background: '#28c840' }} />
        <span className="frame-url" title={url}>
          range.local{url}
        </span>
        <button
          className="btn xray"
          aria-pressed={revealed ? 'true' : 'false'}
          onClick={() => onRevealChange(!revealed)}
          title="Show what the agent read but you could not see"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>

      {report && (
        <div className={'strip-banner' + (concealedCount ? '' : ' clean')}>
          <span className="icon" aria-hidden="true">
            {concealedCount ? '⚠' : '✓'}
          </span>
          <div>
            <div>
              <b>{report.headline}</b>
            </div>
            <div className="tiny" style={{ marginTop: 3, opacity: 0.85 }}>
              {report.total} spans analysed &middot; {report.visible} visible &middot; {report.concealed} concealed
              {report.accessibilityPatterns > 0 && (
                <> &middot; {report.accessibilityPatterns} accessibility pattern(s), flagged not condemned</>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="notice" style={{ margin: 12 }}>
          {error}
        </div>
      )}

      <div className="frame-shell">
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: '#0e1319',
              zIndex: 2,
            }}
          >
            <span className="row faint small">
              <span className="spinner" /> rendering and analysing {url}
            </span>
          </div>
        )}
        <iframe
          ref={frameRef}
          className="frame-iframe"
          style={height ? { height } : undefined}
          src={url}
          onLoad={handleLoad}
          title={'Untrusted page: ' + url}
          /* No allow-scripts. The page renders and computes styles; it cannot run. */
          sandbox="allow-same-origin"
        />
      </div>

      <div className="row small faint" style={{ padding: '9px 13px', borderTop: '1px solid var(--line-soft)' }}>
        <span className="tag">sandbox=&quot;allow-same-origin&quot;</span>
        <span className="tag">script-src &apos;none&apos;</span>
        <span className="faint tiny">
          The page cannot execute. Visibility is computed with getComputedStyle, where the page actually renders.
        </span>
        {focused && <span className="tag magenta">tracing {focused}</span>}
      </div>
    </div>
  );
});
