# Assembling the video in CapCut

Everything in `media/` is a finished 1920x1080 H.264 MP4 with no audio. Drop them
on the timeline in the order below, lay the voiceover over the top, add captions.

Two kinds of clip, and the ratio matters:

**Product footage** (`product-*.mp4`) is the real UI, driven over the Chrome
DevTools Protocol: real clicks, the real agent loop, the real X-ray. Regenerate
with `node scripts/capture-product.mjs`. If the UI changes, so does the footage.

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
| 2 | `product-xray.mp4` | 6.4s | Press **Show what the agent read**. The sweep runs, the concealed instruction ignites in place. |
| 3 | `stats-01-owasp.mp4` | 5.5s | Prompt injection is OWASP LLM01. |
| 4 | `stats-02-echoleak.mp4` | 7.5s | It already happened: Microsoft 365 Copilot, zero click. |
| 5 | `stats-03-defences.mp4` | 8.0s | 12 defences, over 90% bypassed, most had reported near zero. |
| 6 | `honesty.mp4` | 8.0s | "We do not claim to stop prompt injection. Nobody has." |
| 7 | `product-viewer.mp4` (from ~10s) | 17s | The divergence. Left: allowed, then DATA LEFT. Right: read_email HELD, send_email BLOCKED on `destination-originates-from-page`, and the user's own email still goes out. |
| 8 | `product-arena.mp4` | 18.6s | Somebody else's injection, planted and run live. The counters move. PREVENTED. |
| 9 | `product-proxy.mp4` | 12.2s | The integration surface: tier table, then the real refusal from two real MCP servers. |
| 10 | `stats-04-gap.mp4` | 7.0s | 83% deploying agentic AI, 29% ready to secure it. |
| 11 | `closing.mp4` | 8.0s | 16/16, 0, 14/16, and the link. |

That is about 108 seconds of picture. At 3:30 you have room to hold on beat 7,
which is the one that has to land.

`product-viewer.mp4` is one 27 second take, used twice. Cut it at roughly 10
seconds, run the cards, then come back to it. The pause reads as deliberate,
and it stops the middle of the video becoming a wall of slides.

---

## Beats worth holding

**Beat 2, the ignite.** The X-ray sweep is about a second. Let the frame sit
before and after it rather than cutting on the motion.

**Beat 7, the block.** The protected side holds the screen for 2.6 seconds on the
refusal by design, because that is the moment the whole project exists for. Do not
trim it, and do not speed it up.

**Beat 8, the counters.** Attempts 8 to 9 and prevented 6 to 7 happen in one
frame. A short zoom in CapCut helps, since at phone size the change is easy to
miss.

---

## Audio

Every clip is silent. Lay the voiceover on its own track and cut picture to it. If
a line needs longer than a clip runs, re-capture or re-render with a longer pause
rather than freezing a frame, which reads as a stall.

`docs/SHOTLIST.md` has the narration beats and the lines to say verbatim.

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
node scripts/capture-product.mjs    # all four scenes
node scripts/capture-product.mjs xray
```

Capture runs at whatever rate the protocol sustains, usually 13 to 17fps, and the
encoder is told the measured rate so playback speed matches real time. The clips
are build artifacts; `media/` is gitignored and the sources are committed.
