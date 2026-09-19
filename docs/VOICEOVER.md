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

## 1. Pick the voice

In ElevenLabs, **Voice Library**, filter to English, then audition against this
brief: a security engineer explaining something they find genuinely alarming,
not a product marketer. Calm, low, unhurried. No smile in the voice.

`node scripts/audition-voices.mjs` generates line 08 in five voices and prints
the measured words per minute for each. Pace is the part that can be judged
without listening, and it is what decides whether a line fits its shot: 140 to
155 is documentary, past 170 is an advertising read.

| Voice | Why |
|---|---|
| **Daniel** | Chosen. "Steady Broadcaster", British, informative. Reads line 08 at **144 wpm**. |
| **Adam** | 169 wpm. Labelled "Dominant, Firm", tagged social_media. Closer to an ad read. |
| **George** | 173 wpm. Warm storyteller, if Daniel feels too formal. |
| **Eric** | 194 wpm. Too fast for this; every line would need trimming. |

Avoid anything described as "upbeat", "energetic", "narration for ads", or any
voice with noticeable vocal fry. The content is doing the persuading; the
delivery should get out of its way.

### Settings

Use **Eleven Multilingual v2** (better prosody on long paragraphs than Turbo,
and you are not latency-bound here).

| Setting | Value | Why |
|---|---|---|
| Stability | **50** | Low enough to keep inflection, high enough not to wander across a 3 minute read. |
| Similarity | **80** | Keeps the voice consistent between paragraphs you may re-generate individually. |
| Style exaggeration | **0** | Anything above 0 pushes it towards advertising read. |
| Speaker boost | **on** | Slight presence lift, helps it sit over music. |
| Format | **MP3 128kbps 44.1kHz** | 192 needs a paid tier, and the difference is inaudible for one voice under music. |

`scripts/make-voiceover.mjs` does the generating. It sends one request per line
rather than one for the whole script, so a bad take can be re-rolled without
losing the good ones, and it passes each line's neighbours plus the previous
request ids to the API. That second part matters: without it, seventeen separate
requests sound like seventeen separate recordings, because pitch and pace reset
at every paragraph. With it they carry across the joins.

It then lays the lines onto one continuous track the length of the picture,
using the cue sheet the assembler writes, so `media/tracer-voice.mp3` and
`media/tracer-silent.mp4` both start at 0:00 and are already in sync.

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

> Here is the page it was reading.

---

**04** `over product-xray, after the ignite. Let the payload land first.`

> An instruction, hidden in white text on a white background. The agent read
> it as though you had typed it.

---

**05** `over stats-01-owasp`

> This is the number one security risk for language model applications.

---

**06** `over stats-02-echoleak`

> And it is not theoretical. A single email walked data out of Microsoft
> Copilot. No click required.

---

**07** `over stats-03-defences`

> So people built detectors. Twelve were tested. Over ninety percent of
> attacks got through.

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
> and it does appear in the page.

---

**11** `over product-viewer, the tail`

> So the attack fails, and the user's real email still goes out.

---

**12** `over product-arena`

> You do not have to take our attacks for it. Anyone can write their own,
> plant it in a live page, and run it against both agents. Every attempt is
> scored in public, including anything that gets through.

---

**13** `over product-landing`

> Sixteen classes of concealment, every one of them measured. Three rules,
> none of which ask the model to be right about anything. It assumes the
> model gets fooled, and makes the attack fail anyway.

---

**14** `over product-client. This is the beat that answers "is this only a demo?"`

> And this is not a sandbox. Tracer inside a real client, in front of two
> real servers. The agent follows the page's instruction, and the refusal
> arrives as the model's own error.

---

**15** `over product-dashboard`

> Across a team, it is infrastructure. Every decision, every refused
> destination... and nothing that only reads was ever stopped.

---

**16** `over stats-04-gap`

> Eighty-three percent plan to deploy agentic AI. Twenty-nine percent feel
> ready to secure it.

---

**17** `over closing`

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
