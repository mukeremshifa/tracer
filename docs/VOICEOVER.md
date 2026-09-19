# Voiceover: the script, the voice, and how to assemble it

Everything here is paced against the **measured** runtime of each clip in
`media/`, not against an estimate. If a clip is re-captured and its runtime
changes, the affected paragraph needs re-timing.

**316 words, about 2:06 of speech over 2:35 of picture.** That margin is
deliberate: the gaps listed in section 3 stay silent, and every line has room to
land rather than running to the edge of its shot.

Lines 04, 10 and 11 are the tight ones. Each sits on a sub-section of a longer
clip, so if a take runs over, give it another second of picture rather than
cutting a word.

---

## 1. The voice

### If you are using Val

Val is "Marketing & Hook Specialist", tagged `advertisement` and `casual`,
described as "Energetic Voice Great for ads". That is the opposite of the read
this material wants, so the settings have to pull against the voice rather than
go along with it:

| Setting | Value | Why |
|---|---|---|
| Model | **Eleven Multilingual v2** | Not v3. v3 ignores `<break>` tags, and the script depends on them. |
| Stability | **70 to 75** | Higher than usual. Val's default energy is the problem; stability is the dial that flattens it. Below 60 the read starts selling. |
| Similarity | **80** | Leave it. |
| Style exaggeration | **0** | Non-negotiable here. Any style on an ad voice makes it an ad. |
| Speed | **0.95** if available | Slightly under natural. Energetic voices rush the ends of sentences. |
| Speaker boost | **on** | |
| Format | **MP3 128kbps** or better | |

**Audition on line 08 before generating the rest**: *"So we did not build another
detector. Tracer does not claim to stop prompt injection. Nobody has."* If Val
sounds like he is pitching that line rather than admitting it, raise stability
to 80 and try again. If it still sells, the voice is wrong for the video and no
setting will fix it.

### If you want alternatives

`node scripts/audition-voices.mjs` generates line 08 in five voices and prints
the measured words per minute for each. Pace is the part that can be judged
without listening, and it decides whether a line fits its shot: 140 to 155 is
documentary, past 170 is an advertising read.

Measured on the default library voices:

| Voice | Pace | |
|---|---|---|
| **Daniel** | 144 wpm | Steady Broadcaster, British, informative. |
| **Adam** | 169 wpm | Labelled "Dominant, Firm", tagged social_media. |
| **George** | 173 wpm | Warm storyteller. |
| **Brian** | 170 wpm | |
| **Eric** | 194 wpm | Too fast for this. |

Note that library voices need a paid plan; the key in `.env` is on the free
tier, which is why these were auditioned but Val could not be.

---

## 2. The script

Paste each numbered block separately. **Do not paste the headings or the
bracketed notes**, they are for you, not the model.

The `...` marks are deliberate. ElevenLabs reads them as a short breath, which
is what stops the numbers running together. Multilingual v2 also honours
`<break time="1.0s" />` for a timed pause, which is worth reaching for only when
an ellipsis is not enough: the docs warn that overusing break tags makes the
model speed up or add artefacts, so the script uses them nowhere by default.

---

**01** `over product-viewer, first 10s`

> This is an AI agent doing something ordinary. Reading a web page, and
> summarising it.

---

**02** `over product-viewer, the robbery lands`

> It opened the user's inbox, took a one-time passcode, and sent it to a
> stranger. Nobody asked it to.

---

**03** `over product-xray, before the reveal`

> This is the page it was reading. Tracer already knows there is something
> on it you cannot see.

---

**04** `over product-xray, after the ignite. Let the payload land first.`

> An instruction, hidden in white text on a white background. The agent read
> it as though you had typed it yourself.

---

**05** `over stats-01-owasp`

> This is the number one security risk for language model applications.

---

**06** `over stats-02-echoleak`

> And it is not theoretical. A single email walked data out of Microsoft
> Copilot. No click required.

---

**07** `over stats-03-defences`

> So people built detectors. Twelve were tested against adaptive attacks.
> Over ninety percent of those attacks got through.

---

**08** `over honesty. Slow. This is the most important line in the video.`

> So we did not build another detector. Tracer does not claim to stop prompt
> injection. Nobody has.

---

**09** `over product-viewer, second use, the divergence`

> Same page. Same attack. The model is fooled in exactly the same way.

---

**10** `over product-viewer, hold on the block`

> But the address it is sending to appears nowhere in what you asked for...
> and it does appear in the page it just read.

---

**11** `over product-viewer, the tail`

> So the attack fails, and the user's real email still goes out.

---

**12** `over product-arena`

> You do not have to take our attacks for it. Anyone can write their own,
> plant it in a live page, and watch it run against both agents. This one
> was submitted by a visitor, and it is blocked on the same rule.

---

**13** `over product-landing`

> Every attempt is scored in public, including anything that gets through.
> Sixteen classes of concealment, and every one of them measured.

---

**14** `over product-client. This is the beat that answers "is this only a demo?"`

> Three rules, and none of them ask the model to be right about anything. It
> assumes the model gets fooled, and makes the attack fail anyway.

---

**15** `over product-dashboard`

> This is not a sandbox. Two real MCP servers, a hostile page, and the same
> task run twice. Without Tracer, the file lands in the attacker's folder.

---

**16** `over stats-04-gap`

> With Tracer in between, it does not. The agent follows the page's
> instruction, and the refusal comes back as the model's own error, with the
> whole provenance chain attached.

---

**17** `over closing`

> Across a team, it is infrastructure. Every decision, every refused
> destination... and nothing that only reads was ever stopped.

---

**18** `over stats-04-gap`

> Eighty-three percent plan to deploy agentic AI. Twenty-nine percent feel
> ready to secure it.

---

**19** `over closing`

> Sixteen out of sixteen attacks robbed an unprotected agent. Zero got
> through Tracer.

---

## 3. Where to leave silence

Do not narrate over these. They are the shots that have to land on their own.

- **The X-ray ignite itself**, roughly 1.5s. Line 03 ends before the sweep, line
  04 starts after the payload is fully lit.
- **The block**, in `product-viewer`. The protected side holds for about 2.6s by
  design. Line 10 should finish just as it lands, then nothing.
- **The last 2s of `closing`**, so the link is the final thing on screen with no
  voice over it.

---

## 4. CapCut assembly

Two files, both starting at 0:00:

```
media/tracer-silent.mp4    2:24.5, no audio track
media/tracer-voice.mp3     2:24.5, the lines already at their cues
```

1. Drop both at 0:00. They are the same length and already aligned, so there is
   nothing to nudge.
2. Add music on a third track. Everything below is on top of that.
3. Captions. **Do not let auto-captioning transcribe the voice**: it will mangle
   `destination-originates-from-page` and `verify@sec-update.tld`. Type those.

If a line wants moving, move it in CapCut rather than re-generating. The
individual takes are in `media/vo/` as `vo-01.mp3` and so on if you would rather
place them by hand.

### Music

Something with no melodic hook, sitting at **-24 to -20 LUFS** under the voice.
Duck it by 6dB under every line. Bring it up in the silent beats in section 3,
which is where music earns its place. Cut it entirely under the honesty line
(08, at 0:39), which lands harder dry.

---

## 5. The rule on numbers

Every figure in this script traces to `docs/STATS.md`, which also lists the
widely-quoted numbers that were checked and **rejected**. Do not caption or say
a number that is not in that file, including in the description or the thumbnail.
