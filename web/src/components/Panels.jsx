// Right-hand pane: the frozen plan, the live call log, and the decision card.
// Moment 2 is the decision card plus the trace line drawn from it.

import { useEffect, useRef, useState } from 'react';

const TIER_LABEL = { 0: 'tier 0 inert', 1: 'tier 1 private read', 2: 'tier 2 external act' };

export function PlanPanel({ plan, calls }) {
  if (!plan) return null;
  const planned = plan.steps || [];
  const offPlan = (calls || []).filter(
    (c) => c.decision && c.decision.rule && c.decision.rule.startsWith('off-plan'),
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">The frozen plan</span>
        <span className="spacer" />
        <span className="frozen-stamp">frozen before any page was read</span>
      </div>

      {plan.rationale && (
        <div className="panel-body" style={{ paddingBottom: 0 }}>
          <div className="small muted">{plan.rationale}</div>
        </div>
      )}

      <ol className="plan-list" style={{ marginTop: 10 }}>
        {planned.map((step, i) => (
          <li className="plan-item" key={i}>
            <span className="plan-n">{i + 1}</span>
            <div className="grow">
              <div className="plan-tool">{step.tool ? step.tool + '()' : 'answer the user'}</div>
              {step.why && <div className="plan-why">{step.why}</div>}
            </div>
          </li>
        ))}

        {offPlan.map((c) => (
          <li className="plan-item violated" key={c.id}>
            <span className="plan-n">!</span>
            <div className="grow">
              <div className="plan-tool" style={{ color: '#ffb3c2' }}>
                {c.name}() &mdash; not on the plan
              </div>
              <div className="plan-why" style={{ color: '#ffb3c2bb' }}>
                Appeared only after untrusted content entered the context.
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CallLog({ calls, selectedId, onSelect }) {
  const endRef = useRef(null);
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: 'nearest' });
  }, [calls.length]);

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Tool calls</span>
        <span className="spacer" />
        <span className="tiny faint">{calls.length} proposed</span>
      </div>

      {calls.length === 0 ? (
        <div className="panel-body faint small">Nothing proposed yet.</div>
      ) : (
        <ul className="calls">
          {calls.map((c) => {
            const d = c.decision || {};
            return (
              <li key={c.id}>
                <button
                  className="call"
                  aria-selected={selectedId === c.id ? 'true' : 'false'}
                  onClick={() => onSelect(c.id)}
                >
                  <span className={'call-dot ' + (d.decision || 'allow')} />
                  <span className="grow">
                    <span className="call-name">{c.display || c.name}</span>
                    <span className="call-meta" style={{ display: 'block', marginTop: 3 }}>
                      {TIER_LABEL[c.tier] || 'tier ?'}
                      {d.rule ? ' · ' + d.rule : ''}
                    </span>
                  </span>
                  <span className={'tag ' + badgeFor(d.decision)}>{labelFor(d.decision)}</span>
                </button>
              </li>
            );
          })}
          <li ref={endRef} />
        </ul>
      )}
    </div>
  );
}

function badgeFor(decision) {
  if (decision === 'block') return 'red';
  if (decision === 'escalate') return 'amber';
  return 'green';
}

function labelFor(decision) {
  if (decision === 'block') return 'blocked';
  if (decision === 'escalate') return 'held';
  return 'allowed';
}

export function DecisionCard({ call, onTrace, tracedSpan, protectedMode }) {
  if (!call) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Decision</span>
        </div>
        <div className="panel-body faint small">
          Select a tool call to see why it was allowed, held, or blocked.
        </div>
      </div>
    );
  }

  const d = call.decision || {};
  const kind = d.decision || 'allow';
  const chain = d.chain || [];

  return (
    <div className={'decision ' + kind}>
      <div className="decision-head">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="decision-verdict">
            {kind === 'block' ? 'Blocked' : kind === 'escalate' ? 'Held for you' : 'Allowed'}
          </span>
          <span className="row" style={{ gap: 6 }}>
            <span className={'tag ' + (call.tier === 2 ? 'red' : call.tier === 1 ? 'amber' : '')}>
              <span className="tier">{TIER_LABEL[call.tier] || 'tier ?'}</span>
            </span>
            {d.layer && <span className="tag">{d.layer === 'B' ? 'Layer B · enforced' : 'Layer ' + d.layer}</span>}
          </span>
        </div>
        <div className="decision-call">{call.display || call.name}</div>
      </div>

      <div className="decision-body">
        {!protectedMode && (
          <div className="notice" style={{ marginBottom: 12 }}>
            No policy engine is running. This is the unprotected agent: every call it proposes executes.
          </div>
        )}

        <ul className="decision-explain">
          {(d.explain || []).map((line, i) => (
            <li key={i} className={i === 0 && kind !== 'allow' ? 'key' : ''}>
              {line}
            </li>
          ))}
        </ul>

        {d.rule && (
          <div className="row" style={{ marginTop: 13 }}>
            <span className="rule-chip">rule: {d.rule}</span>
            {call.declared && (
              <span className="rule-chip">
                derived_from: {call.declared.length ? call.declared.join(', ') : '[] (declared nothing)'}
              </span>
            )}
          </div>
        )}

        {chain.length > 0 && (
          <div className="chain">
            <div className="label" style={{ marginBottom: 9 }}>
              Provenance &mdash; where this came from
            </div>
            {chain.map((c) => (
              <div className="chain-item" key={c.spanId}>
                <div className="chain-top">
                  <span className="span-id" data-chain-anchor={c.spanId}>
                    {c.spanId}
                  </span>
                  {c.concealed && <span className="tag magenta">invisible to you</span>}
                  {c.accessibility && <span className="tag teal">accessibility pattern</span>}
                  {(c.flags || []).slice(0, 3).map((f) => (
                    <span className="tag" key={f}>
                      {f}
                    </span>
                  ))}
                  <span className="spacer" />
                  <button
                    className="btn sm ghost"
                    onClick={() => onTrace(c)}
                    aria-pressed={tracedSpan === c.spanId ? 'true' : 'false'}
                  >
                    {tracedSpan === c.spanId ? 'tracing' : 'trace it'}
                  </button>
                </div>

                <div className="chain-text">{c.decoded || c.text}</div>

                {c.decoded && (
                  <div className="chain-decoded">
                    Decoded from invisible characters. The rendered page showed nothing here.
                  </div>
                )}

                <div className="chain-meta">
                  {c.url}
                  {c.path ? ' · ' + c.path : ''}
                  {c.style && c.style.color
                    ? ' · color ' + c.style.color + ' on ' + c.style.background +
                      (c.style.contrast != null ? ' (contrast ' + c.style.contrast + ':1)' : '')
                    : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Verdict({ outcome, answer, protectedMode }) {
  if (!outcome) return null;
  const robbed = outcome.robbed;

  return (
    <div className="stack">
      <div className={'verdict ' + (robbed ? 'robbed' : 'contained')}>
        <span className="verdict-label">{robbed ? 'Data left' : 'Contained'}</span>
        <span className="verdict-detail">
          {robbed
            ? outcome.exfiltrations
                .map(
                  (e) =>
                    (e.secrets.length ? e.secrets.join(', ') : 'content') + ' → ' + e.destination + ' via ' + e.via,
                )
                .join('; ')
            : outcome.blocked + ' blocked, ' + outcome.held + ' held for approval, ' + outcome.executed + ' allowed'}
        </span>
      </div>

      {answer && (answer.text || answer.raw) && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">What the agent told the user</span>
            {answer.findings && answer.findings.length > 0 && (
              <>
                <span className="spacer" />
                <span className="tag red">{answer.findings.length} output-channel finding(s)</span>
              </>
            )}
          </div>
          <div className="panel-body">
            <div className="answer">{answer.text || answer.raw}</div>
            {answer.findings && answer.findings.length > 0 && (
              <div className="stack" style={{ marginTop: 12 }}>
                {answer.findings.map((f, i) => (
                  <div className="notice" key={i}>
                    <b>{f.channel}</b> &mdash; {f.reason}
                    {protectedMode ? ' The URL was redacted before display, so no request was made.' : ' This request fires when the answer is rendered.'}
                    <div className="mono tiny" style={{ marginTop: 6, wordBreak: 'break-all' }}>
                      {f.url}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The animated line from the decision card to the element it came from. */
export function ProvenanceLine({ from, to }) {
  const [len, setLen] = useState(0);
  const pathRef = useRef(null);

  useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
  }, [from, to]);

  if (!from || !to) return null;

  const x1 = from.left;
  const y1 = from.top + from.height / 2;
  const x2 = to.right > from.left ? to.left + to.width / 2 : to.right;
  const y2 = to.top + Math.min(to.height / 2, 30);

  const dx = Math.max(60, Math.abs(x1 - x2) * 0.45);
  const d = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 - dx) + ' ' + y1 + ', ' + (x2 + dx) + ' ' + y2 + ', ' + x2 + ' ' + y2;

  return (
    <svg className="trace-overlay" aria-hidden="true">
      <path ref={pathRef} className="trace-path" d={d} style={{ '--len': len || 1 }} />
      <circle className="trace-end" cx={x2} cy={y2} r="5" />
      <circle className="trace-end" cx={x1} cy={y1} r="3.5" />
    </svg>
  );
}
