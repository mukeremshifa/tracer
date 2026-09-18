# Tracer — product build handoff

One pass, end to end. No phases. This brief is the whole scope; read it fully
before touching anything. `README.md` explains what Tracer *is* — read it too.

---

## 0. Context in one paragraph

Tracer is a provenance firewall for AI agents: it assumes prompt injection
succeeds at fooling the model and makes it fail at producing an effect, while
showing the human where the instruction came from. The mechanism works. The
problem is that the entire repo is a demo — all six tools are mocks, the default
model provider is a deterministic script, and the agent only browses local pages.
Nothing here can be dropped in front of a real agent. This build fixes that,
and restyles the viewer.

---

## 1. Architecture decision (already made — implement, don't relitigate)

**One host-agnostic core, two adapters.** The engine currently lives inside an
Express handler; it needs to become a package that knows nothing about Express,
the mock inbox, or the local range.

The split that drives everything: the analyser needs a DOM (real computed styles
and layout), the policy engine does not. Keep them separable.

### Build

**`core/`** — new workspace package, `@tracer/core`. Pure, no I/O, no Express,
no fs. Move in, host-agnostic:

- `overlap.js` — Layer B: normalised verbatim overlap, zero-width + base64 decode
- `policy.js` — tiers, the destination rule, escalate/block/allow decisions
- `loop.js` — plan-then-execute, but with tool execution injected by the host
- `registry.js` — becomes a *schema* for tier configuration, not a fixed list of six tools
- `shared/analyser/*` — analyser + zero-width codec (DOM-optional: full analysis
  when given a Document, text-only flags when given a string)

Core's contract, roughly: given a proposed call (name, tier, arguments), the set
of untrusted spans seen so far, and the frozen plan → return a decision plus a
provenance chain. That is the product. Settle this interface first; everything
else is an adapter feeding it.

**`adapters/mcp/`** — the primary adapter, **build this first**. An MCP proxy: a
client points at Tracer instead of its real MCP servers, Tracer forwards calls
and evaluates each one through core. Requirements:

- tiers come from a config file (e.g. `gmail.send_email: 2`, `fetch.get: 0`),
  not hardcoded — ship a starter config covering common servers
- tool *results* register as untrusted spans (fetched page text, Slack messages,
  Jira tickets), so the overlap scan has something to scan
- a blocked call returns an MCP error carrying the provenance chain, so the
  agent and the human both see why
- no DOM here: visibility analysis does not apply. Zero-width and base64 flags
  still do. Be explicit about this in the adapter's README rather than implying
  the X-ray works in the proxy.

**`adapters/browser/`** — second adapter. A browser extension (MV3) that runs the
analyser in the page where it renders and evaluates the host agent's tool calls
through the same core. This is the only host where the whole thesis survives
intact, including the X-ray. Scope it honestly: it works against Tracer's own
sandbox agent and any open browser agent you can intercept; it cannot sit inside
closed products like Comet. Say so in its README.

**Do not build** an LLM-gateway adapter or per-framework middleware. The gateway
is strictly weaker than the MCP proxy — same blindness, worse ergonomics — and
framework middleware is N integrations for one capability. Extracting core
properly is what makes them cheap to add later; that is the argument for the
extraction, not a reason to build them now.

### Keep

The existing mock agent, mock inbox and local range stay — relabelled as an
explicit **sandbox**: "see it work without wiring anything up." Legitimate, and
it is what hackathon judges and curious outsiders will actually click. The
failure mode to avoid is the sandbox *being* the product; once a real adapter
blocks a real tool call, the sandbox is a demo of something real, which is fine.

---

## 2. The eval harness becomes a feature, not a diorama

Reframe the range + scorecard from "our demo" to **"point Tracer at your agent,
we run 15 known injection classes against it, here is what got through."** Same
code (`scripts/eval.mjs`, `server/src/range/`, `shared/attacks.js`), different
framing and a real entry point:

- a CLI — `npx tracer test --target <mcp-config|endpoint>` — that runs the range
  against a configured agent and emits a scorecard for *that* agent, not for the
  built-in mock
- the built-in mock remains the zero-config default target so `npm run eval` still
  reproduces `SCORECARD.md` with no credentials
- keep publishing what gets through. A defence that displays its own failures
  reads as engineering; a clean sweep reads as rigged.

The Arena stays as the public-facing version of the same thing.

**Three surfaces, one codebase:** sandbox (try it) · range (test your agent) ·
proxy (protect your agent). The web UI should make these three legible as
distinct things.

---

## 3. Visual system — full restyle

Current stylesheet (`web/src/styles.css`, 498 lines) is a dark instrument panel
with teal accents and 10px radii. Replace the token layer and propagate through
every component. Do not leave orphaned old tokens.

### Tokens — exactly three, no light-mode path

```
--acid:  #cdfb41   accent, active state, the one loud colour
--ink:   #131313   background, the dominant surface
--bone:  #f4f5f0   text, borders, inverted surfaces
```

Dark only. `color-scheme: dark`. No `prefers-color-scheme` branch, no theme
toggle. Derive any additional steps as alpha layers over these three (e.g.
`rgba(244,245,240,0.08)` for hairlines) rather than introducing new hex values.

Semantic states — decisions are the heart of this UI — derive from the three:
`allow` = bone, `escalate` = acid, `block` = bone on an inverted/acid-bordered
surface. Do not reintroduce red/amber/green. The constraint is the design.

### Concept: zero-radius, bold, spacious, super-minimalist, with a dev touch

- **`border-radius: 0` everywhere.** No exceptions — buttons, panels, inputs,
  badges, the iframe chrome. Audit for every existing `--r` / `--r-sm` usage.
- **Bold weight as the default voice.** Headings and UI chrome at 700–800; body
  text can sit at 500 but nothing should feel light. Weight carries hierarchy
  where colour no longer can.
- **Spacious.** Generous padding and whitespace, large type scale, few borders —
  when a hairline is needed use a 1px low-alpha bone rule, never a box. Let empty
  space do the separating that panels used to do.
- **Dev touch.** Monospace for anything data-shaped: span IDs, flags, tool names,
  decision rules, URLs, code. Uppercase micro-labels with wide letter-spacing.
  Sharp, terminal-adjacent, not decorative.

### Type

Pick and self-host (or load via `fontsource`, added to `web/package.json` — no
runtime CDN dependency):

- a bold geometric/grotesque sans for display and UI
- a real monospace with good zero/one distinction for data (JetBrains Mono,
  IBM Plex Mono or similar)

Two families total. Wire them into `--sans` / `--mono` and delete the current
system-font stacks.

### The one deliberate exception

**The untrusted page keeps its own look.** `PageFrame`'s rendered page and
`shared/site-css.js` stay bright and paper-like. That contrast is load-bearing —
it keeps "the untrusted thing" and "the thing telling you about it" separable at
a glance. Restyle the chrome *around* the iframe, not the page inside it.

### Also update

- `web/index.html` — the favicon is an inline SVG still carrying the old teal
  `#34d3c8` and a rounded `rx`. Rebuild it on the new tokens, zero radius.
- Add layout/animation libs only if genuinely needed. Default to none; React 18 +
  plain CSS is sufficient for this aesthetic.

### Components to propagate through

`App.jsx`, `components/Viewer.jsx` (459 lines, the split pane + provenance
trace), `components/PageFrame.jsx` (384, the iframe and X-ray overlay),
`components/Arena.jsx` (361), `components/Panels.jsx` (310),
`components/Scorecard.jsx` (225), `components/About.jsx` (215).

The X-ray overlay in `PageFrame` needs care: it highlights concealed spans over
the bright page, so its colours must read against paper, not against ink. Acid
on bright is the natural call — verify it actually reads.

---

## 4. Constraints

- Everything must still run with **no API key**. The deterministic provider stays
  the default.
- `npm run verify` (35 assertions) must pass. Extend it to cover core's extracted
  interface and the MCP adapter's decisions.
- `npm run eval` must still regenerate `SCORECARD.md` against the built-in mock.
- Keep the safety properties in `README.md` §"Safety of the attack range" intact:
  Arena sanitisation, `script-src 'none'`, iframe without `allow-scripts`,
  non-resolvable `.tld`/`.invalid` destinations only.
- The agent never browses the live web from the sandbox.
- Update `README.md` to match the new architecture — the "What is mocked" table
  is now about the sandbox specifically, not the whole product.

---

## 5. Two honest caveats to preserve in the docs

Do not quietly drop these while writing product copy:

1. The destination rule covers **exfiltration**, one consequence class. It does
   nothing about an agent injected into *deleting* files or *approving* a
   transaction — there is no destination to trace.
2. The overlap scan is **verbatim-based**. A payload the model paraphrases rather
   than copies will not overlap.

Tracer's credibility comes from stating its ceiling. Keep doing that.
