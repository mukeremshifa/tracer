// ---------------------------------------------------------------------------
// The landing.
//
// A visitor who reads nothing but the headings should be able to say what
// Tracer is, what it protects against, and how they would put it in front of
// their own agent. Everything else on this page is in service of that.
//
// The two caveats live here rather than in a footnote on purpose. Stating the
// ceiling is the credibility, and a ceiling stated on page four is a ceiling
// nobody read.
// ---------------------------------------------------------------------------

import { Code } from './Code.jsx';

// The tagline is the heading and the product name is the subtitle, not the other
// way round. A first-time visitor needs to know what the card lets them do
// before they need to know what we call it.
const SURFACES = [
  {
    id: 'sandbox',
    n: '01',
    name: 'Sandbox',
    tagline: 'Try it.',
    body:
      'A mock agent, a mock inbox and a local attack range. Watch an unprotected agent get robbed, then watch the same robbery fail — without wiring anything up, and with no API key.',
    cmd: 'npx tracer sandbox',
    to: '#sandbox',
    cta: 'Open the sandbox',
  },
  {
    id: 'range',
    n: '02',
    name: 'Range',
    tagline: 'Test your agent.',
    body:
      'Sixteen known injection classes pointed at whatever agent you configure — over HTTP, or through its MCP tools. It emits a scorecard for that agent, including whatever got through.',
    cmd: 'npx tracer test --target ./mcp.json',
    to: '#scorecard',
    cta: 'See a scorecard',
  },
  {
    id: 'proxy',
    n: '03',
    name: 'Proxy',
    tagline: 'Protect your agent.',
    body:
      'An MCP proxy that evaluates every forwarded tool call through the same policy engine, and a browser extension that does it in the page — where the X-ray works.',
    cmd: 'npx tracer proxy --config ./tiers.json',
    to: '#proxy',
    cta: 'Wire it up',
  },
];

export function Home({ meta, go }) {
  return (
    <div className="wrap stack home">
      {/* --- 1. the problem ---------------------------------------------- */}
      <section className="hero">
        <h1 className="title hero-title">
          An agent that browses reads untrusted content, and then acts.
        </h1>
        <p className="lede hero-lede">
          Anyone who can get text onto a page an agent reads &mdash; invisible text, an HTML comment, a
          product review &mdash; can issue instructions it follows as if the user had typed them. The agent
          has the user&rsquo;s credentials and the user&rsquo;s trust. The attacker needs neither.
        </p>
        <p className="lede hero-lede">
          A 2026 study found not a single attack scenario was consistently blocked across leading agents.
          The Cloud Security Alliance documented indirect prompt injection being exploited in the wild in
          April 2026, and the Brave researchers demonstrated it end to end against a shipping browser agent.
          This is not a hypothetical class.
        </p>
      </section>

      {/* --- 2. the claim ------------------------------------------------- */}
      <section>
        <div className="panel-head">
          <span className="panel-title">What Tracer claims</span>
        </div>
        <div className="claim claim-lg">{meta.claim}</div>
        <p className="lede" style={{ marginTop: 22 }}>
          <b>We do not claim to stop prompt injection. Nobody has.</b> Tracer assumes the injection succeeds
          at fooling the model, and makes it fail at producing an effect &mdash; while showing the human
          exactly where the instruction came from. We publish the attacks that get past us.
        </p>
      </section>

      {/* --- 3. the three surfaces ---------------------------------------- */}
      <section>
        <div className="panel-head">
          <span className="panel-title">Three surfaces, one codebase</span>
        </div>
        <div className="surfaces">
          {SURFACES.map((s) => (
            <div className="surface" key={s.id}>
              <div className="surface-n mono">{s.n}</div>
              <h3 className="surface-name">{s.tagline}</h3>
              <div className="surface-tag">{s.name}</div>
              <p className="surface-body">{s.body}</p>
              <div className="surface-cmd mono">{s.cmd}</div>
              <button
                className="btn sm"
                onClick={() => go(s.to.replace('#', ''))}
                style={{ marginTop: 18, alignSelf: 'flex-start' }}
              >
                {s.cta}
              </button>
            </div>
          ))}
        </div>
        <p className="small faint" style={{ marginTop: 22, maxWidth: '72ch' }}>
          Tracer is not published to npm. Clone the repo, run{' '}
          <span className="mono">npm install</span>, and <span className="mono">npx tracer</span> resolves
          through the repo&rsquo;s own bin entry. Nothing here needs an API key: the default model provider
          is deterministic. The MCP proxy has been run end to end against real MCP servers; the browser
          extension loads unpacked, from this repo.
        </p>
      </section>

      {/* --- 4. the core contract ----------------------------------------- */}
      <section>
        <div className="panel-head">
          <span className="panel-title">One host-agnostic core</span>
        </div>
        <p className="lede">
          <span className="mono">@tracer/core</span> is the engine: capability tiers, the destination rule,
          the overlap scan, the plan-then-execute loop, the analyser. It knows nothing about Express, about
          mock inboxes, or about what a &ldquo;tool&rdquo; is. Every host asks it the same question and gets
          back the same answer.
        </p>
        <CoreDiagram />
        <p className="small muted" style={{ maxWidth: '72ch', marginTop: 20 }}>
          The split that drives everything: <b>the analyser needs a DOM, the policy engine does not.</b> In
          the browser the analyser has real computed styles and real layout, so visibility analysis and the
          X-ray work. In the MCP proxy there is no rendering engine, so core reports{' '}
          <span className="mono">visibilityAware: false</span> rather than letting an absence read as a
          clean bill of health. Zero-width and base64 payloads decode either way &mdash; those are
          properties of the bytes.
        </p>
      </section>

      {/* --- 5. the ceiling ----------------------------------------------- */}
      <section>
        <div className="panel-head">
          <span className="panel-title">What Tracer does not do</span>
        </div>
        <div className="caveats">
          <div className="caveat">
            <div className="caveat-n mono">01</div>
            <h3 className="caveat-title">The destination rule covers exfiltration, one consequence class.</h3>
            <p className="caveat-body">
              It does nothing about an agent injected into <i>deleting</i> files or <i>approving</i> a
              transaction. There is no destination to trace, so there is nothing for the rule to key on.
            </p>
          </div>
          <div className="caveat">
            <div className="caveat-n mono">02</div>
            <h3 className="caveat-title">The overlap scan is verbatim-based.</h3>
            <p className="caveat-body">
              It normalises first &mdash; zero-width characters stripped, base64 decoded &mdash; so encoding
              the payload does not hide it. But a payload the model <i>paraphrases</i> rather than copies
              will not overlap.
            </p>
          </div>
        </div>
        <div className="notice" style={{ marginTop: 28 }}>
          These are on the front page rather than in an appendix deliberately. A security tool that will not
          state its ceiling is asking you to take its floor on faith.{' '}
          <button className="btn sm ghost" onClick={() => go('how')}>
            how it works, in full
          </button>
        </div>
      </section>

      {/* --- the commands ------------------------------------------------- */}
      <section>
        <div className="panel-head">
          <span className="panel-title">From a clone</span>
        </div>
        <Code label="shell">{`git clone <repo> && cd tracer
npm install

npx tracer sandbox                      # try it
npx tracer test                         # the range, against the built-in mock
npx tracer test --target ./mcp.json     # ...against your agent
npx tracer proxy --config ./tiers.json  # protect your agent
npx tracer extension                    # build the unpacked extension`}</Code>
      </section>
    </div>
  );
}

/**
 * The core contract: three hosts in, one decision out. The ASCII version in
 * README.md §Architecture is the reference; this is the same picture.
 */
function CoreDiagram() {
  const hosts = ['sandbox', 'MCP proxy', 'extension'];
  return (
    <div className="diagram" role="img" aria-label="sandbox, MCP proxy and extension all call @tracer/core evaluate(call, ctx), which returns a decision and a provenance chain">
      <svg viewBox="0 0 900 220" preserveAspectRatio="xMidYMid meet">
        {hosts.map((h, i) => {
          const y = 50 + i * 60;
          return (
            <g key={h}>
              <text x="0" y={y + 5} className="d-host">
                {h}
              </text>
              <path d={`M 130 ${y} L 300 ${y} L 300 110 L 330 110`} className="d-wire" />
            </g>
          );
        })}

        <rect x="335" y="62" width="300" height="96" className="d-box" />
        <text x="360" y="100" className="d-box-title">
          @tracer/core
        </text>
        <text x="360" y="128" className="d-box-sub">
          evaluate(call, ctx)
        </text>

        <path d="M 635 110 L 700 110" className="d-wire" />
        <text x="712" y="104" className="d-out">
          decision
        </text>
        <text x="712" y="126" className="d-out">
          + provenance chain
        </text>
      </svg>
    </div>
  );
}
