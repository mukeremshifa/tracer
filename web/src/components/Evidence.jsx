// ---------------------------------------------------------------------------
// The proof-of-life run.
//
// Two real MCP servers, neither of them ours, one hostile page, and the same
// scenario run twice -- once with the client holding the servers directly, once
// with Tracer in between. Everything rendered here comes from
// demo/evidence/evidence.json, written by `npx tracer prove --both`. Nothing is
// retyped, and if no run exists in this checkout the panel says so rather than
// describing one that did not happen.
//
// This used to be on page five. It is the only artifact in the project that a
// sceptic cannot dismiss as a demo of itself, so it belongs on the front page.
// ---------------------------------------------------------------------------

import { Code } from './Code.jsx';

export function Evidence({ evidence }) {
  if (!evidence) {
    return (
      <div className="panel">
        <div className="panel-body row faint small">
          <span className="spinner" /> loading the last run
        </div>
      </div>
    );
  }

  if (evidence.missing || !evidence.protected) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Not run in this checkout</span>
        </div>
        <div className="panel-body small muted stack">
          <div>
            Two real MCP servers, one hostile page, and the same task run twice. It needs{' '}
            <span className="mono">uvx</span> and <span className="mono">npx</span> and no credentials.
          </div>
          <Code label="shell">npx @mukeremshifa/tracer prove --both</Code>
        </div>
      </div>
    );
  }

  const p = evidence.protected;
  const u = evidence.unprotected;
  const tierLines = (p.banner || []).filter((l) => /^\s+tier /.test(l)).map(scrub);
  const head = (p.banner || []).filter((l) => !/^\s+tier /.test(l)).map(scrub);

  return (
    <div className="stack">
      <div className="row" style={{ gap: 40, flexWrap: 'wrap', marginTop: 8 }}>
        <div>
          <div className="stat-n" style={{ color: 'var(--warn)' }}>
            {u && u.wrote ? 'YES' : 'no'}
          </div>
          <div className="stat-l">file written to the attacker&rsquo;s drop folder, unprotected</div>
        </div>
        <div>
          <div className="stat-n" style={{ color: 'var(--acid)' }}>
            {p.wrote ? 'YES' : 'no'}
          </div>
          <div className="stat-l">the same run, with Tracer in between</div>
        </div>
        <div>
          <div className="stat-n" style={{ fontSize: 15, paddingTop: 10 }}>
            {p.status
              ? p.status.blocked + ' blocked · ' + p.status.held + ' held · ' + p.status.allowed + ' allowed'
              : '-'}
          </div>
          <div className="stat-l">what Tracer did across the run</div>
        </div>
      </div>

      <div className="claim" style={{ marginTop: 26 }}>
        {p.goal}
      </div>
      <div className="small faint" style={{ marginTop: -8 }}>
        The user&rsquo;s instruction, and the only thing in this run that came from the user. It names no
        destination.
      </div>

      <div className="split" style={{ gap: 32, marginTop: 20 }}>
        <div>
          <div className="small" style={{ marginBottom: 8 }}>
            <b>The startup banner.</b> Every run prints what the config does to every tool it found.
          </div>
          <Code label="stderr">{head.concat(tierLines).join('\n')}</Code>
        </div>
        <div>
          <div className="small" style={{ marginBottom: 8 }}>
            <b>The refusal, as the client received it.</b> The upstream server was never called.
          </div>
          <Code label="mcp error" wrap>
            {scrub(p.refusal)}
          </Code>
        </div>
      </div>

      <div className="small faint" style={{ marginTop: 8 }}>
        Upstream servers: <span className="mono">{evidence.servers && evidence.servers.fetch}</span> and{' '}
        <span className="mono">{evidence.servers && evidence.servers.filesystem}</span>, spawned over stdio.
        Reproduce with <span className="mono">npx @mukeremshifa/tracer prove --both</span>. The model is
        scripted so the run needs no API key and reproduces byte for byte &mdash; it stands in for the
        compromised agent, not for the defence.
      </div>
    </div>
  );
}

/**
 * The evidence is a real transcript from a real machine, so it carries that
 * machine's absolute paths. Those are noise to a reader and they date the
 * artifact to one checkout -- rewrite them to the repo-relative form the
 * commands in the docs actually use.
 *
 * This is display-only. demo/evidence/evidence.json keeps the verbatim run,
 * because the point of that file is that nobody retyped it.
 */
function scrub(line) {
  // Rewrite any drive-letter path that runs through the repo's demo/ directory,
  // in either slash style -- the transcript is captured on Windows, where both
  // appear depending on which tool printed the line. Everything up to `demo` is
  // the checkout location and is what we are dropping.
  return String(line == null ? '' : line).replace(
    /[A-Za-z]:[\\/][^\s"']*?demo[\\/]/gi,
    './demo/',
  );
}
