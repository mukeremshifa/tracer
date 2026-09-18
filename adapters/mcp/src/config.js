// ---------------------------------------------------------------------------
// Tier configuration for the proxy.
//
// Tiers are the one judgment a host has to make, and they are not something
// Tracer can infer: only you know whether `files.write` writes to a scratch
// directory or to a shared drive. So they live in a config file you can read,
// diff and argue about, and the proxy tells you at startup which of your tools
// matched which rule.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry } from '@mukeremshifa/tracer-core';

const here = dirname(fileURLToPath(import.meta.url));

/** The shipped starter config: common MCP servers, tiered conservatively. */
export const STARTER_CONFIG_PATH = resolve(here, '..', 'tiers.json');

export function loadTierConfig(path = STARTER_CONFIG_PATH) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return normaliseTierConfig(raw, path, dirname(resolve(path)).split(sep).join('/'));
}

/**
 * `${configDir}` in a server's `command`, `args` or `cwd`.
 *
 * A server spec has to name paths -- a filesystem server is told which
 * directory it may touch -- and a client launches the proxy from whatever
 * directory it likes. Without this, a shipped config only runs on the machine it
 * was written on, which is the opposite of reproducible.
 */
function resolveServerPaths(servers, configDir) {
  if (!configDir) return servers;
  const swap = (v) => (typeof v === 'string' ? v.replaceAll('${configDir}', configDir) : v);
  const out = {};
  for (const [name, spec] of Object.entries(servers)) {
    out[name] = {
      ...spec,
      command: swap(spec.command),
      args: Array.isArray(spec.args) ? spec.args.map(swap) : spec.args,
      cwd: spec.cwd ? resolve(swap(spec.cwd)) : spec.cwd,
    };
  }
  return out;
}

export function normaliseTierConfig(raw, source = '(inline)', configDir = null) {
  if (!raw || typeof raw !== 'object') throw new Error('tier config must be an object: ' + source);
  const tools = raw.tools || raw.tiers || {};
  if (!Object.keys(tools).length) {
    throw new Error('tier config has no `tools`: ' + source);
  }
  return {
    source,
    // A proxy sits in front of servers it did not write, and new tools appear
    // when an upstream updates. Blocking on existence would make Tracer the
    // thing that broke the agent; defaulting to tier 2 keeps an unconfigured
    // tool running but fully policed. Set `defaultTier: null` to fail closed.
    defaultTier: raw.defaultTier === undefined ? 2 : raw.defaultTier,
    // Which upstream results count as untrusted content. Everything, by
    // default: a proxy cannot tell a Jira ticket from a phishing email, and
    // assuming the safer answer is the whole posture.
    untrusted: raw.untrusted === undefined ? ['*'] : raw.untrusted,
    requireTask: raw.requireTask !== false,
    // A goal declared in config rather than by the agent. Honest about being
    // the operator's word, not the agent's: see `goalSource` in session.js.
    goal: raw.goal || '',
    // Where decisions are written. `"store": false` turns it off; a relative
    // path resolves against the config, like everything else here, so a shipped
    // config does not depend on the client's working directory.
    store:
      raw.store === false
        ? null
        : raw.store
          ? (configDir ? resolve(configDir, String(raw.store)) : resolve(String(raw.store)))
          : configDir
            ? resolve(configDir, 'tracer-decisions.db')
            : null,
    servers: resolveServerPaths(raw.servers || {}, configDir),
    tools,
  };
}

/**
 * @param {object} config  from loadTierConfig()
 * @returns an @mukeremshifa/tracer-core registry
 */
export function createProxyRegistry(config) {
  return createRegistry({
    label: 'mcp-proxy',
    tools: config.tools,
    defaultTier: config.defaultTier,
  });
}

/** Does this tool's result count as untrusted content? Globs, like tiers. */
export function untrustedMatcher(config) {
  const patterns = (config.untrusted || []).map(
    (p) => new RegExp('^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'),
  );
  return (name) => patterns.some((re) => re.test(name));
}

/**
 * A readable account of what the config will do to a given tool list. Printed
 * at startup: a firewall whose rules you cannot see is a firewall you cannot
 * trust.
 */
export function explainCoverage(registry, toolNames) {
  return toolNames.map((name) => {
    const spec = registry.spec(name);
    return {
      name,
      tier: spec ? spec.tier : null,
      via: !spec ? 'blocked (no tier)' : spec.inferred ? 'default' : spec.matchedBy || 'exact',
      destination: spec && spec.destination !== undefined ? spec.destination : '(guessed from arguments)',
    };
  });
}
