// Zero-width steganography: decode instructions hidden in invisible codepoints.
//
// Two encodings are handled, because attackers in the wild use both:
//   1. Binary  - ZWSP (U+200B) = 0, ZWNJ (U+200C) = 1, eight bits per char.
//   2. Padding - zero-width characters sprinkled between visible characters
//                purely to defeat naive string matching. Stripping them
//                recovers the underlying instruction.
//
// Decoding matters for the demo: "there are invisible characters here" is a
// shrug, but "the invisible characters say *this*" is the whole point.

export const ZW_CLASS = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069\u180E]/;
export const ZW_CLASS_G = /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069\u180E]/g;

const BIT_ZERO = '\u200B';
const BIT_ONE = '\u200C';

function decodeBinary(raw) {
  const bits = Array.from(raw)
    .filter((ch) => ch === BIT_ZERO || ch === BIT_ONE)
    .map((ch) => (ch === BIT_ONE ? '1' : '0'))
    .join('');
  if (bits.length < 16) return null;

  let out = '';
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    const code = parseInt(bits.slice(i, i + 8), 2);
    // Printable ASCII plus newline only; anything else means this was not
    // a binary payload and we should not pretend otherwise.
    if (code === 10 || (code >= 32 && code <= 126)) out += String.fromCharCode(code);
    else return null;
  }
  return out.trim().length >= 8 ? out.trim() : null;
}

export function encodeBinary(text) {
  return Array.from(text)
    .map((ch) => ch.charCodeAt(0).toString(2).padStart(8, '0'))
    .join('')
    .split('')
    .map((b) => (b === '1' ? BIT_ONE : BIT_ZERO))
    .join('');
}

/**
 * @returns {{kind:'binary'|'padding', decoded:string, count:number}|null}
 */
export function decodeZeroWidth(raw) {
  if (!raw || !ZW_CLASS.test(raw)) return null;
  const count = (raw.match(ZW_CLASS_G) || []).length;

  const binary = decodeBinary(raw);
  if (binary) return { kind: 'binary', decoded: binary, count };

  const stripped = raw.replace(ZW_CLASS_G, '').trim();
  if (stripped.length >= 8) return { kind: 'padding', decoded: stripped, count };
  return null;
}

export function stripZeroWidth(raw) {
  return (raw || '').replace(ZW_CLASS_G, '');
}
