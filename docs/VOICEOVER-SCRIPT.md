# Voiceover script, ready to paste

Cross-checked line by line against `media/tracer-silent.mp4` (2:38.0). The
timings below are where each line sits in that file.

**Generate each numbered block as its own take.** Pasting all seventeen as one
request gives you one long file that cannot be nudged when a line lands early.

Do not paste the headings, the timings, or the bracketed notes. Only the
indented text.

---

## Settings

Whatever voice you like, but the script is written for roughly **150 to 170
words per minute**. Much faster and the holds in the picture turn into dead air;
much slower and lines run past their shot. If your read lands well outside that,
tell me and I will resize the picture to match rather than have you re-read it.

The `...` inside a line is a beat, not an ellipsis to be read. On Multilingual
v2 you can replace any of them with `<break time="0.5s" />` if the pause is not
landing; v3 does not support break tags, so use the ellipsis there.

---

## The script

### 01 · 0:00 · the agent, working normally

> This is an AI agent doing something ordinary. Reading a web page, and
> summarising it.

### 02 · 0:06 · the robbery lands

> It opened the user's inbox, took a one-time passcode, and sent it to a
> stranger. Nobody asked it to.

### 03 · 0:13 · the page, before the reveal

> This is the page it was reading. Tracer already knows there is something on
> it you cannot see.

### 04 · 0:16 · the payload ignites

> An instruction, hidden in white text on a white background. The agent read it
> as though you had typed it yourself.

### 05 · 0:22 · OWASP card

> This is the number one security risk for language model applications.

### 06 · 0:28 · EchoLeak card

> And it is not theoretical. A single email walked data out of Microsoft
> Copilot. No click required.

### 07 · 0:36 · the defences card

> So people built detectors. Twelve were tested against adaptive attacks. Over
> ninety percent of those attacks got through.

### 08 · 0:44 · the honesty beat. Slowest line in the video.

> So we did not build another detector. Tracer does not claim to stop prompt
> injection. Nobody has.

### 09 · 0:52 · the same run, side by side

> Same page. Same attack. The model is fooled in exactly the same way.

### 10 · 0:58 · the block

> But the address it is sending to appears nowhere in what you asked for... and
> it does appear in the page it just read.

### 11 · 1:04 · the tail

> So the attack fails, and the user's real email still goes out.

### 12 · 1:07 · the arena

> You do not have to take our attacks for it. Anyone can write their own, plant
> it in a live page, and run it against both agents. Every attempt is scored in
> public, including anything that gets through.

### 13 · 1:28 · the landing page

> Sixteen classes of concealment, every one of them measured. Three rules, and
> none of them ask the model to be right about anything.

### 14 · 1:52 · a real client. The beat that answers "is this only a sandbox?"

> This is not a sandbox. Tracer inside a real client, in front of two real
> servers. The agent follows the page's instruction, and the refusal comes back
> as the model's own error, with the whole provenance chain attached.

### 15 · 2:08 · the dashboard

> Across a team, it is infrastructure. Every decision, every refused
> destination... and nothing that only reads was ever stopped.

### 16 · 2:21 · the gap card

> Eighty-three percent plan to deploy agentic AI. Twenty-nine percent feel
> ready to secure it.

### 17 · 2:29 · the close

> Sixteen out of sixteen attacks robbed an unprotected agent. Zero got through
> Tracer.

---

## What the cross-check changed

Three lines were wrong against the picture. They are already corrected above.

**Line 03** said the page looked unremarkable. It does not: at 0:13 the headline
reads *"Watch the same agent get robbed, then not"* and a banner underneath says
*"This page contains 1 instruction-like element you cannot see."* Narrating
"nothing unusual" over a screen that announces the concealment would have read
as not having watched the video.

**Line 07** said "twelve were tested", which on its own sounds like twelve
attacks. The card says twelve **defences**, tested **against adaptive attacks**,
and that qualifier is the whole finding. Restored.

**Line 13** repeated the landing page almost word for word. At 1:28 the page
already reads *"Three rules, none of which ask the model to be right"*, and the
old line 13 ended with a sentence line 08 had already said. Trimmed so the voice
adds to the screen instead of reciting it.

---

## Where to leave silence

- **0:16 to 0:18**, the X-ray sweep. Line 03 ends before it, line 04 begins
  after the payload is lit.
- **0:58 to 1:04**, the block. The picture holds on `DATA LEFT` against
  `BLOCKED` with the rule name stamped underneath. Line 10 should land as the
  block does, then stop.
- **The last two seconds**, so the link closes the video with no voice on it.

---

## After you generate

Drop the takes in `media/vo/` as `vo-01.mp3` through `vo-17.mp3` and tell me.
I will lay them onto one track aligned to the picture, check every line against
its shot, and report anything that overruns.

If you would rather assemble in CapCut yourself, the timings at each heading are
where each line starts in `media/tracer-silent.mp4`.
