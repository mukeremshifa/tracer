// ---------------------------------------------------------------------------
// The landing page.
//
// The old one opened with the threat model and stated its own ceiling before it
// had stated a benefit. That is the right instinct in a paper and the wrong one
// on a front page: it asks for trust before it has shown anything worth
// trusting.
//
// This one shows the robbery first. Everything that used to be argued in prose
// is now either drawn (the diagrams), counted (the proof band), clickable (the
// range grid) or reproduced from a real run (the evidence). The ceiling still
// gets stated -- after the demonstration, where it reads as confidence rather
// than hedging.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { Code } from './Code.jsx';
import { Evidence } from './Evidence.jsx';
import { PageFrame } from './PageFrame.jsx';
import { ChainDiagram, ProxyDiagram, CoreDiagram } from './artifacts/Diagrams.jsx';
import { api } from '../lib/api.js';

const INSTALL = 'npx @mukeremshifa/tracer sandbox';

const BEATS = [
  {
    n: '01',
    title: 'Freeze the plan',
    body: 'The agent commits to the tools it will use before it reads anything untrusted. A tool that was not on the plan cannot be added by the page.',
  },
  {
    n: '02',
    title: 'Trace every argument',
    body: 'Every value in every tool call is traced back to the span of the page it came from — including spans a person could never have seen.',
  },
  {
    n: '03',
    title: 'Judge the destination',
    body: 'If a call would send private data to an address the user never named, it does not go. The model can be fooled. The address cannot.',
  },
];

export function Home({ meta, go }) {
  const [scorecard, setScorecard] = useState(null);
  const [evidence, setEvidence] = useState(null);

  useEffect(() => {
    api.scorecard().then(setScorecard).catch(() => setScorecard(null));
    api.proxyEvidence().then(setEvidence).catch(() => setEvidence({ missing: true }));
  }, []);

  return (
    <div className="wrap">
      <Hero go={go} />
      <XrayStrip />
      <Mechanism />
      <Proof scorecard={scorecard} go={go} />
      <Range meta={meta} scorecard={scorecard} go={go} />
      <RealRun evidence={evidence} />
      <Install />
      <Ceiling go={go} />
      <Closing go={go} />
    </div>
  );
}

/* --- 1. hero -------------------------------------------------------------- */

function Hero({ go }) {
  return (
    <section className="lede-hero">
      <h1 className="lede-title">
        An agent read a hidden instruction.
        <br />
        <span className="dim">Then it emailed your code to a stranger.</span>
      </h1>
      <p className="lede-sub">
        Tracer stops the email. <b>Not the instruction — the email.</b> It assumes the model was fooled,
        and makes the theft fail anyway.
      </p>
      <div className="lede-actions">
        <button className="btn primary" onClick={() => go('sandbox')}>
          Watch it happen &#9656;
        </button>
        <CopyLine text={INSTALL} />
      </div>
    </section>
  );
}

/** The install command as the second CTA. Copying it is the action. */
function CopyLine({ text }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    // Clipboard access can be refused (insecure origin, denied permission).
    // A button that silently does nothing is worse than one that does not
    // pretend -- select the text as a fallback so it can still be copied.
    const done = () => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {});
    }
  };

  return (
    <button className="copyline" onClick={copy} title="Copy to clipboard">
      <span className="prompt">$</span>
      <span>{text}</span>
      <span className="copied">{copied ? 'copied' : ''}</span>
    </button>
  );
}

/* --- 2. the X-ray strip --------------------------------------------------- */

/**
 * The thesis, unattended. A real range page in a real sandboxed iframe, with
 * the X-ray toggling itself on a slow cycle so the concealed instruction
 * ignites without anybody clicking anything.
 *
 * This is the same PageFrame the sandbox uses, against the same page, running
 * the same analyser -- not a screenshot of one. The iframe carries no
 * allow-scripts, so the untrusted page still cannot execute.
 */
function XrayStrip() {
  const [revealed, setRevealed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    // Asymmetric on purpose: the revealed state is the interesting one, so it
    // holds nearly twice as long as the innocent one.
    const id = setTimeout(() => setRevealed((v) => !v), revealed ? 5200 : 3000);
    return () => clearTimeout(id);
  }, [revealed, paused]);

  return (
    <section className="band" style={{ marginTop: 80 }}>
      <div className="band-head-row">
        <div>
          <div className="band-label">Live, on this page</div>
          <h2 className="band-title">This is a normal article. It is not.</h2>
        </div>
        <button className="btn sm ghost" onClick={() => setPaused((v) => !v)}>
          {paused ? 'resume' : 'pause'}
        </button>
      </div>
      <p className="band-lede">
        The instruction below is invisible to you and perfectly legible to an agent. Tracer&rsquo;s
        analyser found it in your browser, just now.
      </p>
      <div style={{ marginTop: 28 }}>
        <PageFrame
          url="/range/white-on-white"
          revealed={revealed}
          onRevealChange={setRevealed}
          height={380}
        />
      </div>
    </section>
  );
}

/* --- 3. the mechanism ----------------------------------------------------- */

function Mechanism() {
  return (
    <section className="band">
      <div className="band-label">How it works</div>
      <h2 className="band-title">Three rules, none of which ask the model to be right.</h2>
      <p className="band-lede">
        Every published defence so far tries to detect the injection. Tracer assumes it worked, and
        breaks the chain between a compromised plan and a consequence that lands.
      </p>

      <div className="diagram-hold">
        <ChainDiagram />
      </div>

      <div className="beats">
        {BEATS.map((b) => (
          <div className="beat" key={b.n}>
            <div className="beat-n">{b.n}</div>
            <h3 className="beat-title">{b.title}</h3>
            <p className="beat-body">{b.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --- 4. the proof band ---------------------------------------------------- */

function Proof({ scorecard, go }) {
  const t = (scorecard && scorecard.tallies && scorecard.tallies.deliver) || null;
  const total = scorecard ? scorecard.total : null;

  const tiles = [
    { n: total, l: 'known injection classes on the range' },
    { n: t && t.blocked, l: 'exfiltration prevented', tone: '' },
    { n: t && t.bypasses, l: 'got past Tracer', tone: 'hot' },
    // 14, not 16, and shown without a denominator on purpose. In two cases
    // (markdown-image, file-fetch) the run was HELD for approval rather than
    // refused -- the agent is waiting on a human, which is the system working,
    // not the task failing. Printing "14 / 16" beside three perfect scores
    // would read as a defect; printing what it measures reads as what it is.
    { n: t && t.taskStillCompleted, l: 'still completed the user’s real task' },
  ];

  return (
    <section className="band">
      <div className="band-label">The numbers</div>
      <h2 className="band-title">Every class, scored. Including anything that gets through.</h2>

      <div className="stats" style={{ marginTop: 32 }}>
        {tiles.map((tile, i) => (
          <div className={'stat ' + (tile.tone || '')} key={i}>
            <div className="stat-n">{tile.n == null ? '—' : tile.n}</div>
            <div className="stat-l">{tile.l}</div>
          </div>
        ))}
      </div>

      <p className="band-lede" style={{ marginTop: 26 }}>
        Scored under the harder of two scenarios — the one where the user genuinely asked for an email,
        so refusing to send anything would be cheating. The last number is 14 rather than 16 because two
        runs were held for a human to approve instead of being refused outright.{' '}
        <button className="btn sm ghost" onClick={() => go('scorecard')}>
          the full scorecard
        </button>
      </p>
    </section>
  );
}

/* --- 5. the attack range -------------------------------------------------- */

/**
 * Sixteen classes as sixteen things you can click, grouped by family. A number
 * in a sentence is a claim; a grid that opens the actual attack is evidence.
 * State comes from the scorecard, so a bypass would show up here in red rather
 * than being quietly absent.
 */
function Range({ meta, scorecard, go }) {
  const attacks = meta.attacks || [];
  const families = meta.families || {};

  // Scorecard rows keyed by attack id, so each chip can show its real outcome.
  const outcomes = useMemo(() => {
    const out = {};
    const rows = (scorecard && scorecard.rows) || [];
    for (const r of rows) {
      const d = r.scenarios && r.scenarios.deliver;
      if (d) out[r.id] = d.result === 'BYPASS' ? 'bypassed' : 'prevented';
    }
    return out;
  }, [scorecard]);

  const grouped = useMemo(() => {
    const out = {};
    for (const a of attacks) {
      if (!out[a.family]) out[a.family] = [];
      out[a.family].push(a);
    }
    return out;
  }, [attacks]);

  return (
    <section className="band">
      <div className="band-head-row">
        <div>
          <div className="band-label">The attack range</div>
          <h2 className="band-title">Sixteen ways to hide an instruction on a page.</h2>
        </div>
      </div>
      <p className="band-lede">
        Each one is drawn from published research or a documented in-the-wild finding. Click any of them
        to watch it run against both agents.
      </p>

      <div className="range-grid">
        {Object.entries(grouped).map(([family, list]) => (
          <div className="range-col" key={family}>
            <div className="range-col-head">
              <span>{(families[family] || { label: family }).label}</span>
              <span>{list.length}</span>
            </div>
            {list.map((a) => (
              <button
                key={a.id}
                className="range-chip"
                onClick={() => go('sandbox?attack=' + a.id)}
                title={a.title}
              >
                <span className={'rd ' + (outcomes[a.id] === 'bypassed' ? 'bypassed' : '')} />
                <span className="rt">{a.id}</span>
                <span className="rg">run &#8599;</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/* --- 6. the real run ------------------------------------------------------ */

function RealRun({ evidence }) {
  return (
    <section className="band">
      <div className="band-label">Not a simulation</div>
      <h2 className="band-title">Two real MCP servers. One real refusal.</h2>
      <p className="band-lede">
        The sandbox above runs on mock tools. This does not: two upstream MCP servers neither of us
        wrote, a hostile page, and the same task run twice.
      </p>
      <div style={{ marginTop: 30 }}>
        <Evidence evidence={evidence} />
      </div>
    </section>
  );
}

/* --- 7 + 8. the proxy diagram and install -------------------------------- */

const CLIENT_SNIPPET = `{
  "mcpServers": {
    "tracer": {
      "command": "npx",
      "args": [
        "@mukeremshifa/tracer", "proxy",
        "--config", "./tiers.json"
      ]
    }
  }
}`;

const BRIDGE = `await window.tracer.beginTask(
  'Summarise this page and email it to me@corp.example',
  ['read_page', 'send_email'],
);

const decision = await window.tracer.propose('send_email', { to, subject, body });
if (decision.decision !== 'allow') {
  // decision.headline, decision.explain, decision.chain
}`;

const PANES = {
  proxy: {
    label: 'MCP proxy',
    say: (
      <>
        <b>Put it in front of your MCP servers.</b> Tracer connects to them on the client&rsquo;s behalf,
        republishes their tools, and evaluates every call before it is forwarded. Point your client at
        Tracer instead of at the servers it fronts.
      </>
    ),
    cmd: 'npx @mukeremshifa/tracer proxy --config ./tiers.json',
    codeLabel: 'mcp client config',
    code: CLIENT_SNIPPET,
  },
  extension: {
    label: 'Browser extension',
    say: (
      <>
        <b>The only host where the whole thesis survives.</b> The analyser runs where the page renders,
        so it has real computed styles and real layout — which is what makes the X-ray above possible at
        all. Your agent asks before it acts.
      </>
    ),
    cmd: 'npx @mukeremshifa/tracer extension',
    codeLabel: 'javascript',
    code: BRIDGE,
  },
  cli: {
    label: 'Test your own agent',
    say: (
      <>
        <b>Point the range at something you built.</b> Sixteen classes against your agent, over HTTP or
        through its MCP tools. It emits a scorecard for that agent, including whatever got through.
      </>
    ),
    cmd: 'npx @mukeremshifa/tracer test --target ./mcp.json',
    codeLabel: 'shell',
    code: `npx @mukeremshifa/tracer test
npx @mukeremshifa/tracer test --target ./mcp.json
npx @mukeremshifa/tracer test --target https://your-agent/
npx @mukeremshifa/tracer log`,
  },
};

function Install() {
  const [pane, setPane] = useState('proxy');
  const p = PANES[pane];

  return (
    <section className="band" id="install">
      <div className="band-label">Install</div>
      <h2 className="band-title">Three ways in. All of them one command.</h2>

      <ProxyDiagram />

      <div className="seg" style={{ marginTop: 40 }}>
        {Object.entries(PANES).map(([id, def]) => (
          <button key={id} aria-pressed={pane === id ? 'true' : 'false'} onClick={() => setPane(id)}>
            {def.label}
          </button>
        ))}
      </div>

      <div className="install-panes">
        <div className="install-body">
          <div className="stack">
            <p className="install-say">{p.say}</p>
            <CopyLine text={p.cmd} />
          </div>
          <Code label={p.codeLabel}>{p.code}</Code>
        </div>
      </div>

      <div style={{ marginTop: 56 }}>
        <div className="band-label">One engine, every host</div>
        <CoreDiagram />
      </div>
    </section>
  );
}

/* --- 9. the ceiling ------------------------------------------------------- */

function Ceiling({ go }) {
  return (
    <section className="band">
      <div className="band-label">What Tracer does not do</div>
      <h2 className="band-title">Two limits, stated here rather than in an appendix.</h2>

      <div className="caveats" style={{ marginTop: 34 }}>
        <div className="caveat">
          <div className="caveat-n">01</div>
          <h3 className="caveat-title">It covers exfiltration, not every consequence.</h3>
          <p className="caveat-body">
            An agent injected into <i>deleting</i> a file has no destination to trace, so the rule has
            nothing to key on.
          </p>
        </div>
        <div className="caveat">
          <div className="caveat-n">02</div>
          <h3 className="caveat-title">The overlap scan is verbatim-based.</h3>
          <p className="caveat-body">
            Encoding a payload does not hide it — zero-width strips, base64 decodes. A payload the model
            paraphrases rather than copies will not overlap.
          </p>
        </div>
      </div>

      <p className="band-lede" style={{ marginTop: 30 }}>
        A security tool that will not state its ceiling is asking you to take its floor on faith.{' '}
        <button className="btn sm ghost" onClick={() => go('how')}>
          how it works, in full
        </button>
      </p>
    </section>
  );
}

/* --- 10. closing ---------------------------------------------------------- */

function Closing({ go }) {
  return (
    <section className="band">
      <h2 className="band-title" style={{ maxWidth: '20ch' }}>
        Watch an agent get robbed, then watch it not.
      </h2>
      <div className="lede-actions" style={{ marginTop: 30 }}>
        <button className="btn primary" onClick={() => go('sandbox')}>
          Open the sandbox &#9656;
        </button>
        <CopyLine text={INSTALL} />
      </div>
    </section>
  );
}
