import { annotation, utilities } from "@cornerstonejs/tools";
import { renderSegmentation } from "../cornerstone/seg";
import { measurementToAnnotation } from "./measurement-to-annotation";
import type { AIResultSet } from "./types";

export interface ApplyContext {
  viewportId: string;
  stack: { imageId: string; sopInstanceUID: string }[];
}

/**
 * Inject the accepted+visible results of a set into the viewport: measurements
 * become real Cornerstone annotations; segmentations render via the SEG overlay.
 * Returns the annotation UIDs that were added (for later `removeApplied`).
 */
export async function applyResultSet(set: AIResultSet, ctx: ApplyContext): Promise<string[]> {
  const uids: string[] = [];
  for (const r of set.results) {
    if (r.reviewStatus === "rejected" || !r.visible) continue;
    if (r.kind === "measurement") {
      const ann = measurementToAnnotation(r.measurement, r.id);
      const uid = annotation.state.addAnnotation(
        ann as never,
        r.measurement.frameOfReferenceUID as never,
      );
      if (typeof uid === "string") uids.push(uid);
    } else if (r.kind === "segmentation") {
      await renderSegmentation({
        viewportId: ctx.viewportId,
        segmentationId: `orbidicom-ai-${r.id}`,
        stack: ctx.stack,
        data: r.segmentation,
      });
    }
  }
  utilities.triggerAnnotationRenderForViewportIds([ctx.viewportId]);
  return uids;
}

/** Remove previously-applied annotations by UID (e.g. on reject / re-apply). */
export function removeApplied(uids: string[]): void {
  for (const uid of uids) annotation.state.removeAnnotation(uid);
}
