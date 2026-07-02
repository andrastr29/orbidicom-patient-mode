/**
 * Portable, lossless tagging of `Uint8Array` fields for JSON round-tripping.
 *
 * `JSON.stringify` turns a `Uint8Array` into an index-keyed object
 * (`{"0":1,"1":2,...}`) that re-parses as a plain, non-typed, non-iterable object —
 * corrupting segmentation rasters on ai-json export/import. To survive the trip we
 * encode each `Uint8Array` as a tagged base64 form `{ "$u8": "<base64>" }` on
 * export and decode it back on import.
 *
 * The base64 codec is hand-rolled so it runs identically in the browser and in
 * Node/Vitest — it does NOT depend on `Buffer`, `btoa`, or `atob` (none of which
 * are guaranteed across those environments).
 */

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = (() => {
  const lut = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) lut[B64_CHARS.charCodeAt(i)] = i;
  return lut;
})();

/** The tagged wire form of a `Uint8Array`. */
export interface TaggedU8 {
  $u8: string;
}

/** True if `x` is a `{ "$u8": string }` tagged Uint8Array. */
export function isTaggedU8(x: unknown): x is TaggedU8 {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { $u8?: unknown }).$u8 === "string" &&
    Object.keys(x as object).length === 1
  );
}

/** Encode bytes to a standard (padded) base64 string. Portable across browser/Node. */
export function bytesToBase64(bytes: Uint8Array): string {
  // `& 63` always yields a valid index into the 64-char alphabet.
  const c = (idx: number): string => B64_CHARS.charAt(idx & 63);
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += c(n >> 18) + c(n >> 12) + c(n >> 6) + c(n);
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i]! << 16;
    out += c(n >> 18) + c(n >> 12) + "==";
  } else if (rem === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += c(n >> 18) + c(n >> 12) + c(n >> 6) + "=";
  }
  return out;
}

/** Decode a standard base64 string back to bytes. Portable across browser/Node. */
export function base64ToBytes(b64: string): Uint8Array {
  // Drop padding and any stray whitespace; `clean` holds only alphabet chars, so
  // its length alone determines the byte count (each char carries 6 bits).
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const outLen = Math.floor((clean.length * 6) / 8);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)] ?? 0;
    const c1 = B64_LOOKUP[clean.charCodeAt(i + 1)] ?? 0;
    const c2 = B64_LOOKUP[clean.charCodeAt(i + 2)] ?? 0;
    const c3 = B64_LOOKUP[clean.charCodeAt(i + 3)] ?? 0;
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (o < outLen) out[o++] = (n >> 16) & 0xff;
    if (o < outLen) out[o++] = (n >> 8) & 0xff;
    if (o < outLen) out[o++] = n & 0xff;
  }
  return out;
}

/**
 * Deep-clone `value`, replacing every `Uint8Array` with its `{ "$u8": base64 }`
 * tagged form so `JSON.stringify` preserves it losslessly.
 */
export function encodeU8(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $u8: bytesToBase64(value) };
  if (Array.isArray(value)) return value.map(encodeU8);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeU8(v);
    return out;
  }
  return value;
}

/**
 * Deep-clone `value`, replacing every `{ "$u8": base64 }` tag with a real
 * `Uint8Array`. Inverse of {@link encodeU8}; run BEFORE payload validation so the
 * decoded typed array validates.
 */
export function decodeU8(value: unknown): unknown {
  if (isTaggedU8(value)) return base64ToBytes(value.$u8);
  if (Array.isArray(value)) return value.map(decodeU8);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeU8(v);
    return out;
  }
  return value;
}
