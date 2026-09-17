export function About({ meta }) {
  return (
    <div className="wrap narrow stack">
      <div>
        <h1 className="title">How Tracer works, and what it does not claim</h1>
        <div className="claim">
          Tracer converts an invisible, unattributable compromise into a visible, attributable one, and
          structurally blocks the exfiltration class of consequences regardless of whether the model was
          fooled.
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">The position</span>
        </div>
        <div className="panel-body stack">
          <p className="lede" style={{ margin: 0 }}>
            An AI agent that browses the web reads untrusted content and then acts. Anyone who can get text
            onto a page the agent reads &mdash; invisible text, an HTML comment, a product review &mdash; can
            issue instructions the agent follows as if the user had typed them. The agent has the user&rsquo;s
            credentials and the user&rsquo;s trust. The attacker needs neither.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            The obvious response is a classifier: a model that detects injections. The published evidence says
            that road is a dead end. A 2026 study found not a single attack scenario was consistently blocked
            across leading agents; adaptive attacks bypass essentially every published defence, and one of the
            stronger ones still misses roughly one optimisation-based attack in ten.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            So Tracer takes the opposite position. <b>We assume the injection succeeds at fooling the model.
            We make it fail at producing an effect &mdash; and we make it visible to the human.</b>
          </p>
          <div className="notice">
            We do not claim to stop prompt injection. Nobody has. What we claim is the sentence at the top of
            this page, and we publish the attacks that get past us.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Two layers, and one of them does not trust the model</span>
        </div>
        <div className="panel-body stack">
          <div>
            <b>Layer A &mdash; declared provenance.</b>
            <p className="lede" style={{ margin: '6px 0 0' }}>
              Every tool that reads private data or acts externally must declare{' '}
              <span className="mono">derived_from</span>: the span IDs whose content informed its arguments.
              This is cheap and it produces good explanations. It is also bypassable &mdash; a sufficiently
              clever injection can instruct the model to lie &mdash; so it is never load-bearing on its own.
              When Layer A and Layer B disagree, the interface says so.
            </p>
          </div>
          <div>
            <b>Layer B &mdash; enforced overlap.</b>
            <p className="lede" style={{ margin: '6px 0 0' }}>
              Independently of what the model declares, our code scans tool arguments for overlap with
              untrusted content &mdash; after normalising that content, so encoding the payload does not hide
              it. An injection cannot talk its way past code it never sees.
            </p>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">The destination rule</span>
        </div>
        <div className="panel-body stack">
          <div className="claim" style={{ borderLeftColor: 'var(--red)', background: '#1c0f14', color: '#ffd3dd' }}>
            A tier-2 call is hard-blocked when the destination of the call &mdash; recipient address, URL host,
            file path &mdash; does <b>not</b> appear in the user&rsquo;s original instruction, <b>and</b> does
            appear in untrusted page content.
          </div>
          <p className="lede" style={{ margin: 0 }}>
            In plain English: the agent is about to send something somewhere you never mentioned, and the only
            place that destination came from is a web page. That is the signature of every exfiltration finding
            in the literature. It requires zero model judgment.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            Overlap on its own never blocks. Summarising a page means quoting it, so overlap with page content
            is the normal case rather than the attack case. The destination is what matters.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Capability tiers</span>
        </div>
        <div className="panel-body tight table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>tool</th>
                <th>tier</th>
                <th>rule</th>
              </tr>
            </thead>
            <tbody>
              {(meta.tools || []).map((t) => (
                <tr key={t.name}>
                  <td className="mono">{t.name}</td>
                  <td>
                    <span className={'tag ' + (t.tier === 2 ? 'red' : t.tier === 1 ? 'amber' : '')}>
                      {t.tier} &middot; {t.tierLabel}
                    </span>
                  </td>
                  <td className="small muted">{(meta.tiers[t.tier] || {}).blurb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Why the analyser runs in the browser</span>
        </div>
        <div className="panel-body stack">
          <p className="lede" style={{ margin: 0 }}>
            Visibility is a rendering property. Whether a human could have seen a piece of text depends on
            computed styles and real layout, so the analyser runs where the page renders: in a sandboxed
            same-origin iframe, with <span className="mono">getComputedStyle</span> and real bounding boxes.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            This is not a shortcut around a headless browser. In a real browser agent, the agent <i>is</i> the
            browser. It also means there is no Playwright image, no container, and no cold start &mdash; and
            the Arena can analyse a stranger&rsquo;s page instantly, in their own browser.
          </p>
          <p className="lede" style={{ margin: 0 }}>
            The iframe is loaded without <span className="mono">allow-scripts</span> and the pages are served
            with <span className="mono">script-src &apos;none&apos;</span>, so untrusted markup renders and
            computes but cannot execute.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Accessibility</span>
        </div>
        <div className="panel-body">
          <p className="lede" style={{ margin: 0 }}>
            <span className="mono">aria-hidden</span>, <span className="mono">.sr-only</span> and the{' '}
            <span className="mono">clip-path</span> visually-hidden idiom hide content from sighted users for
            entirely legitimate reasons. Tracer flags them, labels them as accessibility patterns in the X-ray,
            and never counts them as attacks. Getting this wrong would mean shipping a tool that penalises
            supporting screen readers.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">What is mocked, stated plainly</span>
        </div>
        <div className="panel-body stack small muted">
          <div>
            All six tools are mocks. The inbox is <span className="mono">server/data/inbox.json</span>; the
            filesystem is <span className="mono">server/data/files.json</span>;{' '}
            <span className="mono">send_email</span> and <span className="mono">http_post</span> write to a sink
            that logs and discards. No tool performs network I/O. A mock inbox is a mock inbox, and we would
            rather say so than imply otherwise.
          </div>
          <div>
            The agent browses only local range pages and Arena-generated pages. It never touches the live web.
            Every exfiltration destination uses a non-resolvable host, so nothing here targets infrastructure we
            do not own.
          </div>
          <div>
            The default model provider is deterministic and is <b>not</b> a language model: it reproduces one
            behaviour, treating page text as an instruction. That keeps the public Arena free to run and the
            scorecard reproducible without a key. Tracer&rsquo;s defence inspects tool calls and provenance and
            never model internals, so the policy engine is identical behind a live model &mdash; set{' '}
            <span className="mono">MODEL_PROVIDER=openai</span> or <span className="mono">vertex</span> and the
            same loop runs against one.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Sources</span>
        </div>
        <div className="panel-body stack small">
          <a href="https://www.csoonline.com/article/4184455/prompt-injection-breaks-todays-ai-agents-study-warns.html" target="_blank" rel="noreferrer">
            CSO Online &mdash; Prompt injection breaks today&rsquo;s AI agents
          </a>
          <a href="https://www.sysdig.com/learn-cloud-native/prompt-injection" target="_blank" rel="noreferrer">
            Sysdig &mdash; Comprehensive guide to prompt injection attacks in 2026
          </a>
          <a href="https://labs.cloudsecurityalliance.org/research/csa-research-note-indirect-prompt-injection-in-the-wild-2026/" target="_blank" rel="noreferrer">
            Cloud Security Alliance &mdash; Indirect prompt injection in the wild (2026)
          </a>
          <a href="https://arxiv.org/pdf/2511.19477" target="_blank" rel="noreferrer">
            arXiv 2511.19477 &mdash; Building browser agents (the Comet demonstration)
          </a>
          <a href="https://arxiv.org/pdf/2605.14290" target="_blank" rel="noreferrer">
            arXiv 2605.14290 &mdash; Web agents should adopt the plan-then-execute paradigm
          </a>
          <a href="https://arxiv.org/pdf/2511.20597" target="_blank" rel="noreferrer">
            arXiv 2511.20597 &mdash; BrowseSafe
          </a>
          <a href="https://arxiv.org/pdf/2512.12594" target="_blank" rel="noreferrer">
            arXiv 2512.12594 &mdash; ceLLMate, sandboxing browser AI agents
          </a>
        </div>
      </div>
    </div>
  );
}
