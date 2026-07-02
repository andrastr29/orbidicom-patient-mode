import { describe, it, expect } from "vitest";
import { fromOrbidicomJson } from "../src/ai/import/from-orbidicom-json";
import { ImportError } from "../src/ai/errors";

const doc = {
  schema: "orbidicom.measurements/v1",
  exportedAt: "2026-06-26T00:00:00.000Z",
  count: 1,
  measurements: [
    {
      annotationUID: "ann-1",
      tool: "Length",
      label: "L1",
      imageId: "img1",
      frameOfReferenceUID: "FOR1",
      stats: [{ target: "imageId:img1", name: "length", value: 42.5, unit: "mm" }],
      points: [[0, 0, 0], [42.5, 0, 0]],
    },
  ],
};

describe("fromOrbidicomJson", () => {
  it("maps measurements to accepted MeasurementResults preserving geometry", () => {
    const set = fromOrbidicomJson(doc);
    expect(set.provenance).toEqual({ source: "import", format: "orbidicom-json" });
    expect(set.results).toHaveLength(1);
    const r = set.results[0];
    expect(r.kind).toBe("measurement");
    expect(r.id).toBe("ann-1");
    expect(r.reviewStatus).toBe("accepted");
    expect(r.visible).toBe(true);
    if (r.kind === "measurement") expect(r.measurement.points).toEqual([[0, 0, 0], [42.5, 0, 0]]);
  });
  it("throws ImportError on wrong schema", () => {
    expect(() => fromOrbidicomJson({ schema: "nope" })).toThrow(ImportError);
  });
});
