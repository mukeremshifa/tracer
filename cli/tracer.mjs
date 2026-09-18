#!/usr/bin/env node
// ---------------------------------------------------------------------------
// tracer — the command line.
//
//   tracer test                          run the range against the built-in mock
//   tracer test --target http://...      ...against your agent, over HTTP
//   tracer test --target ./mcp.json      ...against your agent's MCP tools
//   tracer proxy --config ./tiers.json   run the firewall in front of MCP servers
//   tracer prove                         two real MCP servers, one refusal,
//                                        both halves, nothing mocked
//   tracer log                           the decisions the proxy recorded
//   tracer sandbox                       serve the sandbox + viewer locally
//
// The range is 16 known injection classes. `test` points them at whatever agent
// you configure and tells you what got through. The built-in mock stays the
// zero-config default so the thing is runnable with no credentials and no
// endpoint, and so `npm run eval` keeps reproducing SCORECARD.md.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

const argv = process.argv.slice(2);
const command = argv[0];

function flag(name, fallback = null) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}

const USAGE = `tracer — a provenance firewall for AI agents

  tracer test [--target <target>] [--attack <id>] [--out <path>]
      Run the attack range and report what got through.

      --target mock              the built-in sandbox agent (default, no credentials)
      --target <http(s) url>     your agent, over the HTTP contract (see docs/TESTING.md)
      --target <path/to.json>    your agent's tools, via MCP

      --attack <id>              run one attack class instead of all 15
      --out <path>               where to write the scorecard (default: SCORECARD.md
                                 for the mock, ./tracer-scorecard.md otherwise)
      --json <path>              also write the raw results

  tracer proxy [--config <path>] [--goal <text>]
      Run the MCP proxy. See adapters/mcp/README.md.

  tracer prove [--unprotected] [--both] [--out <dir>]
      Spawns two real MCP servers (uvx mcp-server-fetch and
      npx @modelcontextprotocol/server-filesystem), serves one hostile page on
      127.0.0.1, and drives the canonical scenario through Tracer.

      (default)                  through Tracer: the write is refused
      --unprotected              straight to the servers: the write lands
      --both                     run the control first, then the protected run

      Needs uvx and npx on PATH and nothing else -- no credentials, no
      network beyond the two package installs. Transcripts land in demo/evidence.

  tracer log [--store <path>] [--sessions] [--session <id>] [--json]
      Print the decisions the proxy recorded. Every decision survives a restart;
      secret values are masked out of the stored arguments before they are
      written. There is no dashboard on purpose -- this is the read path.

        --store <path>           the sqlite file (default: demo/tracer-decisions.db)
        --sessions               one line per session instead of per decision
        --session <id>           only this session's decisions
        --json                   the raw rows

  tracer sandbox [--port <n>]
      Serve the sandbox: mock agent, mock inbox, local range, viewer.

  tracer extension
      Build the unpacked browser extension into adapters/browser/dist.

Three surfaces, one codebase: sandbox (try it) · range (test your agent) ·
proxy (protect your agent).
`;

function forward(cmd, args, env) {
  const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell: false });
  child.on('exit', (code) => process.exit(code ?? 0));
}

switch (command) {
  case 'test': {
    const target = flag('--target', 'mock');
    const { runTest } = await import('./test.mjs');
    await runTest({
      target,
      attack: flag('--attack'),
      out: flag('--out'),
      json: flag('--json'),
    });
    break;
  }

  case 'proxy': {
    const args = [join(ROOT, 'adapters', 'mcp', 'bin', 'tracer-proxy.mjs')];
    if (flag('--config')) args.push('--config', resolve(flag('--config')));
    if (flag('--goal')) args.push('--goal', flag('--goal'));
    forward(process.execPath, args);
    break;
  }

  // `demo-proxy` was the original name and still works, unannounced, so nothing
  // that references it breaks. `prove` is what the command actually does.
  case 'demo-proxy':
  case 'prove': {
    // This is a script, not a library: it spawns servers, binds a port and writes
    // transcripts. Run it as a child so a failing half exits non-zero and
    // `--both` can report which half failed.
    const drive = join(ROOT, 'demo', 'drive.mjs');
    const extra = [];
    if (flag('--out')) extra.push('--out', resolve(flag('--out')));
    if (flag('--port')) extra.push('--port', flag('--port'));

    const halves = argv.includes('--both')
      ? [['--unprotected'], []]
      : [argv.includes('--unprotected') ? ['--unprotected'] : []];

    for (const half of halves) {
      const code = await new Promise((done) => {
        const child = spawn(process.execPath, [drive, ...half, ...extra], { stdio: 'inherit' });
        child.on('exit', (c) => done(c ?? 0));
      });
      if (code !== 0) {
        process.stderr.write(
          '\ndemo-proxy: the ' +
            (half.length ? 'unprotected control' : 'protected') +
            ' run did not do what it is supposed to do (exit ' +
            code +
            ').\n',
        );
        process.exit(code);
      }
    }
    break;
  }

  case 'log': {
    const store = resolve(flag('--store') || join(ROOT, 'demo', 'tracer-decisions.db'));
    if (!existsSync(store)) {
      process.stderr.write(
        'no decision store at ' + store + '\n' +
          'Run the proxy (or `tracer prove`) first, or point at one with --store.\n',
      );
      process.exit(1);
    }
    const { readDecisionStore } = await import('../adapters/mcp/src/store.js');
    const { sessions, decisions } = readDecisionStore(store, {
      session: flag('--session'),
      limit: Number(flag('--limit') || 200),
    });

    if (argv.includes('--json')) {
      process.stdout.write(JSON.stringify({ store, sessions, decisions }, null, 2) + '\n');
      break;
    }

    process.stdout.write(store + '\n\n');

    if (argv.includes('--sessions')) {
      for (const s of sessions) {
        process.stdout.write(
          s.id +
            '  ' +
            s.started_at +
            '  ' +
            (s.task_declared ? 'task declared' : 'no task declared') +
            (s.goal_source ? ' (' + s.goal_source + ')' : '') +
            '\n    goal: ' +
            (s.goal || '-') +
            '\n',
        );
      }
      break;
    }

    for (const d of decisions) {
      process.stdout.write(
        d.ts +
          '  ' +
          String(d.decision).toUpperCase().padEnd(9) +
          'tier ' +
          (d.tier ?? '-') +
          '  ' +
          d.tool_name +
          (d.rule ? '  [' + d.rule + ']' : '') +
          '\n',
      );
      const dest = d.destination_json ? JSON.parse(d.destination_json) : null;
      if (dest) process.stdout.write('    -> ' + dest.kind + ' ' + dest.value + '\n');
      process.stdout.write('    args ' + d.args_redacted_json + '\n');
      for (const c of JSON.parse(d.chain_json || '[]').slice(0, 2)) {
        process.stdout.write('    via ' + c.spanId + ' (' + c.url + ')\n');
      }
    }
    if (!decisions.length) process.stdout.write('(no decisions recorded yet)\n');
    break;
  }

  case 'sandbox': {
    const dist = join(ROOT, 'web', 'dist');
    if (!existsSync(dist)) {
      process.stderr.write('note: the viewer is not built yet — run `npm run build` for the UI.\n');
    }
    forward(process.execPath, [join(ROOT, 'server', 'src', 'index.js')], {
      PORT: flag('--port') || process.env.PORT || '8787',
    });
    break;
  }

  case 'extension': {
    forward(process.execPath, [join(ROOT, 'adapters', 'browser', 'build.mjs')]);
    break;
  }

  case 'help':
  case '--help':
  case '-h':
  case undefined:
    process.stdout.write(USAGE);
    break;

  default:
    process.stderr.write('unknown command: ' + command + '\n\n' + USAGE);
    process.exit(1);
}
