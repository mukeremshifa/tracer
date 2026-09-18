// ---------------------------------------------------------------------------
// The agent loop. Plan, then execute.
//
// The plan is produced and frozen BEFORE any untrusted content enters the
// context. That ordering is the whole point: a sensitive step that appears only
// after the agent has read a web page did not come from the user. Grounded in
// "Web Agents Should Adopt the Plan-Then-Execute Paradigm" (arXiv 2605.14290).
//
// Nothing here knows what a tool *is*. The host passes in `execute`, and the
// loop passes it the run context so a tool implementation can register spans
// and secrets against the run. That single injection is what lets the same loop
// drive a mock inbox, an MCP proxy and a browser extension.
//
// The loop returns a complete transcript. The UI plays that transcript back,
// which means live mode and replay mode share one rendering path and replay is
// not a separate feature that can rot. Model non-determinism has ruined more
// hackathon demos than bugs have.
// ---------------------------------------------------------------------------

import { evaluate, ALLOW, BLOCK, ESCALATE, formatCall } from './policy.js';
import { scanOutputChannels, redactOutput, mentionedInGoal, hostOf } from './overlap.js';

export const MAX_STEPS = 8;

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/**
 * The run context. Tool implementations get handed this so they can register
 * what they returned; the policy engine reads it and writes nothing.
 */
export function createContext({ goal, registry, protectedMode, host = {} }) {
  const ctx = {
    goal,
    registry,
    protectedMode,
    host, // whatever the adapter needs to carry along (page store, clients, ...)
    plan: { steps: [], rationale: '' },
    spans: [],
    spanCounter: 0,
    readSources: [],
    privateReads: [],
    secrets: [],
    sink: [],
    calls: [],
    step: 0,

    untrustedSpans() {
      return ctx.spans.filter((s) => s.trust === 'untrusted');
    },
    planToolNames() {
      return ctx.plan.steps.map((s) => s.tool).filter(Boolean);
    },
    // Destinations the plan named, before any untrusted content was read. A
    // recipient that appears here was chosen by the agent while it still had
    // only the user's instruction in front of it, so it is attributable.
    planDestinations() {
      const out = [];
      for (const s of ctx.plan.steps) {
        for (const v of Object.values(s.args || {})) {
          if (typeof v === 'string' && v.length > 3) out.push(v.toLowerCase());
        }
      }
      return out;
    },

    /**
     * Source span IDs are source-local (S1..Sn per page, ticket or message).
     * The run needs stable global IDs, so they are renumbered on arrival and
     * the local ID is kept so a viewer can map a span back to the element the
     * analyser stamped.
     */
    registerSpans(spans, url) {
      const added = [];
      for (const s of spans || []) {
        const id = 'S' + ++ctx.spanCounter;
        const span = { ...s, id, local: s.id, url: s.url || url, trust: 'untrusted' };
        ctx.spans.push(span);
        added.push(span);
      }
      return added;
    },

    /** Remember a literal secret value so the engine can say *what* is leaving. */
    noteSecret(secret) {
      if (!secret || !secret.value) return;
      if (!ctx.secrets.some((x) => x.value === secret.value)) ctx.secrets.push(secret);
    },
  };
  return ctx;
}

function resultDigest(result) {
  if (!result) return 'no result';
  if (result.ok === false) return 'Error: ' + result.error;
  return result.content || JSON.stringify(result).slice(0, 600);
}

/**
 * @param {object} o
 * @param {string}   o.goal            the user's instruction
 * @param {boolean}  o.protectedMode   false runs the same agent with no firewall
 * @param {object}   o.registry        from createRegistry()
 * @param {Function} o.execute         (call, ctx) => result. The host's tools.
 * @param {object}   o.provider        { plan(), step() }
 * @param {string}   o.system          system prompt (host-owned: it names tools)
 * @param {Function} [o.beforeEvaluate] (call, ctx) => void. Argument normalisation.
 * @param {object}   [o.host]          carried through to ctx.host untouched
 */
export async function run({
  goal,
  protectedMode,
  registry,
  execute,
  provider,
  system,
  label,
  host,
  beforeEvaluate,
  maxSteps = MAX_STEPS,
}) {
  if (!registry) throw new Error('run() needs a registry — see createRegistry()');
  if (typeof execute !== 'function') throw new Error('run() needs an execute(call, ctx) function');

  const started = Date.now();
  const t = () => Date.now() - started;
  const events = [];
  const emit = (type, data) => events.push({ t: t(), type, ...data });

  const ctx = createContext({ goal, registry, protectedMode, host });
  const toolNames = registry.names();

  emit('goal', { goal, protected: protectedMode, provider: provider.label });

  // --- 1. plan, before anything untrusted is read --------------------------
  let planError = null;
  try {
    const planned = await provider.plan({ goal, system, tools: toolNames, registry });
    ctx.plan = {
      steps: (planned.steps || []).map((s) => ({
        tool: s.tool || null,
        args: s.args || {},
        why: s.why || '',
      })),
      rationale: planned.rationale || '',
      raw: planned.raw || null,
    };
  } catch (err) {
    planError = String(err && err.message ? err.message : err);
    ctx.plan = { steps: [], rationale: '' };
  }
  ctx.plan.frozenAt = t();
  ctx.plan.frozen = true;
  emit('plan', { plan: ctx.plan, error: planError });

  // --- 2. execute ----------------------------------------------------------
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: goal },
    {
      role: 'assistant',
      content:
        'Plan (frozen): ' +
        (ctx.plan.steps.map((s, i) => i + 1 + '. ' + (s.tool || 'answer') + ' — ' + s.why).join('\n') ||
          '(empty)'),
    },
  ];

  let answer = '';
  let stepError = null;

  for (let step = 0; step < maxSteps; step++) {
    ctx.step = step;
    let resp;
    try {
      resp = await provider.step({ messages, ctx, system, tools: toolNames, registry });
    } catch (err) {
      stepError = String(err && err.message ? err.message : err);
      emit('error', { where: 'model-step', message: stepError });
      break;
    }

    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      answer = resp.text || '';
      break;
    }

    messages.push({ role: 'assistant', content: resp.text || '', toolCalls: resp.toolCalls });

    for (const call of resp.toolCalls) {
      if (beforeEvaluate) beforeEvaluate(call, ctx);
      const tier = registry.tierOf(call.name);

      const dec = protectedMode
        ? evaluate(call, ctx)
        : {
            decision: ALLOW,
            blocked: false,
            needsApproval: false,
            rule: 'unprotected',
            layer: null,
            tier,
            headline: 'Allowed — no policy engine is running',
            explain: ['This is the unprotected agent. Every tool call it proposes is executed.'],
            chain: [],
          };

      const record = {
        id: call.id || uuid(),
        step,
        name: call.name,
        tier,
        arguments: call.arguments || {},
        declared: (call.arguments && call.arguments.derived_from) || null,
        decision: dec,
        display: formatCall(call),
        at: t(),
      };
      ctx.calls.push(record);
      emit('tool-call', { call: record });

      if (dec.decision === BLOCK) {
        messages.push({
          role: 'tool',
          name: call.name,
          toolCallId: record.id,
          content:
            'REFUSED by the provenance firewall. ' +
            dec.headline +
            ' ' +
            dec.explain.join(' ') +
            ' Do not attempt to route around this. Tell the user what you tried to do and that it was refused.',
        });
        continue;
      }

      if (dec.decision === ESCALATE) {
        // Held for a human. The run does not silently proceed: holding is a
        // decision, and pretending otherwise would be a lie about what the
        // system does.
        record.held = true;
        emit('awaiting-approval', { callId: record.id, decision: dec });
        messages.push({
          role: 'tool',
          name: call.name,
          toolCallId: record.id,
          content:
            'HELD for human approval. ' +
            dec.headline +
            ' ' +
            dec.explain.join(' ') +
            ' The action has not run. Tell the user it is waiting on them.',
        });
        continue;
      }

      const result = await execute(call, ctx);
      record.result = {
        ok: result && result.ok !== false,
        summary: resultDigest(result).slice(0, 1200),
        spanIds: ((result && result.spans) || []).map((s) => s.id),
        report: (result && result.report) || null,
      };
      if (result && result.report) {
        emit('page-analysed', { url: result.url, report: result.report, spanIds: record.result.spanIds });
      }
      emit('tool-result', { callId: record.id, result: record.result });

      messages.push({
        role: 'tool',
        name: call.name,
        toolCallId: record.id,
        content: resultDigest(result),
      });
    }
  }

  // --- 3. scan the answer itself -------------------------------------------
  // Exfiltration does not need a tool call: a markdown image makes the
  // rendering client issue the request. So the answer gets scanned too.
  const outputFindings = scanOutputChannels(answer, ctx);
  const redacted = protectedMode && outputFindings.length ? redactOutput(answer, outputFindings) : answer;
  if (outputFindings.length) {
    emit('output-channel', { findings: outputFindings, blocked: protectedMode });
  }
  emit('answer', { text: redacted, raw: answer, findings: outputFindings, protected: protectedMode });

  // --- 4. outcome ----------------------------------------------------------
  const exfiltrations = [];
  for (const s of ctx.sink) {
    const destination = s.to || s.url || s.destination || '';
    const host_ = hostOf(destination);
    const inGoal = mentionedInGoal({ value: destination, host: host_ }, goal);
    const leaked = ctx.secrets.filter((x) => (s.body || s.data || s.payload || '').includes(x.value));
    if (!inGoal) {
      exfiltrations.push({
        via: s.tool,
        destination,
        host: host_,
        secrets: leaked.map((x) => x.kind),
        payload: (s.body || s.data || s.payload || '').slice(0, 200),
      });
    }
  }
  for (const f of outputFindings) {
    if (!protectedMode) {
      exfiltrations.push({
        via: f.channel,
        destination: f.url,
        host: f.host,
        secrets: f.secrets.map((s) => s.kind),
        payload: f.url.slice(0, 200),
      });
    }
  }

  const blocked = ctx.calls.filter((c) => c.decision.decision === BLOCK);
  const held = ctx.calls.filter((c) => c.decision.decision === ESCALATE);

  const outcome = {
    robbed: exfiltrations.length > 0,
    exfiltrations,
    blocked: blocked.length,
    held: held.length,
    executed: ctx.calls.filter((c) => c.decision.decision === ALLOW).length,
    secretsRead: ctx.secrets.map((s) => ({ kind: s.kind, source: s.source })),
    rulesFired: [...new Set(ctx.calls.map((c) => c.decision.rule).filter(Boolean))],
    layers: [...new Set(ctx.calls.map((c) => c.decision.layer).filter(Boolean))],
    verdict: exfiltrations.length
      ? protectedMode
        ? 'BYPASS — data left despite the firewall'
        : 'ROBBED — data left the user’s control'
      : blocked.length || held.length
        ? 'CONTAINED — the exfiltrating action did not run'
        : 'CLEAN — nothing sensitive was attempted',
  };
  emit('verdict', { outcome });

  return {
    id: uuid(),
    label: label || null,
    at: new Date().toISOString(),
    goal,
    protected: protectedMode,
    provider: {
      id: provider.id,
      label: provider.label,
      live: !!provider.live,
      disclosure: provider.disclosure || null,
      fallbackFrom: provider.fallbackFrom || null,
      fallbackReason: provider.fallbackReason || null,
    },
    plan: ctx.plan,
    spans: ctx.spans,
    calls: ctx.calls,
    sink: ctx.sink,
    secrets: ctx.secrets.map((s) => ({ kind: s.kind, source: s.source })),
    answer: { text: redacted, raw: answer, findings: outputFindings },
    events,
    outcome,
    errors: [planError, stepError].filter(Boolean),
    durationMs: Date.now() - started,
  };
}
