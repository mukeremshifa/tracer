# Assembling the video in CapCut

Everything in `media/` is a finished 1920×1080 H.264 MP4 at 30fps with no audio.
Drop them on the timeline in the order below, lay your voiceover over the top,
and add captions. No keyframing required — the motion is already in the clips.

Regenerate any clip with `node scripts/render-clips.mjs <id>`, or all of them
with no argument. The clips are built from the same data the site serves, so
when a number changes, re-render rather than editing a video file.

---

## Order, with what each clip is for

| # | Clip | Runs | What it does |
|---|---|---|---|
| 1 | `robbery.mp4` | 10.0s | The theft, cold. Four tool calls, all allowed, then what left the user's control. |
| 2 | *(your screen capture — X-ray)* | ~8s | See "The one thing you record" below. |
| 3 | `stats-01-owasp.mp4` | 5.5s | Prompt injection is OWASP LLM01. |
| 4 | `stats-02-echoleak.mp4` | 7.5s | It already happened, in Microsoft 365 Copilot, zero-click. |
| 5 | `stats-03-defences.mp4` | 8.0s | 12 defences, >90% bypassed, most had reported near-zero. |
| 6 | `stats-04-gap.mp4` | 7.0s | 83% deploying agentic AI, 29% ready to secure it. |
| 7 | `honesty.mp4` | 8.0s | "We do not claim to stop prompt injection. Nobody has." |
| 8 | `block.mp4` | 10.0s | The same call, refused, traced back to the invisible span. |
| 9 | *(your screen capture — proxy)* | ~15s | The terminal run. See below. |
| 10 | `closing.mp4` | 8.0s | 16/16 · 0 · 14/16, and the link. |

That is **64 seconds of rendered clip** plus roughly 25 seconds you capture, which
leaves comfortable room inside 3:30 for the two live-software beats to breathe.

---

## The clips carry no audio

Every MP4 is silent by design. Lay the voiceover on its own track and cut the
picture to it — if a line needs longer than a clip runs, extend the clip's frame
count and re-render rather than freezing the last frame, which reads as a stall.

`docs/SHOTLIST.md` has the narration beats. `docs/STATS.md` has every number with
its source, and the list of figures that were checked and rejected — do not put a
number on screen that is not in that file.

---

## The two things worth capturing live

Rendered clips cannot show software responding to a person, and that is the part
a judge is actually buying. Two moments deserve a real capture:

**The X-ray.** Open the Viewer, press **Show what the agent read**. The reveal has
a 1.1s sweep and the concealed span ignites in place. This is the single best
visual in the project and a still cannot carry it. Record the window, not the
whole screen.

**The proxy.** Run `npx tracer demo-proxy --both` in a terminal. Two real MCP
servers, the injected write landing without Tracer and refused with it. This is
the beat that answers "is it only a demo?", and it only lands as a real terminal.

For both: 1920×1080, browser at 100% zoom, no bookmarks bar, notifications off.

---

## Captions

Burn in the citation lines rather than relying on the clip's own small type — at
phone size the `cite` line at the bottom of each stat card is legible but tight.
The wording to use is in `docs/STATS.md` under each cleared number.

Do not caption a number that is not in that file.
