// ---------------------------------------------------------------------------
// A proxied conversation, from Tracer's point of view.
//
// The proxy does not drive the agent -- some other client does -- so there is
// no loop here. There is a run context, exactly the one @mukeremshifa/tracer-core's policy
// engine expects, kept alive across calls: the declared task, the plan frozen
// with it, every untrusted span that has arrived in a tool result since, and
// the secrets that came back from tier-1 reads.
//
// What this gives up, honestly: the proxy cannot force plan-then-execute on a
// client that does not cooperate. It can only offer `tracer_begin_task` and say
// plainly what happens when the agent skips it -- every tier-2 destination
// becomes unattributable, so it escalates rather than runs. See the README.
// ---------------------------------------------------------------------------

import { createContext, evaluate, analyseText, ALLOW, BLOCK, ESCALATE } from '@mukeremshifa/tracer-core';

const SECRET_PATTERNS = [
  { kind: 'one-time passcode', re: /\b\d{3}[- ]\d{3}\b/g },
  { kind: 'one-time passcode', re: /\b\d{6}\b/g },
  { kind: 'API key', re: /\b(?:sk|pk|ghp|xox[bpas])[-_][A-Za-z0-9-_]{16,}\b/g },
  { kind: 'bearer token', re: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: 'account fragment', re: /\bending \d{4}\b/gi },
];

export function extractSecrets(text, source) {
  const found = [];
  for (const { kind, re } of SECRET_PATTERNS) {
    for (const m of String(text || '').matchAll(re)) {
      const value = m[0];
      if (value.length < 5) continue;
      if (!found.some((f) => f.value === value)) found.push({ value, kind, source });
    }
  }
  return found;
}

export class ProxySession {
  /**
   * @param {object} o
   * @param {object} o.registry   from createProxyRegistry()
   * @param {Function} o.isUntrusted  (toolName) => boolean
   * @param {string} [o.goal]     a task declared up front (config or --goal)
   * @param {boolean} [o.requireTask]
   * @param {object} [o.store]  a decision store (adapters/mcp/src/store.js)
   */
  constructor({ registry, isUntrusted, goal = '', requireTask = true, store = null }) {
    this.registry = registry;
    this.isUntrusted = isUntrusted || (() => true);
    this.requireTask = requireTask;
    this.taskDeclared = !!goal;
    // Where the goal came from, which is never a detail: a goal the operator
    // configured, a goal the agent declared and a goal Tracer guessed carry
    // different weight, and a decision that does not say which is a decision
    // that overstates itself.
    this.goalSource = goal ? 'config' : null;
    this.store = store;
    this.log = [];
    this.descriptionScan = [];
    this.ctx = createContext({ goal, registry, protectedMode: true, host: { kind: 'mcp-proxy' } });
  }

  /** The agent declares what it was asked to do, and how it intends to do it. */
  beginTask({ goal, plan }) {
    this.ctx.goal = String(goal || '');
    this.ctx.plan = {
      steps: (Array.isArray(plan) ? plan : []).map((s) =>
        typeof s === 'string'
          ? { tool: s, args: {}, why: '' }
          : { tool: s.tool || null, args: s.args || {}, why: s.why || '' },
      ),
      rationale: '',
      frozen: true,
      frozenAt: Date.now(),
    };
    this.taskDeclared = true;
    this.goalSource = 'declared';
    this.persistSession();
    return {
      goal: this.ctx.goal,
      plan: this.ctx.plan.steps.map((s) => s.tool).filter(Boolean),
      note:
        'Task frozen. Tool calls are now evaluated against it. Steps that appear only after untrusted ' +
        'content arrives are not attributable to the user and will be held or refused.',
    };
  }

  /**
   * A provisional goal, inferred from the agent's first read.
   *
   * Without a goal the destination rule still works -- it compares against the
   * spans, not the instruction -- but `mentionedInGoal` can never be true, so
   * every tier-2 destination is unattributable and the session fills with holds.
   * Most clients will not call tracer_begin_task. Most of them do, however, open
   * with a read whose arguments came from the user: the URL they were asked to
   * summarise, the file they were asked to check.
   *
   * Two constraints make this safe rather than a hole:
   *
   *   1. Only the FIRST forwarded call, and only a tier 0 or tier 1 one. The
   *      arguments of the first call were composed before any untrusted content
   *      existed in the session, which is the same argument that makes a frozen
   *      plan meaningful. Inferring from a tier-2 call would let an injected
   *      destination authorise itself, which is the whole attack.
   *   2. It is labelled inferred, everywhere, and it never becomes a plan. The
   *      frozen-plan rules stay stood down; see `hasPlan` in core/src/policy.js.
   */
  inferGoal(call) {
    if (this.ctx.goal || this.goalSource || this.log.length) return null;
    const tier = this.registry.tierOf(call.name);
    if (tier === null || tier >= 2) return null;

    const values = Object.entries(call.arguments || {})
      .filter(([k, v]) => typeof v === 'string' && v.trim() && k !== 'derived_from')
      .map(([, v]) => v.trim().slice(0, 300));
    if (!values.length) return null;

    this.ctx.goal = 'Inferred, not declared: the agent opened with ' + call.name + ' on ' + values.join(', ') + '.';
    this.goalSource = 'inferred';
    this.persistSession();
    return { goal: this.ctx.goal, source: 'inferred', from: call.name };
  }

  /** Evaluate a proposed call. Returns a core decision. */
  evaluate(call) {
    const decision = evaluate(call, this.ctx);

    if (!this.taskDeclared && this.requireTask && decision.decision === ALLOW && decision.tier > 0) {
      // Not a veto, a caveat: without a declared task there is nothing for the
      // destination rule to compare against, so an allow here is weaker than it
      // looks and must not be reported as though it were not.
      decision.explain = [
        ...decision.explain,
        'No task was declared through tracer_begin_task, so this allow rests on the tier alone. Call tracer_begin_task first to get the destination rule.',
      ];
      decision.taskUndeclared = true;
    }

    if (this.goalSource === 'inferred') {
      decision.explain = [
        ...decision.explain,
        'The goal Tracer compared this against was inferred from the first tool call, not declared: "' +
          this.ctx.goal +
          '". An inferred goal is a guess at what you asked for, and it is not a frozen plan. ' +
          'Call tracer_begin_task, or start the proxy with --goal, to replace it with your own words.',
      ];
      decision.goalSource = 'inferred';
    } else if (this.goalSource) {
      decision.goalSource = this.goalSource;
    }

    // Written before the call runs, not after. A decision recorded only on the
    // way out would be missing exactly the rows that matter: a refusal never
    // reaches an upstream server, and a crash mid-call must not lose the fact
    // that Tracer said no.
    if (this.store) {
      try {
        this.store.record(call, decision, this.ctx.secrets);
      } catch (err) {
        // The firewall does not stop working because the audit log does. Said
        // out loud, once, rather than swallowed.
        if (!this.storeFailed) {
          this.storeFailed = String((err && err.message) || err);
          process.emitWarning('tracer: decision store write failed, continuing without it: ' + this.storeFailed);
        }
      }
    }

    this.log.push({
      at: new Date().toISOString(),
      name: call.name,
      tier: decision.tier ?? this.registry.tierOf(call.name),
      decision: decision.decision,
      rule: decision.rule,
      destination: decision.destination || null,
    });
    return decision;
  }

  /**
   * Register what an upstream server returned.
   *
   * This is the step that gives Layer B anything to scan. A proxy that forwards
   * results without registering them is a proxy that will never find an
   * overlap, because it never saw the page the payload was on.
   */
  registerResult(call, result) {
    const text = textOf(result);
    if (!text) return { spans: [], report: null };

    const source = call.name + (argHint(call) ? ' ' + argHint(call) : '');

    if (!this.isUntrusted(call.name)) {
      // A tier-1 read of the user's own data: not untrusted, but the literal
      // values matter, because the engine's sharpest question is not "where is
      // this going" but "what is going there".
      for (const s of extractSecrets(text, source)) this.ctx.noteSecret(s);
      return { spans: [], report: null };
    }

    const tier = this.registry.tierOf(call.name);
    if (tier === 1) for (const s of extractSecrets(text, source)) this.ctx.noteSecret(s);

    const analysed = analyseText(text, { url: source, origin: 'mcp:' + call.name });
    const spans = this.ctx.registerSpans(analysed.spans, source);
    this.ctx.readSources.push(source);
    return { spans, report: analysed.report };
  }

  /**
   * Register the *descriptions* an upstream server published for its tools.
   *
   * A tool description is content, not configuration. It arrives over the wire
   * from a server Tracer did not write, the agent reads it before it reads
   * anything else, and it is the one string in an MCP session that is injected
   * straight into the model's context with no call having been made. A proxy
   * that forwards descriptions unexamined is a delivery vehicle for the attack
   * class it exists to stop.
   *
   * So descriptions go through the analyser and register as untrusted spans,
   * exactly as tool results do -- which also means a destination that appears
   * only in a tool description is attributable, and blockable.
   *
   * @param {Array<{name: string, description?: string}>} tools
   */
  registerToolDescriptions(tools) {
    const out = [];
    for (const tool of tools || []) {
      const text = String((tool && tool.description) || '');
      const source = 'tool-description:' + tool.name;
      if (!text.trim()) {
        out.push({ name: tool.name, source, spans: [], flagged: [], instructionLike: false });
        continue;
      }
      const analysed = analyseText(text, {
        url: source,
        origin: 'mcp-tool-description:' + tool.name,
      });
      const spans = this.ctx.registerSpans(analysed.spans, source);
      this.ctx.readSources.push(source);
      const flagged = spans.filter((s) => s.instructionLike || s.concealed);
      this.descriptionScan.push({ name: tool.name, spans: spans.length, flagged: flagged.length });
      out.push({
        name: tool.name,
        source,
        spans,
        flagged,
        instructionLike: flagged.length > 0,
        report: analysed.report,
      });
    }
    return out;
  }

  /** Keep the session row in step with what the agent has told us. */
  persistSession() {
    if (!this.store) return;
    try {
      this.store.session({
        goal: this.ctx.goal,
        goalSource: this.goalSource,
        plan: this.ctx.plan.steps.map((s) => s.tool).filter(Boolean),
        taskDeclared: this.taskDeclared,
      });
    } catch {
      /* see evaluate(): an audit-log failure is not a policy failure */
    }
  }

  recordSink(call, decision) {
    if ((decision.tier ?? 0) < 2) return;
    this.ctx.sink.push({
      tool: call.name,
      destination: decision.destination ? decision.destination.value : '',
      payload: JSON.stringify(call.arguments || {}).slice(0, 2000),
      at: this.ctx.calls.length,
    });
  }

  summary() {
    return {
      goal: this.ctx.goal || null,
      goalSource: this.goalSource,
      mode: this.taskDeclared || this.ctx.plan.steps.length ? 'plan declared' : 'degraded (no plan declared)',
      taskDeclared: this.taskDeclared,
      plan: this.ctx.plan.steps.map((s) => s.tool).filter(Boolean),
      spans: this.ctx.spans.length,
      store: this.store
        ? { path: this.store.path, session: this.store.sessionId, failed: this.storeFailed || null }
        : 'off',
      toolDescriptions: {
        scanned: this.descriptionScan.length,
        flagged: this.descriptionScan.filter((d) => d.flagged > 0).map((d) => d.name),
      },
      secrets: this.ctx.secrets.map((s) => ({ kind: s.kind, source: s.source })),
      calls: this.log,
      blocked: this.log.filter((c) => c.decision === BLOCK).length,
      held: this.log.filter((c) => c.decision === ESCALATE).length,
      allowed: this.log.filter((c) => c.decision === ALLOW).length,
    };
  }
}

/** MCP results are a content array; flatten the text parts. */
export function textOf(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  const parts = [];
  for (const item of result.content || []) {
    if (item && item.type === 'text' && item.text) parts.push(item.text);
    if (item && item.type === 'resource' && item.resource && item.resource.text) {
      parts.push(item.resource.text);
    }
  }
  if (!parts.length && result.structuredContent) {
    parts.push(JSON.stringify(result.structuredContent, null, 2));
  }
  return parts.join('\n\n');
}

function argHint(call) {
  const a = call.arguments || {};
  for (const key of ['url', 'uri', 'path', 'query', 'id', 'key', 'issue']) {
    if (typeof a[key] === 'string' && a[key]) return String(a[key]).slice(0, 120);
  }
  return '';
}
