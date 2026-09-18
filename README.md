# Tracer

**A provenance firewall for AI agents.**

> Tracer converts an invisible, unattributable compromise into a visible, attributable one, and
> structurally blocks the exfiltration class of consequences regardless of whether the model was
> fooled.

That sentence is the whole claim, and it is a ceiling rather than a starting point. **Tracer does not
stop prompt injection.** Nobody has. What it does is assume the injection succeeds at fooling the
model, and then make it fail at producing an effect — while showing the human exactly what happened
and where it came from.

Built for the [TLN Cybersecurity Challenge 2026](https://tln-cybersecurity-challenge.devpost.com/).

---

## The problem

An AI agent that browses the web reads untrusted content and then acts. Anyone who can get text onto
a page the agent reads — invisible text, an HTML comment, a product review — can issue instructions
the agent follows as if the user had typed them. The agent has the user's credentials, the user's
inbox, and the user's trust. The attacker needs none of them.

This is being exploited now, not theoretically:

- A 2026 study found **not a single attack scenario was consistently blocked** across leading agents
  powered by GPT-5 and Gemini. ([CSO Online](https://www.csoonline.com/article/4184455/prompt-injection-breaks-todays-ai-agents-study-warns.html))
- Adaptive attacks bypass essentially every published defence. SecAlign, one of the stronger ones,
  **still misses roughly one in ten** optimisation-based attacks. ([Sysdig](https://www.sysdig.com/learn-cloud-native/prompt-injection))
- **April 2026:** the Cloud Security Alliance confirmed indirect injection had crossed from
  proof-of-concept to **live exploitation**, with Google Security and Forcepoint X-Labs independently
  documenting adversaries seeding the open web with hidden instructions. ([CSA](https://labs.cloudsecurityalliance.org/research/csa-research-note-indirect-prompt-injection-in-the-wild-2026/))
- **May 2026:** the Five Eyes agencies issued joint guidance on agentic AI naming prompt injection as
  a core manipulation route, stressing that no single safeguard is enough.
- Brave's security team demonstrated indirect injection against Perplexity Comet: instructions hidden
  in white-on-white text and HTML comments, and when the user asked only to *"summarize this page,"*
  the agent fetched a one-time passcode from their email. ([arXiv 2511.19477](https://arxiv.org/pdf/2511.19477))

Nearly every finding shares one shape: **an agent with access to private data, exposure to untrusted
content, and the ability to communicate externally is exploitable.**

## The position

Almost everyone who touches this space builds a classifier — a model that detects injections. The
literature above says that road is a dead end. So Tracer takes the opposite position:

> **We assume the injection succeeds at fooling the model. We make it fail at producing an effect —
> and we make it visible to the human.**

---

## Three surfaces, one codebase

|  | what it is | where |
|---|---|---|
| **sandbox** — *try it* | a mock agent, a mock inbox and a local attack range. See the mechanism work without wiring anything up. | `server/`, `web/` |
| **range** — *test your agent* | 16 known injection classes on the range plus one that has no page at all, pointed at whatever agent you configure. Emits a scorecard for **that** agent. | `cli/`, `scripts/eval.mjs` |
| **proxy** — *protect your agent* | an MCP proxy that evaluates every forwarded tool call, and a browser extension that does the same in the page. | `adapters/mcp`, `adapters/browser` |

```bash
npm install
npx tracer test                      # range vs. the built-in mock, no credentials
npx tracer test --target ./mcp.json  # range vs. your agent
npx tracer proxy --config ./tiers.json   # the firewall, in front of your MCP servers
npx tracer prove --both              # the proxy vs. two real MCP servers, both halves
npx tracer sandbox                   # the local sandbox + viewer
```

The sandbox is legitimate and it is not the product. Once a real adapter blocks a real tool call, the
sandbox stands for something real.

---

## Architecture

**One host-agnostic core, two adapters.** `@tracer/core` is the engine: tiers, the destination rule,
the overlap scan, the plan-then-execute loop, the analyser. It knows nothing about Express, about
mock inboxes, or about what a "tool" is — the host injects tool execution and configures tiers.

```
                       ┌──────────────────────────┐
  sandbox   ──────────▶│                          │
  MCP proxy ──────────▶│  @tracer/core            │──▶ decision + provenance chain
  extension ──────────▶│  evaluate(call, ctx)     │
                       └──────────────────────────┘
```

The split that drives everything: **the analyser needs a DOM, the policy engine does not.** In the
browser the analyser has real computed styles and real layout, so the full visibility analysis and
the X-ray work. In the MCP proxy there is no rendering engine, so there is no visibility analysis —
core reports `visibilityAware: false` rather than letting an absence read as a clean bill of health.
Zero-width and base64 payloads decode either way; those are properties of the bytes.

We deliberately did **not** build an LLM-gateway adapter or per-framework middleware. The gateway is
strictly weaker than the MCP proxy — same blindness, worse ergonomics — and framework middleware is
N integrations for one capability. Extracting core properly is what makes them cheap to add later;
that is the argument for the extraction, not a reason to build them now.

### The sandbox, end to end

```
  untrusted page (sandboxed iframe, no allow-scripts)
          │
          ▼
  ┌───────────────────────────┐
  │ 1. ANALYSER               │  getComputedStyle + real layout, per text node
  │    visibility + flags     │  → span store + strip report
  └───────────┬───────────────┘  → the same flags power the X-ray
              ▼
  ┌───────────────────────────┐
  │ 2. SPAN STORE             │  S1..Sn: text, origin, DOM path,
  │    everything untrusted   │  visible?, flags[], decoded?
  └───────────┬───────────────┘
              ▼
  user goal ─▶┌───────────────────────────┐
              │ 3. AGENT LOOP             │  plan frozen BEFORE
              │    plan → execute         │  any page is read
              └───────────┬───────────────┘
                          ▼ proposed tool call
              ┌───────────────────────────┐
              │ 4. POLICY ENGINE          │  tiers + declared provenance (A)
              │                           │  + ENFORCED overlap (B)
              └───────────┬───────────────┘
                 allow ───┤─── hold / block
                          ▼
              ┌───────────────────────────┐
              │ 5. PROVENANCE VIEWER      │  the X-ray and the trace
              └───────────────────────────┘
```

### The key technical call: no server-side browser

Visibility is a rendering property. Whether a human *could have seen* a piece of text depends on
computed styles and real layout, so the analyser runs **where the page renders** — in a sandboxed
same-origin iframe, in the browser.

This is not a shortcut around a headless browser. In a real browser agent, **the agent is the
browser**, so the analyser running in the page is the architecturally correct place for it. It also
means:

- the X-ray is nearly free — we are already in the DOM we need to light up, with no coordinate
  re-projection;
- the Arena works instantly on a stranger's submitted page, in their own browser;
- there is no Playwright image, no container, and no 400 MB cold start to wait through.

The iframe is loaded **without `allow-scripts`** and range/Arena pages are served with
`script-src 'none'`, so untrusted markup renders and computes but cannot execute.

### The adapters

**`adapters/mcp` — the MCP proxy.** A client points at Tracer instead of at its real MCP servers.
Tracer forwards calls and evaluates each one. Tiers come from a config file you can read and diff
(`gmail.send_email: 2`, `fetch.*: 0`), never from a hardcoded list. Tool *results* register as
untrusted spans — without that step the overlap scan has nothing to scan, and the destination rule
can never fire. A blocked call returns an MCP error whose text is the provenance chain, so the agent
and the human both see why.

Tool *descriptions* register too. A description is content: it comes from a server we did not write
and reaches the model before any call is made. Tracer used to republish them verbatim, which made the
firewall a delivery vehicle for the MCP-native attack class it exists to stop; they now go through the
analyser at `listTools` time, a description that reads as instructions is republished fenced and named
as content with its hidden characters decoded in the open, and a destination that appears only in a
tool description is refused.

It cannot force plan-then-execute on a client that does not cooperate: it offers `tracer_begin_task`,
and most clients will never call it. Declaring the task out of band with `--goal` is the answer for a
single-purpose agent. When neither happens, Tracer **degrades rather than escalating everything** — the
frozen-plan rules stand down and say so in every decision, tier-1 reads are allowed because holding
every read behind a human is how a firewall gets switched off, and a goal is inferred from the agent's
first read and labelled *inferred* wherever it is relied on. What does not relax is the destination
rule, which compares against the spans rather than against a plan. The noise is now proportionate, and
the startup banner names the mode every run.

Every decision it takes is written to a SQLite file beside the config and readable with `npx tracer
log`. Secret values are masked before they are stored: an audit log that keeps the passcode it was
protecting is a new vulnerability with a reassuring name.
[`adapters/mcp/README.md`](./adapters/mcp/README.md).

**`adapters/browser` — an MV3 extension.** The analyser runs in the page where it renders, so this is
the only host where the whole thesis survives intact, X-ray included. It works against Tracer's own
sandbox agent, against an agent you are building (`window.tracer.propose(...)`), and against any open
browser agent whose tool-call path you can intercept. It **cannot** sit inside a closed product like
Comet — there is no supported way to intercept another extension's privileged calls, and claiming
otherwise would be the kind of unfalsifiable security claim Tracer exists to argue against.
[`adapters/browser/README.md`](./adapters/browser/README.md).

### Two layers, and one of them does not trust the model

**Layer A — declared provenance.** Every tier-1 and tier-2 tool takes a mandatory `derived_from`:
the span IDs whose content informed its arguments. Cheap, and it produces good explanations. It is
also bypassable — an injection can instruct the model to lie — so **it is never load-bearing on its
own.** When Layer A and Layer B disagree, the interface says so, which is more informative than
either agreeing.

**Layer B — enforced overlap.** Independently of what the model declares, our code scans tool
arguments for overlap with untrusted content, after **normalising** that content so that encoding the
payload does not hide it (zero-width and base64 are both decoded first). An injection cannot talk its
way past code it never sees.

### Capability tiers

| Tier | Meaning | Rule |
|---|---|---|
| 0 — inert | reads untrusted content | always allowed |
| 1 — private read | touches the user's private data | allowed if in the frozen plan; otherwise held, logged with provenance |
| 2 — external act | can move information out of the user's control | clean provenance, or held for approval with the chain displayed |

### The destination rule

A tier-2 call is **hard-blocked, not merely escalated**, when:

> the destination of the call — recipient address, URL host, file path — does **not** appear in the
> user's original instruction, **and** does appear in untrusted page content.

In plain English: *the agent is about to send something somewhere you never mentioned, and the only
place that destination came from is a web page.* That is the signature of every exfiltration finding
in the literature, and it requires zero model judgment.

Two deliberate restraints:

- **Overlap alone never blocks.** Summarising a page means quoting it, so overlap with page content
  is the normal case. The destination is what matters.
- A destination we simply **cannot trace** is *held for approval*, not blocked. "Email the author of
  this article" is a legitimate request whose recipient legitimately comes from the page, and a
  firewall that refuses it is one people switch off.

### Where the rule stops

Two limits, stated here rather than in a footnote, because Tracer's credibility comes from stating
its ceiling:

1. **The destination rule covers exfiltration — one consequence class.** It does nothing about an
   agent injected into *deleting* files, *approving* a transaction, or corrupting a record. There is
   no destination to trace, so there is nothing for this rule to key on. The tier system and the
   frozen plan still apply; the hard block does not.
2. **The overlap scan is verbatim-based.** It normalises first — zero-width decoded, base64 decoded,
   case folded, and for a file path the tail matched as well as the whole string — but a payload the
   model *paraphrases* rather than copies will not overlap, and Layer B will not see it. The
   destination rule survives paraphrasing of the *prose* (an address is an address); it does not
   survive paraphrasing of the *address*.

   That ceiling used to be stated and never measured. It is now a row on the range: `paraphrase`
   writes the destination out in words — `verify at sec-update dot tld` — so the reconstructed address
   appears nowhere on the page, the literal comparison misses, and the hard block is replaced by a
   hold (`unattributable-destination`). The consequence is still prevented, because a recipient that
   appears neither in your instruction nor in the frozen plan is not attributable whatever it was
   encoded as — but a hold asks something of the user that a refusal does not, and SCORECARD.md
   publishes the downgrade per row. We did not add an "at/dot" normaliser to make the number go back
   up: that is an arms race against spelling, and the structural answer generalises.

Both of these are why the scorecard publishes what gets through rather than only what is caught.

### The output channel

Exfiltration does not need a tool call. A markdown image in the model's answer makes the *rendering
client* issue the request — a real, widely exploited channel. So the answer is scanned too, and a
URL whose host came from untrusted content is redacted before display.

### Accessibility

`aria-hidden`, `.sr-only` and the `clip-path` visually-hidden idiom hide content from sighted users
for entirely legitimate reasons. Tracer **flags them and labels them as accessibility patterns in the
X-ray, and never counts them as attacks.** Getting this wrong would mean shipping a security tool
that penalises supporting screen readers. The control page in the range exists to prove it.

---

## Running it

```bash
npm install
npm run dev          # API on :8787, viewer on :5173
```

No API key is required. Tracer ships with a deterministic provider so everything runs immediately.

```bash
npm run verify       # 89 assertions on the properties that matter
npm run eval         # regenerate SCORECARD.md from the full range
npm run build && npm start   # single-process production build on :8787
```

### Pointing the range at your own agent

```bash
npx tracer test                          # the built-in mock (default, no credentials)
npx tracer test --target http://localhost:3000/agent   # the HTTP contract
npx tracer test --target ./my.tiers.json               # your MCP tools
```

Same 15 injection classes, scorecard written for *that* agent. See
[`docs/TESTING.md`](./docs/TESTING.md) for the contract and what the score does and does not mean.

### Running the proxy

```bash
npx tracer proxy --config ./my.tiers.json
npx tracer log                            # the decisions it recorded
```

### Proof of life: the proxy against real MCP servers

Everything else here is scored against material we wrote. This is not:

```bash
npx tracer prove --both
```

Two real MCP servers — `uvx mcp-server-fetch` and `npx
@modelcontextprotocol/server-filesystem`, neither of them ours — one hostile page served on
`127.0.0.1`, and the same scenario run twice. With the client holding the servers directly, the
injected write lands and the access code goes with it. With Tracer in between, it is refused and the
upstream server is never called. Both transcripts are checked into [`demo/evidence/`](./demo/evidence)
and rendered on the `#proxy` page.

Needs `uvx` and `npx` and nothing else — no credentials. [`demo/README.md`](./demo/README.md) states
exactly what is real in that run and what is not: the servers, the client and the firewall are real;
the *model* is a scripted stand-in, so the run reproduces byte for byte without an API key.

### Building the extension

```bash
npx tracer extension     # → adapters/browser/dist, load unpacked
```

### Live models

```bash
cp .env.example .env
# MODEL_PROVIDER=openai   + OPENAI_API_KEY
# MODEL_PROVIDER=vertex   + GEMINI_API_KEY, or GOOGLE_CLOUD_PROJECT with ADC
```

The identical agent loop runs against the live model; only the provider changes. The transcript
records which provider produced it and the UI labels it, so a deterministic run can never be mistaken
for a live one. If a live provider fails to initialise, Tracer falls back to the deterministic one and
says so rather than taking the link down mid-demo.

---

## What is mocked in the sandbox, stated plainly

This section is about **the sandbox specifically**, not about Tracer. The MCP proxy forwards calls to
real servers and the browser extension runs on real pages; neither of them mocks anything. What
follows is the "try it without wiring anything up" surface.

All six of the sandbox's tools are mocks:

| Tool | Tier | What it really does |
|---|---|---|
| `read_page(url)` | 0 | returns analysed spans from the local range |
| `search_range(query)` | 0 | searches a static local index |
| `read_email(query)` | 1 | searches `server/data/inbox.json` |
| `read_file(path)` | 1 | reads `server/data/files.json` |
| `send_email(to, …)` | 2 | writes to a sink that logs and discards |
| `http_post(url, data)` | 2 | writes to a sink that logs and discards |

**No tool performs network I/O.** A mock inbox is a mock inbox, and we would rather say so than imply
otherwise.

The default model provider is deterministic and is **not a language model**: it reproduces exactly one
behaviour — treating text found on a web page as an instruction from its user. It exists so the
scorecard is reproducible by anyone with no API key, and so a public Arena cannot be run up as a bill
by strangers. Tracer's defence inspects tool calls and provenance and never model internals, so the
policy engine behaves identically behind a live model.

## Safety of the attack range

The agent browses **only local range pages and Arena-generated pages. Never the live web.**

Every exfiltration destination on the range uses a non-resolvable `.tld` pseudo-TLD or an `.invalid`
host (RFC 2606). Nothing in this repo targets infrastructure we do not own.

The Arena renders stranger-submitted markup, which is the one genuinely dangerous surface here.
Three controls, defence in depth:

1. **Sanitisation** on the way in — scripts, event handlers, `javascript:`/`data:` URLs, iframes,
   objects, forms and meta refresh are stripped before storage.
2. **`script-src 'none'`** on the way out, plus `default-src 'none'`, `form-action 'none'`,
   `base-uri 'none'`, `object-src 'none'`.
3. The viewer's iframe omits **`allow-scripts`** entirely.

`Content-Security-Policy: sandbox` is deliberately *not* used: it places the response in an opaque
origin, which would also stop the analyser from reading the document — and reading the document, with
real computed styles, is the entire point. `script-src 'none'` is what actually prevents execution.

---

## The scorecard

[`SCORECARD.md`](./SCORECARD.md) is generated by `npm run eval` and published **including anything
that gets through**. It runs all 16 attacks against both configurations under two different user
goals, because one of those goals would flatter us:

1. **Summarise only** — the frozen plan contains no tier-2 tool, so the plan freeze alone refuses any
   send. A real control, but in this scenario it amounts to an allow-list of tool names.
2. **Summarise and email it to me** — `send_email` is now *on* the frozen plan, the plan freeze cannot
   fire, and the destination rule has to do the work alone. **This is the column to judge us on.**

The scorecard also tracks whether the user's *actual task* still completed. A firewall that stops the
attack by stopping the agent is not a firewall, it is an off switch.

## The Arena

A public page where anyone can write their own injection, watch it planted into a live page, and watch
both agents run against it. Successful bypasses are published on the **Hall of Bypasses** with the
submitter's name.

We do not fear the bypasses. The literature says nobody has solved this; a defence that displays its
own failures reads as real engineering, and a defence claiming a clean sweep reads as a demo that was
rigged.

## Repository layout

```
core/                    @tracer/core — no Express, no fs, no DOM requirement
  src/registry.js        tier configuration as a schema, not a fixed tool list
  src/policy.js          the policy engine: tiers, the destination rule, decisions
  src/overlap.js         Layer B, normalisation, output-channel scanning
  src/loop.js            plan-then-execute, with tool execution injected by the host
  src/analyser/          the analyser (DOM-optional) + zero-width codec

adapters/mcp/            the primary adapter — an MCP proxy
  src/proxy.js           forwards calls, evaluates each one, registers results as spans
  src/config.js          tier config loading; tiers.json is the starter config
  bin/tracer-proxy.mjs   stdio entry point
adapters/browser/        an MV3 extension — the analyser where the page renders
  src/content.js         analyser + X-ray in the page
  src/background.js      one run context per tab
  src/bridge.js          window.tracer — the API an in-page agent calls
  build.mjs              copies core in; an extension can only load what it ships

cli/tracer.mjs           test | proxy | prove | log | sandbox | extension

demo/                    PROOF OF LIFE — the proxy vs. two real MCP servers
  tiers.json             the tier config for the run
  site/                  the hostile page, served on 127.0.0.1
  workspace/             the private notes, and the drop folder the payload names
  drive.mjs              a real MCP client driving the canonical scenario
  evidence/              both transcripts, regenerated by `tracer prove --both`

shared/
  attacks.js             the attack manifest, single source of truth, every class cited
  xray.js                the X-ray — shared by the viewer and the extension
  site-css.js            the fictional publication's stylesheet

server/src/              THE SANDBOX
  index.js               Express: API, static range, the built viewer
  loop.js                host adapter — hands core the sandbox's tools and tiers
  registry.js            the sandbox's six tools, configured against core's schema
  tools.js               mock implementations
  providers/             simulated | openai | vertex
  range/                 18 generated static pages
web/src/
  styles.css             the visual system — three tokens, zero radius
  components/PageFrame   the iframe and the X-ray
  components/Viewer      the split pane and the provenance trace
  components/Arena       Moment 3
scripts/
  build-range.mjs        renders the range from the manifest
  eval.mjs               generates SCORECARD.md
  verify.mjs             the smoke tests
  build-demo.mjs         bakes the canonical replay transcripts
```

## Technologies

React 18, Vite 6, Node 22, Express 4, the Model Context Protocol SDK (the proxy), Chrome MV3 (the
extension), jsdom (eval harness only), OpenAI Chat Completions and Google Vertex AI / Gemini function
calling for live mode. Space Grotesk and JetBrains Mono, self-hosted via fontsource. No headless
browser, no container, no runtime CDN, and no database server — the proxy's decision log is a SQLite
file written through `node:sqlite`, which ships inside Node, so there is nothing to stand up and no
native build step to break on somebody else's machine.

Tracer sits adjacent to enterprise agent authorisation and capability scoping — the same territory as
SSOJet's MCP authentication work: `derived_from` and the capability tiers are, in effect, a
provenance-scoped authorisation check on every agent action.

## AI tool disclosure

See [`DISCLOSURE.md`](./DISCLOSURE.md).

---

*Tracer is defensive. The attack range exists to test it and must never target infrastructure we do
not own.*
