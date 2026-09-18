# Tracer — product-surface handoff (web UI)

One pass, end to end. No phases. This brief is the whole scope; read it fully
before touching anything.

**Read first, in this order:** `README.md` (what Tracer is and the three-surface
claim), `HANDOFF.md` (the previous build — architecture decisions already made,
do not relitigate), then this file.

**This build changes `web/` and one server endpoint. It does not change `core/`,
`adapters/`, or `cli/`.** Those are done and correct. If you find yourself
editing the policy engine, you have misread the brief.

---

## 0. The problem, in one paragraph

The previous build shipped the architecture: `@tracer/core` extracted, the MCP
proxy and the browser extension both real, a `tracer` CLI with `test` / `proxy` /
`sandbox` / `extension`. The README makes a three-surface argument — **sandbox
(try it) · range (test your agent) · proxy (protect your agent)**. The web UI
makes none of it. `grep -rniE "npx|mcp|proxy|extension|install|adapter|integrat"
web/src web/index.html` returns **zero hits**. All four tabs (Viewer, Arena,
Scorecard, How it works) are the sandbox. A first-time visitor on `localhost:5173`
lands on a configuration panel for a demo whose purpose has not yet been stated,
and leaves with no idea that Tracer can be put in front of a real agent. The
engineering is a product; the UI is a diorama. `HANDOFF.md` §2 asked for "the web
UI should make these three legible as distinct things" and that is the one line
that was not delivered. This build delivers it.

**What is NOT wrong and must not be "fixed":** the visual system (acid/ink/bone,
zero radius — it landed and it is good), the honesty posture (published bypasses,
stated ceilings), the provenance-line trace in the Viewer, the paper-vs-ink
contrast around the iframe. Do not restyle. Do not soften the caveats. This is an
information-architecture build, not a redesign.

---

## 1. Scope

1. A **landing route** that states the problem, the claim, and the three surfaces.
2. **Navigation restructured** around the three surfaces, not around internal
   component names.
3. **Two integration pages** — MCP proxy, browser extension — with real,
   copyable config drawn from files that already exist in the repo.
4. The Viewer's **payload before its configuration**.
5. **Honest labelling**: every sandbox surface says it is the sandbox.

---

## 2. Current state — exact facts you will need

### Routing
`web/src/App.jsx` — hash routing, `TABS` array at lines 8–13, `hashTab()` reads
`window.location.hash`, default `'viewer'`. Tabs render as
`{meta && tab === 'x' && <Component />}` in `<main className="page">`. There is no
router library and none should be added; extend the existing hash scheme.

### Components (line counts are current)
| file | lines | what it is |
|---|---|---|
| `web/src/App.jsx` | 137 | shell, topbar, tabs, footer |
| `web/src/components/Viewer.jsx` | 459 | split pane, plan/call log/decision, provenance line |
| `web/src/components/Arena.jsx` | 361 | BYO-injection, scoreboard, Hall of Bypasses |
| `web/src/components/Scorecard.jsx` | 225 | reads `/api/scorecard` |
| `web/src/components/About.jsx` | 215 | the thesis: position, two layers, destination rule, tiers, caveats |
| `web/src/components/PageFrame.jsx` | 204 | iframe + X-ray overlay |
| `web/src/components/Panels.jsx` | 312 | `CallLog`, `DecisionCard`, `PlanPanel`, `ProvenanceLine`, `Verdict` |
| `web/src/styles.css` | 1116 | the visual system |

### API client
`web/src/lib/api.js` — `meta`, `runPair`, `run`, `transcripts`, `transcript`,
`demoTranscript`, `scorecard`, `arenaPage`, `arenaAttempt`, `scoreboard`.
`/api/meta` (`server/src/index.js:95`) returns `claim`, `providers`,
`activeProvider`, `tools[]`, `tiers`, `families`, `attacks[]`, `rangePages`,
`extraPages[]`, `techniques`, `mockWorld`.

### Vite
`web/vite.config.js` — port 5173, proxies `/api`, `/range`, `/arena` to
`localhost:8787`. Aliases `@shared` and `@tracer/core`. Do not change.

### Visual system — reuse, do not invent
Tokens in `web/src/styles.css:19-41`: `--acid #cdfb41`, `--ink #131313`,
`--bone #f4f5f0`, plus alpha steps `--bone-80/60/45/30`, `--hair`, `--hair-soft`,
`--lift`, `--acid-30`, `--acid-12`, `--ink-60`. Fonts `--sans` (Space Grotesk),
`--mono` (JetBrains Mono). **No new hex values. `border-radius: 0` is enforced
globally via the `*` rule — do not add radii.** Semantic states: allow = bone,
escalate = acid, block = bone on inverted/acid-bordered. No red/amber/green.

Existing class vocabulary to reuse: `wrap` `narrow` `stack` `row` `col` `grow`
`panel` `panel-head` `panel-title` `panel-body` `title` `lede` `claim` `notice`
`tag` `tier` `btn` `primary` `ghost` `sm` `seg` `field` `label` `select` `input`
`textarea` `mono` `small` `tiny` `muted` `faint` `grid` `table-wrap` `stat`
`stats` `kbd` `spinner` `truncate` `nowrap` `sr-only`.

### Source of truth for integration copy — quote, do not invent
- `adapters/mcp/README.md` — proxy behaviour, the `tracer_begin_task` /
  `tracer_status` cooperation caveat, the `mcpServers` client snippet.
- `adapters/mcp/tiers.json` — real starter tiering. Note `defaultTier: 2`,
  `requireTask: true`, `untrusted[]` globs, and that `destination` is the field
  the hard block keys on.
- `adapters/browser/README.md` — MV3 load-unpacked steps, the
  `window.tracer.beginTask` / `.propose` / `.guard` bridge API, and the honest
  scope limit (works against your own agent and Tracer's sandbox; **cannot** sit
  inside closed products like Comet).
- `cli/tracer.mjs` — the `USAGE` block is the authoritative command list.

---

## 3. Build

### 3.1 Route map

Replace the four-tab `TABS` with a two-level structure. Keep hash routing; keep
old hashes working (`#viewer`, `#arena`, `#scorecard`, `#about` must not 404 —
redirect to their new homes).

```
#home        Landing. Default route. Replaces #viewer as the entry point.
#sandbox     The Viewer. Labelled "Sandbox".
#arena       The Arena. Labelled "Sandbox · Arena".
#scorecard   The Scorecard. Labelled "Range".
#proxy       NEW — MCP proxy integration.
#extension   NEW — browser extension integration.
#how         The About content, renamed "How it works".
```

Topbar nav should read as the three surfaces, not seven flat tabs. Suggested:
a primary group `Sandbox · Range · Protect your agent`, with `How it works` and
the landing reachable via the brand mark. Exact grouping is yours; the constraint
is that **a visitor can tell from the nav alone that Tracer is more than a demo.**

### 3.2 The landing (`#home`) — new component `web/src/components/Home.jsx`

This is the highest-value item in the build. It must do five things, in order:

1. **State the problem in one breath.** An agent that browses reads untrusted
   content and then acts. Anyone who can put text on a page can issue
   instructions it follows. Use the existing evidence from `README.md` — the
   2026 study, CSA April 2026 live exploitation, the Brave/Comet demonstration.
   Do not re-research; the citations are already in `About.jsx`.
2. **State the claim, verbatim.** Pull it from `meta.claim` (already on the API)
   rather than hardcoding, so it cannot drift. Immediately follow it with the
   honesty beat: *"We do not claim to stop prompt injection. Nobody has."*
3. **The three surfaces, as three equal cards.** This is the fix. Each card:
   name, one sentence, the command, and a link into the relevant route.
   - **Sandbox — try it.** Mock agent, mock inbox, local attack range. See the
     mechanism without wiring anything up. `npx tracer sandbox` → `#sandbox`
   - **Range — test your agent.** 15 known injection classes pointed at whatever
     agent you configure; emits a scorecard for *that* agent.
     `npx tracer test --target ./mcp.json` → `#scorecard`
   - **Proxy — protect your agent.** An MCP proxy that evaluates every forwarded
     tool call, and an extension that does the same in the page.
     `npx tracer proxy --config ./tiers.json` → `#proxy`
4. **One diagram** of the core contract — the `@tracer/core` box with three
   arrows in (sandbox, MCP proxy, extension) and `decision + provenance chain`
   out. The ASCII version in `README.md` §Architecture is the reference. Inline
   SVG or CSS grid, acid on ink, no new colours.
5. **Both caveats**, stated on the landing, not buried: the destination rule
   covers exfiltration only; the overlap scan is verbatim-based. These are the
   credibility moat — putting them on the front page is the point.

Do not add a fake "Get started free" / pricing / testimonial / logo-cloud
register. This is a security tool, not a SaaS splash. Spacious, bold, few
borders, per the existing system.

### 3.3 `#proxy` — new component `web/src/components/Proxy.jsx`

The page that answers "how do I put this in front of my agent". Content, all of
it already true and sourced from `adapters/mcp/`:

- The one-line mental model, and the pipeline diagram from the adapter README
  (`agent client → tracer-proxy → gmail / fetch / jira / slack`).
- **Install + run**, copyable:
  ```
  npm install
  npx tracer proxy --config ./tiers.json
  ```
- **The client wiring snippet** — the `mcpServers` JSON block from
  `adapters/mcp/README.md` §Run. This is the single most useful thing on the
  page; make it copyable with a copy button.
- **Tiering**, explained with the real starter config. Show the three tiers
  (0 inert, 1 private read, 2 external act) and an excerpt of
  `adapters/mcp/tiers.json`. Call out that `destination` is the field the hard
  block keys on — "the most important line in the file."
- **What you get / what you do not.** A two-column honest split. Gets: untrusted
  tool results registered as spans, the destination rule, self-explaining
  refusals carrying the provenance chain, zero-width + base64 decoding.
  Does not: **no visibility analysis, no X-ray** — a proxy has no rendering
  engine, and core reports `visibilityAware: false` rather than letting the
  absence read as a clean bill of health. Point to `#extension` for the X-ray.
- **The cooperation caveat.** `tracer_begin_task` / `tracer_status`; when an
  agent skips it, tier-2 destinations become unattributable and those calls
  escalate rather than run. Say it plainly, as the adapter README does.

### 3.4 `#extension` — new component `web/src/components/Extension.jsx`

- Load-unpacked steps from `adapters/browser/README.md`:
  ```
  npx tracer extension
  # chrome://extensions → Developer mode → Load unpacked → adapters/browser/dist
  ```
- **Why this host is different:** the analyser runs where the page renders, so
  real computed styles and real layout are available. This is the only host
  where the full thesis survives, including the X-ray.
- **The bridge API**, copyable, from the adapter README: `window.tracer.beginTask`,
  `.propose`, `.guard`. Include the line that Tracer does not execute your tools
  — "it answers *should this run, and what is it derived from*; the agent still
  owns its own hands."
- **Scope, honestly:** works against Tracer's own sandbox agent and an agent you
  are building. It cannot sit inside closed products like Comet. Do not soften.

### 3.5 Viewer — payload before configuration

`Viewer.jsx` currently opens on a control panel (page dropdown, scenario toggle,
two buttons, goal string, scenario note, attack note, progress line) at roughly
lines 209–320, before the visitor has been told what they are about to watch.
Invert it:

- A short framing header first: what is about to happen and why it matters —
  one or two sentences, e.g. *the user asked for a summary; watch where the
  verification code goes.*
- A clear **"Run the robbery"** primary action. The existing `Run both agents`
  and `Load recorded demo` both stay, but the primary path should be one obvious
  button, with page/scenario selection demoted to a secondary "configure" row
  that a curious visitor can open.
- Keep all existing behaviour intact: range pre-analysis, the unprotected-first
  ordering (`setWhich('unprotected')` — "the robbery first, always"), the
  playbar, the automatic trace on block/escalate. **Do not change the run logic
  or the player.** This is presentation only.
- Label the surface **Sandbox** somewhere persistent, with the honest note that
  all six tools are mocks and no tool performs network I/O.

### 3.6 Honest labelling pass

Every sandbox-backed surface (Viewer, Arena) carries a visible, quiet marker that
it is the sandbox — not a disclaimer wall, one line. The existing `About.jsx`
§"What is mocked, stated plainly" stays as the full version and should be linked
from those markers. Per `HANDOFF.md` §4, the "What is mocked" table is about the
sandbox specifically, not the whole product — make sure the new copy reflects
that scoping.

---

## 4. Constraints

- **No new dependencies.** React 18 + plain CSS is sufficient. No router, no
  animation library, no UI kit.
- **No new hex values.** Derive from the three tokens as alpha layers.
- **`border-radius: 0` everywhere.** The global `*` rule enforces it; do not
  override.
- Everything must still run with **no API key**. The deterministic provider
  stays the default.
- `npm run verify` must pass. `npm run eval` must still regenerate
  `SCORECARD.md` against the built-in mock.
- The agent never browses the live web from the sandbox.
- Keep the safety properties intact: Arena sanitisation, `script-src 'none'`,
  iframe without `allow-scripts`, non-resolvable `.tld`/`.invalid` destinations.
- **Do not weaken the two caveats** (exfiltration-only; verbatim overlap) while
  writing product copy. They move to a *more* prominent place, not a less one.
- Old hashes keep working.

---

## 5. Definition of done

- [ ] `grep -rniE "npx|mcp|proxy|extension|install" web/src` returns real hits.
- [ ] Landing at `#home` is the default route; states problem, claim, three
      surfaces, diagram, both caveats.
- [ ] `#proxy` and `#extension` exist with copyable, accurate config.
- [ ] Nav communicates three surfaces; old hashes redirect, nothing 404s.
- [ ] Viewer leads with the payload; run logic unchanged.
- [ ] Sandbox surfaces are labelled as sandbox.
- [ ] `npm run verify` passes; `npm run dev` clean on 5173; no console errors.
- [ ] No new deps, no new hex, no radii.
- [ ] **The 60-second test:** a stranger who lands on 5173 and reads nothing but
      headings can say what Tracer is, what it protects against, and how they
      would put it in front of their own agent.

---

## 6. Suggested order

1. `Home.jsx` + routing restructure in `App.jsx` (highest value, unblocks the rest).
2. `Proxy.jsx` and `Extension.jsx` (pure content, no state).
3. Viewer reordering (most delicate — touches a live component).
4. Labelling pass, then verify.

---

## 7. What needs Mukerem's input

Everything above is specified enough to build without blocking. These are the
genuine judgment calls:

1. **Does `npx tracer …` actually work for an outside user, or is it repo-local
   only?** Right now `bin.tracer` is declared in a `"private": true` root
   package. If Tracer is not published to npm, the landing should say
   `npm install && npx tracer …` *from the cloned repo*, not imply a global
   install. **Decide: publish to npm, or word the commands as repo-local.**
   Default if you say nothing: word them as repo-local, which is honest and
   costs nothing.

2. **Has the MCP proxy been run end-to-end against a real client** (Claude
   Desktop, Cursor, etc.) with a real MCP server behind it? If yes, the landing
   can say so and that is a large credibility win for judges. If not, the
   integration pages should describe it as implemented-and-testable rather than
   battle-tested. **Tell the next session which.** Do not let it claim a
   deployment that has not happened.

3. **Nav grouping wording.** "Protect your agent" as a nav label is clear but
   long. Alternatives: "Integrate", "Deploy", "Protect". Your call — otherwise
   the next session picks and moves on.

4. **A demo GIF/video on the landing.** `docs/SUBMISSION.md` plans a five-minute
   video. If a recording exists by build time, the landing should embed or link
   it above the fold. If not, the recorded-transcript player (`Load recorded
   demo`, already wired to `/api/demo-transcript`) is the fallback and needs no
   new asset. **If you have a video URL, hand it over; otherwise say "use the
   recorded transcript."**

5. ~~Fonts.~~ **Resolved, no input needed.** `@fontsource/space-grotesk` and
   `@fontsource/jetbrains-mono` are installed in `web/package.json` and imported
   at `web/src/main.jsx:7-10` (weights 500 and 700, self-hosted, no runtime CDN).
   The bold display type is available — use it. Noted here only so the next
   session does not re-check.
