// ---------------------------------------------------------------------------
// The range, for the proxy demo: one static directory on 127.0.0.1.
//
//   node demo/serve.mjs [--port 4310]
//
// The injected page has to come from somewhere a real `fetch` MCP server will
// really fetch, and it must not come from the live web: a demo that depends on
// a third party's page is a demo that stops reproducing the day they edit it.
// So it is served locally, from a directory a reader can open and diff.
// ---------------------------------------------------------------------------

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, 'site');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

export function createRangeServer() {
  return createServer(async (req, res) => {
    // A single directory, and nothing above it. This server exists to hand one
    // hostile page to one fetch tool; it is not a file browser.
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)).replace(/^[/\\]+/, '');
    if (path.includes('..')) {
      res.writeHead(403).end('no');
      return;
    }
    const file = join(ROOT, path || 'vendor-brief.html');
    try {
      const body = await readFile(file);
      const ext = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: /' + path);
    }
  });
}

const PORT = Number(arg('--port', process.env.DEMO_PORT || 4310));

if (import.meta.url === 'file://' + process.argv[1].replace(/\\/g, '/')) {
  createRangeServer().listen(PORT, '127.0.0.1', () => {
    process.stderr.write('demo range on http://127.0.0.1:' + PORT + '/vendor-brief.html\n');
  });
}
