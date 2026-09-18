# Tracer — execution brief: make it real, on camera

**For a fresh session.** Read this fully before touching anything. Then read
`README.md` (what Tracer is), `docs/SUBMISSION.md` (the video script this build
serves), and `SCORECARD.md` (the numbers we publish).

---

## 0. The goal, stated once

Tracer is being built to win the TLN Cybersecurity Challenge 2026. The mechanism
already works — 50 assertions pass, the policy engine is sound, the MCP proxy
connects to real servers. What is missing is **proof that anyone can watch.**

Every item in this brief is justified by one question: *does this make the thing
more demonstrable, or does it just make the repo more complete?* If the answer is
the second, it is not in this brief.

### Explicitly deferred: the dashboard

A decisions dashboard was scoped and **cut on purpose.** It is a feature judges
read about rather than watch. We keep the *write path* (below, §1) so that "we
record every decision; the dashboard is a view away" is a demonstrable claim
rather than an assertion — but no dashboard UI, no approve/release round trip,
no held-request mechanics. Do not build them.

---

## 1. Codebase ground truth

Read these before changing anything.

| File | Lines | What it is |
|---|---|---|
| `core/src/policy.js` | 402 | `evaluate(call, ctx)` — tiers, destination rule, decisions |
| `core/src/overlap.js` | 297 | Layer B: normalise (zero-width, base64, case) then scan; `scanOutputChannels` |
| `core/src/loop.js` | 366 | Plan-then-execute; `createContext({goal, registry, protectedMode, host})` |
| `core/src/registry.js` | 220 | Tier config as schema; `createRegistry`, `destinationOf(call)` |
| `core/src/analyser/analyse.js` | 403 | The analyser (DOM-optional) |
| `adapters/mcp/src/proxy.js` | 306 | The MCP proxy. `CallToolRequestSchema` handler is `async` |
| `adapters/mcp/src/session.js` | 182 | `ProxySession`: run context, `beginTask`, `evaluate`, `registerResult`, `SECRET_PATTERNS` |
| `adapters/mcp/src/config.js` | 84 | Tier loading, `untrustedMatcher`, `explainCoverage` |
| `adapters/browser/src/content.js` | 131 | Analyser + X-ray in the page |
| `shared/attacks.js` | 305 | The 15-attack manifest — single source of truth |
| `scripts/eval.mjs` | — | Generates `SCORECARD.md`; already reads `MODEL_PROVIDER` (line 62) |
| `cli/test.mjs` | 471 | `tracer test` — targets `mock`, an HTTP endpoint, an MCP config |
| `server/src/index.js` | — | Express; `/api/*`. No database — `readFileSync` only |

### What already works — do not rebuild

- `npm run verify` — 50 assertions, all passing. **Keep them passing.**
- `npm run eval` — regenerates `SCORECARD.md` end to end.
- The proxy connects to real MCP servers over stdio and republishes tools as
  `<server>.<tool>`.
- Tool *results* already register as untrusted spans (`session.registerResult`) —
  this is what lets the destination rule fire in the proxy.
- `decisionPayload(decision)` already produces exactly the JSON a store persists.

---

## Workstream A — the proof-of-life demo *(highest priority)*

**Goal: a recorded, reproducible demonstration of Tracer blocking a real tool
call in a real MCP client.** Today the only thing anyone can watch is the
sandbox, and all six of its tools are mocks. The README claims the proxy "has
been run end to end against real MCP servers" and there is no artifact proving it.

This is the single highest-value item in the brief. It converts the strongest
claim in the project from text into evidence.

### A1. Get the proxy running against a real client, end to end

1. Pick the demo stack: `filesystem` MCP server (tier 1 reads, tier 2
   `write_file`) plus `fetch` (tier 0). Both are `uvx`/`npx`-installable and need
   no credentials — important, because a judge may want to reproduce it.
2. Wire it into a real client — Claude Desktop or Cursor — using the
   `mcpServers` config block already documented on the `#proxy` page.
3. Drive the canonical scenario: agent fetches a page containing a hidden
   instruction; agent reads a local file (tier 1); agent attempts to write or
   send to a destination that came from the fetched page (tier 2) → **blocked**,
   with the provenance chain in the refusal text.
4. Capture: the startup tier table on stderr, the client transcript showing the
   refusal, and the refusal text in full.

**If a real client's behaviour makes this awkward** (timeouts, tool-name
handling, the agent not calling `tracer_begin_task`), fix the proxy rather than
the demo — see Workstream B. Do not fall back to a mock and call it real.

### A2. Make the run reproducible by a stranger

- A `demo/` directory or documented recipe: the exact `tiers.json`, the exact
  page with the injection (served locally from the range, not the live web), and
  the exact client config.
- A single command that sets it up, in the spirit of the existing CLI:
  `npx tracer demo-proxy` or equivalent.

### A3. Put the evidence on the `#proxy` page

The page is currently all configuration and no outcome. Add the captured
artifacts: the stderr tier table, and the refusal as it arrives in the client.
The Viewer spends enormous effort making a blocked call *visible*; the page
describing the real adapter shows none of it.

### A4. Same treatment for the extension

`adapters/browser` is the only host where the X-ray survives, and `#extension`
has no screenshot. Load it unpacked, run it against a range page, capture the
X-ray lighting up concealed spans in place, and put that on the page.

### Definition of done

- A real MCP client, with real MCP servers behind Tracer, visibly refuses a
  tier-2 call, with the provenance chain in the refusal.
- The setup is reproducible from the repo by someone who is not you.
- `#proxy` and `#extension` each show an artifact of the thing working.

---

## Workstream B — make the proxy survivable for a modern agent

**Goal: an agent that has never heard of Tracer can run behind it without
hitting a wall of holds.** Today `requireTask: true` means that if the client
skips `tracer_begin_task`, every tier-2 destination becomes unattributable and
escalates. That is honest, and it is also the thing most likely to break the
demo in Workstream A.

### B1. Degrade instead of escalating everything

When no task has been declared, do **not** escalate every tier-2 call. Instead:

- Keep the destination rule running — it depends on the spans, not on the plan,
  so it works with no goal at all. A destination that came from fetched content
  and appears nowhere is still blockable.
- Escalate only where the *absence of a goal* is what creates the ambiguity.
- Say which mode it is in, in the startup banner and in every decision's
  explanation.

The README's line — "noisy on purpose; it is the honest failure mode" — stays
true, but the noise should be proportionate.

### B2. Infer a provisional goal

MCP clients pass context. Where a goal can be derived (first user-facing tool
call, a `--goal` flag, a `goal` in config), use it and **label it as inferred**
in the decision text. An inferred goal must never be treated as a frozen plan.

### B3. Surface the escape hatch

`--goal` / config `goal` already exists and is the right answer for
single-purpose agents. It is currently buried in a `small muted` paragraph at the
bottom of `#proxy`, below the limitation it solves. Move it up.

### B4. Scan tool descriptions — *security fix, do this first*

**The proxy currently republishes upstream tool descriptions verbatim** (it
appends `[Tracer: tier N]` and forwards). A malicious MCP server can put an
injection in its own tool description, and Tracer passes it through unexamined —
making the firewall a delivery vehicle for the attack class it exists to stop.

Fix: at `listTools` time, run descriptions through the analyser and register them
as untrusted spans, exactly as tool results are. Add a test.

Do this **before** the rest of Workstream B, because it is a live weakness in
shipped code rather than an ergonomics gap.

### Definition of done

- An agent that never calls `tracer_begin_task` still gets useful protection and
  a workable number of holds.
- Tool descriptions are scanned and registered; a test proves it.
- `npm run verify` passes.

---

## Workstream C — evidence that is not self-generated

**Goal: the published numbers stop being scored entirely against material we
wrote.** Today the 15 attacks are ours and mostly uncited, and the scorecard runs
against a deterministic regex attacker in the same repo.

### C1. Live-model scorecard column

`scripts/eval.mjs` already reads `MODEL_PROVIDER` from env, already labels runs
with `provider.label` / `provider.live`, and already handles fallback. The loop
is provider-agnostic.

1. Run `npm run eval` with `MODEL_PROVIDER=openai` (or `vertex`).
2. Extend `eval.mjs` to emit **both** runs into one scorecard — a deterministic
   column and a live column, per attack and in the tallies — rather than
   overwriting.
3. Render the second column in `web/src/components/Scorecard.jsx`.
4. Record the model id and run date beside the live column.
5. Add `--attacks` and `--scenario` filters so partial runs are cheap during
   development; do the full sweep once for the published figure.

**Expect it not to be 15/15.** A real model paraphrases, and the README already
concedes Layer B's n-gram half does not survive paraphrase. The destination rule
should hold, because an address is an address.

**Publish whatever happens.** A live-model bypass is the most valuable row in the
repo — the first externally-generated evidence about the defence. Do not tune the
range to make the number go back up.

### C2. Attack provenance

`shared/attacks.js` has 15 entries and exactly one carries a source
(`white-on-white` → the Brave/Comet finding). The README leans on OWASP, CSA and
Five Eyes; the manifest cites none of it.

Add a `source` field (citation + URL) to every attack. Surface it in the Viewer's
attack note and the Scorecard's per-attack table. Where an attack is a general
technique with no canonical source, say so rather than inventing one.

### C3. Two new attack classes — the demonstrable ones

Full coverage of missing classes was scoped and trimmed to the two that show
well and close real gaps:

| Class | Why | Where |
|---|---|---|
| **Tool-description poisoning** | Proves the B4 fix; it is the MCP-native attack and no range page covers it | new range/test case |
| **Paraphrase** | The README *states* this ceiling and never measures it. A stated ceiling should be a measured one | new range page |

Deferred, and fine to state as known gaps: multi-turn memory persistence,
homoglyph destinations, split payloads.

### Definition of done

- `SCORECARD.md` shows deterministic and live side by side, with model id and date.
- All 15 attacks carry a source, surfaced in the UI.
- Two new classes on the range, in the scorecard, including anything that gets through.

---

## Workstream D — the demo surface

**Goal: a first-time visitor understands what they are looking at.** Cheap fixes
only; this is polish in service of the video, not a redesign.

### D1. Kill the jargon (≈1 hour, all of it)

| Fix | Where |
|---|---|
| Rename nav groups → `Try it` / `Test your agent` / `Protect your agent` | `App.jsx` `NAV` array — 3 string literals |
| Swap Home's card hierarchy: taglines become headings, `Sandbox`/`Range`/`Proxy` demote | `Home.jsx` `SURFACES` |
| Viewer loading text: drop "range" → "analysing 17 test pages in a sandboxed iframe" | `Viewer.jsx` |

"Range" is firing-range jargon. "Sandbox" reads as *toy* — the exact impression
the README works to escape.

### D2. Side-by-side A/B *(the one that matters for the video)*

The Viewer currently shows unprotected **or** protected behind a toggle
(`which === 'unprotected' | 'protected'`). The single most persuasive thing in
the project — same model, same page, one robbed and one not — requires the
viewer to toggle and hold the first result in memory.

Show both at once. This is real work and it is worth it: `docs/SUBMISSION.md`
budgets 1:35–2:45 for exactly this beat.

### D3. Promote Reveal

The X-ray is the mechanism nobody else has, and it is a small toggle the UI has
to *prompt* you to press ("Press **Reveal** to see the page the agent read").
Make it a primary control with its own label.

### Definition of done

- No unexplained jargon in the nav or on first load.
- Robbed and defended visible simultaneously.
- Reveal reads as a main action.

---

## Workstream E — the decision store *(write path only)*

**Goal: "we record every decision; a dashboard is a view away" becomes
demonstrable.** Roughly an hour. No UI.

- Use **`node:sqlite`** (built into Node 22, already required). Do **not** add
  `better-sqlite3` — the repo's "no database, no container" claim stays mostly
  intact with a built-in, and that is worth preserving and saying.
- Two tables: `decisions` (`id`, `session_id`, `ts`, `tool_name`, `tier`,
  `decision`, `rule`, `layer`, `headline`, `explain_json`, `chain_json`,
  `destination_json`, `args_redacted_json`) and `sessions` (`id`, `started_at`,
  `goal`, `plan_json`, `task_declared`).
- `decisionPayload(decision)` in `proxy.js` already produces the right shape.
- **Redact before writing.** `SECRET_PATTERNS` in `session.js` already extracts
  secrets; mask them in `args_redacted_json`. An audit log that stores the OTP it
  protected is a new vulnerability, not a feature.
- Expose it through the existing `tracer_status` tool and a CLI dump
  (`npx tracer log`) so it is showable on camera without a UI.

### Definition of done

- Every decision survives a proxy restart.
- No secret value appears in stored args.
- One command prints the decision history.

---

## Sequencing

```
B4 (tool-description scan)   ← security fix, and it touches proxy.js first
  ↓
A1–A2 (proxy running for real, reproducibly)
  ↓
B1–B3 (survivability — driven by whatever A1 exposes)
  ↓
E (decision store)  ∥  C1 (live scorecard)  ∥  D1 (jargon)
  ↓
A3–A4 (evidence onto the pages)
  ↓
D2–D3 (side-by-side, Reveal)  ∥  C2–C3 (sources, 2 new classes)
```

**Why B4 first:** it is a live weakness in shipped code, and it touches
`proxy.js` — which A and B both rewrite around.

**Why A before B:** running it for real is what tells you which survivability
problems are actual rather than theoretical. Do not fix B1 speculatively.

### If time runs short

Value order: **A1–A3** > **B4** > **D1–D2** > **C1** > **E** > **C2–C3** > **A4** > **D3**.

A working demo of a real block beats everything else in this brief. If only one
thing lands, it is that.

---

## Non-goals and traps

### Do not build

- **The dashboard, the approval queue, the hold/release round trip.** Cut
  deliberately. §5 keeps the write path; that is the whole scope.
- **MCP HTTP/SSE transport.** Needed eventually for remote servers; not for this.
- **The bring-your-own-agent web form.** Valuable, independent, not this brief.
- **Any new native dependency.** `node:sqlite` is sufficient.
- **A second server process.** Anything web-facing goes on the existing Express app.

### Traps

**Do not weaken the honest failure modes to make the demo smoother.** The README
argues that a visible failure beats a silent one, and that argument is load-bearing
for the project's credibility. B1 makes the noise *proportionate*; it must not
make Tracer quieter by making it less strict. If a change makes the demo feel
better by making the defence weaker, that is a regression.

**Do not mock anything new.** The sandbox's mocks are disclosed and legitimate.
Workstream A exists precisely because the demo is currently all mocks; adding
another one defeats it.

**Do not tune the range to protect the score.** If the live model or a new class
produces a bypass, publish it. The Hall of Bypasses and the "we publish what gets
through" stance are the credibility engine.

**Keep README claims in sync with the code.** The README is unusually precise
about what Tracer does and does not do. This build changes several statements —
the "no database" line in Technologies, the escalation behaviour in
`adapters/mcp/README.md`, and the attack count. Update them in the same change.

### Standing constraints

- The attack range must never target infrastructure the project does not own.
  All destinations use `.tld` pseudo-TLDs or `.invalid` hosts (RFC 2606).
- `npm run verify` must pass at every landing point.
- Tracer is defensive. New attack classes exist to test the defence.

---

## What the video needs from this build

`docs/SUBMISSION.md` already scripts five minutes around three wow moments. This
build exists to make three of those beats real rather than described:

| Beat | Needs |
|---|---|
| 1:35–2:45 — "the same attack, defeated" | **D2** side-by-side |
| 2:45–3:25 — "how" | **D3** Reveal as a main action |
| 4:15–5:00 — "what ships next" | **A1–A3**: a real client, real servers, a real refusal |

The submission checklist already warns that "a slideshow of screenshots instead
of live software" quietly costs points. Workstream A is the answer to that
warning.
