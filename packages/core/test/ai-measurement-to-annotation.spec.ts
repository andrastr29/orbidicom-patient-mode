import { describe, it, expect } from "vitest";
import { measurementToAnnotation } from "../src/ai/measurement-to-annotation";
import type { Measurement } from "../src/cornerstone/measurements";

const m: Measurement = {
  annotationUID: "ann-1",
  tool: "Length",
  label: "L1",
  imageId: "img1",
  frameOfReferenceUID: "FOR1",
  stats: [{ target: "imageId:img1", name: "length", value: 42.5, unit: "mm" }],
  points: [
    [0, 0, 0],
    [42.5, 0, 0],
  ],
};

describe("measurementToAnnotation", () => {
  it("builds a render-ready Length annotation from a Measurement", () => {
    const a = measurementToAnnotation(m, "r-1");
    expect(a.annotationUID).toBe("ann-1");
    expect(a.isVisible).toBe(true);
    expect(a.metadata?.toolName).toBe("Length");
    expect(a.metadata?.FrameOfReferenceUID).toBe("FOR1");
    expect(a.metadata?.referencedImageId).toBe("img1");
    expect((a.metadata as Record<string, unknown>).orbidicomResultId).toBe("r-1");
    expect(a.data.handles?.points).toEqual([
      [0, 0, 0],
      [42.5, 0, 0],
    ]);
    expect(a.data.label).toBe("L1");
    expect(a.data.cachedStats).toEqual({});
  });
});
