// ---------------------------------------------------------------------------
// @tracer/core — the provenance firewall, with no host attached.
//
// No Express, no fs, no DOM requirement, no assumption about what a "tool" is.
// Everything here answers one question:
//
//   given a proposed call, the untrusted spans seen so far, and the plan frozen
//   before any of them arrived — should this run, and what is the chain of
//   provenance behind that answer?
//
// Adapters feed it. See adapters/mcp (a proxy in front of MCP servers),
// adapters/browser (an MV3 extension) and server/ (the sandbox).
// ---------------------------------------------------------------------------

export { createRegistry, TIERS, DESTINATION_HINTS, DERIVED_FROM } from './src/registry.js';

export { evaluate, describeConcealment, formatCall, ALLOW, BLOCK, ESCALATE } from './src/policy.js';

export {
  overlapScan,
  extractDestination,
  extractArtifacts,
  decodedForms,
  searchableText,
  mentionedInGoal,
  destinationForms,
  spansContaining,
  scanOutputChannels,
  redactOutput,
  tokenise,
  ngrams,
  hostOf,
} from './src/overlap.js';

export { run, createContext, MAX_STEPS } from './src/loop.js';

export {
  analyse,
  analyseText,
  stripReport,
  instructionScore,
  contrastRatio,
  domPath,
} from './src/analyser/analyse.js';

export {
  ZW_CLASS,
  decodeZeroWidth,
  stripZeroWidth,
  encodeBinary,
} from './src/analyser/zerowidth.js';
