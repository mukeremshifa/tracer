# Shot list — 3:30 cut

Every beat, what is on screen, how long it actually runs, and what has to be true
before you hit record. Timings for the software beats are measured, not guessed:
they come from the beat table in `web/src/lib/player.js` and the event counts in
the transcripts named below.

**Narration is AI voiceover, and most of the picture is rendered rather than
recorded.** `media/` holds finished 1920x1080 MP4s built by
`node scripts/render-clips.mjs` from the same data the site serves, so a number
that moves is one command away from correct footage instead of a reshoot. Only
two beats are captured live -- the X-ray reveal and the proxy terminal -- because
those are the ones where software responding to a person is the point.

See `docs/EDIT.md` for the CapCut assembly order.

---

## Before you record anything

- [ ] `npm run verify` — 89/89 green
- [ ] `npm run eval` — SCORECARD.md matches the numbers on the stat cards
- [ ] `npm run shots` — extension screenshots current
- [ ] `node scripts/seed-arena.mjs` — Arena has entries, so it does not read as unused
- [ ] Deployed link loads from a machine you do not own, and `/og.png` renders in a Slack paste
- [ ] Display at 1920x1080, browser zoom 100%, no bookmarks bar, no notifications
- [ ] Close the tab strip clutter: one window, one tab per beat

---

## The cut

| # | Time | What is on screen | Source |
|---|---|---|---|
| 1 | 0:00–0:12 | **The robbery, cold.** No title. Viewer, unprotected side only. Agent reads a page, opens the inbox, sends the passcode to a stranger. Land on the red verdict. | Live, `#sandbox` |
| 2 | 0:12–0:22 | **"Here is the page they were looking at."** Press **Show what the agent read**. The X-ray sweeps; the hidden instruction ignites in acid. | Live, same tab |
| 3 | 0:22–0:52 | **The evidence.** Four stat cards, ~7s each. LLM01 → EchoLeak → 12 defences/>90% → 83%/29%. | `web/tools/stat-cards.html` |
| 4 | 0:52–1:02 | **The honesty beat.** "We do not claim to stop prompt injection. Nobody has." | Stat card 5 |
| 5 | 1:02–1:35 | **The same attack, defeated.** Both runs side by side on one clock. The protected side holds `read_email`, hard-blocks `send_email` for a full 2.6s, then lets the user's own email through. | Replay, `#sandbox` |
| 6 | 1:35–1:50 | **The provenance line.** It draws itself 420ms after the block — no click. Traces `verify@sec-update.tld` back to the invisible div. | Same take as #5 |
| 7 | 1:50–2:15 | **How.** One diagram. Two layers; the model declares provenance and we do not trust it. | `#how` |
| 8 | 2:15–2:40 | **Try to break it.** Arena, live submission, then the scoreboard and Hall of Bypasses. | Live, `#arena` |
| 9 | 2:40–3:00 | **The scorecard.** The two-scenario table. Say the precise claim verbatim. | `#scorecard` |
| 10 | 3:00–3:25 | **The real thing.** `npx tracer demo-proxy --both` in a terminal: two real MCP servers, the write landing without Tracer and refused with it. | Terminal + `#proxy` |
| 11 | 3:25–3:30 | **Close.** Stat card 6 — 16/16 · 0 · 14/16 — and the link. | Stat card 6 |

---

## Measured runtimes

From `server/data/demo-pair.json`, paced by the `BEAT` table:

- **Unprotected run: 13.3s.** 13 events. `read_page` → page-analysed → `read_email`
  → `send_email` → `send_email` → answer → verdict.
  Outcome: `robbed: true`, destination `verify@sec-update.tld`, secret
  `"one-time passcode"`, payload `"Verification code: 884-201"`.
- **Protected run: 14.9s.** 12 events. `read_email` **escalates** (1.6s
  awaiting-approval beat), `send_email` **blocks** and holds the screen **2.6s**,
  then a second `send_email` to the user's own address is **allowed**.
  Rules fired: `tier-0-inert`, `off-plan-private-read`,
  `destination-originates-from-page`, `tier-2-clean-destination`.

Both play at once in beat #5, so budget ~15s of screen time, not 28.

You can slow playback if a beat needs more room: `usePlayer` takes a `speed` and
the UI exposes the control. Do not speed it up — the 2.6s block pause is the
single most important hold in the video.

---

## Record the Viewer against the replay, not a live run

`docs/SUBMISSION.md` already says this; here is the concrete reason. The live path
depends on the browser analysing the page in a sandboxed iframe and posting the
span store up with the run. That is architecturally correct — visibility is a
rendering property, so the analyser belongs where the page renders — but it means
a live take has more moving parts than a replay.

`web/src/lib/player.js` renders replay and live through **one** code path, so the
replay is not a lesser artifact. It is the same pixels, deterministically, every
take.

Use **Load recorded demo**. Serve live mode on the public link.

---

## Beats that need something built or seeded first

| Beat | Needs |
|---|---|
| #3, #4, #11 | The stat cards. Built: `web/tools/stat-cards.html`. Serve and screen-record; each card is exactly 1920x1080 so the crop is free. |
| #8 | Arena with real entries. `node scripts/seed-arena.mjs`. An empty Hall of Bypasses on camera reads as a feature nobody used. |
| #10 | `npx tracer demo-proxy --both` run once so `demo/evidence/` is fresh, and the `#proxy` page loaded to show the refusal. |

---

## Things that quietly cost points

From `docs/SUBMISSION.md`, still true:

- A slideshow of screenshots instead of live software.
- A claim with no number behind it.
- A broken link.

And one more, specific to this project: **do not overstate**. The credibility
position is that Tracer publishes its own ceilings. The contrast between the hard
numbers and the "nobody has solved this" line is the sell. Inflating anything
undoes it.

## Say these exactly

> Tracer converts an invisible, unattributable compromise into a visible,
> attributable one, and structurally blocks the exfiltration class of consequences
> regardless of whether the model was fooled.

> The agent is about to send something somewhere you never mentioned, and the only
> place that destination came from is a web page.

> We do not claim to stop prompt injection. Nobody has. We assume the model gets
> fooled.

> The model tells us where its information came from — and we don't trust it. We
> check independently, in code the injection never gets to talk to.
