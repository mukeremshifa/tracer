// ---------------------------------------------------------------------------
// The policy engine.
//
// Two layers, and one of them does not trust the model.
//
//   Layer A  declared provenance. The model states which spans informed each
//            call. Cheap, and it produces good explanations. A clever enough
//            injection can instruct the model to lie, so Layer A is never
//            load-bearing on its own. When it disagrees with Layer B we say so
//            on screen -- a caught lie is more informative than a truth.
//
//   Layer B  enforced overlap. Our code scans the arguments for verbatim
//            overlap with untrusted content. The model is not consulted.
//
// The hard block is reserved for one rule, stated in full below, because a
// defence that blocks on suspicion is a defence nobody leaves switched on.
// ---------------------------------------------------------------------------

import { REGISTRY } from './registry.js';
import {
  overlapScan,
  extractDestination,
  mentionedInGoal,
  spansContaining,
  hostOf,
} from './overlap.js';

export const ALLOW = 'allow';
export const BLOCK = 'block';
export const ESCALATE = 'escalate';

function decision(kind, fields) {
  return {
    decision: kind,
    blocked: kind === BLOCK,
    needsApproval: kind === ESCALATE,
    rule: null,
    layer: null,
    headline: '',
    explain: [],
    chain: [],
    ...fields,
  };
}

function chainEntry(span, why) {
  return {
    spanId: span.id,
    local: span.local || span.id,
    url: span.url,
    text: span.decoded || span.text,
    decoded: span.decoded || null,
    flags: span.flags || [],
    visible: !!span.visible,
    concealed: !!span.concealed,
    accessibility: span.accessibility || null,
    path: span.path,
    style: span.style || null,
    why: why || null,
  };
}

/** Plain English for how a span was hidden. Used verbatim in the decision card. */
export function describeConcealment(span) {
  const f = span.flags || [];
  const bits = [];
  if (f.includes('colour-matches-background')) {
    const c = span.style && span.style.color ? span.style.color : 'the same colour as the background';
    bits.push('styled ' + c + ' on ' + ((span.style && span.style.background) || 'a matching background'));
  }
  if (f.includes('display-none')) bits.push('inside a display:none container');
  if (f.includes('visibility-hidden')) bits.push('set to visibility:hidden');
  if (f.includes('opacity-zero')) bits.push('rendered at zero opacity');
  if (f.includes('font-size-zero')) bits.push('rendered at zero font size');
  if (f.includes('off-screen')) bits.push('positioned off the edge of the page');
  if (f.includes('zero-box')) bits.push('collapsed to a zero-sized box');
  if (f.includes('zero-width-chars')) bits.push('encoded in zero-width characters');
  if (f.includes('html-comment')) bits.push('inside an HTML comment');
  if (f.includes('fetched-file')) bits.push('inside a file the agent fetched');
  for (const flag of f) {
    if (flag.startsWith('attribute:')) bits.push('inside the ' + flag.split(':')[1] + ' attribute of an element');
  }
  if (!bits.length) return span.visible ? 'visible on the page' : 'not rendered to you';
  return bits.join(', ');
}

/**
 * @param {{name:string, arguments:object}} call
 * @param {object} ctx  run context (see loop.js)
 */
export function evaluate(call, ctx) {
  const spec = REGISTRY[call.name];
  if (!spec) {
    return decision(BLOCK, {
      rule: 'unknown-tool',
      layer: 'registry',
      headline: 'Blocked — unknown tool ' + call.name,
      explain: ['The agent tried to call a tool that is not in the registry.'],
    });
  }

  const tier = spec.tier;
  const untrusted = ctx.untrustedSpans();
  const declared = Array.isArray(call.arguments && call.arguments.derived_from)
    ? call.arguments.derived_from
    : null;

  // --- tier 0: inert ---------------------------------------------------------
  if (tier === 0) {
    return decision(ALLOW, {
      rule: 'tier-0-inert',
      layer: 'tiers',
      tier,
      headline: 'Allowed — ' + call.name + ' changes nothing and discloses nothing',
      explain: ['Tier 0 tools read untrusted content. They cannot move information anywhere.'],
    });
  }

  // --- Layer B runs first, and runs regardless ------------------------------
  const scan = overlapScan(call.arguments, untrusted);
  const artifactHits = scan.hits.filter((h) => h.type === 'artifact');
  const ngramHits = scan.hits.filter((h) => h.type === 'ngram');

  // Layer A vs Layer B: did the model under-report its sources?
  const declaredSet = new Set(declared || []);
  const undeclared = artifactHits.filter((h) => !declaredSet.has(h.spanId));
  const mismatch = declared !== null && undeclared.length > 0;

  const layerNotes = [];
  if (declared !== null) {
    layerNotes.push(
      declared.length
        ? 'Layer A — the model declared this came from ' + declared.join(', ') + '.'
        : 'Layer A — the model declared that no page content informed this call.',
    );
  }
  if (mismatch) {
    layerNotes.push(
      'Layer B — our own scan disagrees. ' +
        undeclared.map((h) => h.value + ' also appears in ' + h.spanId).join('; ') +
        '. The model’s self-report is not trusted and not required.',
    );
  }

  const inPlan = ctx.planToolNames().includes(call.name);
  const dest = extractDestination(call);

  // Off-plan is reported as a supporting reason wherever a more specific rule
  // fires. Two independent controls agreeing is worth showing; collapsing them
  // into whichever happened to be checked first is not.
  const offPlanNote =
    !inPlan && tier > 0
      ? [
          'Separately: this call was not in the plan frozen before any page was read (' +
            (ctx.planToolNames().join(', ') || 'no tool calls') +
            '). A step that appears only after untrusted content entered the context did not come from you.',
        ]
      : [];

  // --- tier 1: private reads ------------------------------------------------
  if (tier === 1) {
    if (!inPlan) {
      return decision(ESCALATE, {
        rule: 'off-plan-private-read',
        layer: 'plan',
        tier,
        headline: 'Needs your approval — ' + formatCall(call) + ' is not in the frozen plan',
        explain: [
          call.name + ' reads your private data and was not part of the plan you approved.',
          'The plan frozen before any page was read contained: ' +
            (ctx.planToolNames().join(', ') || 'no tool calls') +
            '.',
          'It is being held for you rather than blocked, because reading is reversible and sending is not.',
          ...layerNotes,
        ],
        chain: artifactHits.slice(0, 4).map((h) => chainEntry(h.span, 'contains ' + h.value)),
      });
    }
    return decision(ALLOW, {
      rule: 'tier-1-in-plan',
      layer: 'tiers',
      tier,
      headline: 'Allowed — ' + formatCall(call) + ' was in the frozen plan',
      explain: [
        'Tier 1 reads private data but cannot move it anywhere. Logged with its provenance so any later attempt to move it is attributable.',
        ...layerNotes,
      ],
      chain: artifactHits.slice(0, 3).map((h) => chainEntry(h.span, 'contains ' + h.value)),
    });
  }

  // --- tier 2: external acts ------------------------------------------------

  // THE DESTINATION RULE.
  //
  // Hard-blocked when the destination of the call does not appear in the user's
  // original instruction AND does appear in untrusted page content.
  //
  // In plain English: the agent is about to send something somewhere you never
  // mentioned, and the only place that destination came from is a web page.
  // That is the signature of every exfiltration finding in the literature, and
  // it requires no judgment from the model at all.
  if (dest) {
    const inGoal = mentionedInGoal(dest, ctx.goal);
    const originSpans = [
      ...spansContaining(dest.value, untrusted),
      ...(dest.host ? spansContaining(dest.host, untrusted) : []),
    ].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);

    if (!inGoal && originSpans.length) {
      const primary = originSpans[0];
      return decision(BLOCK, {
        rule: 'destination-originates-from-page',
        layer: 'B',
        tier,
        headline: 'Blocked — ' + formatCall(call),
        explain: [
          'This ' + dest.kind + ' appears nowhere in your instruction.',
          'It appears in span ' +
            primary.id +
            ', ' +
            describeConcealment(primary) +
            ', on ' +
            primary.url +
            '.',
          'The agent is about to send something somewhere you never mentioned, and the only place that destination came from is a web page.',
          ...secretNote(call, ctx),
          ...layerNotes,
          ...offPlanNote,
        ],
        chain: originSpans.slice(0, 4).map((s) => chainEntry(s, 'source of ' + dest.value)),
        destination: dest,
      });
    }

    // A secret leaving for a destination the user never named is blocked even
    // when that destination did not come from the page: the model may have
    // produced it from its own weights, and the user still never asked for it.
    const leaking = secretsIn(call, ctx);
    if (!inGoal && leaking.length) {
      return decision(BLOCK, {
        rule: 'secret-to-unnamed-destination',
        layer: 'B',
        tier,
        headline: 'Blocked — ' + formatCall(call),
        explain: [
          'This call carries a ' +
            leaking[0].kind +
            ' that was read from your private data (' +
            leaking[0].source +
            ').',
          'The ' + dest.kind + ' ' + dest.value + ' appears nowhere in your instruction.',
          'Private data may leave only for a destination you named.',
          ...layerNotes,
          ...offPlanNote,
        ],
        chain: artifactHits.slice(0, 3).map((h) => chainEntry(h.span, 'contains ' + h.value)),
        destination: dest,
      });
    }
  }

  // The frozen plan, as a rule in its own right. It catches the case the
  // destination rule cannot: a tier-2 action whose destination the user did
  // mention, or which has no destination at all, appearing out of nowhere
  // after the agent read a page.
  if (!inPlan) {
    return decision(BLOCK, {
      rule: 'off-plan-sensitive-action',
      layer: 'plan',
      tier,
      headline: 'Blocked — ' + formatCall(call) + ' is not in the frozen plan',
      explain: [
        'The plan was frozen before any page was read. It contained: ' +
          (ctx.planToolNames().join(', ') || 'no tool calls') +
          '.',
        call.name +
          ' is a tier 2 action — it can move information out of your control — and it was not on that plan.',
        'A step that appears only after untrusted content entered the context did not come from you.',
        ...layerNotes,
      ],
      chain: undeclared.slice(0, 4).map((h) => chainEntry(h.span, 'contains ' + h.value)),
      destination: dest,
    });
  }

  // Defence in depth for the destination rule. The rule above needs the
  // destination to be findable in page content, which means a payload encoded
  // in a form we do not decode could slip past it. This check does not depend
  // on matching the page at all: a destination that appears neither in the
  // user's instruction nor in the plan frozen before any page was read is not
  // attributable to the user, whatever it was encoded as.
  //
  // It escalates rather than blocks, deliberately. "Email the author of this
  // article" is a legitimate request whose recipient legitimately comes from
  // the page, and a firewall that hard-blocks it is one people switch off.
  if (dest && dest.host) {
    const inGoal = mentionedInGoal(dest, ctx.goal);
    const planned = ctx.planDestinations
      ? ctx.planDestinations().some((v) => v.includes(dest.value.toLowerCase()) || (dest.host && v.includes(dest.host)))
      : false;

    if (!inGoal && !planned) {
      return decision(ESCALATE, {
        rule: 'unattributable-destination',
        layer: 'B',
        tier,
        headline: 'Needs your approval — ' + formatCall(call),
        explain: [
          'This ' + dest.kind + ' (' + dest.value + ') appears neither in your instruction nor in the plan frozen before any page was read.',
          'We could not trace where it came from, which is not the same as knowing it is hostile — so it is held for you rather than refused.',
          'Nothing has been sent.',
          ...layerNotes,
          ...offPlanNote,
        ],
        chain: artifactHits.slice(0, 4).map((h) => chainEntry(h.span, 'contains ' + h.value)),
        destination: dest,
      });
    }
  }

  // Overlap alone never blocks. Summarising a page means quoting it: overlap
  // with page content is the normal case, not the attack case.
  if (artifactHits.length || mismatch) {
    return decision(ESCALATE, {
      rule: mismatch ? 'declared-provenance-mismatch' : 'tier-2-page-derived-arguments',
      layer: 'B',
      tier,
      headline: 'Needs your approval — ' + formatCall(call),
      explain: [
        'This is an external action whose arguments overlap untrusted page content.',
        'Overlap on its own is not evidence of an attack — summarising a page means quoting it — so this is held for you rather than blocked.',
        ...layerNotes,
      ],
      chain: artifactHits.slice(0, 4).map((h) => chainEntry(h.span, 'contains ' + h.value)),
      destination: dest,
    });
  }

  if (ngramHits.length) {
    return decision(ALLOW, {
      rule: 'tier-2-clean-destination',
      layer: 'B',
      tier,
      headline: 'Allowed — ' + formatCall(call),
      explain: [
        'The destination came from your instruction, not from the page.',
        'The body quotes page content, which is expected when summarising. Quoting is not exfiltration; the destination is what matters.',
        ...layerNotes,
      ],
      chain: ngramHits.slice(0, 3).map((h) => chainEntry(h.span, 'quoted text')),
      destination: dest,
    });
  }

  return decision(ALLOW, {
    rule: 'tier-2-clean',
    layer: 'B',
    tier,
    headline: 'Allowed — ' + formatCall(call),
    explain: ['No untrusted content informed this call, and the destination came from you.', ...layerNotes],
    destination: dest,
  });
}

// --- helpers -----------------------------------------------------------------

function secretsIn(call, ctx) {
  const blob = JSON.stringify(call.arguments || {});
  return (ctx.secrets || []).filter((s) => blob.includes(s.value));
}

function secretNote(call, ctx) {
  const leaking = secretsIn(call, ctx);
  if (!leaking.length) return [];
  return [
    'The message also carries a ' +
      leaking[0].kind +
      ' read from your private data (' +
      leaking[0].source +
      ').',
  ];
}

export function formatCall(call) {
  const a = call.arguments || {};
  const shown = Object.entries(a)
    .filter(([k]) => k !== 'derived_from' && k !== 'body' && k !== 'data')
    .map(([k, v]) => k + ': "' + String(v).slice(0, 64) + '"')
    .join(', ');
  return call.name + '(' + shown + ')';
}

export { hostOf };
