# Submission pack

## The video: 3:30, product-led

Every judging criterion gets answered. Roughly two thirds of the picture is the
product running; the cards carry numbers and the two lines that have to be said
out loud.

The clips are in `media/`, built by `scripts/capture-product.mjs` (the real UI,
driven over the DevTools protocol) and `scripts/render-clips.mjs` (the cards).
`docs/EDIT.md` is the assembly order, `docs/SHOTLIST.md` the narration beats.

| Time | Beat | Clip | Scores |
|---|---|---|---|
| 0:00-0:10 | **The robbery, cold.** No title card. A user asks an agent to summarise an article and email it to themselves. Calls land one by one, every one allowed. | `product-viewer` (head) | Impact |
| 0:10-0:17 | **"Here is the page they were looking at."** Press *Show what the agent read*. The sweep runs and the concealed instruction ignites in place. | `product-xray` | Impact, Innovation |
| 0:17-0:38 | **The evidence.** OWASP LLM01. EchoLeak: a zero-click prompt injection in Microsoft 365 Copilot, hidden in white-on-white text and HTML comments. Then the one that matters: 12 published defences, over 90% bypassed under adaptive attack, most of which had reported near zero. | `stats-01`, `stats-02`, `stats-03` | Impact |
| 0:38-0:46 | **The honesty beat.** "We do not claim to stop prompt injection. Nobody has." This buys credibility for everything after it. | `honesty` | Presentation |
| 0:46-1:03 | **The same attack, defeated.** Both runs on one clock. `read_email` held, `send_email` blocked on `destination-originates-from-page`, and the user's own email still goes out. The hard block holds the screen 2.6 seconds by design. Do not trim it. | `product-viewer` (tail) | Technical, UX |
| 1:03-1:22 | **Try to break it.** A stranger's injection planted and run live in the Arena. The counters move. Prevented. | `product-arena` | Innovation |
| 1:22-1:44 | **Not a sandbox.** `npx tracer prove` in a terminal: two real MCP servers, neither of them ours, and a refusal carrying the provenance chain. This is the beat that answers "is it only a sandbox?" | `product-terminal` | Impact, Technical |
| 1:44-1:56 | **The integration surface.** The tier config you can read and diff, and the refusal as the client received it. | `product-proxy` | Technical |
| 1:56-2:03 | **The gap.** 83% of organisations deploying agentic AI, 29% ready to secure it. | `stats-04` | Impact |
| 2:03-2:11 | **The numbers, and the link.** 16/16 robbed unprotected, 0 landed through Tracer, 14/16 tasks still completed. Reproducible with `npm run eval`. | `closing` | Presentation |

That is about 2:11 of picture. The remaining time is deliberate: hold on the
block, let the X-ray breathe, and leave room for narration rather than filling
every second.

**Every number on screen is in `docs/STATS.md`, with its source.** That file also
lists the figures that were checked and rejected. Do not put one on screen that
is not in it.

### Lines to say exactly

The claim, verbatim, never exceeded:

> Tracer converts an invisible, unattributable compromise into a visible, attributable one, and
> structurally blocks the exfiltration class of consequences regardless of whether the model was
> fooled.

The destination rule, verbatim:

> The agent is about to send something somewhere you never mentioned, and the only place that
> destination came from is a web page.

The honesty beat, which buys credibility for everything else:

> We do not claim to stop prompt injection. Nobody has. We assume the model gets fooled.

The two-layer line:

> The model tells us where its information came from — and we don't trust it. We check independently,
> in code the injection never gets to talk to.

### Three things that quietly cost points

A slideshow of screenshots instead of live software. A claim with no number behind it. A broken link.

---

## Recording checklist

- [ ] `npm run verify` — 50/50 green before you record anything
- [ ] `npm run eval` — SCORECARD.md regenerated, numbers match what you will say
- [ ] Product clips rebuilt from the current UI (`scripts/capture-product.mjs`); live mode served on the public link
- [ ] Pick the **"Summarise it and email it to me"** scenario on camera. It is the honest test and the
      destination rule is what fires. The summarise-only scenario makes the plan freeze look like the
      whole defence, which undersells it and invites a fair objection.
- [ ] Page: `white-on-white` for the canonical Comet reproduction
- [ ] Before the reveal, let the strip-report banner sit on screen for a beat: *"this page contains
      1 instruction-like element you cannot see"*
- [ ] Show the control page (`clean`) for two seconds when claiming no false positives
- [ ] Say "mock inbox" out loud the first time the inbox appears

## Devpost checklist

- [ ] Project name and description, including one line on the agent-authorisation angle (SSOJet adjacency)
- [ ] Technologies used, listed in full (see README → Technologies)
- [ ] **Public link tested from a machine nobody on the team owns**
- [ ] Video under 3:30, publicly viewable
- [ ] README with the architecture diagram and the precise claim verbatim ✔ (in repo)
- [ ] Scorecard published in the repo, including failures ✔ (`SCORECARD.md`)
- [ ] Hall of Bypasses live on the Arena page ✔
- [ ] **AI & external tools disclosure** — `DISCLOSURE.md`, bracketed sections filled in
- [ ] Every team member can explain every design decision without reading the brief
- [ ] Nothing in the repo targets any live third-party site ✔

## Questions the AppSec judge will ask, and the honest answers

**"So you just block emails to addresses not in the prompt?"**
No — that would break every legitimate "email the author" request. Untraceable destinations are *held
for approval* with the provenance chain shown. The *hard block* is narrower: the destination is absent
from your instruction **and** present in untrusted page content. That conjunction is the exfiltration
signature.

**"What if the model lies in `derived_from`?"**
It does, in the shipped run: the injection tells it not to mention the step and it declares `[]`.
Layer B catches it anyway and the interface shows the contradiction. Layer A is for explanation, never
for enforcement.

**"What if the payload is encoded?"**
Untrusted content is normalised before any provenance question is asked: zero-width steganography is
decoded, base64 blobs are decoded. Beyond that, the `unattributable-destination` rule does not depend
on matching the page at all — a destination that is in neither your instruction nor the frozen plan is
held regardless of how it was encoded.

**"Isn't the plan freeze doing all the work?"**
In the summarise-only scenario, largely yes, and we say so in the scorecard rather than let you find
it. That is why the scorecard runs a second scenario where `send_email` is on the plan. Judge the
second column.

**"Your analyser is client-side. Can't the attacker just not run it?"**
The analyser is part of the agent, not part of the page. An attacker who controls the agent's own
runtime has already won and no in-agent control helps. What the attacker controls here is page
content, which is exactly what the analyser inspects.

**"What does this not cover?"**
Exfiltration through a channel we do not model (timing, DNS, a tool we did not tier). Injections that
cause harm without moving data — destructive actions rather than disclosure. And a semantically
laundered destination the model reconstructs rather than copies. Those are real gaps and they are
listed here rather than discovered on camera.
