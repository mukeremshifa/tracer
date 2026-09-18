// ---------------------------------------------------------------------------
// #extension — the browser adapter.
//
// The only host where the whole thesis survives intact, and the only page in
// this app allowed to say so. The scope limit at the bottom is not a
// disclaimer; it is the reason to believe the rest.
// ---------------------------------------------------------------------------

import { Code } from './Code.jsx';

const BRIDGE = `await window.tracer.beginTask('Summarise this page and email it to me@corp.example', [
  'read_page',
  'send_email',
]);

const decision = await window.tracer.propose('send_email', { to, subject, body });
if (decision.decision !== 'allow') {
  // decision.headline, decision.explain, decision.chain
}

// or: await window.tracer.guard('send_email', args)  — throws the refusal`;

export function Extension({ go }) {
  return (
    <div className="wrap narrow stack">
      <div>
        <div className="surface-tag" style={{ marginBottom: 14 }}>Protect your agent</div>
        <h1 className="title">The browser extension</h1>
        <p className="lede">
          The analyser runs where the page renders, which makes this the only host where the whole thesis
          survives intact &mdash; including the X-ray.
        </p>
      </div>

      {/*
        The one thing this page still owes the reader is a picture of the X-ray
        lighting up spans in a real page, in a real browser, under the real
        extension. It is not here yet, and the honest move is to say which artifact
        is missing and how to make it rather than to describe it as though it
        existed. The same analyser runs live in the Viewer, one click away.
      */}
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">The artifact this page still owes you</span>
        </div>
        <div className="panel-body stack">
          <p className="lede" style={{ margin: 0 }}>
            There is no screenshot of the extension on this page. There should be: the X-ray is the
            mechanism nothing else here has, and a page describing it without showing it is asking to be
            taken on trust.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            What you can do instead, right now, is watch the same analyser run live &mdash; the Viewer
            injects the identical code into a sandboxed iframe, and{' '}
            <b>Show what the agent read</b> is the same toggle the extension&rsquo;s panel offers.
          </p>
          {go && (
            <div className="row">
              <button className="btn" onClick={() => go('sandbox')}>
                See the X-ray in the Viewer
              </button>
            </div>
          )}
          <p className="small faint" style={{ margin: 0 }}>
            To capture it from the extension itself: build and load it with the two lines below, open any
            page on the range (<span className="mono">/range/white-on-white</span> is the canonical one),
            click the toolbar icon and press the reveal control. The concealed span is highlighted in
            place, on the page, with the decoded text beside it.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Load it</span>
        </div>
        <div className="panel-body stack">
          <Code label="shell">{`npx tracer extension
# chrome://extensions → Developer mode → Load unpacked → adapters/browser/dist`}</Code>
          <p className="small faint" style={{ margin: 0 }}>
            Repo-local, from a clone after <span className="mono">npm install</span>. The direct equivalent
            is <span className="mono">node adapters/browser/build.mjs</span>. MV3, unpacked; there is no
            store listing.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Why this host is different</span>
        </div>
        <div className="panel-body stack">
          <p className="lede" style={{ margin: 0 }}>
            Visibility is a rendering property. Whether a human could have seen a piece of text depends on
            computed styles and real layout &mdash; so in the page, and only in the page, Tracer can answer
            it. White-on-white text, <span className="mono">display: none</span>, zero-sized boxes,
            off-screen positioning, zero opacity, transparent text-fill, zero-width character payloads, HTML
            comments, instruction payloads in <span className="mono">alt</span> /{' '}
            <span className="mono">title</span> / <span className="mono">aria-label</span>.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            <b>The X-ray.</b> Click the toolbar icon, hit &ldquo;show me what the agent read&rdquo;, and the
            concealed spans light up in place, on the page, where they were hiding. It is pure CSS over
            attributes the analyser stamped during detection &mdash; the same pass, so the picture and the
            flags cannot disagree.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            Accessibility patterns (<span className="mono">aria-hidden</span>,{' '}
            <span className="mono">.sr-only</span>, the <span className="mono">clip-path</span> idiom) are
            surfaced too, in a deliberately quieter treatment and labelled <i>legitimate, not an attack</i>.
            A tool that punishes screen-reader support is a tool nobody should deploy.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            One run context per tab: the declared task, the frozen plan, every untrusted span from every
            page that tab has visited. <span className="mono">evaluate()</span> is the identical function
            the sandbox and the{' '}
            <button className="btn sm ghost" onClick={() => go('proxy')}>
              MCP proxy
            </button>{' '}
            call.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">The bridge API</span>
        </div>
        <div className="panel-body stack">
          <p className="lede" style={{ margin: 0 }}>
            Call it from the page in the agent you are building:
          </p>
          <Code label="javascript">{BRIDGE}</Code>
          <div className="claim">
            Tracer does not execute your tools. It answers <i>should this run, and what is it derived
            from</i>; the agent still owns its own hands.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Scope, stated honestly</span>
        </div>
        <div className="panel-body stack">
          <div className="two-col">
            <div>
              <div className="col-label">It works against</div>
              <ul className="plain">
                <li>
                  <b>Tracer&rsquo;s own sandbox agent</b> &mdash; the viewer in this app, which is what
                  &ldquo;try it&rdquo; means.{' '}
                  <button className="btn sm ghost" onClick={() => go('sandbox')}>
                    the sandbox
                  </button>
                </li>
                <li>
                  <b>An agent you are building</b>, through the bridge above.
                </li>
                <li>
                  <b>Any open browser agent whose tool-call path you can intercept.</b> If you can get to
                  the call site, you can put <span className="mono">propose()</span> in front of it.
                </li>
              </ul>
            </div>
            <div>
              <div className="col-label">It cannot</div>
              <ul className="plain">
                <li>
                  <b>Sit inside a closed product</b> like Comet, Atlas, or any agent whose tool calls happen
                  in privileged extension code. There is no supported way for one extension to intercept
                  another&rsquo;s privileged calls.
                </li>
                <li>
                  Claiming otherwise would be exactly the kind of unfalsifiable security claim Tracer exists
                  to argue against.
                </li>
                <li>
                  What it <i>can</i> still do there is the visible half: analyse the page the closed agent
                  is about to read, and show you before you let it run that the page contains instructions
                  aimed at it. That is worth having. It is not enforcement, and this page will not call it
                  enforcement.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Tiers</span>
        </div>
        <div className="panel-body">
          <p className="lede" style={{ margin: 0 }}>
            <span className="mono">adapters/browser/src/tiers.js</span> ships defaults keyed on tool names
            that keep recurring, plus globs for the shapes. Unmatched tools land on tier 2: a tool nobody
            classified still runs, and is still policed. Edit that file and rebuild.
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
