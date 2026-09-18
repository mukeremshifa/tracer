// ---------------------------------------------------------------------------
// Tier configuration.
//
// This used to be a hardcoded list of six mock tools. It is now a *schema*: a
// host hands Tracer a description of the tools its agent can call, and gets
// back an object the policy engine can interrogate. The sandbox configures six
// mocks; the MCP proxy configures whatever servers the user has wired up; a
// browser extension configures whatever the host agent exposes. None of that is
// core's business.
//
// Tiers are the capability axis the policy engine reasons over:
//   0  inert          reads untrusted content, changes nothing
//   1  private read   touches the user's private data
//   2  external act   can move information out of the user's control
//
// The one judgment a host must make is which tier each tool sits in. It is a
// small judgment and it is the right place for it: only the host knows whether
// `files.write` writes to a scratch directory or to a shared drive.
// ---------------------------------------------------------------------------

export const TIERS = {
  0: { label: 'inert', blurb: 'Reads untrusted content. Changes nothing, discloses nothing.' },
  1: { label: 'private read', blurb: "Reads the user's private data." },
  2: { label: 'external act', blurb: "Can move information outside the user's control." },
};

/**
 * Fields that name *where* an action lands, in rough order of specificity.
 * Used when a tool declares a tier but not a destination field: guessing the
 * recipient from a conventional argument name is better than having no
 * destination rule at all, and the guess is reported as such so a host can
 * correct it in config.
 */
export const DESTINATION_HINTS = [
  ['to', 'recipient address'],
  ['recipient', 'recipient address'],
  ['email', 'recipient address'],
  ['channel', 'channel'],
  ['url', 'request host'],
  ['endpoint', 'request host'],
  ['webhook', 'request host'],
  ['host', 'request host'],
  ['path', 'file path'],
  ['destination', 'destination'],
  ['target', 'destination'],
];

export const DERIVED_FROM = {
  type: 'array',
  items: { type: 'string' },
  description:
    'Span IDs (for example ["S3","S7"]) whose content informed these arguments. Use [] only if no untrusted content informed them at all. Be accurate.',
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `gmail.*` matches `gmail.send_email`. Exact names always win over globs. */
function globToRe(pattern) {
  return new RegExp('^' + pattern.split('*').map(escapeRe).join('.*') + '$');
}

function trimPunctuation(v) {
  // "email it to me@range.example." -- the full stop belongs to the sentence,
  // not to the address. Left in place it silently defeats every comparison.
  if (typeof v !== 'string') return '';
  return v.trim().replace(/[.,;:!?)\]]+$/, '');
}

function hostOfValue(value) {
  const v = String(value || '').trim();
  const at = v.lastIndexOf('@');
  if (at > 0 && !v.includes('://')) return v.slice(at + 1).toLowerCase();
  try {
    return new URL(v.includes('://') ? v : 'https://' + v).hostname.toLowerCase();
  } catch {
    return v.toLowerCase();
  }
}

function kindOf(declared, field) {
  if (declared) return declared;
  const hit = DESTINATION_HINTS.find(([h]) => h === String(field).toLowerCase());
  return hit ? hit[1] : null;
}

/**
 * @param {object} config
 * @param {Record<string, object|number>} config.tools
 *        A bare tier number is shorthand for `{ tier }`. Keys may be exact tool
 *        names or globs (`gmail.*`).
 * @param {number|null} [config.defaultTier]
 *        Tier for a tool matching nothing. `null` (the default) means "unknown
 *        tools are blocked" -- the sandbox's behaviour, where the tool list is
 *        closed and complete. A proxy sitting in front of somebody else's MCP
 *        servers is better off defaulting to 2: fail closed on capability
 *        rather than on existence, so an unconfigured tool still runs but is
 *        still policed.
 * @param {string} [config.label]
 */
export function createRegistry(config = {}) {
  const tools = config.tools || {};
  const exact = new Map();
  const globs = [];

  for (const [name, raw] of Object.entries(tools)) {
    const spec = typeof raw === 'number' ? { tier: raw } : { ...raw };
    if (typeof spec.tier !== 'number' || !(spec.tier in TIERS)) {
      throw new Error('tier for ' + name + ' must be 0, 1 or 2 (got ' + JSON.stringify(spec.tier) + ')');
    }
    if (name.includes('*')) globs.push({ pattern: name, re: globToRe(name), spec });
    else exact.set(name, spec);
  }

  const defaultTier = config.defaultTier === undefined ? null : config.defaultTier;

  function spec(name) {
    if (exact.has(name)) return exact.get(name);
    for (const g of globs) if (g.re.test(name)) return { ...g.spec, matchedBy: g.pattern };
    if (defaultTier === null) return null;
    return { tier: defaultTier, inferred: true };
  }

  return {
    label: config.label || 'registry',
    defaultTier,
    spec,
    has: (name) => spec(name) !== null,

    tierOf(name) {
      const s = spec(name);
      return s ? s.tier : null;
    },

    /**
     * The destination of a call: the argument that decides where it lands. It
     * is the only thing the hard block keys on, so a host that gets it wrong
     * loses the rule -- hence `declared`, which says whether the field was
     * configured or guessed.
     */
    destinationOf(call) {
      const s = spec(call.name);
      if (!s) return null;
      const args = call.arguments || {};

      if (s.destination === null) return null; // "this tool sends nothing anywhere"
      if (s.destination) {
        const value = trimPunctuation(args[s.destination]);
        if (!value) return null;
        const kind = s.destinationKind || kindOf(null, s.destination) || 'destination';
        return {
          field: s.destination,
          value,
          host: kind === 'file path' ? null : hostOfValue(value),
          kind,
          declared: true,
        };
      }

      for (const [hint, kind] of DESTINATION_HINTS) {
        const key = Object.keys(args).find((k) => k.toLowerCase() === hint);
        if (!key) continue;
        const value = trimPunctuation(args[key]);
        if (!value) continue;
        return {
          field: key,
          value,
          host: kind === 'file path' ? null : hostOfValue(value),
          kind,
          declared: false,
        };
      }
      return null;
    },

    names: () => [...exact.keys()],
    patterns: () => globs.map((g) => g.pattern),

    /** Tool declarations in the shape a model provider wants. */
    declarations(shape) {
      const list = [...exact.entries()]
        .filter(([, s]) => s.parameters)
        .map(([name, s]) => ({ name, description: s.description || '', parameters: s.parameters }));

      if (shape === 'openai') {
        return list.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }
      if (shape === 'vertex') {
        // Gemini rejects unknown JSON Schema keywords, so declarations are kept
        // to the subset it accepts.
        const clean = (schema) => ({
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(schema.properties).map(([k, v]) => [
              k,
              v.type === 'array'
                ? { type: 'array', items: { type: 'string' }, description: v.description }
                : { type: 'string', description: v.description },
            ]),
          ),
          required: schema.required,
        });
        return [
          {
            functionDeclarations: list.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: clean(t.parameters),
            })),
          },
        ];
      }
      return list;
    },
  };
}
