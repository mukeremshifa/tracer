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
        The X-ray, shown rather than described. Both frames are Chrome renders of
        a real range page with the shipped analyser and the shipped xray module
        run against it -- the same two calls the content script makes. Captured
        from adapters/browser/dist, so what is pictured is what the extension
        loads; regenerate with scripts/capture-shots.mjs.
      */}
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">What it does to a page</span>
          <span className="spacer mono small faint">/range/white-on-white</span>
        </div>
        <div className="panel-body stack">
          <div className="shot-pair">
            <figure className="shot">
              <img src="/shots/xray-before.png" alt="A financial news article as it renders normally. Nothing appears out of place." />
              <figcaption className="small muted">
                <b>What you see.</b> An article. The gap below the third paragraph is the only tell, and
                nobody reads a page looking for gaps.
              </figcaption>
            </figure>
            <figure className="shot">
              <img src="/shots/xray-after.png" alt="The same article with the X-ray on. A hidden instruction is revealed in acid green, telling the agent to retrieve a passcode and email it to an attacker." />
              <figcaption className="small muted">
                <b>What the agent read.</b> The concealed span ignites in place, with the instruction it
                carries readable and its span ID beside it.
              </figcaption>
            </figure>
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            Both frames are the shipped <span className="mono">analyser.js</span> and{' '}
            <span className="mono">xray.js</span> from{' '}
            <span className="mono">adapters/browser/dist</span>, run against a real range page in Chrome
            &mdash; the same two calls <span className="mono">content.js</span> makes. Nothing here is a
            mockup.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Encoding does not hide it</span>
          <span className="spacer mono small faint">/range/zero-width</span>
        </div>
        <div className="panel-body stack">
          <figure className="shot" style={{ margin: 0 }}>
            <img src="/shots/xray-zero-width.png" alt="A figure caption on an energy article. The X-ray shows it carries a zero-width payload, with a DECODES TO line spelling out the hidden instruction." />
          </figure>
          <p className="small muted" style={{ margin: 0 }}>
            The payload here is written in zero-width characters inside an ordinary figure caption: there
            is nothing to see even with the styles stripped. The analyser decodes it and the X-ray prints
            what it decodes to, because a span that looks empty is the one case where showing the element
            is not enough.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">And it does not cry wolf</span>
          <span className="spacer mono small faint">/range/clean</span>
        </div>
        <div className="panel-body stack">
          <figure className="shot" style={{ margin: 0 }}>
            <img src="/shots/xray-clean.png" alt="The control page with the X-ray on. No acid highlighting. Two screen-reader-only elements are outlined and labelled as legitimate accessibility patterns." />
          </figure>
          <p className="small muted" style={{ margin: 0 }}>
            The control page carries a screen-reader-only caption and an{' '}
            <span className="mono">aria-hidden</span> decoration &mdash; both hidden from sighted users,
            neither an attack. No acid anywhere: they are outlined and named as accessibility patterns.
            Getting this wrong would mean shipping a security tool that penalises supporting screen
            readers.
          </p>
          {go && (
            <div className="row">
              <button className="btn" onClick={() => go('sandbox')}>
                Run the same analyser live in the Viewer
              </button>
            </div>
          )}
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
