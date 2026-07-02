import { describe, it, expect, vi } from "vitest";
// export.ts transitively imports cornerstone via measurements.ts — stub it (as the
// sibling ai-export spec does). The round-trip logic under test is cornerstone-free.
vi.mock("@cornerstonejs/tools", () => ({}));
vi.mock("@cornerstonejs/core", () => ({}));

import { exportAccepted } from "../src/ai/export";
import { importResults } from "../src/ai/import";
import { fromOrbidicomJson } from "../src/ai/import/from-orbidicom-json";
import { computeSegmentStats } from "../src/ai/stats";
import type { AIResultSet, MeasurementResult, SegmentationResult } from "../src/ai/types";

const measurement: MeasurementResult = {
  kind: "measurement",
  id: "m-1",
  label: "Lesion",
  reviewStatus: "accepted",
  visible: true,
  measurement: {
    annotationUID: "m-1",
    tool: "EllipticalROI",
    label: "Lesion",
    imageId: "img1",
    frameOfReferenceUID: "FOR1",
    stats: [{ target: "imageId:img1", name: "area", value: 12.5, unit: "mm2" }],
    points: [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [10, 10, 0],
    ],
  },
};

// A 2x2 labelmap: two voxels of segment 1 + one voxel of segment 2.
const raster = new Uint8Array([1, 1, 2, 0]);
const segmentation: SegmentationResult = {
  kind: "segmentation",
  id: "s-1",
  label: "Tumor",
  reviewStatus: "accepted",
  visible: true,
  sourceBytes: new Uint8Array([9, 8, 7, 6, 5]),
  segmentation: {
    info: {
      segments: [
        { number: 1, label: "core", color: [255, 0, 0] },
        { number: 2, label: "edema", color: [0, 255, 0] },
      ],
    } as never,
    labelmaps: [
      {
        sourceSopInstanceUid: "1.2.3",
        rows: 2,
        columns: 2,
        data: raster,
      },
    ],
  },
};

const set: AIResultSet = {
  schema: "orbidicom.ai-results/v1",
  provenance: { source: "import", format: "ai-json" },
  results: [measurement, segmentation],
};

describe("AI export → import round-trip", () => {
  it("json: measurements survive geometry/labels/kind via fromOrbidicomJson", () => {
    const json = exportAccepted(set, "json", () => "2026-06-26T00:00:00.000Z");
    const reimported = fromOrbidicomJson(JSON.parse(json));
    // Also reachable through the dispatcher.
    expect(importResults(json).results).toHaveLength(1);
    expect(reimported.results).toHaveLength(1);
    const r = reimported.results[0]!;
    expect(r.kind).toBe("measurement");
    if (r.kind === "measurement") {
      expect(r.measurement.tool).toBe("EllipticalROI");
      expect(r.measurement.label).toBe("Lesion");
      expect(r.measurement.points).toEqual(measurement.measurement.points);
    }
  });

  it("ai-json: full structural round-trip incl. a segmentation Uint8Array", () => {
    const aiJson = exportAccepted(set, "ai-json");
    // The Uint8Array must NOT serialize as an index-keyed object.
    expect(aiJson).not.toContain('"0":1');
    expect(aiJson).toContain("$u8");

    const back = importResults(aiJson);
    expect(back.results).toHaveLength(2);

    const seg = back.results.find((r) => r.kind === "segmentation") as
      | SegmentationResult
      | undefined;
    expect(seg).toBeDefined();
    const lm = seg!.segmentation.labelmaps[0]!;
    // Decoded field is a real Uint8Array, deep-equal to the original.
    expect(lm.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(lm.data)).toEqual(Array.from(raster));
    expect(seg!.sourceBytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(seg!.sourceBytes!)).toEqual([9, 8, 7, 6, 5]);

    // The kind-specific structure (info.segments, labelmap dims) is preserved.
    expect(seg!.segmentation.info.segments).toHaveLength(2);
    expect(lm.rows).toBe(2);
    expect(lm.columns).toBe(2);

    // The measurement result also survives.
    const meas = back.results.find((r) => r.kind === "measurement") as
      | MeasurementResult
      | undefined;
    expect(meas?.measurement.points).toEqual(measurement.measurement.points);

    // computeSegmentStats must NOT throw on the reconstructed typed array, and
    // must count the labelled voxels (segment 1 → 2 voxels, segment 2 → 1).
    const stats = computeSegmentStats(seg!.segmentation, { rowMm: 1, colMm: 1, sliceMm: 1 });
    expect(stats.find((s) => s.segment === 1)?.voxels).toBe(2);
    expect(stats.find((s) => s.segment === 2)?.voxels).toBe(1);
  });
});
