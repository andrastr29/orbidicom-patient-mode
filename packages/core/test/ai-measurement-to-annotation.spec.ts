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

  it("does NOT add initialRotation for a non-Elliptical tool (Length)", () => {
    const a = measurementToAnnotation(m, "r-1");
    expect((a.data as Record<string, unknown>).initialRotation).toBeUndefined();
  });

  it("adds initialRotation === 0 for an EllipticalROI", () => {
    const ell: Measurement = {
      ...m,
      annotationUID: "ell-1",
      tool: "EllipticalROI",
      label: "Ellipse",
      points: [
        [0, 0, 0],
        [10, 0, 0],
        [0, 10, 0],
        [10, 10, 0],
      ],
    };
    const a = measurementToAnnotation(ell, "r-ell");
    expect(a.metadata?.toolName).toBe("EllipticalROI");
    expect((a.data as Record<string, unknown>).initialRotation).toBe(0);
    expect(a.data.handles?.points).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [10, 10, 0],
    ]);
    expect(a.data.label).toBe("Ellipse");
  });

  it("carries toolName/points/label through for a RectangleROI", () => {
    const rect: Measurement = {
      ...m,
      annotationUID: "rect-1",
      tool: "RectangleROI",
      label: "Box",
      points: [
        [0, 0, 0],
        [4, 0, 0],
        [0, 4, 0],
        [4, 4, 0],
      ],
    };
    const a = measurementToAnnotation(rect, "r-rect");
    expect(a.metadata?.toolName).toBe("RectangleROI");
    expect((a.data as Record<string, unknown>).initialRotation).toBeUndefined();
    expect(a.data.handles?.points).toEqual([
      [0, 0, 0],
      [4, 0, 0],
      [0, 4, 0],
      [4, 4, 0],
    ]);
    expect(a.data.label).toBe("Box");
  });

  it("carries toolName/points/label through for a Probe", () => {
    const probe: Measurement = {
      ...m,
      annotationUID: "probe-1",
      tool: "Probe",
      label: "Pt",
      points: [[3, 7, 1]],
    };
    const a = measurementToAnnotation(probe, "r-probe");
    expect(a.metadata?.toolName).toBe("Probe");
    expect((a.data as Record<string, unknown>).initialRotation).toBeUndefined();
    expect(a.data.handles?.points).toEqual([[3, 7, 1]]);
    expect(a.data.label).toBe("Pt");
  });
});
