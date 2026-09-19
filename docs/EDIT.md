# Assembling the video in CapCut

Everything in `media/` is a finished 1920x1080 H.264 MP4 with no audio. Drop them
on the timeline in the order below, lay the voiceover over the top, add captions.

Two kinds of clip, and the ratio matters:

**Product footage** (`product-*.mp4`) is the real UI, driven over the Chrome
DevTools Protocol: real clicks, the real agent loop, the real X-ray. Regenerate
with `node scripts/capture-product.mjs`. If the UI changes, so does the footage.

A camera and an overlay are added on top of the capture, never inside it: scenes
shoot at 2x so a push-in stays native resolution, and marks are drawn on the
finished frame from rectangles measured in the live DOM. The overlay may only
restate what is already on screen, for instance enlarging a rule name the UI
prints at 11px. It may not introduce a claim the footage does not support.

One product clip is captured differently. `product-client.mp4` is Tracer inside
a real MCP client (Claude Code over `claude -p`), and it is rendered from a
captured session (the real proxy banner, the real tool calls, the real refusal)
by `node scripts/capture-client.mjs`. The exchange is cached in
`web/tools/clips/client-session.json`; `--live` re-captures it. It is the same
argument the Viewer makes, made in a tool the judge already uses.

**Cards** (everything else) are rendered typography, built by
`node scripts/render-clips.mjs`. They carry numbers and the two lines the video
has to say out loud. They are connective tissue between product beats, never the
substance.

The cut below is roughly two thirds product, one third card. Keep it that way: a
deck of statistics is a case study, and this is a product.

---

## Order

| # | Clip | Runs | What the viewer sees |
|---|---|---|---|
| 1 | `product-viewer.mp4` (first ~10s) | 10s | Both agents start. The page, the frozen plan, calls landing live. |
| 2 | `product-xray.mp4` | 8.0s | Press **Show what the agent read**. The camera pushes in, the sweep runs, the concealed instruction ignites in place, and the rule that stopped it is stamped at a size a phone can read. |
| 3 | `stats-01-owasp.mp4` | 5.5s | Prompt injection is OWASP LLM01. |
| 4 | `stats-02-echoleak.mp4` | 7.5s | It already happened: Microsoft 365 Copilot, zero click. |
| 5 | `stats-03-defences.mp4` | 8.0s | 12 defences, over 90% bypassed, most had reported near zero. |
| 6 | `honesty.mp4` | 8.0s | "We do not claim to stop prompt injection. Nobody has." |
| 7 | `product-viewer.mp4` (from ~10s) | 9s | The divergence. Left: allowed, then DATA LEFT. Right: read_email HELD, send_email BLOCKED and boxed, the rule stamped underneath, and the user's own email still goes out. |
| 8 | `product-arena.mp4` | 20.8s | Somebody else's injection, planted and run live against both agents. |
| 9 | `product-landing.mp4` | 23.7s | One travel down the landing page: the live sandbox, the three rules, the sixteen attack classes, the two real MCP servers. |
| 10 | `product-client.mp4` | 16.1s | Tracer inside a real MCP client. The firewall boots its tier table, the agent reads the notes and fetches the page, then the write is **BLOCKED** on `destination-originates-from-page`, and the refusal arrives as the model's own error. |
| 11 | `product-dashboard.mp4` | 12.6s | What it looks like in front of a team: recent decisions, blocked destinations, the tier breakdown showing nothing that only reads was ever stopped. |
| 12 | `stats-04-gap.mp4` | 7.0s | 83% deploying agentic AI, 29% ready to secure it. |
| 13 | `closing.mp4` | 8.0s | 16/16, 0, 14/16, and the link. |

That is about 155 seconds of picture. At 3:30 there is room to hold on beat 7,
which is the one that has to land, and on the refusal in beat 10.

Beats 9, 10 and 11 are three readings of the same claim, in increasing order of
"this is real": the landing page states it, the client scene shows it happening
in a tool the viewer recognises, the dashboard shows what it looks like at
scale. If the cut runs long, beat 10 is the strongest and can stand alone.

`product-dashboard.mp4` carries a **PREVIEW** badge and the line saying every
number on that page is fabricated. Both stay in frame. An assessor will look for
exactly that, and cropping it out would be the one dishonest frame in the video.

`product-viewer.mp4` is one 19 second take, used twice. Cut it at roughly 10
seconds, run the cards, then come back to it.

---

## Beats worth holding

**Beat 2, the ignite.** The X-ray sweep is about a second, and the camera is
already moving into it. Let the frame sit before and after rather than cutting
on the motion.

**Beat 7, the block.** The protected side holds the screen for 2.6 seconds on the
refusal by design, because that is the moment the whole project exists for. Do not
trim it, and do not speed it up.

**Beat 8, the arena.** The attack is submitted by a visitor and the page is
served from `/arena/<id>`, which is worth a caption: it is someone else's
attack, not one of ours.

---

## Audio

Every clip is silent. Lay the voiceover on its own track and cut picture to it. If
a line needs longer than a clip runs, re-capture or re-render with a longer pause
rather than freezing a frame, which reads as a stall.

`docs/VOICEOVER.md` has the narration, and `docs/VOICEOVER-PASTE.md` the
version with the pauses baked in.

---

## Captions

Burn in the citation lines. At phone size the small type at the bottom of each
card is legible but tight.

Every number comes from `docs/STATS.md`, which also lists the figures that were
checked and rejected. Do not caption a number that is not in that file.

---

## Re-capturing

The product scenes need the server running:

```
npm run build && npm start          # :8787
node scripts/capture-product.mjs    # viewer, xray, landing, dashboard, arena
node scripts/capture-product.mjs xray
```

Scenes capture at 2x and output 1080p at a fixed 30fps, so the camera can push
in without upscaling. The clips are build artifacts; `media/` is gitignored and
the sources are committed.

The extension scene is written but excluded from the default run: Chrome accepts
`--load-extension` and then does not install the unpacked MV3 build, so it is
captured by hand. See `docs/BRIEF-AGENT-CAPTURE.md`.

The client scene renders from its cached session and needs no server:

```
node scripts/capture-client.mjs             # render product-client.mp4 from cache
node scripts/capture-client.mjs --live      # re-capture the exchange, then render
```

`--live` needs Claude Code auth, `uvx` and `npx` on PATH, and the demo range up
(`node demo/serve.mjs`). It drives Claude Code through Tracer against the two
real MCP servers and re-records the whole exchange; the render is deterministic
either way at a fixed 30fps.
