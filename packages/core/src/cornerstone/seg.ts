/**
 * DICOM-SEG labelmap rendering for a STACK viewport (Cornerstone3D 5.0.13).
 *
 * Turns a decoded {@link SegmentationData} into an on-screen labelmap overlay:
 * aligns the per-source-image rasters to the viewport's stack, creates per-slice
 * derived labelmap images, registers a stack labelmap segmentation, adds its
 * representation to the viewport, and applies each segment's display color.
 *
 * The pure alignment lives in `seg/align.ts` (unit-tested); this module is the
 * Cornerstone integration — it requires a live WebGL viewport, so the actual
 * rendering must be verified in a browser (see docs). Read-only (no editing).
 */
import { segmentation, Enums as csToolsEnums } from "@cornerstonejs/tools";
import { imageLoader } from "@cornerstonejs/core";
import type { SegmentationData } from "../datasource";
import { alignLabelmapsToStack } from "../seg/align";

export interface RenderSegmentationOptions {
  /** The STACK viewport to draw the labelmap over. */
  viewportId: string;
  /** A unique id for this segmentation (e.g. `seg-<sopUid>`). */
  segmentationId: string;
  /** The source stack: each rendered image id with its SOP Instance UID. */
  stack: { imageId: string; sopInstanceUID: string }[];
  /** The decoded SEG (segment defs + per-source-image labelmaps). */
  data: SegmentationData;
}

/**
 * Render `data` as a labelmap over `viewportId`. Returns false (a no-op) when none
 * of the SEG's labelmaps match an image currently in the stack. The caller renders
 * the viewport afterwards.
 */
export async function renderSegmentation(opts: RenderSegmentationOptions): Promise<boolean> {
  const { viewportId, segmentationId, stack, data } = opts;
  const aligned = alignLabelmapsToStack(stack, data.labelmaps);
  if (!aligned.length) return false;

  // One derived labelmap image per matched source slice, populated with its raster.
  const labelmapImages = imageLoader.createAndCacheDerivedLabelmapImages(
    aligned.map((a) => a.imageId),
  );
  aligned.forEach((a, i) => {
    const img = labelmapImages[i];
    if (!img) return;
    // The exact pixel-buffer accessor differs across point releases; both forms
    // exist in 5.0.13. Loosely typed on purpose (verified at runtime in a browser).
    const anyImg = img as unknown as {
      voxelManager?: { getScalarData?: () => { set?: (b: ArrayLike<number>) => void } };
      getPixelData?: () => { set?: (b: ArrayLike<number>) => void };
    };
    const scalar = anyImg.voxelManager?.getScalarData?.() ?? anyImg.getPixelData?.();
    if (scalar && typeof scalar.set === "function") scalar.set(a.raster);
  });

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: { imageIds: labelmapImages.map((img) => img.imageId) },
      },
    },
  ]);
  await segmentation.addLabelmapRepresentationToViewport(viewportId, [{ segmentationId }]);

  // Apply each segment's Recommended Display color (CIELab→sRGB done in parsing).
  for (const seg of data.info.segments) {
    if (seg.color) {
      segmentation.config.color.setSegmentIndexColor(viewportId, segmentationId, seg.number, [
        seg.color[0],
        seg.color[1],
        seg.color[2],
        255,
      ]);
    }
  }
  return true;
}

/** Remove a previously-added labelmap representation from a viewport. */
export function removeSegmentationFromViewport(viewportId: string, segmentationId: string): void {
  segmentation.removeSegmentationRepresentation(viewportId, {
    segmentationId,
    type: csToolsEnums.SegmentationRepresentations.Labelmap,
  });
}

/**
 * Fully remove a segmentation from global state — its state entry AND all of its
 * viewport representations (unlike {@link removeSegmentationFromViewport}, which
 * only strips a single viewport's representation and leaves the global entry, so
 * re-adding the same `segmentationId` would throw "already exists").
 *
 * `segmentation.removeSegmentation` (@cornerstonejs/tools 5.0.13) tears down every
 * viewport representation for the id and then deregisters it from the state
 * manager, so the id is free to be added again on the next re-apply.
 */
export function removeAiSegmentation(segmentationId: string): void {
  segmentation.removeSegmentation(segmentationId);
}
