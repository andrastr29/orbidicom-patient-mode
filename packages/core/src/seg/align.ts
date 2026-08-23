/**
 * SEG render-prep: pure helpers that bridge decoded {@link SegLabelmap}s (keyed
 * by source SOP Instance UID) and a rendered image *stack* (a list of image ids,
 * each with its SOP Instance UID). The Cornerstone labelmap glue consumes these
 * to create per-slice derived labelmap images. No DOM / Cornerstone here.
 */
import type { SegLabelmap } from "./parse";

/** A labelmap raster matched to the stack image it paints over. */
export interface AlignedLabelmap {
  imageId: string;
  /** Row-major segment number per pixel (0 = background); length rows*columns. */
  raster: Uint8Array;
}

/**
 * Match each labelmap to the stack image with the same SOP Instance UID, in stack
 * order. Stack images without a labelmap, and labelmaps without a stack image, are
 * dropped, so the result is exactly the slices that need a labelmap drawn.
 */
export function alignLabelmapsToStack(
  stack: { imageId: string; sopInstanceUID: string }[],
  labelmaps: SegLabelmap[],
): AlignedLabelmap[] {
  const bySop = new Map(labelmaps.map((l) => [l.sourceSopInstanceUid, l]));
  const out: AlignedLabelmap[] = [];
  for (const { imageId, sopInstanceUID } of stack) {
    const lm = bySop.get(sopInstanceUID);
    if (lm) out.push({ imageId, raster: lm.data });
  }
  return out;
}

/** The distinct non-zero segment indices present across the aligned rasters, ascending. */
export function segmentIndicesIn(aligned: AlignedLabelmap[]): number[] {
  const seen = new Set<number>();
  for (const { raster } of aligned) {
    for (const v of raster) if (v !== 0) seen.add(v);
  }
  return [...seen].sort((a, b) => a - b);
}
