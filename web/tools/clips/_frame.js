// Frame-driven animation.
//
// Every clip reads its frame number from the URL and draws that exact frame.
// Nothing here is time-based: no requestAnimationFrame, no CSS transitions, no
// setTimeout. A renderer screenshotting f=0..n-1 therefore gets a perfectly
// even sequence however long each screenshot actually took.
export const q = new URLSearchParams(location.search);
export const F = Number(q.get('f') || 0);
export const N = Number(q.get('n') || 1);
export const t = N > 1 ? F / (N - 1) : 0;   // 0..1 across the clip

/** Progress across a window of the clip, clamped and eased. */
export function seg(from, to) {
  if (t <= from) return 0;
  if (t >= to) return 1;
  return (t - from) / (to - from);
}
export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Fade and rise, the one entrance used throughout. */
export function enter(el, p, rise = 40) {
  const e = easeOut(p);
  el.style.opacity = String(e);
  el.style.transform = 'translateY(' + ((1 - e) * rise).toFixed(2) + 'px)';
}

/** Count a number up. Integers stay integers; one decimal stays one decimal. */
export function countTo(value, p, decimals = 0) {
  const v = value * easeOut(p);
  return decimals ? v.toFixed(decimals) : String(Math.round(v));
}
