import { describe, it, expect } from "vitest";
import { computeSegmentStats } from "../src/ai/stats";
import type { SegmentationData } from "../src/datasource";

const data: SegmentationData = {
  info: {
    segmentationType: "BINARY",
    rows: 2,
    columns: 2,
    numberOfFrames: 2,
    segments: [{ number: 1, label: "Tumor" }],
  },
  labelmaps: [
    { sourceSopInstanceUid: "a", rows: 2, columns: 2, data: Uint8Array.from([1, 0, 1, 0]) },
    { sourceSopInstanceUid: "b", rows: 2, columns: 2, data: Uint8Array.from([0, 1, 0, 0]) },
  ],
};

describe("computeSegmentStats", () => {
  it("counts voxels per segment and derives volume/area", () => {
    const stats = computeSegmentStats(data, { rowMm: 1, colMm: 1, sliceMm: 2 });
    expect(stats).toEqual([
      { segment: 1, label: "Tumor", voxels: 3, areaMm2: 3, volumeMm3: 6 },
    ]);
  });
});
