# Tracer browser extension (MV3)

The analyser runs where the page renders, which makes this the only host where
the whole thesis survives intact — including the X-ray.

```bash
node adapters/browser/build.mjs
# chrome://extensions → Developer mode → Load unpacked → adapters/browser/dist
```

---

## What it does

**Analyses every page in the tab, with real computed styles.** White-on-white
text, `display: none`, zero-sized boxes, off-screen positioning, zero-opacity,
transparent text-fill, zero-width character payloads, HTML comments, instruction
payloads in `alt` / `title` / `aria-label`. This is the question no other
adapter can answer: *could a human actually have seen this?*

**The X-ray.** Click the toolbar icon, hit "show me what the agent read", and
the concealed spans light up in place, on the page, where they were hiding. It
is pure CSS over attributes the analyser stamped during detection — the same
pass, so the picture and the flags cannot disagree. Accessibility patterns
(`aria-hidden`, `.sr-only`, the clip-path idiom) are surfaced too, in a
deliberately different, quieter treatment and labelled *legitimate, not an
attack*. A tool that punishes screen-reader support is a tool nobody should
deploy.

**Evaluates tool calls through the same core.** One run context per tab: the
declared task, the frozen plan, every untrusted span from every page that tab
has visited. `evaluate()` is the identical function the sandbox and the MCP
proxy call.

---

## The scope, stated honestly

This extension works against:

- **Tracer's own sandbox agent** — the viewer in `web/`, which is what the
  three-surface story means by "try it".
- **An agent you are building.** Call the bridge from the page:

  ```js
  await window.tracer.beginTask('Summarise this page and email it to me@corp.example', [
    'read_page',
    'send_email',
  ]);

  const decision = await window.tracer.propose('send_email', { to, subject, body });
  if (decision.decision !== 'allow') {
    // decision.headline, decision.explain, decision.chain
  }
  // or: await window.tracer.guard('send_email', args)  — throws the refusal
  ```

  Tracer does not execute your tools. It answers "should this run, and what is
  it derived from"; the agent still owns its own hands.

- **Any open browser agent whose tool-call path you can intercept.** If you can
  get to the call site, you can put `propose()` in front of it.

It **cannot** sit inside a closed product like Comet, Atlas, or any agent whose
tool calls happen in privileged extension code. There is no supported way for
one extension to intercept another's privileged calls, and claiming otherwise
would be exactly the kind of unfalsifiable security claim Tracer exists to argue
against. What it *can* still do in those products is the visible half: analyse
the page the closed agent is about to read and show you, before you let it run,
that the page contains instructions aimed at it. That is worth having. It is not
enforcement, and this README will not call it enforcement.

---

## Tiers

`src/tiers.js` ships defaults keyed on tool names that keep recurring, plus
globs for the shapes. Unmatched tools land on tier 2: a tool nobody classified
still runs, and is still policed. Edit that file and rebuild.

---

## Two caveats that apply everywhere Tracer runs

1. **The destination rule covers exfiltration, one consequence class.** It does
   nothing about an agent injected into *deleting* files or *approving* a
   transaction — there is no destination to trace.
2. **The overlap scan is verbatim-based.** A payload the model paraphrases
   rather than copies will not overlap.
