// ---------------------------------------------------------------------------
// The dashboard — a preview, and labelled as one.
//
// Tracer today is a firewall you run in front of one agent. This is what it
// looks like run in front of a fleet: the decisions it is already taking,
// aggregated across a team rather than shown one at a time.
//
// Every number below is invented. That is stated on the page itself, in a chip
// next to the title, because a mock dashboard that does not say it is a mock is
// the single easiest way for an honest project to become a dishonest one. The
// fixtures live in one block at the top so nobody has to guess which parts are
// real -- none of them are.
// ---------------------------------------------------------------------------

const KPI = [
  { n: '12', l: 'agents protected' },
  { n: '48,201', l: 'tool calls evaluated, 24h' },
  { n: '37', l: 'exfiltration attempts blocked', tone: 'hot' },
  { n: '3', l: 'held for review' },
];

const FEED = [
  { v: 'block', tool: 'gmail.send_email', dest: 'drop.attacker-cdn.tld', rule: 'destination-not-in-goal', t: '2m' },
  { v: 'allow', tool: 'fetch.get', dest: 'docs.internal.corp', rule: 'tier-0', t: '4m' },
  { v: 'allow', tool: 'jira.search', dest: 'jira.corp', rule: 'tier-0', t: '6m' },
  { v: 'hold', tool: 'filesystem.write_file', dest: '/shared/finance/q3', rule: 'tier-2-off-plan', t: '9m' },
  { v: 'allow', tool: 'gmail.read_email', dest: 'inbox', rule: 'tier-1-on-plan', t: '11m' },
  { v: 'block', tool: 'fetch.post', dest: 'pixel.tracking-cdn.tld', rule: 'overlap-with-concealed', t: '14m' },
  { v: 'allow', tool: 'slack.post_message', dest: '#eng-releases', rule: 'tier-2-on-plan', t: '17m' },
  { v: 'allow', tool: 'fetch.get', dest: 'status.corp', rule: 'tier-0', t: '21m' },
];

const DESTINATIONS = [
  { label: 'drop.attacker-cdn.tld', n: 14 },
  { label: 'pixel.tracking-cdn.tld', n: 9 },
  { label: 'paste.anon-host.tld', n: 7 },
  { label: 'webhook.relay.tld', n: 5 },
  { label: 'mail.lookalike-corp.tld', n: 2 },
];

const TIERS = [
  { tier: '0', name: 'inert', calls: '41,882', blocked: '0' },
  { tier: '1', name: 'private read', calls: '5,104', blocked: '0' },
  { tier: '2', name: 'can reach outside', calls: '1,215', blocked: '37' },
];

const AGENTS = [
  { name: 'support-triage', host: 'MCP proxy', calls: '18,440', last: 'allow' },
  { name: 'research-browser', host: 'extension', calls: '11,207', last: 'block' },
  { name: 'invoice-reader', host: 'MCP proxy', calls: '7,981', last: 'allow' },
  { name: 'release-notes', host: 'MCP proxy', calls: '5,332', last: 'hold' },
  { name: 'inbox-summariser', host: 'extension', calls: '3,118', last: 'block' },
  { name: 'docs-indexer', host: 'MCP proxy', calls: '2,143', last: 'allow' },
];

export function Dashboard({ go }) {
  const peak = Math.max(...DESTINATIONS.map((d) => d.n));

  return (
    <div className="wrap stack">
      <div>
        <div className="dash-head">
          <h1 className="title" style={{ margin: 0 }}>
            Fleet
          </h1>
          <span className="chip-preview">preview</span>
        </div>
        <p className="lede" style={{ maxWidth: '64ch', marginTop: 18 }}>
          What Tracer looks like in front of a team rather than one agent. Every number on this page is
          fabricated &mdash; it is a design for a console that does not ship yet. The measured results
          are on the{' '}
          {go ? (
            <button
              className="btn sm ghost"
              style={{ margin: 0, padding: 0, font: 'inherit', letterSpacing: 0, textTransform: 'none', color: 'var(--acid)' }}
              onClick={() => go('scorecard')}
            >
              scorecard
            </button>
          ) : (
            'scorecard'
          )}
          .
        </p>
      </div>

      <div className="stats">
        {KPI.map((k) => (
          <div className={'stat ' + (k.tone || '')} key={k.l}>
            <div className="stat-n">{k.n}</div>
            <div className="stat-l">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="dash-cols">
        {/* --- the feed --- */}
        <div>
          <div className="panel-head">
            <span className="panel-title">Recent decisions</span>
            <span className="spacer tiny faint">last 24 hours</span>
          </div>
          <div>
            {FEED.map((f, i) => (
              <div className="feed-row" key={i}>
                <span className={'feed-verdict ' + f.v}>{f.v}</span>
                <span className="feed-tool">{f.tool}</span>
                <span className="feed-dest">
                  {f.dest} &middot; {f.rule}
                </span>
                <span className="feed-time">{f.t}</span>
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginTop: 44 }}>
            <div className="panel-head">
              <span className="panel-title">Agents</span>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>agent</th>
                    <th>host</th>
                    <th>calls 24h</th>
                    <th>last decision</th>
                  </tr>
                </thead>
                <tbody>
                  {AGENTS.map((a) => (
                    <tr key={a.name}>
                      <td className="mono">{a.name}</td>
                      <td className="small muted">{a.host}</td>
                      <td className="mono">{a.calls}</td>
                      <td>
                        <span className={'tag ' + (a.last === 'block' ? 'hot' : 'quiet')}>{a.last}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* --- the side --- */}
        <div className="stack">
          <div>
            <div className="panel-head">
              <span className="panel-title">Blocked destinations</span>
            </div>
            <div className="bars">
              {DESTINATIONS.map((d) => (
                <div className="bar-row" key={d.label}>
                  <span className="bar-label">{d.label}</span>
                  <span className="bar-n">{d.n}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: (d.n / peak) * 100 + '%' }} />
                  </span>
                </div>
              ))}
            </div>
            <div className="small faint" style={{ marginTop: 16 }}>
              None of these was named by a user. That is the whole reason each one was refused.
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">By capability tier</span>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>tier</th>
                    <th>name</th>
                    <th>calls</th>
                    <th>blocked</th>
                  </tr>
                </thead>
                <tbody>
                  {TIERS.map((t) => (
                    <tr key={t.tier}>
                      <td className="mono">{t.tier}</td>
                      <td className="small muted">{t.name}</td>
                      <td className="mono">{t.calls}</td>
                      <td className="mono">
                        <span className={'tag ' + (t.blocked !== '0' ? 'hot' : 'quiet')}>{t.blocked}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="small faint" style={{ marginTop: 16 }}>
              Every refusal happened at tier 2. Nothing that only reads was ever stopped &mdash; a
              firewall that blocks reads is an off switch.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
