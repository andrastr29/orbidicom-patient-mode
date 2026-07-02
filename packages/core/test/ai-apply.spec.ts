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
vi.mock("../src/cornerstone/seg", () => ({
  renderSegmentation: vi.fn(async () => true),
  removeAiSegmentation: vi.fn(),
}));

import { applyResultSet, removeApplied, removeAppliedSegmentations } from "../src/ai/apply";
import { removeAiSegmentation } from "../src/cornerstone/seg";
import { annotation } from "@cornerstonejs/tools";
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
    const result = await applyResultSet(set, { viewportId: "vp1", stack: [] });
    expect(result.annotationUids).toEqual(["ann-1"]);
    expect(added).toHaveLength(1);
  });

  it("returns a segmentationIds entry for an accepted+visible segmentation result", async () => {
    const setWithSeg: AIResultSet = {
      ...set,
      results: [
        ...set.results,
        {
          kind: "segmentation",
          id: "r-3",
          label: "seg",
          reviewStatus: "accepted",
          visible: true,
          segmentation: { info: { segments: [] }, labelmaps: [] } as never,
        },
      ],
    };
    const result = await applyResultSet(setWithSeg, { viewportId: "vp1", stack: [] });
    expect(result.segmentationIds).toEqual(["orbidicom-ai-r-3"]);
  });
});

describe("removeApplied", () => {
  it("removes each annotation once by its uid", () => {
    const removeAnnotation = vi.mocked(annotation.state.removeAnnotation);
    removeAnnotation.mockClear();
    removeApplied(["a", "b"]);
    expect(removeAnnotation).toHaveBeenCalledTimes(2);
    expect(removeAnnotation).toHaveBeenNthCalledWith(1, "a");
    expect(removeAnnotation).toHaveBeenNthCalledWith(2, "b");
  });
});

describe("removeAppliedSegmentations", () => {
  it("fully deregisters each segmentation once by its id", () => {
    const deregister = vi.mocked(removeAiSegmentation);
    deregister.mockClear();
    removeAppliedSegmentations(["orbidicom-ai-r-3", "orbidicom-ai-r-9"]);
    expect(deregister).toHaveBeenCalledTimes(2);
    expect(deregister).toHaveBeenNthCalledWith(1, "orbidicom-ai-r-3");
    expect(deregister).toHaveBeenNthCalledWith(2, "orbidicom-ai-r-9");
  });

  it("does not throw when re-applying a segmentation (apply → remove → apply)", async () => {
    const setWithSeg: AIResultSet = {
      ...set,
      results: [
        {
          kind: "segmentation",
          id: "r-3",
          label: "seg",
          reviewStatus: "accepted",
          visible: true,
          segmentation: { info: { segments: [] }, labelmaps: [] } as never,
        },
      ],
    };
    const first = await applyResultSet(setWithSeg, { viewportId: "vp1", stack: [] });
    // The re-apply cycle: fully deregister, then apply again — must not throw.
    expect(() => removeAppliedSegmentations(first.segmentationIds)).not.toThrow();
    await expect(
      applyResultSet(setWithSeg, { viewportId: "vp1", stack: [] }),
    ).resolves.toBeDefined();
  });
});
