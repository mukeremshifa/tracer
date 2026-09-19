# Intro stats — sourced, checked, and safe to say on camera

Every number the video asserts, with the primary source and the exact wording that
number supports. **Nothing here is from a statistics-aggregator blog.** Several
widely-quoted figures were checked and dropped; they are listed at the bottom so
nobody re-adds them.

The rule: if the primary source does not state it, we do not say it.

---

## Cleared for use

### 1. Adaptive attacks bypass 12 published defences, >90% success

> "By systematically tuning and scaling general optimization techniques — gradient
> descent, reinforcement learning, random search, and human-guided exploration — we
> bypass **12 recent defenses** (based on a diverse set of techniques) with attack
> success rate **above 90%** for most; importantly, **the majority of defenses
> originally reported near-zero attack success rates.**"

- Source: *The Attacker Moves Second: Stronger Adaptive Attacks Bypass Defenses
  Against LLM Jailbreaks and Prompt Injections*, arXiv:2510.09023
- Verified: abstract read verbatim at the arXiv abstract page.
- **Why it matters to Tracer:** this is the single strongest argument for not
  building a classifier. The defences did not merely underperform — they reported
  near-zero and were then broken. Say it exactly as written; the "originally
  reported near-zero" clause is the part that lands.

### 2. EchoLeak — CVE-2025-32711, Microsoft 365 Copilot

A zero-click indirect prompt injection in a shipping Microsoft product, enabling
unauthenticated data exfiltration from a single crafted email. Disclosed by Aim
Security. CVSS 9.3. Microsoft patched server-side and reported no exploitation in
the wild.

- Source: arXiv:2509.10540 (Reddy & Gujral, AAAI Fall Symposium 2025) for the
  academic write-up; CVE-2025-32711 for the identifier.
- **Why it matters to Tracer:** the concealment techniques were **white-on-white
  text and HTML comments** — two of the pages on our own range, by name. This is
  the closest thing to proof that the range models something real.
- Careful wording: it was found by researchers and patched. Do **not** imply it was
  exploited against real users. "The first documented zero-click prompt injection
  in a production LLM system" is supportable.

### 3. OWASP ranks prompt injection LLM01 — first, most critical

- Source: OWASP Top 10 for LLM Applications 2025 (LLM01:2025 Prompt Injection).
- Safe, uncontroversial, instantly recognised by an AppSec judge.

### 4. 83% plan agentic AI; 29% feel ready to secure it

> "83 percent of organizations we surveyed had planned to deploy agentic AI
> capabilities into their business functions, only 29 percent of organizations felt
> they were truly ready to leverage these technologies securely."

- Source: Cisco, *State of AI Security 2026*, quoted in Cisco's own blog post
  announcing the report.
- Note: the full report is gated. This figure is quoted directly by Cisco, so it is
  safe. The "73% of audited production deployments" figure attributed to the same
  report appears only in third-party summaries and is **not** cleared — see below.

### 5. Already in the repo and already checked

These are cited in README.md and were not re-verified in this pass; they were
sourced when the README was written:

- No attack scenario consistently blocked across leading agents (CSO Online).
- SecAlign misses roughly one in ten optimisation-based attacks (Sysdig).
- CSA confirmed indirect injection in the wild, April 2026.
- Five Eyes joint guidance on agentic AI, May 2026.
- Brave vs. Perplexity Comet — hidden text, agent fetched a passcode (arXiv 2511.19477).

---

## Checked and REJECTED — do not put these on screen

Each of these surfaced in a search-engine summary and **failed** verification at the
source it was attributed to. A fabricated number in a security pitch is worse than
no number.

| Claim | Why rejected |
|---|---|
| "Prompt injection attacks surged **340%** year-over-year" | Does not appear in the article it was attributed to. No primary source found. |
| "**$2.3 billion** in losses globally in 2025" | Same. Not in the cited page. No primary source found. |
| "Detection tools catch only **23%** of sophisticated attempts" | Not in the cited article. The only 23% figure there is HackerOne's on *agent adoption* — a different statistic entirely. |
| "**94.4%** of AI agents vulnerable" | Vendor blog (Straiker), attributed to an unnamed "2025 benchmark". No study, no sample size, no methodology. |
| "**73%** of audited production deployments" (Cisco) | Appears only in third-party summaries, not in Cisco's own blog. Gated report; unverifiable. |
| "Prompt injection in **73%** of production AI deployments" | Same figure, same problem. |
| "**62%** of enterprise exploits used indirect pathways" | Aggregator only, no primary source. |
| "Indirect injection is **55%+** of incidents" | The aggregator itself says "source not explicitly named". |

---

## Recommended intro sequence

Four beats. The argument is: *this is real, this is unsolved, so we did something
structurally different.*

1. **OWASP LLM01.** Prompt injection is the number one risk for LLM applications.
   Instantly legible, no argument to win.
2. **EchoLeak, CVE-2025-32711.** It already happened, in Microsoft 365 Copilot,
   zero-click — hidden in white-on-white text and HTML comments.
3. **12 defences, >90% bypassed, most originally reported near-zero.** The reason we
   did not build a detector.
4. **83% deploying agentic AI, 29% ready to secure it.** The gap Tracer sits in.

Then the honesty line, which the numbers have now earned:

> We do not claim to stop prompt injection. Nobody has. We assume the model gets fooled.

And only then Tracer's own numbers, which are ours and reproducible:
**16/16 robbed · 0 landed · 14/16 tasks still completed · 91 assertions.**
