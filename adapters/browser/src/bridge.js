// ---------------------------------------------------------------------------
// window.tracer — the page-world API a browser agent calls.
//
// A content script lives in an isolated world, so an agent running in the page
// cannot reach it directly. This module runs in the page world and relays
// through postMessage.
//
// Scope, honestly: an agent has to be willing to ask. This works against
// Tracer's own sandbox agent, against an agent you are building, and against
// any open browser agent whose tool-call path you can intercept. It cannot sit
// inside a closed product like Comet: there is no supported way to intercept
// another extension's privileged tool calls, and pretending otherwise would be
// the exact kind of claim Tracer exists to argue against.
// ---------------------------------------------------------------------------

const pending = new Map();
let seq = 0;

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.tracer !== 'response') return;
  const resolve = pending.get(event.data.id);
  if (!resolve) return;
  pending.delete(event.data.id);
  resolve(event.data.response);
});

function call(op, payload) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    window.postMessage({ tracer: 'request', id, op, payload: payload || {} }, '*');
  });
}

const api = {
  /**
   * Declare the task and freeze a plan, before reading anything. Everything
   * after this is evaluated against it.
   */
  beginTask(goal, plan) {
    return call('begin-task', { goal, plan: plan || [] });
  },

  /**
   * Propose a tool call. Returns a decision; act on it.
   *   { decision: 'allow' | 'escalate' | 'block', rule, headline, explain, chain }
   * Tracer does not execute anything — the agent still owns its own tools. What
   * it owns is the answer to "should this run, and what is it derived from".
   */
  async propose(name, args) {
    const { decision } = await call('propose', { name, arguments: args || {} });
    return decision;
  },

  /** Convenience: propose, and throw the refusal if it is not allowed. */
  async guard(name, args) {
    const decision = await api.propose(name, args);
    if (decision.decision !== 'allow') {
      const err = new Error(decision.headline);
      err.tracer = decision;
      throw err;
    }
    return decision;
  },

  version: '1.0.0',
};

Object.defineProperty(window, 'tracer', { value: Object.freeze(api), configurable: false });
window.dispatchEvent(new CustomEvent('tracer:ready'));
