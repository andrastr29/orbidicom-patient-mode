import { annotation, utilities } from "@cornerstonejs/tools";
import { removeSegmentationFromViewport, renderSegmentation } from "../cornerstone/seg";
import { measurementToAnnotation } from "./measurement-to-annotation";
import type { AIResultSet } from "./types";

export interface ApplyContext {
  viewportId: string;
  stack: { imageId: string; sopInstanceUID: string }[];
}

/** Handles produced by `applyResultSet`, needed to remove what was added on re-apply. */
export interface AppliedHandles {
  annotationUids: string[];
  segmentationIds: string[];
}

/** Deterministic segmentation id for an AI result (stable across re-applies). */
export function aiSegmentationId(resultId: string): string {
  return `orbidicom-ai-${resultId}`;
}

/**
 * Inject the accepted+visible results of a set into the viewport: measurements
 * become real Cornerstone annotations; segmentations render via the SEG overlay.
 * Returns the annotation + segmentation ids that were added (for later
 * `removeApplied` / `removeAppliedSegmentations`).
 */
export async function applyResultSet(set: AIResultSet, ctx: ApplyContext): Promise<AppliedHandles> {
  const annotationUids: string[] = [];
  const segmentationIds: string[] = [];
  for (const r of set.results) {
    if (r.reviewStatus === "rejected" || !r.visible) continue;
    if (r.kind === "measurement") {
      const ann = measurementToAnnotation(r.measurement, r.id);
      const uid = annotation.state.addAnnotation(
        ann as never,
        r.measurement.frameOfReferenceUID as never,
      );
      if (typeof uid === "string") annotationUids.push(uid);
    } else if (r.kind === "segmentation") {
      const segmentationId = aiSegmentationId(r.id);
      await renderSegmentation({
        viewportId: ctx.viewportId,
        segmentationId,
        stack: ctx.stack,
        data: r.segmentation,
      });
      segmentationIds.push(segmentationId);
    }
  }
  utilities.triggerAnnotationRenderForViewportIds([ctx.viewportId]);
  return { annotationUids, segmentationIds };
}

/** Remove previously-applied annotations by UID (e.g. on reject / re-apply). */
export function removeApplied(uids: string[]): void {
  for (const uid of uids) annotation.state.removeAnnotation(uid);
}

/** Remove previously-applied segmentation labelmaps by id (e.g. on reject / re-apply). */
export async function removeAppliedSegmentations(
  viewportId: string,
  segmentationIds: string[],
): Promise<void> {
  for (const id of segmentationIds) removeSegmentationFromViewport(viewportId, id);
}
