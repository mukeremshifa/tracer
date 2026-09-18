// ---------------------------------------------------------------------------
// The sandbox's host adapter.
//
// The loop itself lives in @mukeremshifa/tracer-core and knows nothing about mock inboxes or
// the local range. This file is the thin layer that hands it three things: the
// sandbox's tier configuration, the sandbox's tool implementations, and the
// system prompt that names them.
//
// It is the smallest of the three adapters, and it is worth noticing how small
// it is: that is the argument for the extraction.
// ---------------------------------------------------------------------------

import { run as coreRun } from '@mukeremshifa/tracer-core';
import { registry } from './registry.js';
import { execute, normaliseRangePath } from './tools.js';
import { systemPrompt } from './prompts.js';

export { MAX_STEPS } from '@mukeremshifa/tracer-core';

/**
 * @param {object} o
 * @param {string} o.goal
 * @param {boolean} o.protectedMode
 * @param {Record<string,{spans:Array,report:object}>} o.pageStore  analysed pages
 * @param {object} o.provider
 */
export async function run({ goal, protectedMode, pageStore, provider, label }) {
  return coreRun({
    goal,
    protectedMode,
    provider,
    label,
    registry,
    execute,
    system: systemPrompt(protectedMode),
    host: { pageStore: pageStore || {}, searches: [] },
    // The model writes range URLs in whatever form it likes; they are one
    // identity as far as the page store is concerned, so they are normalised
    // before the policy engine sees them rather than after.
    beforeEvaluate(call) {
      if (call.name === 'read_page' && call.arguments) {
        call.arguments.url = normaliseRangePath(call.arguments.url);
      }
    },
  });
}
