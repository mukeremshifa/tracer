// ---------------------------------------------------------------------------
// #proxy — how you put Tracer in front of a real agent.
//
// Every snippet on this page is either read off disk (/api/integration) or
// quoted from adapters/mcp/README.md. Nothing here is aspirational copy.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Code } from './Code.jsx';
import { api } from '../lib/api.js';

const CLIENT_SNIPPET = `{
  "mcpServers": {
    "tracer": {
      "command": "node",
      "args": [
        "/path/to/tracer/adapters/mcp/bin/tracer-proxy.mjs",
        "--config",
        "/path/to/my.tiers.json"
      ]
    }
  }
}`;

export function Proxy({ go }) {
  const [integration, setIntegration] = useState(null);
  const [evidence, setEvidence] = useState(null);

  useEffect(() => {
    api.integration().then(setIntegration).catch(() => setIntegration({}));
    // The proof-of-life run, if one has been made in this checkout. A missing
    // artifact is reported as missing: the alternative is a page that claims an
    // outcome nobody produced.
    api.proxyEvidence().then(setEvidence).catch(() => setEvidence({ missing: true }));
  }, []);

  const tiers = integration && integration.mcp && integration.mcp.tiers;

  return (
    <div className="wrap narrow stack">
      <div>
        <div className="surface-tag" style={{ marginBottom: 14 }}>Protect your agent</div>
        <h1 className="title">The MCP proxy</h1>
        <p className="lede">
          A provenance firewall between an agent and its MCP servers. You point a client at Tracer instead
          of at the real servers. Tracer connects to them on the client&rsquo;s behalf, republishes their
          tools as <span className="mono">&lt;server&gt;.&lt;tool&gt;</span>, and puts every call through
          the same policy engine the sandbox uses.
        </p>
        <p className="small muted">
          This adapter has been run end to end against real MCP servers. The run is below, in full, from
          the startup banner to the refusal as the client received it.
        </p>
      </div>

      <Pipeline />

      <Evidence evidence={evidence} />

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Install and run</span>
        </div>
        <div className="panel-body stack">
          <Code label="shell">{`npm install
npx tracer proxy --config ./tiers.json`}</Code>
          <p className="small faint" style={{ margin: 0 }}>
            Repo-local. Tracer is not published to npm, so these run from a clone; the equivalent direct
            invocation is{' '}
            <span className="mono">node adapters/mcp/bin/tracer-proxy.mjs --config ./tiers.json</span>. Every
            run prints the resolved tiering for every tool it found, to stderr, at startup &mdash; a
            firewall whose rules you cannot see is a firewall you cannot trust.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Wire it into your client</span>
        </div>
        <div className="panel-body stack">
          <p className="lede" style={{ margin: 0 }}>
            In the client&rsquo;s MCP server list, in place of the servers it fronts:
          </p>
          <Code label="mcp client config (json)">{CLIENT_SNIPPET}</Code>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Tiering</span>
        </div>
        <div className="panel-body stack">
          <p className="lede" style={{ margin: 0 }}>
            Tiers are the one judgment Tracer cannot make for you: only you know whether{' '}
            <span className="mono">filesystem.write_file</span> writes to a scratch directory or a shared
            drive. Three of them:
          </p>

          <table className="grid">
            <thead>
              <tr>
                <th>tier</th>
                <th>name</th>
                <th>rule</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mono">0</td>
                <td className="mono">inert</td>
                <td className="small muted">reads untrusted content, changes nothing</td>
              </tr>
              <tr>
                <td className="mono">1</td>
                <td className="mono">private read</td>
                <td className="small muted">touches the user&rsquo;s private data</td>
              </tr>
              <tr>
                <td className="mono">2</td>
                <td className="mono">external act</td>
                <td className="small muted">can move information out of the user&rsquo;s control</td>
              </tr>
            </tbody>
          </table>

          <div className="claim">
            <span className="mono">destination</span> names the argument that decides <b>where</b> a call
            lands. It is the only field the hard block keys on &mdash; the most important line in the file.
            Omit it and Tracer guesses from conventional argument names (<span className="mono">to</span>,{' '}
            <span className="mono">recipient</span>, <span className="mono">url</span>,{' '}
            <span className="mono">channel</span>, <span className="mono">path</span>) and marks the guess
            as a guess in the decision.
          </div>

          {tiers ? (
            <Code label={(integration.mcp && integration.mcp.tiersPath) || 'tiers.json'} maxHeight={420}>
              {tiers}
            </Code>
          ) : (
            <div className="empty">loading the starter config</div>
          )}

          <p className="small faint" style={{ margin: 0 }}>
            Keys are republished names. Globs are allowed; exact names win.{' '}
            <span className="mono">defaultTier: 2</span> means a tool nobody configured still runs and is
            still policed. Set it to <span className="mono">null</span> to fail closed on existence instead
            &mdash; safer, and it will break the agent the next time an upstream ships a new tool.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">What you get, and what you do not</span>
        </div>
        <div className="panel-body">
          <div className="two-col">
            <div>
              <div className="col-label">Applies here</div>
              <ul className="plain">
                <li>
                  <b>Tool results are registered as untrusted content.</b> A fetched page, a Jira ticket, a
                  Slack thread &mdash; each is split into numbered spans and added to the run context, so
                  the overlap scan has something to scan.
                </li>
                <li>
                  <b>Tool descriptions are registered too.</b> A description is content: it comes from a
                  server we did not write and reaches the model before any call is made. Scanned at{' '}
                  <span className="mono">listTools</span> time, so a destination that appears only in a
                  tool description is refused &mdash; and a description that reads as instructions is
                  republished fenced and named as content, not passed through.
                </li>
                <li>
                  <b>The destination rule.</b> A tier-2 call whose destination appears nowhere in the
                  declared task, and does appear in content a tool returned, is hard-blocked.
                </li>
                <li>
                  <b>Every decision is written down.</b> A SQLite file beside the config, via{' '}
                  <span className="mono">node:sqlite</span>; read it with{' '}
                  <span className="mono">npx tracer log</span>. Secret values are masked before they are
                  stored &mdash; an audit log that keeps the passcode it was protecting is a new
                  vulnerability with a reassuring name.
                </li>
                <li>
                  <b>A refusal explains itself.</b> Blocked calls come back as an MCP error whose text is
                  the decision and the provenance chain behind it &mdash; which span, from which source,
                  carrying what.
                </li>
                <li>
                  <b>Zero-width and base64 payloads decode</b> before scanning. Those are properties of the
                  bytes, not of the layout.
                </li>
              </ul>
            </div>
            <div>
              <div className="col-label">Does not apply here</div>
              <ul className="plain">
                <li>
                  <b>No visibility analysis. No X-ray.</b> Whether a human could have <i>seen</i> a piece of
                  text is a question only a rendering engine can answer, and a proxy does not have one.
                </li>
                <li>
                  White-on-white text, <span className="mono">display: none</span>, zero-sized boxes,
                  off-screen positioning &mdash; none of those flags exist on this path.
                </li>
                <li>
                  Core reports <span className="mono">visibilityAware: false</span> on every span store it
                  builds here, rather than letting the absence read as a clean bill of health.
                </li>
                <li>
                  If you want the X-ray, you want the browser adapter.{' '}
                  <button className="btn sm ghost" onClick={() => go('extension')}>
                    the extension
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">The honest limitation: the plan needs the agent&rsquo;s cooperation</span>
        </div>
        <div className="panel-body stack">
          <p className="lede" style={{ margin: 0 }}>
            The frozen plan is one of the two controls that catch an injected step, and the proxy does not
            drive the agent, so it cannot force the plan to exist. It offers a tool instead:
          </p>
          <Code label="tools the proxy adds">{`tracer_begin_task(goal, plan)   call it first, before reading anything
tracer_status()                 what Tracer has seen so far`}</Code>
          <p className="lede" style={{ margin: 0 }}>
            When an agent calls <span className="mono">tracer_begin_task</span>, everything works as
            designed: later calls are checked against the frozen plan and the declared goal.
          </p>

          {/* The fix comes before the problem it solves. It used to sit in a
              muted paragraph underneath, which is the wrong order for the one
              thing a reader can act on. */}
          <div className="notice info">
            <b>Most clients will never call it.</b> Declare the task out of band instead &mdash; the right
            answer for a single-purpose agent, and one line:
            <div className="mono" style={{ marginTop: 8 }}>
              --goal &quot;Summarise the ticket and email it to me@corp.example&quot;
            </div>
            <div className="small" style={{ marginTop: 8 }}>
              Or a <span className="mono">goal</span> field in the tier config. Either way the destination
              rule keeps working for anything that appears in tool output, because that part depends on the
              spans rather than on the plan.
            </div>
          </div>

          <div className="notice">
            <b>And when neither happens, Tracer degrades rather than escalating everything.</b> With no plan
            declared, the frozen-plan rules stand down and say so in every decision; tier-1 reads are
            allowed, because holding every read behind a human is how a firewall gets switched off; and a
            goal is inferred from the agent&rsquo;s first read and labelled <i>inferred</i> wherever it is
            relied on. What does <b>not</b> relax is the destination rule: it compares a destination against
            the untrusted spans it could have come from, which needs neither a plan nor a goal. A
            destination that came from fetched content and appears nowhere else is still refused outright.
          </div>

          <p className="small muted" style={{ margin: 0 }}>
            The startup banner names which mode it is in, every time. This is the noise budget being spent
            where it buys something: the holds that remain are the ones where the absence of a goal is what
            created the ambiguity, not every call in the session.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Two caveats that apply everywhere Tracer runs</span>
        </div>
        <div className="panel-body stack small muted">
          <div>
            <b>The destination rule covers exfiltration, one consequence class.</b> It does nothing about an
            agent injected into deleting files or approving a transaction &mdash; there is no destination to
            trace.
          </div>
          <div>
            <b>The overlap scan is verbatim-based.</b> A payload the model paraphrases rather than copies
            will not overlap.
          </div>
        </div>
      </div>
    </div>
  );
}

function Pipeline() {
  return (
    <div className="diagram" role="img" aria-label="agent client to tracer-proxy to gmail, fetch, jira and slack; the proxy evaluates each call to allow, hold or refuse">
      <svg viewBox="0 0 820 170" preserveAspectRatio="xMidYMid meet">
        <text x="0" y="60" className="d-host">agent client</text>
        <path d="M 140 55 L 250 55" className="d-wire" />

        <rect x="255" y="28" width="190" height="54" className="d-box" />
        <text x="275" y="61" className="d-box-title">tracer-proxy</text>

        <path d="M 445 55 L 560 55" className="d-wire" />
        <text x="575" y="60" className="d-out">gmail / fetch / jira / slack</text>

        <path d="M 350 82 L 350 125" className="d-wire" />
        <text x="365" y="130" className="d-out">allow &middot; hold &middot; refuse</text>
      </svg>
    </div>
  );
}

// --- the proof-of-life run ---------------------------------------------------
// This page used to be all configuration and no outcome. The Viewer spends
// enormous effort making a blocked call visible; the page describing the real
// adapter showed none of it.
//
// Everything rendered here comes from demo/evidence/evidence.json, written by
// `npx tracer prove --both`. Nothing is retyped, and if no run has been made
// the panel says so rather than describing one.

function Evidence({ evidence }) {
  if (!evidence) {
    return (
      <div className="panel">
        <div className="panel-body row faint small">
          <span className="spinner" /> loading the last proof-of-life run
        </div>
      </div>
    );
  }

  if (evidence.missing || !evidence.protected) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Proof of life &mdash; not run in this checkout</span>
        </div>
        <div className="panel-body small muted stack">
          <div>
            Two real MCP servers, one hostile page on <span className="mono">127.0.0.1</span>, and the same
            scenario run twice: once with the client holding the servers directly, once with Tracer in
            between. It needs <span className="mono">uvx</span> and <span className="mono">npx</span> and
            nothing else &mdash; no credentials.
          </div>
          <Code label="shell">npx tracer prove --both</Code>
          <div className="faint tiny">
            The transcripts land in <span className="mono">demo/evidence/</span> and this panel renders them.
          </div>
        </div>
      </div>
    );
  }

  const p = evidence.protected;
  const u = evidence.unprotected;
  const tierLines = (p.banner || []).filter((l) => /^\s+tier /.test(l));
  const head = (p.banner || []).filter((l) => !/^\s+tier /.test(l));

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Proof of life &mdash; a real refusal, on real MCP servers</span>
        <span className="tiny faint">{new Date(p.at).toLocaleString()}</span>
      </div>
      <div className="panel-body stack">
        <div className="small muted">
          Two upstream servers, neither of them ours &mdash;{' '}
          <span className="mono">{evidence.servers && evidence.servers.fetch}</span> and{' '}
          <span className="mono">
            {evidence.servers && evidence.servers.filesystem}
          </span>{' '}
          &mdash; spawned over stdio, with an <span className="mono">@modelcontextprotocol/sdk</span> client
          on the other side of Tracer. Reproduce with{' '}
          <span className="mono">npx tracer prove --both</span>.
        </div>

        <div className="claim" style={{ margin: 0 }}>{p.goal}</div>
        <div className="small muted" style={{ marginTop: -6 }}>
          The user&rsquo;s instruction, and the only thing in this run that came from the user. It names no
          destination.
        </div>

        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div className="stat-n" style={{ color: '#ff6b5e' }}>{u && u.wrote ? 'YES' : 'no'}</div>
            <div className="stat-l">
              file written to the drop folder, client holding the servers directly
            </div>
          </div>
          <div>
            <div className="stat-n" style={{ color: 'var(--acid)' }}>{p.wrote ? 'YES' : 'no'}</div>
            <div className="stat-l">file written with Tracer in between</div>
          </div>
          <div>
            <div className="stat-n" style={{ fontSize: 15, paddingTop: 8 }}>
              {p.status ? p.status.blocked + ' blocked, ' + p.status.held + ' held, ' + p.status.allowed + ' allowed' : '-'}
            </div>
            <div className="stat-l">what Tracer did across the run</div>
          </div>
        </div>

        <div>
          <div className="small" style={{ marginBottom: 6 }}>
            <b>The startup banner, on stderr.</b> Every run prints what the config does to every tool it
            found.
          </div>
          <Code label="stderr">{head.concat(tierLines).join('\n')}</Code>
        </div>

        <div>
          <div className="small" style={{ marginBottom: 6 }}>
            <b>The refusal, as it arrived in the client.</b> The upstream server was never called.
          </div>
          <Code label="mcp error" wrap>{p.refusal}</Code>
        </div>

        <div className="small muted">
          What is not real here: the model. The client is scripted so the run needs no API key and
          reproduces byte for byte &mdash; it stands in for the compromised agent, not for the defence, and
          the drop path it writes to is parsed out of the page it fetched rather than hardcoded. For a live
          model doing this, put the config above in Claude Desktop or Cursor; see{' '}
          <span className="mono">demo/README.md</span>.
        </div>
      </div>
    </div>
  );
}
