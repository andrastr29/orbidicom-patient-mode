/**
 * DICOM-SEG (Segmentation Storage) parsing: the framework-agnostic core of
 * read-only segmentation support. Turns a SEG instance's DICOM-JSON metadata into
 * normalized segment definitions (labels, codes, display colors) and a per-frame
 * map of which segment each frame paints over which source image, plus a decoder
 * for the BINARY segmentation bitstream. The on-screen labelmap rendering
 * (Cornerstone3D / WebGL) consumes these outputs and is layered on top.
 */

/** Segmentation Storage SOP Class UID. */
export const SEG_SOP_CLASS_UID = "1.2.840.10008.5.1.4.1.1.66.4";

const TAG = {
  SOP_CLASS_UID: "00080016",
  SEGMENTATION_TYPE: "00620001",
  SEGMENT_SEQUENCE: "00620002",
  SEGMENT_NUMBER: "00620004",
  SEGMENT_LABEL: "00620005",
  SEGMENT_ALGORITHM_TYPE: "00620008",
  SEGMENTED_PROPERTY_CATEGORY: "00620003",
  SEGMENTED_PROPERTY_TYPE: "0062000F",
  RECOMMENDED_CIELAB: "0062000D",
  ROWS: "00280010",
  COLUMNS: "00280011",
  NUMBER_OF_FRAMES: "00280008",
  REFERENCED_SERIES_SEQUENCE: "00081115",
  SERIES_INSTANCE_UID: "0020000E",
  PER_FRAME_GROUPS: "52009230",
  SEGMENT_IDENTIFICATION: "0062000A",
  REFERENCED_SEGMENT_NUMBER: "0062000B",
  DERIVATION_IMAGE: "00089124",
  SOURCE_IMAGE: "00082112",
  REF_SOP_INSTANCE_UID: "00081155",
  CODE_MEANING: "00080104",
} as const;

type Json = Record<string, unknown>;

function first(obj: Json, tag: string): string {
  const entry = obj?.[tag] as { Value?: unknown[] } | undefined;
  return String(entry?.Value?.[0] ?? "");
}
const num = (obj: Json, tag: string) => Number(first(obj, tag)) || 0;

function seq(obj: Json, tag: string): Json[] {
  return ((obj?.[tag] as { Value?: unknown[] } | undefined)?.Value as Json[]) ?? [];
}
function codeMeaning(obj: Json, tag: string): string | undefined {
  const item = seq(obj, tag)[0];
  return item ? first(item, TAG.CODE_MEANING) || undefined : undefined;
}
function usValues(obj: Json, tag: string): number[] {
  return ((obj?.[tag] as { Value?: unknown[] } | undefined)?.Value ?? []).map(Number);
}

/** A single segment defined in a SEG. */
export interface SegmentInfo {
  number: number;
  label: string;
  algorithmType?: string;
  /** CodeMeaning of the Segmented Property Category. */
  category?: string;
  /** CodeMeaning of the Segmented Property Type. */
  type?: string;
  /** Display color as sRGB [r,g,b] (0–255), from Recommended Display CIELab. */
  color?: [number, number, number];
}

/** Normalized view of a SEG instance's metadata. */
export interface SegInfo {
  segmentationType: string;
  rows: number;
  columns: number;
  numberOfFrames: number;
  /** Series the segmentation is drawn over (Referenced Series Sequence). */
  referencedSeriesUid?: string;
  segments: SegmentInfo[];
}

/** Per-frame: which segment it belongs to, and which source image it overlays. */
export interface SegFrameMap {
  segmentNumber: number;
  sourceSopInstanceUid?: string;
}

/** A labelmap (segment number per pixel) for one source image, ready to render. */
export interface SegLabelmap {
  sourceSopInstanceUid: string;
  rows: number;
  columns: number;
  /** Row-major segment number per pixel (0 = background); length rows*columns. */
  data: Uint8Array;
}

/** True if the metadata describes a Segmentation Storage instance. */
export function isSegmentation(meta: Json): boolean {
  return first(meta, TAG.SOP_CLASS_UID) === SEG_SOP_CLASS_UID;
}

/** The Series Instance UID a SEG references (the series it overlays), if present. */
export function referencedSeriesUid(meta: Json): string | undefined {
  const item = seq(meta, TAG.REFERENCED_SERIES_SEQUENCE)[0];
  return item ? first(item, TAG.SERIES_INSTANCE_UID) || undefined : undefined;
}

/** Parse a SEG instance's metadata into normalized {@link SegInfo}. */
export function parseSeg(meta: Json): SegInfo {
  const segments = seq(meta, TAG.SEGMENT_SEQUENCE).map((s): SegmentInfo => {
    const seg: SegmentInfo = {
      number: num(s, TAG.SEGMENT_NUMBER),
      label: first(s, TAG.SEGMENT_LABEL),
    };
    const algo = first(s, TAG.SEGMENT_ALGORITHM_TYPE);
    if (algo) seg.algorithmType = algo;
    const category = codeMeaning(s, TAG.SEGMENTED_PROPERTY_CATEGORY);
    if (category) seg.category = category;
    const type = codeMeaning(s, TAG.SEGMENTED_PROPERTY_TYPE);
    if (type) seg.type = type;
    const lab = usValues(s, TAG.RECOMMENDED_CIELAB);
    if (lab.length === 3) seg.color = cielabToRgb([lab[0] ?? 0, lab[1] ?? 0, lab[2] ?? 0]);
    return seg;
  });
  return {
    segmentationType: first(meta, TAG.SEGMENTATION_TYPE) || "BINARY",
    rows: num(meta, TAG.ROWS),
    columns: num(meta, TAG.COLUMNS),
    numberOfFrames: num(meta, TAG.NUMBER_OF_FRAMES),
    referencedSeriesUid: referencedSeriesUid(meta),
    segments,
  };
}

/** Per-frame segment + source-image map, from the Per-frame Functional Groups. */
export function mapFramesToSegments(meta: Json): SegFrameMap[] {
  return seq(meta, TAG.PER_FRAME_GROUPS).map((frame): SegFrameMap => {
    const segId = seq(frame, TAG.SEGMENT_IDENTIFICATION)[0];
    const map: SegFrameMap = {
      segmentNumber: segId ? num(segId, TAG.REFERENCED_SEGMENT_NUMBER) : 0,
    };
    const deriv = seq(frame, TAG.DERIVATION_IMAGE)[0];
    const src = deriv ? seq(deriv, TAG.SOURCE_IMAGE)[0] : undefined;
    const sourceSop = src ? first(src, TAG.REF_SOP_INSTANCE_UID) : "";
    if (sourceSop) map.sourceSopInstanceUid = sourceSop;
    return map;
  });
}

/**
 * Convert a DICOM "Recommended Display CIELab Value" (three US values, 0–65535)
 * to sRGB [r,g,b] (0–255). L* maps to [0,100]; a* and b* map to [-128,127].
 */
export function cielabToRgb(lab: [number, number, number]): [number, number, number] {
  const L = (lab[0] / 65535) * 100;
  const a = (lab[1] / 65535) * 255 - 128;
  const b = (lab[2] / 65535) * 255 - 128;
  // CIELab → XYZ (D65 reference white).
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const d = 6 / 29;
  const finv = (t: number) => (t > d ? t * t * t : 3 * d * d * (t - 4 / 29));
  const X = 0.95047 * finv(fx);
  const Y = 1.0 * finv(fy);
  const Z = 1.08883 * finv(fz);
  // XYZ → linear sRGB → gamma-companded, clamped to [0,255].
  const lin = [
    X * 3.2406 + Y * -1.5372 + Z * -0.4986,
    X * -0.9689 + Y * 1.8758 + Z * 0.0415,
    X * 0.0557 + Y * -0.204 + Z * 1.057,
  ];
  return lin.map((c) => {
    const g = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, g)) * 255);
  }) as [number, number, number];
}

/**
 * Decode a BINARY-type SEG's packed pixel data into one 0/1 mask per frame. The
 * bitstream is LSB-first and continuous across frames (frame boundaries are not
 * byte-aligned), per PS3.5, so frame `f`, pixel `p` lives at bit `f*rows*cols+p`.
 */
export function unpackBinarySegmentationFrames(
  bytes: Uint8Array,
  rows: number,
  columns: number,
  frames: number,
): Uint8Array[] {
  const perFrame = rows * columns;
  const out: Uint8Array[] = [];
  for (let f = 0; f < frames; f++) {
    const mask = new Uint8Array(perFrame);
    for (let p = 0; p < perFrame; p++) {
      const bit = f * perFrame + p;
      mask[p] = ((bytes[bit >> 3] ?? 0) >> (bit & 7)) & 1;
    }
    out.push(mask);
  }
  return out;
}

/**
 * Assemble decoded per-frame masks into one {@link SegLabelmap} per source image:
 * for each frame, paint its segment number onto the source image's labelmap where
 * the mask is set (later frames win on overlap). Frames with no source image are
 * skipped. This is the render-ready data a Cornerstone3D labelmap consumes.
 */
export function buildSegLabelmaps(
  dims: { rows: number; columns: number },
  masks: Uint8Array[],
  frameMap: SegFrameMap[],
): SegLabelmap[] {
  const { rows, columns } = dims;
  const perFrame = rows * columns;
  const bySop = new Map<string, Uint8Array>();
  frameMap.forEach((fm, i) => {
    const sop = fm.sourceSopInstanceUid;
    const mask = masks[i];
    if (!sop || !mask) return;
    let lm = bySop.get(sop);
    if (!lm) {
      lm = new Uint8Array(perFrame);
      bySop.set(sop, lm);
    }
    for (let p = 0; p < perFrame; p++) {
      if (mask[p]) lm[p] = fm.segmentNumber;
    }
  });
  return [...bySop.entries()].map(([sourceSopInstanceUid, data]) => ({
    sourceSopInstanceUid,
    rows,
    columns,
    data,
  }));
}
