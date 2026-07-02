import { describe, it, expect } from "vitest";
import { buildMeasurementSr } from "../src/sr/to-json";
import { srTreeFromJson } from "../src/sr/from-json";
import { fromDicomSr } from "../src/ai/import/from-dicom-sr";
import type { Measurement } from "../src/cornerstone/measurements";

const lengthM: Measurement = {
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

describe("fromDicomSr (findings-only)", () => {
  it("maps SR NUM items to value findings", () => {
    const tree = srTreeFromJson(buildMeasurementSr([lengthM], { sopInstanceUid: "1.2.3" }));
    const set = fromDicomSr(tree);
    expect(set.provenance.format).toBe("dicom-sr");
    const finding = set.results.find((r) => r.kind === "finding" && r.value?.startsWith("42.5"));
    expect(finding).toBeDefined();
    expect(set.results.every((r) => r.kind === "finding")).toBe(true);
  });
});
