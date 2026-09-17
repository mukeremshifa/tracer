// ---------------------------------------------------------------------------
// Transcript playback.
//
// A run returns a complete transcript and the UI plays it. Live mode and replay
// mode therefore share one rendering path: replay is not a second
// implementation that can drift, and recording the video against a saved
// transcript shows exactly what the live link shows.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Beat lengths, in ms. Paced for a person watching, not for a machine: the
// decision card is the moment that has to land, so it gets room.
const BEAT = {
  goal: 500,
  plan: 1500,
  'tool-call': 1200,
  'tool-result': 700,
  'page-analysed': 1400,
  'awaiting-approval': 1600,
  'output-channel': 1800,
  answer: 1400,
  verdict: 900,
  error: 900,
};

const BLOCKING_PAUSE = 2600; // a blocked tier-2 call holds the screen longer

export function usePlayer(transcript, { autoPlay = true, speed = 1 } = {}) {
  const events = useMemo(() => (transcript && transcript.events) || [], [transcript]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(speed);
  const timer = useRef(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // A new transcript resets playback.
  useEffect(() => {
    clear();
    setIndex(transcript ? -1 : -1);
    setPlaying(!!transcript && autoPlay);
  }, [transcript, autoPlay]);

  useEffect(() => {
    clear();
    if (!playing || !events.length) return;
    if (index >= events.length - 1) {
      setPlaying(false);
      return;
    }

    const next = events[index + 1];
    const isHardBlock =
      next.type === 'tool-call' && next.call && next.call.decision && next.call.decision.blocked;
    const ms = ((isHardBlock ? BLOCKING_PAUSE : BEAT[next.type] || 700) / rate) | 0;

    timer.current = setTimeout(() => setIndex((i) => i + 1), ms);
    return clear;
  }, [playing, index, events, rate]);

  const visible = useMemo(() => events.slice(0, index + 1), [events, index]);

  const seekEnd = useCallback(() => {
    clear();
    setPlaying(false);
    setIndex(events.length - 1);
  }, [events.length]);

  const restart = useCallback(() => {
    clear();
    setIndex(-1);
    setPlaying(true);
  }, []);

  const stepForward = useCallback(() => {
    clear();
    setPlaying(false);
    setIndex((i) => Math.min(i + 1, events.length - 1));
  }, [events.length]);

  const stepBack = useCallback(() => {
    clear();
    setPlaying(false);
    setIndex((i) => Math.max(i - 1, -1));
  }, []);

  useEffect(() => clear, []);

  const last = visible[visible.length - 1] || null;
  const done = index >= events.length - 1 && events.length > 0;

  return {
    events,
    visible,
    index,
    last,
    done,
    playing,
    rate,
    setRate,
    play: () => setPlaying(true),
    pause: () => {
      clear();
      setPlaying(false);
    },
    toggle: () => setPlaying((p) => !p),
    restart,
    seekEnd,
    stepForward,
    stepBack,
    progress: events.length ? (index + 1) / events.length : 0,
  };
}

/** The calls revealed so far, with their decisions, newest last. */
export function callsFrom(visible) {
  const out = [];
  for (const e of visible) {
    if (e.type === 'tool-call') out.push(e.call);
    if (e.type === 'tool-result') {
      const target = out.find((c) => c.id === e.callId);
      if (target) target.result = e.result;
    }
  }
  return out;
}

export function firstOf(visible, type) {
  return visible.find((e) => e.type === type) || null;
}

export function lastOf(visible, type) {
  for (let i = visible.length - 1; i >= 0; i--) if (visible[i].type === type) return visible[i];
  return null;
}
