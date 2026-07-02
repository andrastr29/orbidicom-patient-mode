import type { SegmentationData } from "../datasource";
import type { SegmentStat } from "./types";

export interface VoxelSpacing {
  rowMm: number;
  colMm: number;
  sliceMm: number;
}

/**
 * Aggregate per-segment voxel counts across all labelmaps and derive area/volume.
 * `voxels` is the total labelled pixel count for that segment across every frame;
 * `areaMm2` = voxels * rowMm * colMm; `volumeMm3` = areaMm2 * sliceMm.
 */
export function computeSegmentStats(data: SegmentationData, spacing: VoxelSpacing): SegmentStat[] {
  const counts = new Map<number, number>();
  for (const lm of data.labelmaps) {
    for (const seg of lm.data) {
      if (seg === 0) continue;
      counts.set(seg, (counts.get(seg) ?? 0) + 1);
    }
  }
  const px = spacing.rowMm * spacing.colMm;
  return data.info.segments.map((s) => {
    const voxels = counts.get(s.number) ?? 0;
    return {
      segment: s.number,
      label: s.label,
      voxels,
      areaMm2: voxels * px,
      volumeMm3: voxels * px * spacing.sliceMm,
    };
  });
}
