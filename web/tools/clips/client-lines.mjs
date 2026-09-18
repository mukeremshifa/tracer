// ---------------------------------------------------------------------------
// The client scene, turned from a captured session into a typed transcript.
//
// One module, imported by both sides so the timing cannot drift: the browser
// renderer (client.html) draws frame F, and the capture script
// (scripts/capture-client.mjs) asks plan() how many frames the clip runs. The
// content is whatever was captured in client-session.json -- the real proxy
// banner, the real tool calls, the real refusal. Nothing here invents text; it
// only lays it out and colours it.
// ---------------------------------------------------------------------------

// Characters revealed per frame, and the still hold at the very end. The type
// is a touch slower than the bash-terminal clip because it is set larger.
export const CPF = 11;
export const END_PAD = 26; // frames held on the final state

// A pause is spelled in frames and paid for in the same budget as characters,
// so the reveal stays a single linear map from frame to budget.
const pauseChars = (frames) => frames * CPF;

const short = (p) => {
  const s = String(p || '');
  const m = s.match(/[^/\\]+[/\\][^/\\]+$/); // last two path segments
  return m ? m[0].replace(/\\/g, '/') : s;
};

// Build the ordered list of items. An item is either a line ({ spans }) or a
// pause ({ pause: frames }). Spans carry a css class the renderer colours.
export function buildItems(session) {
  const items = [];
  const line = (spans) => items.push({ spans: Array.isArray(spans) ? spans : [spans] });
  const blank = () => line([{ text: '', cls: '' }]);
  const pause = (frames) => items.push({ pause: frames });

  // --- the firewall boots: the real tier table ------------------------------
  for (const raw of session.banner || []) {
    const l = raw.replace(/\s+$/, '');
    let cls = 'boot';
    if (/^tracer-proxy/.test(l)) cls = 'head';
    else if (/\bmode\b/.test(l) || /destination rule|frozen-plan|inferred/.test(l)) cls = 'dim';
    else if (/^\s*tier\s+\d/.test(l)) cls = 'tier';
    else if (/upstream|ready on stdio/.test(l)) cls = 'ok';
    // Highlight the tier digit so the table reads as a table.
    const m = l.match(/^(\s*tier\s+)(\d)(\s+)(.*)$/);
    if (m) {
      line([
        { text: m[1], cls: 'dim' },
        { text: m[2], cls: 't' + m[2] },
        { text: m[3] + m[4], cls: 'tier' },
      ]);
    } else {
      line([{ text: l, cls }]);
    }
  }
  pause(24); // let the ruleset sit -- a firewall whose rules you can read

  blank();
  line([{ text: '──────────  the client asks  ──────────', cls: 'rule' }]);
  blank();

  // --- the user's one message ----------------------------------------------
  line([{ text: '❯ ', cls: 'you' }, { text: 'you', cls: 'you' }]);
  line([{ text: session.prompt, cls: 'prompt' }]);
  pause(10);
  blank();

  // --- the agent works ------------------------------------------------------
  for (const step of session.steps || []) {
    if (step.kind === 'begin') {
      // Plan items arrive in whatever spelling the client used: mcp__tracer__…,
      // a stray tracer__ prefix, or the flattened <server>_<tool>. Strip the
      // namespaces and the upstream-server segment down to the bare tool.
      const bare = (p) => String(p)
        .replace(/^mcp__[^_]*__/, '')            // mcp__tracer__
        .replace(/^tracer__/, '')                // stray proxy prefix
        .replace(/^(?:filesystem|fetch)_/, '')   // upstream server segment
        .replace(/^_+/, '');
      const plan = (step.plan || []).map(bare).join(' → ');
      line([{ text: '⚙ ', cls: 'tool' }, { text: 'tracer_begin_task', cls: 'tool' }]);
      if (plan) line([{ text: '   plan  ', cls: 'dim' }, { text: plan, cls: 'dim' }]);
      pause(6);
      continue;
    }
    // A tool call, and the firewall's verdict beside it.
    const chip =
      step.verdict === 'BLOCK'
        ? [{ text: '   ', cls: '' }, { text: ' BLOCKED · tier ' + (step.tier ?? 2) + ' ', cls: 'chip-block' }]
        : [{ text: '   ', cls: '' }, { text: ' ALLOW · tier ' + (step.tier ?? 0) + ' ', cls: 'chip-allow' }];
    line([{ text: '→ ', cls: 'arrow' }, { text: step.name, cls: 'tool' }, { text: '  ' + short(step.arg), cls: 'arg' }, ...chip]);
    if (step.rule) line([{ text: '   ', cls: '' }, { text: step.rule, cls: step.verdict === 'BLOCK' ? 'rule-block' : 'dim' }]);

    if (step.verdict === 'BLOCK' && step.refusal && step.refusal.length) {
      pause(20); // hold the moment the write is stopped
      blank();
      for (const r of step.refusal) {
        const head = /^REFUSED by Tracer/.test(r);
        const chainHead = /^Provenance chain:/.test(r);
        line([
          { text: '▌ ', cls: 'bar' },
          { text: r, cls: head ? 'refuse-head' : chainHead ? 'refuse-head' : 'refuse' },
        ]);
      }
      pause(40); // the hero hold
      blank();
    } else {
      pause(5);
    }
  }

  // --- the agent tells the user, in its own words ---------------------------
  if (session.closing) {
    blank();
    line([{ text: '❯ ', cls: 'model' }, { text: 'claude', cls: 'model' }]);
    for (const para of session.closing.split(/\n+/)) line([{ text: para, cls: 'model' }]);
  }
  pause(END_PAD);

  return items;
}

// Visible-character cost of one item (a newline counts as one).
function itemChars(it) {
  if (it.pause) return pauseChars(it.pause);
  return it.spans.reduce((n, s) => n + s.text.length, 0) + 1;
}

export function totalBudget(items) {
  return items.reduce((n, it) => n + itemChars(it), 0);
}

export function plan(session) {
  const items = buildItems(session);
  return Math.ceil(totalBudget(items) / CPF) + END_PAD;
}

// The lines visible at frame F: every fully-revealed text line, plus the one
// mid-type carrying a cursor. Pauses consume budget and emit nothing. The
// renderer takes it from here and handles the scroll.
export function revealed(items, F) {
  let budget = F * CPF;
  const out = [];
  for (const it of items) {
    if (budget <= 0) break;
    if (it.pause) { budget -= pauseChars(it.pause); continue; }
    const full = it.spans.reduce((n, s) => n + s.text.length, 0);
    if (budget >= full + 1) {
      out.push({ spans: it.spans, typing: false });
      budget -= full + 1;
    } else {
      // Partway through this line: reveal span by span up to the budget.
      let left = budget;
      const shown = [];
      for (const s of it.spans) {
        if (left <= 0) break;
        const take = Math.min(s.text.length, left);
        shown.push({ text: s.text.slice(0, take), cls: s.cls });
        left -= take;
      }
      out.push({ spans: shown, typing: true });
      budget = 0;
      break;
    }
  }
  return out;
}
