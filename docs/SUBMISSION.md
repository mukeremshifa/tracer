# Submission pack

## The video: 2:39, product-led

Two thirds of the picture is the product running. The cards carry the numbers
and the two lines that have to be said out loud.

The finished pieces are `media/tracer-silent.mp4` (picture, no audio) and
`media/tracer-voice.mp3` (narration). Both start at 0:00 and are the same
length, so they drop onto a timeline together. `media/tracer-preview.mp4` is the
two muxed, for checking.

Sources: `scripts/capture-product.mjs` drives the real UI over the DevTools
protocol, `scripts/capture-client.mjs` renders the captured MCP exchange,
`scripts/render-clips.mjs` builds the cards, `scripts/assemble-cut.mjs` cuts
them together. `docs/EDIT.md` is the assembly order; `docs/VOICEOVER.md` is the
script.

| Time | Beat | Clip | Scores |
|---|---|---|---|
| 0:00-0:14 | **The robbery, cold.** No title card. A user asks an agent to summarise an article and email it to themselves. Every call is allowed, and a one-time passcode leaves for a stranger. | `product-viewer` (head) | Impact |
| 0:14-0:30 | **"Here is the page it was reading."** The camera pushes in, the sweep runs, and the concealed instruction ignites in place with the rule that will stop it stamped underneath. | `product-xray` | Impact, Innovation |
| 0:30-0:53 | **The evidence.** OWASP LLM01. EchoLeak, a zero-click injection in Microsoft 365 Copilot hidden in white-on-white text and HTML comments. Then the one that matters: 12 published defences, over 90% bypassed under adaptive attack, most of which had reported near zero. | `stats-01`, `stats-02`, `stats-03` | Impact |
| 0:53-1:02 | **The honesty beat.** "We do not claim to stop prompt injection. Nobody has." This buys credibility for everything after it. No music under this one. | `honesty` | Presentation |
| 1:02-1:20 | **The same attack, defeated.** Both runs on one clock. `read_email` held, `send_email` blocked on `destination-originates-from-page`, and the user's own email still goes out. | `product-viewer` (tail) | Technical, UX |
| 1:20-1:34 | **Try to break it.** A stranger's injection, planted and run live, blocked on the same rule. | `product-arena` | Innovation |
| 1:34-1:53 | **Sixteen classes, all measured.** The landing page: every concealment class scored in public, and the three rules, none of which ask the model to be right. | `product-landing` | Technical |
| 1:53-2:15 | **Not a sandbox.** Tracer inside a real MCP client, in front of two real servers. The agent follows the page's instruction and the refusal arrives as the model's own error, provenance chain attached. The strongest beat in the cut. | `product-client` | Impact, Technical |
| 2:15-2:23 | **In front of a team.** Every decision, every refused destination, and nothing that only reads was ever stopped. Labelled a preview, because it is. | `product-dashboard` | UX |
| 2:23-2:31 | **The gap.** 83% of organisations deploying agentic AI, 29% ready to secure it. | `stats-04` | Impact |
| 2:31-2:39 | **The numbers, and the link.** 16/16 robbed unprotected, 0 landed through Tracer, 14/16 tasks still completed. Reproducible with `npm run eval`. | `closing` | Presentation |

**Every number on screen is in `docs/STATS.md`, with its source.** That file also
lists the figures that were checked and rejected. Do not put one on screen that
is not in it.

### Captions and music

The lower third is occupied during the product shots: the rule stamp and
`DATA LEFT` at 1:10, the tool calls typing in at 2:00. Captions there cover the
frames the video exists for. The stat cards have an empty lower third and carry
the numbers, so caption those and leave the product footage alone; it already
carries burned-in text doing the same job.

Music, if any, belongs on the cards for the same reason. The product footage is
evidence and plays dry. Nothing under the honesty beat at 0:53.

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
