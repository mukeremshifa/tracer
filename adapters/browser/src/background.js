// ---------------------------------------------------------------------------
// Service worker: the policy engine, once per tab.
//
// The content script sees pages. This sees decisions. It holds one run context
// per tab -- the declared task, the frozen plan, every untrusted span the
// analyser found on every page that tab has visited -- and evaluates proposed
// tool calls against it with exactly the same `evaluate()` the sandbox and the
// MCP proxy call.
//
// A tab is the right lifetime: it is what a human means by "this task", and it
// is what closes when they are done.
// ---------------------------------------------------------------------------

import { createContext, evaluate, createRegistry, BLOCK, ESCALATE } from './core.js';
import { DEFAULT_TIERS } from './tiers.js';

const registry = createRegistry({ label: 'browser', tools: DEFAULT_TIERS, defaultTier: 2 });

/** @type {Map<number, object>} tabId -> run context */
const sessions = new Map();
/** @type {Map<number, Array>} tabId -> decision log */
const logs = new Map();

function sessionFor(tabId) {
  if (!sessions.has(tabId)) {
    sessions.set(
      tabId,
      createContext({ goal: '', registry, protectedMode: true, host: { kind: 'browser', tabId } }),
    );
    logs.set(tabId, []);
  }
  return sessions.get(tabId);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  sessions.delete(tabId);
  logs.delete(tabId);
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const tabId = (sender.tab && sender.tab.id) ?? msg.tabId;

  if (msg.type === 'tracer:page-analysed') {
    const ctx = sessionFor(tabId);
    // Re-scans of the same URL replace that page's spans rather than piling up
    // duplicates: a client-side re-render is the same page, not a second one.
    ctx.spans = ctx.spans.filter((s) => s.url !== msg.url);
    ctx.registerSpans(msg.spans, msg.url);
    if (!ctx.readSources.includes(msg.url)) ctx.readSources.push(msg.url);
    setBadge(tabId, msg.report);
    respond({ ok: true, spans: ctx.spans.length });
    return true;
  }

  if (msg.type === 'tracer:begin-task') {
    const ctx = sessionFor(tabId);
    ctx.goal = String(msg.goal || '');
    ctx.plan = {
      steps: (msg.plan || []).map((s) =>
        typeof s === 'string' ? { tool: s, args: {}, why: '' } : s,
      ),
      frozen: true,
      frozenAt: Date.now(),
      rationale: '',
    };
    respond({ ok: true, goal: ctx.goal, plan: ctx.planToolNames() });
    return true;
  }

  if (msg.type === 'tracer:propose') {
    const ctx = sessionFor(tabId);
    const call = { name: msg.name, arguments: msg.arguments || {} };
    const decision = evaluate(call, ctx);
    ctx.calls.push({ name: call.name, arguments: call.arguments, decision, at: Date.now() });
    logs.get(tabId).unshift({
      at: Date.now(),
      name: call.name,
      decision: decision.decision,
      rule: decision.rule,
      headline: decision.headline,
      explain: decision.explain,
      chain: decision.chain,
    });
    if (decision.decision === BLOCK || decision.decision === ESCALATE) {
      chrome.action.setBadgeText({ tabId, text: decision.decision === BLOCK ? 'STOP' : 'HOLD' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#cdfb41' });
    }
    respond({ decision });
    return true;
  }

  if (msg.type === 'tracer:session') {
    const ctx = sessions.get(msg.tabId);
    respond({
      goal: ctx ? ctx.goal : '',
      plan: ctx ? ctx.planToolNames() : [],
      spans: ctx ? ctx.spans : [],
      concealed: ctx ? ctx.spans.filter((s) => s.concealed) : [],
      log: logs.get(msg.tabId) || [],
    });
    return true;
  }

  if (msg.type === 'tracer:reset') {
    sessions.delete(msg.tabId);
    logs.delete(msg.tabId);
    chrome.action.setBadgeText({ tabId: msg.tabId, text: '' });
    respond({ ok: true });
    return true;
  }

  return false;
});

function setBadge(tabId, report) {
  if (typeof tabId !== 'number' || !report) return;
  const n = report.concealedInstructionLike || 0;
  chrome.action.setBadgeText({ tabId, text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#cdfb41' });
}
