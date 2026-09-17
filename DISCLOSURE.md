# AI and external tool disclosure

The TLN Cybersecurity Challenge requires a disclosure of which AI tools were used and how. This is
that disclosure. It is written to be more complete than required rather than less.

> **Fill in the bracketed sections before submitting.** Everything unbracketed is already accurate for
> this repository; the bracketed parts are facts only the team can supply honestly.

---

## 1. AI used to build Tracer

| Tool | How it was used |
|---|---|
| **[Claude Code / Cursor / other — name it]** | [e.g. drafted the analyser, the policy engine, the range generator and the React viewer from a written architecture brief; the team reviewed, corrected and tested every file.] |
| **[any other assistant]** | [e.g. research summarisation, README wording] |

**What the team did, not the tool:** [Be specific. Which design decisions were yours? At minimum,
this should name the architecture calls — the client-side analyser, the two-layer policy engine, the
destination rule, the two-scenario scorecard — and say who verified the security reasoning.]

**Human review.** [State who read the policy engine line by line, and confirm that every claim in the
README and the video was checked against the code before being said out loud.]

## 2. AI *inside* Tracer at runtime

This matters more than the build-time disclosure, because it is a claim about what the judges are
looking at.

Tracer runs an agent loop with three interchangeable model providers:

| Provider | What it is | Default? |
|---|---|---|
| `simulated` | **Not a language model.** A deterministic stand-in (~220 lines, `server/src/providers/simulated.js`) that reproduces exactly one behaviour: an agent that treats text found on a web page as an instruction from its user. | **Yes** |
| `openai` | Live OpenAI Chat Completions with native tool calling, `temperature=0`. | No |
| `vertex` | Live Google Vertex AI / Gemini function calling, `temperature=0`. | No |

**The deterministic provider is the default, and the running UI says so on screen at all times** —
the provider chip in the header, and a label on every transcript.

### Why a deterministic provider exists

1. **Reproducibility.** Anyone can clone this repo with no API key and regenerate `SCORECARD.md`
   exactly.
2. **A public Arena that strangers can hammer** cannot be metered by someone else's API bill.
3. **Demo determinism.** Model non-determinism has ruined more hackathon demos than bugs have.

### Why it does not weaken the security claim

Tracer's defence inspects **tool calls and provenance, never model internals or model text
classification**. The policy engine receives a tool name, its arguments, the frozen plan, and the
untrusted span store. It cannot tell which provider produced the call and does not care.

Set `MODEL_PROVIDER=openai` or `vertex` and the identical loop runs against a live model. The team
[should state here whether they did this, against which model, and what happened].

### What we are *not* claiming

- We are **not** claiming a language model was fooled in the runs shown by default. A deterministic
  component was configured to behave like a fooled model, because that is the input the firewall is
  designed to withstand.
- We are **not** claiming Tracer stops prompt injection. The precise claim is in the README and the
  video, and it is deliberately narrower.
- We are **not** using AI to detect injections anywhere in the system. There is no classifier. That is
  the design position, not an omission.

## 3. External data, services and content

- **No live web access.** The agent browses only the local static range and Arena-generated pages.
- **All six agent tools are mocks.** The inbox is `server/data/inbox.json`; the filesystem is
  `server/data/files.json`; `send_email` and `http_post` write to an in-memory sink that logs and
  discards. No tool performs network I/O.
- **No real personal data.** Every address, name and secret in the mock world is invented. The
  fictional publication ("The Range Ledger") and every article on it are invented.
- **Every exfiltration destination is non-resolvable** — `.tld` pseudo-TLDs and `.invalid` hosts
  (RFC 2606). Nothing in this repository targets infrastructure we do not own.
- **No third-party dataset, model weights or paid service** is bundled or required.

## 4. Third-party code

| Dependency | Licence | Why |
|---|---|---|
| React, React DOM | MIT | the viewer |
| Vite, @vitejs/plugin-react | MIT | build tooling |
| Express, cors | MIT | the API and static host |
| dotenv | MIT | optional local configuration |
| jsdom | MIT | **eval harness only** — not a runtime dependency |
| concurrently | MIT | dev convenience |

No UI kit, no component library, and no CSS framework: the interface in `web/src/styles.css` is
written for this project.

## 5. Statistics quoted

Every figure said on camera or written in the README is sourced in the README's Sources section and
was checked against the linked source. Where a number describes *our own* system it comes from
`SCORECARD.md`, which is generated by `npm run eval` and can be regenerated by anyone.

---

*[Signed — team name and members]*
