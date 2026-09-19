// ---------------------------------------------------------------------------
// The marks drawn over captured footage.
//
// Each mark is a function of the frame index that returns SVG. They share the
// product's own palette (acid on ink) so the layer reads as part of the thing
// rather than as a video effect pasted over it.
//
// House rule for everything here: a mark may only restate what is already on
// screen. It can point at a refusal, enlarge a rule name the UI prints at 11px,
// or dim the parts of the frame that are not the subject. It may not introduce
// a claim the footage does not support.
// ---------------------------------------------------------------------------

import { seg, easeOut, easeInOut, clamp01 } from './overlay.mjs';

export const ACID = '#cdfb41';
export const INK = '#131313';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Spotlight matte: dim everything except one rect.
 *
 * Drawn as a single path with an even-odd fill rather than four rects, so the
 * cut-out edge stays exact when the rect is animating.
 */
export function spotlight({ rect, from, to, hold, out, strength = 0.72, radius = 10 }) {
  return (n, { w, h }) => {
    const up = seg(n, from, to, easeOut);
    const down = out == null ? 0 : seg(n, hold, out, easeInOut);
    const a = strength * up * (1 - down);
    if (a <= 0.002) return '';
    const r = typeof rect === 'function' ? rect(n) : rect;
    if (!r) return '';
    const rr = Math.min(radius, r.w / 2, r.h / 2);
    return `<path d="M0 0H${w}V${h}H0Z M${r.x + rr} ${r.y} h${r.w - rr * 2} a${rr} ${rr} 0 0 1 ${rr} ${rr} v${r.h - rr * 2} a${rr} ${rr} 0 0 1 ${-rr} ${rr} h${-(r.w - rr * 2)} a${rr} ${rr} 0 0 1 ${-rr} ${-rr} v${-(r.h - rr * 2)} a${rr} ${rr} 0 0 1 ${rr} ${-rr} Z" fill="${INK}" fill-opacity="${a.toFixed(3)}" fill-rule="evenodd"/>`;
  };
}

/** A box drawn around a rect, stroke wiping on clockwise from the top left. */
export function box({ rect, from, to, out, color = ACID, width = 3, radius = 8 }) {
  return (n) => {
    const t = seg(n, from, to, easeOut);
    if (t <= 0) return '';
    const fade = out == null ? 1 : 1 - seg(n, out, out + 10, easeInOut);
    if (fade <= 0) return '';
    const r = typeof rect === 'function' ? rect(n) : rect;
    if (!r) return '';
    const per = 2 * (r.w + r.h);
    return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${radius}"
      fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${fade.toFixed(3)}"
      stroke-dasharray="${per}" stroke-dashoffset="${(per * (1 - t)).toFixed(1)}"/>`;
  };
}

/**
 * A callout: a rule drawn from an anchor rect out to a label.
 *
 * The line draws first, then the label types on. `side` decides which way it
 * leaves the anchor, so a callout never runs off frame.
 */
export function callout({
  anchor, label, sub, from, to, out, side = 'auto', len = 260, color = ACID, size = 34,
}) {
  return (n, { w, h }) => {
    const draw = seg(n, from, to, easeOut);
    if (draw <= 0) return '';
    const fade = out == null ? 1 : 1 - seg(n, out, out + 12, easeInOut);
    if (fade <= 0) return '';
    const r = typeof anchor === 'function' ? anchor(n) : anchor;
    if (!r) return '';

    // "auto" puts the label on whichever side of the anchor has more frame left.
    // Held in a local, not written back to `side`: this closure runs once per
    // frame, and assigning the parameter would freeze the first frame's choice
    // for the whole clip even as the camera moves the anchor across the frame.
    const at = side === 'auto' ? (r.x > w - (r.x + r.w) ? 'left' : 'right') : side;
    const dir = at === 'left' ? -1 : 1;
    const x0 = at === 'left' ? r.x : r.x + r.w;
    const y0 = r.y + r.h / 2;
    const elbow = 42;

    // Shorten the rule rather than let the label leave the frame. The anchor is
    // wherever the measured element ended up, so a fixed length runs off screen
    // as soon as the camera pushes in; the sub-line is the first thing lost and
    // it is the line that says why the label is there.
    const margin = 28;
    const textW = Math.max(String(label).length * size * 0.62,
      sub ? String(sub).length * size * 0.31 : 0);
    const room = at === 'left' ? x0 - margin - textW - 14 : w - margin - textW - 14 - x0;
    const reach = Math.max(12, Math.min(len, room - elbow));

    const x1 = x0 + dir * elbow * draw;
    const x2 = x0 + dir * (elbow + reach) * draw;

    const textAnchor = at === 'left' ? 'end' : 'start';
    const tx = x0 + dir * (elbow + reach + 14);
    // The label fades in once the rule has drawn. An earlier version revealed it
    // a character at a time, which at 30fps reads as a rendering fault rather
    // than as typing.
    const labelT = clamp01((draw - 0.55) / 0.45);
    const shown = esc(label);

    return `<g opacity="${fade.toFixed(3)}">
      <circle cx="${x0}" cy="${y0}" r="5" fill="${color}"/>
      <path d="M${x0} ${y0} L${x1} ${y0} L${x2} ${y0}" stroke="${color}" stroke-width="2.5" fill="none"/>
      ${labelT > 0 ? `<g opacity="${labelT.toFixed(3)}">
        <text x="${tx}" y="${y0 + size * 0.34}" text-anchor="${textAnchor}"
          font-family="'JetBrains Mono','SF Mono',monospace" font-size="${size}" font-weight="700"
          fill="${color}" letter-spacing="-0.5">${shown}</text>
        ${sub ? `<text x="${tx}" y="${y0 + size * 0.34 + size * 0.92}" text-anchor="${textAnchor}"
          font-family="'JetBrains Mono','SF Mono',monospace" font-size="${Math.round(size * 0.5)}"
          fill="#ffffff" fill-opacity="0.72">${esc(sub)}</text>` : ''}
      </g>` : ''}
    </g>`;
  };
}

/**
 * A rule name, set as type.
 *
 * The UI prints `destination-originates-from-page` as small mono chrome. It is
 * the single most important string in the product and it is unreadable on a
 * phone, so it gets restated at a size the format can carry.
 */
export function ruleStamp({ text, kicker, from, to, out, x, y, size = 46, align = 'start' }) {
  return (n) => {
    const t = seg(n, from, to, easeOut);
    if (t <= 0) return '';
    const fade = out == null ? 1 : 1 - seg(n, out, out + 12, easeInOut);
    if (fade <= 0) return '';
    const dy = (1 - t) * 18;
    const pad = 16;
    const charW = size * 0.6;
    const boxW = esc(text).length * charW + pad * 2;
    const boxH = size * 1.55 + (kicker ? size * 0.72 : 0);
    const bx = align === 'end' ? x - boxW : x;
    return `<g opacity="${(t * fade).toFixed(3)}" transform="translate(0 ${dy.toFixed(2)})">
      <rect x="${bx}" y="${y}" width="${boxW}" height="${boxH}" rx="6" fill="${INK}" fill-opacity="0.9" stroke="${ACID}" stroke-width="2"/>
      ${kicker ? `<text x="${bx + pad}" y="${y + size * 0.78}" font-family="'JetBrains Mono',monospace"
        font-size="${Math.round(size * 0.42)}" fill="${ACID}" fill-opacity="0.75"
        letter-spacing="2">${esc(kicker.toUpperCase())}</text>` : ''}
      <text x="${bx + pad}" y="${y + (kicker ? size * 1.62 : size * 1.06)}"
        font-family="'JetBrains Mono','SF Mono',monospace" font-size="${size}" font-weight="700"
        fill="${ACID}" letter-spacing="-1">${esc(text)}</text>
    </g>`;
  };
}

/** Compose marks into one SVG for a frame. */
export function renderMarks(marks, n, size) {
  const body = marks.map((m) => m(n, size)).filter(Boolean).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">${body}</svg>`;
}
