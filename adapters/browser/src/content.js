// ---------------------------------------------------------------------------
// Content script: the analyser, running where the page renders.
//
// This is the only host where the whole thesis survives intact. The analyser
// has real computed styles and real layout, so it can answer the question no
// other adapter can: could a human actually have seen this text? Everything the
// X-ray draws comes from the same pass that produced the flags.
//
// MV3 content scripts are not modules, so the real work is loaded with a
// dynamic import of an extension-local module. That is why build.mjs exists:
// it copies core into the extension directory, because an extension can only
// load files it ships.
// ---------------------------------------------------------------------------

(async () => {
  const [{ analyse }, { applyXray, injectXrayStyle }] = await Promise.all([
    import(chrome.runtime.getURL('analyser.js')),
    import(chrome.runtime.getURL('xray.js')),
  ]);

  let lastResult = null;

  function scan() {
    try {
      const result = analyse(document, { url: location.href, window });
      lastResult = result;
      injectXrayStyle(document);
      chrome.runtime.sendMessage({
        type: 'tracer:page-analysed',
        url: location.href,
        title: document.title,
        spans: result.spans.map(trim),
        report: result.report,
      });
      return result;
    } catch (err) {
      chrome.runtime.sendMessage({ type: 'tracer:error', where: 'analyse', message: String(err) });
      return null;
    }
  }

  // Spans carry a style object and a DOM path; the background page needs the
  // text and the flags. Trimming here keeps a long page from filling the
  // message channel with computed styles nobody reads.
  function trim(s) {
    return {
      id: s.id,
      url: s.url,
      text: s.text,
      decoded: s.decoded,
      flags: s.flags,
      visible: s.visible,
      concealed: s.concealed,
      accessibility: s.accessibility,
      instructionLike: s.instructionLike,
      reasons: s.reasons,
      path: s.path,
      style: s.style,
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.type === 'tracer:rescan') {
      const r = scan();
      respond({ ok: !!r, report: r && r.report });
      return true;
    }
    if (msg.type === 'tracer:xray') {
      applyXray(document, msg.on);
      respond({ ok: true });
      return true;
    }
    if (msg.type === 'tracer:focus-span') {
      focusSpan(msg.localId);
      respond({ ok: true });
      return true;
    }
    if (msg.type === 'tracer:report') {
      respond({ report: lastResult && lastResult.report, url: location.href });
      return true;
    }
    return false;
  });

  function focusSpan(localId) {
    for (const el of document.querySelectorAll('[data-tracer-focus]')) {
      el.removeAttribute('data-tracer-focus');
    }
    if (!localId) return;
    const el =
      document.querySelector('[data-tracer-span~="' + localId + '"]') ||
      document.querySelector('[data-tracer-attr-span~="' + localId + '"]');
    if (!el) return;
    injectXrayStyle(document);
    el.setAttribute('data-tracer-focus', '1');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // --- the bridge ----------------------------------------------------------
  // A host agent running in the page proposes a call; the extension answers
  // with a decision. Injected into the page world, because a content script
  // lives in an isolated world the page cannot reach.
  const bridge = document.createElement('script');
  bridge.src = chrome.runtime.getURL('bridge.js');
  bridge.type = 'module';
  (document.head || document.documentElement).appendChild(bridge);
  bridge.remove();

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.tracer !== 'request') return;
    const { id, op, payload } = event.data;
    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'tracer:' + op, ...payload });
    } catch (err) {
      response = { error: String(err) };
    }
    window.postMessage({ tracer: 'response', id, response }, '*');
  });

  scan();

  // Pages change after load, and an injection added by client-side rendering
  // is still an injection. Re-scan on a settled DOM rather than on every
  // mutation.
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 900);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
