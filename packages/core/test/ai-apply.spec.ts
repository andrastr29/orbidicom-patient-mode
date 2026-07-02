import { describe, it, expect, vi, beforeEach } from "vitest";

const added: unknown[] = [];
vi.mock("@cornerstonejs/tools", () => ({
  annotation: {
    state: {
      addAnnotation: vi.fn((a: { annotationUID?: string }) => {
        a.annotationUID = a.annotationUID || "gen-uid";
        added.push(a);
        return a.annotationUID;
      }),
      removeAnnotation: vi.fn(),
    },
  },
  utilities: { triggerAnnotationRenderForViewportIds: vi.fn() },
}));
vi.mock("../src/cornerstone/seg", () => ({ renderSegmentation: vi.fn(async () => true) }));

import { applyResultSet } from "../src/ai/apply";
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
        stats: [],
        points: [
          [0, 0, 0],
          [1, 0, 0],
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
        points: [
          [0, 0, 0],
          [2, 0, 0],
        ],
      },
    },
  ],
};

beforeEach(() => {
  added.length = 0;
});

describe("applyResultSet", () => {
  it("adds only accepted+visible measurements and triggers a render", async () => {
    const uids = await applyResultSet(set, { viewportId: "vp1", stack: [] });
    expect(uids).toEqual(["ann-1"]);
    expect(added).toHaveLength(1);
  });
});
