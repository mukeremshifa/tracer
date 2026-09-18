# Tracer MCP proxy

A provenance firewall that sits between an agent and its MCP servers.

```
agent client  ──►  tracer-proxy  ──►  gmail / fetch / jira / slack / ...
                        │
                        └─ evaluate(call) ──► allow · hold · refuse
```

You point a client at Tracer instead of at the real servers. Tracer connects to
them on the client's behalf, republishes their tools as `<server>.<tool>`, and
puts every call through the same policy engine the sandbox uses
(`@tracer/core`).

---

## What it actually does

**Tool results are registered as untrusted content.** This is the part that
makes the proxy more than a logger. A fetched page, a Jira ticket, a Slack
thread — each comes back, gets split into numbered spans, and is added to the
run context. Layer B then has something to scan. Skip this step and the
destination rule can never fire, because you cannot notice that an address came
from a fetched page if you never looked at the fetched page.

**The destination rule.** A tier-2 call whose destination appears nowhere in
the declared task, and does appear in content a tool returned, is hard-blocked.
That is the signature of every exfiltration finding in the literature, and it
needs no judgment from the model.

**Tool descriptions are registered too.** A tool description is content, not
configuration: it arrives from a server we did not write and lands in the model's
context before any call is made. Tracer used to republish upstream descriptions
verbatim, which made the firewall a delivery vehicle for the attack class it
exists to stop — the MCP-native one, catalogued as
[OWASP MCP03:2025 Tool Poisoning](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning)
and first demonstrated by
[Invariant Labs](https://github.com/invariantlabs-ai/mcp-injection-experiments).
Descriptions now go through the analyser at `listTools` time and register as
untrusted spans exactly as results do, so a destination that appears only in a
tool description is attributable and refused. A description that reads as
instructions is republished fenced and named as content, with its zero-width
characters stripped and the decoded payload printed in the open. The startup
banner names every flagged tool.

**A refusal explains itself.** Blocked calls come back as an MCP error whose
text is the decision and the provenance chain behind it — which span, from which
source, carrying what. The agent can relay it; a human reading the transcript
sees the same sentences. The decision rides in the result's `_meta`, never in
`structuredContent`: a tool that declares an `outputSchema` — the filesystem
server's read tools do — makes the client validate `structuredContent` against
it, and Tracer's explanation used to arrive as an unparseable protocol error. A
refusal the client cannot read is not a refusal.

**Every decision is written down.** `node:sqlite`, a file beside the tier config,
two tables (`sessions` and `decisions`) and no dashboard: this is the write path
and the read path is `npx tracer log`. Secret values are masked out of the stored
arguments before they are written — `SECRET_PATTERNS` finds the OTP in a tier-1
read, and an audit log that stores the passcode it was protecting is a new
vulnerability with a reassuring name. `"store": false` turns it off.

---

## What does NOT apply here

**There is no visibility analysis and no X-ray in the proxy.** Whether a human
could have *seen* a piece of text is a question only a rendering engine can
answer, and a proxy does not have one. White-on-white text, `display: none`,
zero-sized boxes, off-screen positioning — none of those flags exist on this
path, and Tracer reports `visibilityAware: false` on every span store it builds
here rather than letting the absence read as a clean bill of health.

What survives intact, because it is a property of the bytes rather than of the
layout:

- zero-width character payloads (decoded, and the decoded text is what gets
  scanned)
- base64-encoded payloads (normalised before scanning)
- instruction-likeness scoring on span text
- the whole tier/plan/destination machinery, which never needed a DOM

If you want the X-ray, you want the browser adapter. That is the only host where
the full thesis survives.

---

## Install

```bash
npm install                       # from the repo root; it is a workspace
node adapters/mcp/bin/tracer-proxy.mjs --help
```

## Configure

Copy `tiers.json` and edit it. Tiers are the one judgment Tracer cannot make for
you: only you know whether `filesystem.write_file` writes to a scratch directory
or a shared drive.

```jsonc
{
  "defaultTier": 2,          // unconfigured tools still run, still policed
  "requireTask": true,
  "untrusted": ["fetch.*", "jira.*", "slack.*"],

  "servers": {
    "gmail": { "command": "npx", "args": ["-y", "@example/mcp-gmail"] },
    "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] }
  },

  "tools": {
    "fetch.*": 0,
    "gmail.read_email": 1,
    "gmail.send_email": { "tier": 2, "destination": "to" }
  }
}
```

- Keys are republished names (`<server>.<tool>`). Globs allowed; exact names win.
- `destination` names the argument that decides **where** a call lands. It is
  the only field the hard block keys on, so it is the most important line in the
  file. Omit it and Tracer guesses from conventional argument names (`to`,
  `recipient`, `url`, `channel`, `path`) and marks the guess as a guess in the
  decision.
- `defaultTier: 2` means a tool nobody configured still runs and is still
  policed. Set it to `null` to fail closed on existence instead — safer, and it
  will break the agent the next time an upstream ships a new tool.

Every run prints the resolved tiering for every tool it found, to stderr, at
startup. A firewall whose rules you cannot see is a firewall you cannot trust.

## Run

```bash
node adapters/mcp/bin/tracer-proxy.mjs --config ./my.tiers.json
```

```bash
npx tracer log             # every decision, newest last
npx tracer log --sessions  # one line per session
```

In a client's MCP server list, in place of the servers it fronts:

```json
{
  "mcpServers": {
    "tracer": {
      "command": "node",
      "args": ["/path/to/tracer/adapters/mcp/bin/tracer-proxy.mjs", "--config", "/path/to/my.tiers.json"]
    }
  }
}
```

---

## Proof of life

`demo/` is this adapter running in front of two real MCP servers — `uvx
mcp-server-fetch` and `npx @modelcontextprotocol/server-filesystem`, neither of
them ours — refusing a real write, with transcripts of both halves checked in.

```bash
npx tracer prove --both
```

The control run creates the file the injection asked for; the protected run does
not, and the upstream server is never called. See `demo/README.md`, including
what is real in that run and what is not.

---

## The honest limitation: plan-then-execute needs the agent's cooperation

The frozen plan is one of the two controls that catch an injected step, and the
proxy does not drive the agent, so it cannot force the plan to exist. It offers
a tool instead:

```
tracer_begin_task(goal, plan)   call it first, before reading anything
tracer_status()                 what Tracer has seen so far
```

When an agent calls `tracer_begin_task`, everything works as designed: later
calls are checked against the frozen plan and the declared goal.

**Most clients will never call it.** The answer for a single-purpose agent is one
line, and it comes before the limitation rather than after it:

```
--goal "Summarise the ticket and email it to me@corp.example"
```

or a `goal` field in the tier config. Either way the destination rule keeps
working for any destination that appears in *tool output*, because that part
depends on the spans, not on the plan.

### Degraded mode

When neither happens, Tracer **degrades rather than escalating everything**. This
used to read: every tier-2 destination becomes unattributable, so those calls
escalate rather than run. That was honest and close to useless — a wall of holds
is a wall people route around, and `requireTask: true` was the single thing most
likely to break a real demo.

With no plan declared:

- The **frozen-plan rules stand down**, and say so in every decision. There is no
  plan, so "not in the frozen plan" is not a finding, and printing it anyway is
  how a report loses the reader's trust in the findings that are real.
- **Tier-1 reads are allowed**, not held. A read cannot move information
  anywhere, and holding every one of them behind a human is how a firewall gets
  switched off. Provenance is still recorded, which is what makes a later attempt
  to move what was read attributable.
- A **goal is inferred** from the agent's first read — only the first, and only a
  tier 0 or 1 one, because inferring from a tier-2 call would let an injected
  destination authorise itself. It is labelled *inferred* in every decision that
  rests on it, and it never becomes a plan.
- A tier-2 call made **before any untrusted content has been read** is allowed
  rather than held: nothing has entered the session that a destination could have
  come from. It is the weakest allow Tracer issues and it says so.

What does **not** relax is the destination rule. It compares a destination
against the untrusted spans it could have come from, which needs neither a plan
nor a goal: a destination that came from fetched content and appears nowhere else
is refused outright, in degraded mode exactly as in strict mode. `demo/` is a
worked example — `requireTask: false`, no `tracer_begin_task`, and a real
refusal.

The startup banner names the mode, every run. `requireTask: true` keeps the old
strict behaviour if you want it.

---

## Two caveats that apply everywhere Tracer runs

1. **The destination rule covers exfiltration, one consequence class.** It does
   nothing about an agent injected into *deleting* files or *approving* a
   transaction — there is no destination to trace.
2. **The overlap scan is verbatim-based.** A payload the model paraphrases
   rather than copies will not overlap. This is measured rather than asserted:
   the `paraphrase` row on the range writes the destination out in words
   (`verify at sec-update dot tld`), the literal comparison misses, and the hard
   block is replaced by a hold. See SCORECARD.md — the downgrade is published.
