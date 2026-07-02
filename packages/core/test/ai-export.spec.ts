import { describe, it, expect, vi } from "vitest";
vi.mock("@cornerstonejs/tools", () => ({}));
vi.mock("@cornerstonejs/core", () => ({}));

import { exportAccepted } from "../src/ai/export";
import type { AIResultSet } from "../src/ai/types";

const set: AIResultSet = {
  schema: "orbidicom.ai-results/v1",
  provenance: { source: "import", format: "orbidicom-json" },
  results: [
    {
      kind: "measurement",
      id: "r-1",
      label: "L1",
      reviewStatus: "accepted",
      visible: true,
      measurement: {
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
      },
    },
    {
      kind: "measurement",
      id: "r-2",
      label: "rejected",
      reviewStatus: "rejected",
      visible: true,
      measurement: {
        annotationUID: "ann-2",
        tool: "Length",
        label: "x",
        imageId: "img1",
        frameOfReferenceUID: "FOR1",
        stats: [],
        points: [],
      },
    },
  ],
};

describe("exportAccepted", () => {
  it("exports only accepted measurements as JSON", () => {
    const json = JSON.parse(exportAccepted(set, "json", () => "2026-06-26T00:00:00.000Z"));
    expect(json.schema).toBe("orbidicom.measurements/v1");
    expect(json.count).toBe(1);
    expect(json.measurements[0].annotationUID).toBe("ann-1");
  });
  it("exports the accepted subset as an ai-results document", () => {
    const doc = JSON.parse(exportAccepted(set, "ai-json"));
    expect(doc.schema).toBe("orbidicom.ai-results/v1");
    expect(doc.results).toHaveLength(1);
  });
});
