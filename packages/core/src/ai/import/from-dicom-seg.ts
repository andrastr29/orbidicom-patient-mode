import { decodeSegmentation } from "../../seg/decode";
import { computeSegmentStats, type VoxelSpacing } from "../stats";
import type { AIResultSet, SegmentationResult } from "../types";

/** Decode a BINARY DICOM-SEG (meta + de-enveloped bytes) into a SegmentationResult. */
export function fromDicomSeg(
  meta: Record<string, unknown>,
  bytes: Uint8Array,
  spacing?: VoxelSpacing,
): AIResultSet {
  const data = decodeSegmentation(meta, bytes);
  const n = data.info.segments.length;
  const result: SegmentationResult = {
    kind: "segmentation",
    id: "seg-0",
    label:
      n === 1 ? data.info.segments[0]?.label || "Segmentation" : `Segmentation (${n} segments)`,
    reviewStatus: "accepted",
    visible: true,
    segmentation: data,
    sourceBytes: bytes,
    stats: spacing ? computeSegmentStats(data, spacing) : undefined,
  };
  return {
    schema: "orbidicom.ai-results/v1",
    provenance: {
      source: "import",
      format: "dicom-seg",
      seriesInstanceUid: data.info.referencedSeriesUid,
    },
    results: [result],
  };
}
