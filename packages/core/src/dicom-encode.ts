/**
 * Minimal DICOM Part-10 writer: encodes a DICOM-JSON dataset (the tag-keyed
 * `{ vr, Value }` shape produced by `sr/to-json.ts`) into an Explicit VR Little
 * Endian Part-10 byte stream suitable for STOW-RS (`application/dicom`).
 *
 * Intentionally small: it supports the value representations a Structured Report
 * uses (string VRs, DS/IS numerics-as-strings, binary numerics, and nested
 * sequences) rather than the full DICOM standard. Round-tripped against
 * `dicom-parser` in the tests. No external dependency.
 */

/** DICOM-JSON element: `{ vr, Value }`. For SQ, `Value` is an array of item objects. */
export interface DicomJsonElement {
  vr: string;
  Value?: unknown[];
}
export type DicomJsonDataset = Record<string, DicomJsonElement | undefined>;

export interface EncodeOptions {
  /** Defaults to Explicit VR Little Endian. */
  transferSyntaxUid?: string;
  implementationClassUid?: string;
  implementationVersionName?: string;
}

const EXPLICIT_VR_LE = "1.2.840.10008.1.2.1";
/** OrbiDICOM's implementation class UID (a fixed UUID-derived 2.25 root). */
export const ORBIDICOM_IMPL_CLASS_UID = "2.25.328632175243827011552047185862990091541";

// VRs that use the 2-reserved-bytes + 4-byte-length header form.
const LONG_VRS = new Set(["OB", "OW", "OF", "OD", "OL", "OV", "SQ", "UC", "UR", "UT", "UN"]);
// VRs encoded as (possibly multi-valued, "\"-joined) text.
const TEXT_VRS = new Set([
  "AE",
  "AS",
  "CS",
  "DA",
  "DS",
  "DT",
  "IS",
  "LO",
  "LT",
  "PN",
  "SH",
  "ST",
  "TM",
  "UC",
  "UR",
  "UT",
  "UI",
]);
const NUMERIC_SIZES: Record<string, number> = { US: 2, SS: 2, UL: 4, SL: 4, FL: 4, FD: 8, AT: 4 };

const te = new TextEncoder();

const u16 = (n: number): Uint8Array => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n & 0xffff, true);
  return b;
};
const u32 = (n: number): Uint8Array => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
};

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function padEven(bytes: Uint8Array, pad: number): Uint8Array {
  if (bytes.length % 2 === 0) return bytes;
  const out = new Uint8Array(bytes.length + 1);
  out.set(bytes);
  out[bytes.length] = pad;
  return out;
}

function encodeText(vr: string, value: unknown[] | undefined): Uint8Array {
  const parts = (value ?? []).map((v) => {
    if (v == null) return "";
    if (typeof v === "object") return String((v as { Alphabetic?: string }).Alphabetic ?? "");
    return String(v);
  });
  return padEven(te.encode(parts.join("\\")), vr === "UI" ? 0x00 : 0x20);
}

function encodeNumeric(vr: string, value: unknown[] | undefined): Uint8Array {
  const vals = (value ?? []).map(Number);
  const size = NUMERIC_SIZES[vr];
  if (!size) return new Uint8Array(0);
  const b = new Uint8Array(vals.length * size);
  const dv = new DataView(b.buffer);
  vals.forEach((v, i) => {
    const off = i * size;
    if (vr === "US") dv.setUint16(off, v, true);
    else if (vr === "SS") dv.setInt16(off, v, true);
    else if (vr === "UL") dv.setUint32(off, v >>> 0, true);
    else if (vr === "SL") dv.setInt32(off, v, true);
    else if (vr === "FL") dv.setFloat32(off, v, true);
    else if (vr === "FD") dv.setFloat64(off, v, true);
    else if (vr === "AT") {
      dv.setUint16(off, (v >>> 16) & 0xffff, true);
      dv.setUint16(off + 2, v & 0xffff, true);
    }
  });
  return b;
}

function encodeBytes(value: unknown[] | undefined): Uint8Array {
  return padEven(Uint8Array.from((value ?? []).map((v) => Number(v) & 0xff)), 0x00);
}

function encodeValue(vr: string, value: unknown[] | undefined): Uint8Array {
  if (TEXT_VRS.has(vr)) return encodeText(vr, value);
  if (vr in NUMERIC_SIZES) return encodeNumeric(vr, value);
  if (vr === "OB" || vr === "OW" || vr === "UN") return encodeBytes(value);
  return encodeText(vr, value); // safe fallback
}

// Item / delimitation tags carry no VR, just tag + 4-byte length.
const itemStart = () => concat([u16(0xfffe), u16(0xe000), u32(0xffffffff)]);
const itemEnd = () => concat([u16(0xfffe), u16(0xe00d), u32(0)]);
const seqEnd = () => concat([u16(0xfffe), u16(0xe0dd), u32(0)]);

function encodeElement(tag: string, el: DicomJsonElement): Uint8Array {
  const group = parseInt(tag.slice(0, 4), 16);
  const element = parseInt(tag.slice(4, 8), 16);
  const head = [u16(group), u16(element), te.encode(el.vr)];

  if (el.vr === "SQ") {
    const items = (el.Value ?? []).map((it) =>
      concat([itemStart(), encodeDataset(it as DicomJsonDataset), itemEnd()]),
    );
    // Undefined-length sequence (terminated by a sequence-delimitation item).
    return concat([...head, u16(0), u32(0xffffffff), ...items, seqEnd()]);
  }

  const value = encodeValue(el.vr, el.Value);
  if (LONG_VRS.has(el.vr)) return concat([...head, u16(0), u32(value.length), value]);
  return concat([...head, u16(value.length), value]);
}

function encodeDataset(obj: DicomJsonDataset, includeGroup2 = false): Uint8Array {
  const tags = Object.keys(obj)
    .filter((k) => /^[0-9A-Fa-f]{8}$/.test(k))
    .filter((k) => includeGroup2 || k.slice(0, 4).toLowerCase() !== "0002")
    .sort((a, b) => parseInt(a, 16) - parseInt(b, 16));
  return concat(tags.map((t) => encodeElement(t, obj[t]!)));
}

const firstUid = (el: DicomJsonElement | undefined): string => String(el?.Value?.[0] ?? "");

function buildFileMeta(dataset: DicomJsonDataset, opts: EncodeOptions): Uint8Array {
  const meta: DicomJsonDataset = {
    "00020001": { vr: "OB", Value: [0, 1] }, // File Meta Information Version
    "00020002": { vr: "UI", Value: [firstUid(dataset["00080016"])] }, // MediaStorageSOPClassUID
    "00020003": { vr: "UI", Value: [firstUid(dataset["00080018"])] }, // MediaStorageSOPInstanceUID
    "00020010": { vr: "UI", Value: [opts.transferSyntaxUid ?? EXPLICIT_VR_LE] },
    "00020012": { vr: "UI", Value: [opts.implementationClassUid ?? ORBIDICOM_IMPL_CLASS_UID] },
    "00020013": { vr: "SH", Value: [opts.implementationVersionName ?? "ORBIDICOM"] },
  };
  const body = encodeDataset(meta, true);
  const groupLength = encodeElement("00020000", { vr: "UL", Value: [body.length] });
  return concat([groupLength, body]);
}

/**
 * Encode a DICOM-JSON dataset into a Part-10 byte stream (Explicit VR LE). The
 * dataset must carry SOP Class (00080016) and SOP Instance (00080018) UIDs for
 * the File Meta Information; group-0002 elements in the dataset are ignored
 * (the file meta is generated).
 */
export function dicomJsonToPart10(dataset: DicomJsonDataset, opts: EncodeOptions = {}): Uint8Array {
  return concat([
    new Uint8Array(128), // preamble
    te.encode("DICM"),
    buildFileMeta(dataset, opts),
    encodeDataset(dataset),
  ]);
}
