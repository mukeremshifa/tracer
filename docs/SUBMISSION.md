# Submission pack

## The five-minute video

Every judging criterion gets explicitly answered. Three wow moments, spaced.

| Time | Beat | Scores |
|---|---|---|
| 0:00–0:30 | **The robbery.** No title card. A user asks an agent to summarise a news article and email it to themselves. The agent fetches a verification code from their inbox and emails it to a stranger. Silence. | Impact |
| 0:30–1:05 | **"Here is the page they were looking at."** Press REVEAL. *Moment 1.* Hidden instructions ignite across the article. | Impact, Innovation |
| 1:05–1:35 | **The evidence.** Five Eyes, May 2026. CSA confirmed live exploitation, April 2026. Not one attack scenario consistently blocked across leading agents. Then: so we didn't build a detector. | Impact |
| 1:35–2:45 | **The same attack, defeated.** Live, uncut. *Moment 2* — the provenance line traces from `verify@sec-update.tld` back to the invisible div. Point out that the user's own email still went out. | Technical, UX |
| 2:45–3:25 | **How.** One diagram. The line that matters: *the model tells us where its information came from, but we don't trust it — we independently check whether the destination came from a web page instead of from you.* | Innovation, Technical |
| 3:25–4:15 | **"Try to break it."** *Moment 3* — the Arena, live, plus the Hall of Bypasses. Then the scorecard, including the two-scenario table. State the precise claim. | Innovation, Technical |
| 4:15–5:00 | **Who this protects, what ships next, AI-tool disclosure.** | Impact, Presentation |

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

- [ ] `npm run verify` — 35/35 green before you record anything
- [ ] `npm run eval` — SCORECARD.md regenerated, numbers match what you will say
- [ ] Record the defended run against a **replay** (Viewer → "Load recorded demo"); serve live mode on the public link
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
- [ ] Video under 5:00, publicly viewable
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
It does, in the shipped demo — the injection tells it not to mention the step and it declares `[]`.
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
