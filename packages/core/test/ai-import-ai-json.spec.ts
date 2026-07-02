import { describe, it, expect } from "vitest";
import { fromAiJson } from "../src/ai/import/from-ai-json";
import { ImportError } from "../src/ai/errors";

const doc = {
  schema: "orbidicom.ai-results/v1",
  provenance: { source: "inference", providerId: "mock" },
  results: [
    {
      kind: "finding",
      id: "f1",
      label: "Impression",
      reviewStatus: "pending",
      visible: true,
      text: "x",
    },
  ],
};

describe("fromAiJson", () => {
  it("passes a valid AIResultSet through and marks it as an import", () => {
    const set = fromAiJson(doc);
    expect(set.provenance.source).toBe("import");
    expect(set.provenance.format).toBe("ai-json");
    expect(set.results[0].label).toBe("Impression");
  });
  it("backfills visible/reviewStatus defaults", () => {
    const set = fromAiJson({
      ...doc,
      results: [{ kind: "finding", id: "f2", label: "y" }],
    });
    expect(set.results[0].visible).toBe(true);
    expect(set.results[0].reviewStatus).toBe("pending");
  });
  it("throws ImportError on invalid input", () => {
    expect(() => fromAiJson({ schema: "nope" })).toThrow(ImportError);
  });

  it("throws ImportError when a measurement result is missing its measurement", () => {
    const bad = {
      ...doc,
      results: [
        { kind: "measurement", id: "m1", label: "L", reviewStatus: "pending", visible: true },
      ],
    };
    expect(() => fromAiJson(bad)).toThrow(ImportError);
    expect(() => fromAiJson(bad)).toThrow(/missing a measurement object/);
  });

  it("throws ImportError when a measurement has non-numeric points", () => {
    const bad = {
      ...doc,
      results: [
        {
          kind: "measurement",
          id: "m2",
          label: "L",
          reviewStatus: "pending",
          visible: true,
          measurement: { points: [["a", "b", "c"]], stats: [] },
        },
      ],
    };
    expect(() => fromAiJson(bad)).toThrow(/invalid measurement.points/);
  });

  it("throws ImportError when a segmentation result is missing its segmentation", () => {
    const bad = {
      ...doc,
      results: [
        { kind: "segmentation", id: "s1", label: "S", reviewStatus: "accepted", visible: true },
      ],
    };
    expect(() => fromAiJson(bad)).toThrow(ImportError);
    expect(() => fromAiJson(bad)).toThrow(/missing a segmentation object/);
  });

  it("throws ImportError when a segmentation is missing labelmaps", () => {
    const bad = {
      ...doc,
      results: [
        {
          kind: "segmentation",
          id: "s2",
          label: "S",
          reviewStatus: "accepted",
          visible: true,
          segmentation: { info: { segments: [] } },
        },
      ],
    };
    expect(() => fromAiJson(bad)).toThrow(/invalid segmentation.labelmaps/);
  });
});
