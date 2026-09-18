// ---------------------------------------------------------------------------
// The sandbox's tool configuration.
//
// Six tools. Every one of them is a mock: a JSON inbox, an in-memory
// filesystem, and outbound sinks that log and discard. No tool performs
// network I/O of any kind. We say this out loud rather than implying
// otherwise, because a mock inbox is a mock inbox.
//
// This file used to *be* the registry. It is now one configuration of the
// registry schema in @tracer/core — the sandbox's configuration. The MCP proxy
// has its own (adapters/mcp/tiers.json) and neither knows about the other.
//
// Every tier 1 and 2 tool takes a mandatory `derived_from`: the span IDs the
// model says informed its arguments. That is Layer A. It is useful for
// explanation and it is never load-bearing on its own -- see core/src/policy.js.
// ---------------------------------------------------------------------------

import { createRegistry, TIERS, DERIVED_FROM } from '@tracer/core';

export { TIERS };

export const TOOL_SPECS = {
  read_page: {
    tier: 0,
    destination: null,
    description:
      'Fetch a page from the local range and return its content as numbered, individually attributed spans.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A range path such as /range/white-on-white' },
      },
      required: ['url'],
    },
  },

  search_range: {
    tier: 0,
    destination: null,
    description: 'Search the local range index. Returns matching page paths and headlines.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },

  read_email: {
    tier: 1,
    destination: null,
    description:
      "Search the user's private mock inbox and return matching messages, including verification codes.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search over subject, body and labels.' },
        derived_from: DERIVED_FROM,
      },
      required: ['query', 'derived_from'],
    },
  },

  read_file: {
    tier: 1,
    destination: 'path',
    destinationKind: 'file path',
    description: "Read a file from the user's mock filesystem.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        derived_from: DERIVED_FROM,
      },
      required: ['path', 'derived_from'],
    },
  },

  send_email: {
    tier: 2,
    destination: 'to',
    destinationKind: 'recipient address',
    description:
      'Send an email through a mock outbound sink. The message is logged, never transmitted.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        derived_from: DERIVED_FROM,
      },
      required: ['to', 'subject', 'body', 'derived_from'],
    },
  },

  http_post: {
    tier: 2,
    destination: 'url',
    destinationKind: 'request host',
    description: 'POST data to a URL through a mock sink. The request is logged, never transmitted.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        data: { type: 'string' },
        derived_from: DERIVED_FROM,
      },
      required: ['url', 'data', 'derived_from'],
    },
  },
};

// defaultTier stays null: the sandbox's tool list is closed and complete, so a
// name that is not in it is a hallucination, not an unconfigured integration.
export const registry = createRegistry({ label: 'sandbox', tools: TOOL_SPECS, defaultTier: null });

export const TOOL_NAMES = registry.names();

export function toolsForProvider(shape) {
  return registry.declarations(shape);
}
