# Capture state: where the footage stands

**Live working notes.** Update this as scenes land. A fresh session should be
able to read this file and carry on without asking anything.

Everything in `media/` is a build artifact and is gitignored. The sources that
produce it are committed, so a clip is never lost, only re-rendered.

---

## Run this first

```bash
npm run build && npm start        # :8787, required by every product scene
```

Then any scene:

```bash
node scripts/capture-product.mjs            # every scene
node scripts/capture-product.mjs xray       # one scene
```

---

## The app was rebuilt, and it moved the shots

The revamp replaced Viewer, Proxy, Arena and Extension with Sandbox, Dashboard,
Evidence and a real landing page. Measured against the live DOM, not guessed:

| Old scene | State | Why |
|---|---|---|
| `product-proxy` | **dead** | `#proxy` is gone. The alias redirects to `#home`, so the scene would scroll the landing page and film the wrong thing. |
| `product-arena` | **dead** | `#arena` redirects to `#sandbox`. The scene waits on a `textarea` that does not render until **Write your own** is clicked, so it times out. |
| `product-viewer` | needs re-shoot | Selectors survive; the button is now **Run both agents**. |
| `product-xray` | **done, directed** | See below. |
| `product-terminal` | safe | Renders from real stdout, no UI dependency. |
| `product-client` | safe | Renders from a cached session. Strongest clip in the set. |
| cards | safe | Typography only. |

Replacements chosen for the two dead scenes:

- `product-proxy` -> a **landing page** scene (bands, diagrams, the 16-attack
  grid). The page is 8198px tall and is a better shot than `#proxy` ever was.
- `product-arena` -> a **dashboard** scene (recent decisions, blocked
  destinations, tier breakdown). New surface, and the one that says "operable
  product" rather than "demo".

The write-your-own flow still exists behind the **Write your own** toggle, so
the arena beat can be kept by clicking that first.

---

## Useful DOM facts, measured

Do not re-derive these; they cost real time to find.

- **Viewport.** `--window-size=1920,1080` gives a **1902x984** viewport, because
  Chrome's window size includes its own chrome. Scenes now pin it with
  `Emulation.setDeviceMetricsOverride`, so capture is exactly 1920x1080 CSS px
  at `deviceScaleFactor: SCALE`.
- **The blocked call** is `.call` containing `.call-dot.block`.
- **The rule name** is the tail of that row's `.call-meta`, after the `·`.
  It is *not* `.rule-chip`: that reflects the selected call, which defaults to
  one in the unprotected pane whose chip reads `unprotected`.
- **Letter-spacing defeats regex.** `textContent` on that row reads
  `de tination-originate -from-page`. Match structurally, never by text.
- **The X-ray reflows the payload.** It adds a `HIDDEN FROM YOU` label via
  `::before` and grows the span from ~77px to ~134px tall. Measure the rect
  *after* a throwaway reveal, then reset, then film.
- Buttons: **Run both agents**, **Show what the agent read (N hidden)**, which
  toggles its own label to **Showing what the agent read**.

---

## The overlay layer

`scripts/lib/`, three modules, no new dependencies.

- `overlay.mjs` keyframed camera. Interpolates centre and scale, not edges, so a
  push-in cannot shear. Snaps to even pixels: yuv420p chroma is subsampled, and
  an odd crop origin makes fine type shimmer between frames.
- `marks.mjs` spotlight, box, callout, rule stamp, in the product palette.
- `compose.mjs` rasterises the overlay in the same headless Chrome the capture
  already needs, so overlay type resolves against the same font files the UI
  uses.

Scenes capture at **2x** and output 1080p, so a push-in to half width is still
native resolution. `frameOn(..., { maxZoom })` refuses to crop tighter than the
capture can carry.

**House rule, enforced in code.** A mark may only restate what is already on
screen. It may enlarge a rule name or dim non-subject areas. It may not
introduce a claim the footage does not support. This caught a real defect: an
early pass captioned the clip `BLOCKED ON unprotected`. There is now a guard
that throws rather than ship a wrong caption.

---

## Em dashes

Done. None remain in any rendered surface: the interface, the card clips, the
X-ray label, and the closing card's citation line.

What is left is six bare em dashes used as a **placeholder glyph** for an empty
table cell. That is typography rather than punctuation in a sentence, so it
stays. One of them, in `Sandbox.jsx`, is also a `split()` delimiter, and
changing it would alter behaviour rather than wording.

The rewrites were not a search and replace. A dash joining two clauses became a
full stop or a comma depending on how close the clauses were, and a dash
introducing a gloss became a colon.

---

## Two traps that cost real time

**Stale Chrome holds the debug port.** A scene that fails with a timeout, then
fails identically on retry, is usually attaching to a leftover browser from a
previous run rather than its own. That is how one capture ended up filming the
Scorecard with a scrollbar on it while claiming to be the dashboard. Kill every
Chrome before a run when anything looks wrong, and check the first frame of a
clip is the page the scene named.

**Crops must be clamped to the real frame.** `maxWidth`/`maxHeight` on a
screencast are a bounding box Chrome fits the page into, so frames can arrive
smaller than requested, and ffmpeg rejects a crop larger than its input. Handled
in `compose.mjs` now, by measuring the first JPEG rather than trusting the
request.

---

## Status

The video is cut. `media/tracer-silent.mp4` (2:39, no audio) and
`media/tracer-voice.mp3` are the same length and both start at 0:00;
`media/tracer-preview.mp4` is the two muxed for checking.

- [x] All five product scenes captured, directed, verified 1920x1080 at 30/1
- [x] Em dashes out of the interface and the cards
- [x] Client scene's absolute paths scrubbed at render
- [x] Voiceover recorded (19 lines, one generation, break tags)
- [x] Picture recut to the recorded voice with `assemble-cut.mjs --sync`
- [x] `docs/SUBMISSION.md` rewritten against the cut that exists

Left to the user: captions and background music, in CapCut. The reasoning on
both is in `docs/SUBMISSION.md` under "Captions and music", and the short
version is that the lower third is occupied during the product shots and empty
on the cards, so both belong on the cards only.

Still manual, briefed in `docs/BRIEF-AGENT-CAPTURE.md`: the extension scene.
Chrome accepts `--load-extension` and then does not install the unpacked MV3
build, so it cannot be captured unattended.

---

## Rebuilding

```bash
npm run build && npm start              # :8787, needed by the product scenes
node scripts/capture-product.mjs        # re-capture the UI
node scripts/render-clips.mjs           # re-render the cards
node scripts/sync-to-voice.mjs --apply  # re-measure the narration
node scripts/assemble-cut.mjs --sync    # cut the picture to it
```

`media/` is gitignored. Every clip in it is a build artifact and the sources
that produce it are committed, so nothing there is ever lost, only re-rendered.
