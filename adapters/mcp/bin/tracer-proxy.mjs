#!/usr/bin/env node
// ---------------------------------------------------------------------------
// tracer-proxy — run the provenance firewall in front of your MCP servers.
//
//   tracer-proxy --config ./tracer.tiers.json
//
// Speaks MCP over stdio, so it goes in a client's server list exactly where the
// real servers used to be. Everything it says about itself goes to stderr;
// stdout belongs to the protocol.
// ---------------------------------------------------------------------------

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { loadTierConfig, STARTER_CONFIG_PATH } from '../src/config.js';
import { createProxy } from '../src/proxy.js';

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(
    [
      'tracer-proxy — a provenance firewall in front of your MCP servers',
      '',
      '  --config <path>   tier configuration (default: the shipped starter config)',
      '  --goal <text>     declare the task up front instead of via tracer_begin_task',
      '  --store <path>    where to record decisions (default: tracer-decisions.db',
      '                    beside the config). Read them back with `tracer log`.',
      '  --no-store        do not record decisions',
      '  --print-config    show the resolved configuration and exit',
      '',
      'Add it to a client the way you would any MCP server, in place of the servers',
      'it fronts. See adapters/mcp/README.md.',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

const configPath = arg('--config', STARTER_CONFIG_PATH);
const config = loadTierConfig(configPath);
if (arg('--goal')) config.goal = arg('--goal');
if (arg('--store')) config.store = resolve(arg('--store'));
if (process.argv.includes('--no-store')) config.store = null;

if (process.argv.includes('--print-config')) {
  process.stdout.write(JSON.stringify(config, null, 2) + '\n');
  process.exit(0);
}

const log = (line) => process.stderr.write(line + '\n');

log('tracer-proxy');
log('  config          ' + config.source);
log('  default tier    ' + (config.defaultTier === null ? 'blocked (fail closed)' : config.defaultTier));
log('  visibility      not available — no rendering engine in a proxy (see README)');

const proxy = await createProxy({ config, logger: log });
await proxy.server.connect(new StdioServerTransport());
log('  ready on stdio');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await proxy.close();
    process.exit(0);
  });
}
