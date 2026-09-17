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

## Architecture

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
- there is no Playwright image, no container, and no 400 MB cold start waiting to eat a demo.

The iframe is loaded **without `allow-scripts`** and range/Arena pages are served with
`script-src 'none'`, so untrusted markup renders and computes but cannot execute.

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
npm run verify       # 35 assertions on the properties that matter
npm run eval         # regenerate SCORECARD.md from the full range
npm run build && npm start   # single-process production build on :8787
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

## What is mocked, stated plainly

All six tools are mocks:

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
that gets through**. It runs all 15 attacks against both configurations under two different user
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
shared/
  analyser/analyse.js    the analyser — runs in the browser AND under jsdom
  analyser/zerowidth.js  zero-width steganography codec
  attacks.js             the attack manifest, single source of truth
  site-css.js            the fictional publication's stylesheet
server/src/
  index.js               Express: API, static range, the built viewer
  loop.js                the agent loop — plan, then execute
  policy.js              the policy engine
  overlap.js             Layer B, normalisation, output-channel scanning
  registry.js            six tools, three tiers
  tools.js               mock implementations
  providers/             simulated | openai | vertex
  range/                 17 generated static pages
web/src/
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

React 18, Vite 6, Node 22, Express 4, jsdom (eval harness only), OpenAI Chat Completions and Google
Vertex AI / Gemini function calling for live mode. No headless browser, no database, no container.

Tracer sits adjacent to enterprise agent authorisation and capability scoping — the same territory as
SSOJet's MCP authentication work: `derived_from` and the capability tiers are, in effect, a
provenance-scoped authorisation check on every agent action.

## AI tool disclosure

See [`DISCLOSURE.md`](./DISCLOSURE.md).

---

*Tracer is defensive. The attack range exists to test it and must never target infrastructure we do
not own.*
