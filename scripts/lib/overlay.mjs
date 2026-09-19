// ---------------------------------------------------------------------------
// The overlay layer: a camera and a compositor for captured product footage.
//
// Everything under media/ is real UI captured over CDP. That footage is honest
// but it is not directed: one locked-off 1920x1080 frame per scene, with the
// thing that matters happening at 11px somewhere inside it. On a phone, the
// moment the whole project exists for is illegible.
//
// This module adds the two things an editor would add, without touching what
// was captured:
//
//   camera()   a keyframed crop. Frames are captured at 2x, so pushing in to
//              half width is still native resolution at 1080p rather than an
//              upscale.
//   overlay()  an SVG layer composited on top: a spotlight matte, a callout
//              rule drawn to the element that matters, and the rule name set as
//              type instead of left as UI chrome.
//
// Both are driven by rectangles measured from the live DOM at capture time, so
// the camera is always framed on the real element and stays correct when the
// layout changes. Nothing here invents content: an overlay may only restate
// something already on screen.
// ---------------------------------------------------------------------------

/** Cubic ease, the one that reads as a camera move rather than a slide. */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Map a frame index onto 0..1 across [from, to], eased. */
export function seg(n, from, to, ease = easeInOut) {
  if (to <= from) return n >= to ? 1 : 0;
  return ease(clamp01((n - from) / (to - from)));
}

/**
 * A keyframed crop rectangle.
 *
 * Keyframes are {at, rect} in capture-space pixels, where rect is the region of
 * the captured frame that should fill the output. Between keyframes the rect is
 * interpolated on centre and scale rather than on its four edges, which is what
 * stops a push-in from drifting or shearing.
 *
 * The returned rect is snapped to even pixels: yuv420p chroma is subsampled 2x,
 * and an odd crop origin makes fine type shimmer between frames.
 */
export function camera(keys, { width, height, aspect }) {
  const sorted = [...keys].sort((a, b) => a.at - b.at);
  return (n) => {
    let a = sorted[0];
    let b = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (n >= sorted[i].at && n <= sorted[i + 1].at) { a = sorted[i]; b = sorted[i + 1]; break; }
      if (n > sorted[i].at) { a = sorted[i]; b = sorted[i + 1] || sorted[i]; }
    }
    const t = a === b ? 1 : seg(n, a.at, b.at, a.ease || easeInOut);
    const lerp = (x, y) => x + (y - x) * t;

    // Interpolate centre and width, then rebuild the box. Edge-wise lerping
    // lets the aspect wander mid-move, which looks like a wobble.
    const acx = a.rect.x + a.rect.w / 2, acy = a.rect.y + a.rect.h / 2;
    const bcx = b.rect.x + b.rect.w / 2, bcy = b.rect.y + b.rect.h / 2;
    const cx = lerp(acx, bcx), cy = lerp(acy, bcy);
    let w = lerp(a.rect.w, b.rect.w);
    let h = w / aspect;

    // Never sample outside the captured frame: that would letterbox mid-move.
    w = Math.min(w, width); h = Math.min(h, height);
    if (h > height) { h = height; w = h * aspect; }
    let x = cx - w / 2, y = cy - h / 2;
    x = Math.max(0, Math.min(x, width - w));
    y = Math.max(0, Math.min(y, height - h));

    const even = (v) => Math.max(0, Math.round(v / 2) * 2);
    return { x: even(x), y: even(y), w: even(w), h: even(h) };
  };
}

/**
 * Fit a measured DOM rect into a camera rect of the output aspect, with padding.
 *
 * `pad` is a multiplier on the element's larger dimension, so a tight element
 * still gets context around it instead of filling the frame edge to edge.
 */
export function frameOn(rect, { aspect, pad = 0.55, width, height, scale = 1, maxZoom = 0 }) {
  const r = { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
  let w = Math.max(r.w * (1 + pad * 2), r.h * (1 + pad * 2) * aspect);
  let h = w / aspect;

  // Never frame wider than the push-in the capture can actually carry. Footage
  // shot at `scale` can be blown up by `scale` before it stops being native
  // resolution, so the tightest honest crop is width/scale. A caller asking for
  // less zoom than that is fine; asking for more would be an upscale.
  if (maxZoom > 0) {
    const floor = width / maxZoom;
    if (w < floor) { w = floor; h = w / aspect; }
  }
  if (w > width) { w = width; h = w / aspect; }
  if (h > height) { h = height; w = h * aspect; }
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return {
    x: Math.max(0, Math.min(cx - w / 2, width - w)),
    y: Math.max(0, Math.min(cy - h / 2, height - h)),
    w, h,
  };
}

/** The full frame, as a camera rect. */
export const fullFrame = (width, height) => ({ x: 0, y: 0, w: width, h: height });
