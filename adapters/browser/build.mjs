// ---------------------------------------------------------------------------
// Build the unpacked extension.
//
//   node adapters/browser/build.mjs
//
// No bundler. An extension can only load files it ships, so the build is a
// copy: core's ES modules go in beside the extension's own, and the entry
// points re-export them. Keeping it a copy rather than a bundle means the
// analyser running on a real page is byte-for-byte the analyser the eval
// harness runs, which is the property worth protecting.
// ---------------------------------------------------------------------------

import { cp, mkdir, rm, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const dist = join(here, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// The extension's own files.
await cp(join(here, 'src'), dist, { recursive: true });

// Core, verbatim.
await mkdir(join(dist, 'core'), { recursive: true });
await cp(join(repo, 'core', 'index.js'), join(dist, 'core', 'index.js'));
await cp(join(repo, 'core', 'src'), join(dist, 'core', 'src'), { recursive: true });

// The X-ray, shared with the viewer so the sandbox and a real page cannot drift.
await cp(join(repo, 'shared', 'xray.js'), join(dist, 'xray.js'));

// Entry points, so the extension's own modules never reach across directories.
await writeFile(join(dist, 'core.js'), "export * from './core/index.js';\n");
await writeFile(join(dist, 'analyser.js'), "export * from './core/src/analyser/analyse.js';\n");

const files = await readdir(dist);
process.stdout.write(
  'tracer extension built → adapters/browser/dist\n' +
    '  ' +
    files.sort().join('  ') +
    '\n\n' +
    'Load it: chrome://extensions → Developer mode → Load unpacked → adapters/browser/dist\n',
);
