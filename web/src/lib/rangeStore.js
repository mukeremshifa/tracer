// ---------------------------------------------------------------------------
// Client-side page analysis.
//
// The analyser runs where the page renders. In a browser agent the agent *is*
// the browser, so this is not a shortcut around a server-side headless browser
// -- it is the architecturally correct place for it, and it is why there is no
// Playwright image in this project.
//
// Each page is loaded into a hidden iframe with `sandbox="allow-same-origin"`
// and, crucially, WITHOUT `allow-scripts`: the untrusted page cannot execute
// anything, while real computed styles and real layout geometry are still
// available to the analyser.
// ---------------------------------------------------------------------------

import { analyse } from '@tracer/core';

const FRAME_W = 1100;
const FRAME_H = 900;

function hiddenFrame() {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.title = 'Tracer analyser (offscreen)';
  // Offscreen rather than display:none -- a display:none iframe has no layout,
  // and layout is exactly what the off-screen and zero-box detectors need.
  frame.style.cssText =
    'position:fixed;left:-20000px;top:0;width:' + FRAME_W + 'px;height:' + FRAME_H + 'px;border:0;visibility:hidden;';
  return frame;
}

export function analyseUrl(url, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    const frame = hiddenFrame();
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        frame.remove();
      } catch {
        /* already gone */
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish({ url, spans: [], report: null, error: 'timed out' }), timeout);

    frame.addEventListener('load', () => {
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.body) return finish({ url, spans: [], report: null, error: 'no document' });
        const result = analyse(doc, { url, window: frame.contentWindow });
        finish({ url, spans: result.spans, report: result.report });
      } catch (err) {
        finish({ url, spans: [], report: null, error: String(err && err.message ? err.message : err) });
      }
    });

    frame.src = url;
    document.body.appendChild(frame);
  });
}

/**
 * Analyse the whole range up front. The agent may follow a link from one page
 * to another (the cross-page chaining attack does exactly that), and the run is
 * a single request, so every page it could reach must already be analysed.
 */
export async function analyseRange(paths, onProgress) {
  const store = {};
  let done = 0;
  for (const path of paths) {
    const result = await analyseUrl(path);
    store[path] = { spans: result.spans, report: result.report };
    done += 1;
    if (onProgress) onProgress(done, paths.length, path);
  }
  return store;
}
