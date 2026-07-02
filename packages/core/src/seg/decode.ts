import type { SegmentationData } from "../datasource";
import {
  parseSeg,
  mapFramesToSegments,
  unpackBinarySegmentationFrames,
  buildSegLabelmaps,
} from "./parse";

type Json = Record<string, unknown>;

/**
 * Decode a BINARY DICOM-SEG from its DICOM-JSON metadata + the already-extracted
 * (de-enveloped) packed PixelData bitstream into `{ info, labelmaps }`.
 * Pure: no fetch, no DOM. `bytes` is the raw LSB-first, frame-continuous bitstream.
 */
export function decodeSegmentation(meta: Json, bytes: Uint8Array): SegmentationData {
  const info = parseSeg(meta);
  const frameMap = mapFramesToSegments(meta);
  const masks = unpackBinarySegmentationFrames(bytes, info.rows, info.columns, info.numberOfFrames);
  return { info, labelmaps: buildSegLabelmaps(info, masks, frameMap) };
}
