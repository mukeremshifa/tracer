// ---------------------------------------------------------------------------
// A copyable block. Integration pages live or die on whether the snippet on
// screen is the snippet that works, so the copy button copies exactly what is
// rendered and the content comes off disk via /api/integration wherever there
// is a file to read.
// ---------------------------------------------------------------------------

import { useState } from 'react';

// `wrap` is for prose that happens to arrive as machine output -- a refusal
// message, a provenance chain. Those are meant to be read, and a long line
// disappearing off the right edge reads as truncation even though the block
// scrolls. Tables and banners keep the default: wrapping a column layout
// destroys it.
export function Code({ children, label, lang = 'sh', maxHeight, wrap = false }) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === 'string' ? children : String(children ?? '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard permission is not guaranteed (and is denied outright in some
      // embedded contexts). Selecting the text is still a copy path.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="code">
      <div className="code-head">
        <span className="code-label">{label || lang}</span>
        <button className="btn sm ghost code-copy" onClick={copy}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre
        className={'code-body' + (wrap ? ' wrap' : '')}
        style={maxHeight ? { maxHeight, overflow: 'auto' } : undefined}
      >
        {text}
      </pre>
    </div>
  );
}
