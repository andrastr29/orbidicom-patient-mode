import { describe, it, expect, vi, beforeEach } from "vitest";

// scroll-sync only orchestrates Cornerstone's image-slice synchronizer: it decides
// WHICH viewports are members and when the synchronizer exists at all. Stub the
// library so those decisions are observable in node.
const h = vi.hoisted(() => {
  const sync = { add: vi.fn(), remove: vi.fn() };
  return {
    sync,
    createImageSliceSynchronizer: vi.fn(() => sync),
    destroySynchronizer: vi.fn(),
  };
});

vi.mock("@cornerstonejs/tools", () => ({
  synchronizers: { createImageSliceSynchronizer: h.createImageSliceSynchronizer },
  SynchronizerManager: { destroySynchronizer: h.destroySynchronizer },
}));
// scroll-sync imports stack.ts only for the shared engine id; stub it so this
// suite doesn't drag in the whole rendering stack (and its dicom loader).
vi.mock("../src/cornerstone/stack", () => ({ STACK_ENGINE_ID: "test-engine" }));

import { createScrollSync } from "../src/cornerstone/scroll-sync";

const STACK_ENGINE_ID = "test-engine";

const added = () => h.sync.add.mock.calls.map((c) => (c[0] as { viewportId: string }).viewportId);
const removed = () =>
  h.sync.remove.mock.calls.map((c) => (c[0] as { viewportId: string }).viewportId);

describe("createScrollSync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allocates no synchronizer until there is something to synchronize", () => {
    const s = createScrollSync();
    s.setViewports([]);
    s.setViewports(["a"]); // a lone viewport has nothing to follow
    expect(h.createImageSliceSynchronizer).not.toHaveBeenCalled();
    expect(s.getViewports()).toEqual([]);
  });

  it("adds every member of a multi-viewport set, addressed on the shared stack engine", () => {
    const s = createScrollSync();
    s.setViewports(["a", "b", "c"]);
    expect(h.createImageSliceSynchronizer).toHaveBeenCalledTimes(1);
    expect(added()).toEqual(["a", "b", "c"]);
    expect(h.sync.add).toHaveBeenCalledWith({
      renderingEngineId: STACK_ENGINE_ID,
      viewportId: "a",
    });
    expect(s.getViewports()).toEqual(["a", "b", "c"]);
  });

  it("diffs against the live set, so repeating it is a no-op", () => {
    const s = createScrollSync();
    s.setViewports(["a", "b"]);
    h.sync.add.mockClear();
    s.setViewports(["a", "b"]);
    expect(h.sync.add).not.toHaveBeenCalled();
    expect(h.sync.remove).not.toHaveBeenCalled();
  });

  it("adds only what is new and removes only what is gone", () => {
    const s = createScrollSync();
    s.setViewports(["a", "b"]);
    h.sync.add.mockClear();
    s.setViewports(["b", "c"]);
    expect(removed()).toEqual(["a"]);
    expect(added()).toEqual(["c"]);
    expect(s.getViewports()).toEqual(["b", "c"]);
  });

  it("clears the whole set when the feature is switched off, reusing the synchronizer after", () => {
    const s = createScrollSync();
    s.setViewports(["a", "b"]);
    s.setViewports([]);
    expect(removed()).toEqual(["a", "b"]);
    expect(s.getViewports()).toEqual([]);
    s.setViewports(["a", "b"]);
    // Turning it back on must not claim a second synchronizer id.
    expect(h.createImageSliceSynchronizer).toHaveBeenCalledTimes(1);
  });

  it("drops to zero members when the grid shrinks to a single viewport", () => {
    const s = createScrollSync();
    s.setViewports(["a", "b"]);
    s.setViewports(["a"]);
    expect(s.getViewports()).toEqual([]);
    expect(removed()).toEqual(["a", "b"]);
  });

  it("survives a remove() that throws because the viewport died with its engine", () => {
    const s = createScrollSync();
    s.setViewports(["a", "b"]);
    h.sync.remove.mockImplementationOnce(() => {
      throw new Error("viewport gone");
    });
    expect(() => s.setViewports([])).not.toThrow();
    expect(s.getViewports()).toEqual([]);
  });

  it("unregisters the synchronizer globally on destroy, and goes inert after", () => {
    const s = createScrollSync();
    s.setViewports(["a", "b"]);
    s.destroy();
    expect(h.destroySynchronizer).toHaveBeenCalledTimes(1);
    expect(s.getViewports()).toEqual([]);
    h.sync.add.mockClear();
    s.setViewports(["a", "b"]);
    expect(h.sync.add).not.toHaveBeenCalled();
  });

  it("destroy is idempotent and does nothing if no synchronizer was ever created", () => {
    const s = createScrollSync();
    s.destroy();
    s.destroy();
    expect(h.destroySynchronizer).not.toHaveBeenCalled();
  });

  it("claims a distinct synchronizer id per handle (Cornerstone throws on duplicates)", () => {
    createScrollSync().setViewports(["a", "b"]);
    createScrollSync().setViewports(["a", "b"]);
    const ids = h.createImageSliceSynchronizer.mock.calls.map((c) => c[0]);
    expect(new Set(ids).size).toBe(2);
  });
});
