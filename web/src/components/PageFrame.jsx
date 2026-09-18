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
import { analyse } from '@tracer/core';
import { applyXray, injectXrayStyle } from '@shared/xray.js';

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
    applyXray(doc(), on);
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
      injectXrayStyle(d);
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
      injectXrayStyle(d);
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
        <span className="frame-url" title={url}>
          range.local{url}
        </span>
        {/*
          The X-ray is the mechanism nobody else has, and it used to be a small
          toggle the page had to prompt you to press. A primary control with its
          own label, saying what it does rather than what it is called.
        */}
        <button
          className={'btn xray primary-xray' + (revealed ? ' on' : '')}
          aria-pressed={revealed ? 'true' : 'false'}
          onClick={() => onRevealChange(!revealed)}
          title="Show what the agent read but you could not see"
        >
          <span className="xray-icon" aria-hidden="true">
            {revealed ? '◉' : '◎'}
          </span>
          {revealed
            ? 'Showing what the agent read'
            : concealedCount
              ? 'Show what the agent read (' + concealedCount + ' hidden)'
              : 'Show what the agent read'}
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
              background: 'var(--ink)',
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
        {focused && <span className="tag hot">tracing {focused}</span>}
      </div>
    </div>
  );
});
