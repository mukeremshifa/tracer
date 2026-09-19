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

Good defaults, in order of preference:

| Voice | Why |
|---|---|
| **Adam** | Low, measured, documentary. The safest choice for this material. |
| **Daniel** | British, news-read. Good if you want the "this is a report" framing. |
| **Charlie** | Warmer, more conversational. Use if Adam feels too heavy. |

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
| Format | **MP3 192kbps 44.1kHz** or WAV | Either is fine for CapCut. |

Generate **one paragraph at a time**, not the whole script in one request. Two
reasons: you can re-roll a single bad line without losing a good take of the
rest, and the numbered files drop straight onto the timeline in order.

---

## 2. The script

Paste each numbered block separately. **Do not paste the headings or the
bracketed notes**, they are for you, not the model.

The `...` marks are deliberate. ElevenLabs reads them as a short breath, which
is what stops the numbers running together.

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

1. Drop the clips in the order in `docs/EDIT.md`. All are 1920x1080, 30fps,
   already silent, so no audio detaching is needed.
2. Drop the numbered voice files on a track above. They are already in order.
3. **Cut picture to voice, not the other way round.** If a line runs long,
   extend the clip by holding on a still section rather than speeding the voice
   up. If a line runs short, let the picture breathe.
4. `product-viewer.mp4` is one 19 second take used **twice**: cut it at about
   10 seconds for lines 01 and 02, run the cards, then return to it for lines
   09 to 11.
5. Captions: burn in the citation lines on the stat cards. They are legible at
   1080p but tight on a phone.

### Music

Something with no melodic hook, sitting at **-24 to -20 LUFS** under the voice.
Duck it by 6dB under every line. Bring it up in the two silent beats above,
which is where music earns its place. Cut it entirely for the honesty line
(08), which lands harder dry.

---

## 5. The rule on numbers

Every figure in this script traces to `docs/STATS.md`, which also lists the
widely-quoted numbers that were checked and **rejected**. Do not caption or say
a number that is not in that file, including in the description or the thumbnail.
