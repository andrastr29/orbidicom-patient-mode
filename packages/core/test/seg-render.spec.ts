import { describe, it, expect, vi } from "vitest";

// The render glue talks to Cornerstone; stub it and assert the orchestration
// (alignment -> derived image ids, raster writes, registration shape, colors).
const calls = vi.hoisted(() => ({
  derived: vi.fn(),
  addSegs: vi.fn(),
  addRep: vi.fn(async () => {}),
  setColor: vi.fn(),
  removeRep: vi.fn(),
}));
vi.mock("@cornerstonejs/tools", () => ({
  segmentation: {
    addSegmentations: calls.addSegs,
    addLabelmapRepresentationToViewport: calls.addRep,
    removeSegmentationRepresentation: calls.removeRep,
    config: { color: { setSegmentIndexColor: calls.setColor } },
  },
  Enums: { SegmentationRepresentations: { Labelmap: "Labelmap" } },
}));
vi.mock("@cornerstonejs/core", () => ({
  imageLoader: { createAndCacheDerivedLabelmapImages: calls.derived },
}));

import { renderSegmentation, removeSegmentationFromViewport } from "../src/cornerstone/seg";
import type { SegmentationData } from "../src/datasource";

function setupDerived(): Record<string, Uint8Array> {
  const buffers: Record<string, Uint8Array> = {};
  calls.derived.mockImplementation((ids: string[]) =>
    ids.map((id) => {
      const buf = new Uint8Array(2);
      buffers[id] = buf;
      return { imageId: `lm:${id}`, voxelManager: { getScalarData: () => buf } };
    }),
  );
  return buffers;
}

const data: SegmentationData = {
  info: {
    segmentationType: "BINARY",
    rows: 1,
    columns: 2,
    numberOfFrames: 2,
    segments: [{ number: 1, label: "Tumor", color: [200, 50, 50] }],
  },
  labelmaps: [
    { sourceSopInstanceUid: "A", rows: 1, columns: 2, data: Uint8Array.from([1, 0]) },
    { sourceSopInstanceUid: "B", rows: 1, columns: 2, data: Uint8Array.from([0, 1]) },
  ],
};

describe("renderSegmentation", () => {
  it("creates derived labelmaps for matched slices, writes rasters, registers + colors them", async () => {
    Object.values(calls).forEach((c) => c.mockClear());
    const buffers = setupDerived();
    const stack = [
      { imageId: "img:a", sopInstanceUID: "A" },
      { imageId: "img:x", sopInstanceUID: "X" }, // unsegmented, so skipped
      { imageId: "img:b", sopInstanceUID: "B" },
    ];

    const drawn = await renderSegmentation({
      viewportId: "vp1",
      segmentationId: "seg-1",
      stack,
      data,
    });
    expect(drawn).toBe(true);

    // Derived images only for matched slices, in stack order; rasters copied in.
    expect(calls.derived).toHaveBeenCalledWith(["img:a", "img:b"]);
    expect(Array.from(buffers["img:a"])).toEqual([1, 0]);
    expect(Array.from(buffers["img:b"])).toEqual([0, 1]);

    // Registered as a stack labelmap referencing the derived image ids.
    expect(calls.addSegs).toHaveBeenCalledWith([
      {
        segmentationId: "seg-1",
        representation: { type: "Labelmap", data: { imageIds: ["lm:img:a", "lm:img:b"] } },
      },
    ]);
    expect(calls.addRep).toHaveBeenCalledWith("vp1", [{ segmentationId: "seg-1" }]);

    // Segment display color applied as RGBA.
    expect(calls.setColor).toHaveBeenCalledWith("vp1", "seg-1", 1, [200, 50, 50, 255]);
  });

  it("is a no-op when no labelmap matches the stack", async () => {
    Object.values(calls).forEach((c) => c.mockClear());
    setupDerived();
    const drawn = await renderSegmentation({
      viewportId: "vp1",
      segmentationId: "seg-1",
      stack: [{ imageId: "img:z", sopInstanceUID: "Z" }],
      data,
    });
    expect(drawn).toBe(false);
    expect(calls.addSegs).not.toHaveBeenCalled();
  });

  it("removes a labelmap representation from a viewport", () => {
    calls.removeRep.mockClear();
    removeSegmentationFromViewport("vp1", "seg-1");
    expect(calls.removeRep).toHaveBeenCalledWith("vp1", {
      segmentationId: "seg-1",
      type: "Labelmap",
    });
  });
});
