import { describe, it, expect, vi, beforeEach } from "vitest";

// reference-lines is pure orchestration over the tool group: which viewport is the
// source, and whether the tool is on at all. Stub the group to observe that.
const h = vi.hoisted(() => {
  const tg = {
    setToolConfiguration: vi.fn(),
    setToolEnabled: vi.fn(),
    setToolDisabled: vi.fn(),
  };
  return { tg, getToolGroup: vi.fn((): unknown => tg) };
});

vi.mock("@cornerstonejs/tools", () => ({
  ToolGroupManager: { getToolGroup: h.getToolGroup },
  ReferenceLinesTool: { toolName: "ReferenceLines" },
}));
// reference-lines imports init.ts only for TOOL_GROUP_ID; stub it so this suite
// doesn't drag in the whole Cornerstone bootstrap.
vi.mock("../src/cornerstone/init", () => ({ TOOL_GROUP_ID: "test-group" }));

import { createReferenceLines } from "../src/cornerstone/reference-lines";

/** Order of the two calls matters — see the "configures before enabling" test. */
const callOrder = () =>
  [
    ...h.tg.setToolConfiguration.mock.invocationCallOrder.map((n) => [n, "config"] as const),
    ...h.tg.setToolEnabled.mock.invocationCallOrder.map((n) => [n, "enable"] as const),
  ]
    .sort((a, b) => a[0] - b[0])
    .map(([, kind]) => kind);

describe("createReferenceLines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getToolGroup.mockReturnValue(h.tg);
  });

  it("points the tool at a source viewport and turns it on", () => {
    const r = createReferenceLines();
    r.setSource("stack-2");
    expect(h.tg.setToolConfiguration).toHaveBeenCalledWith("ReferenceLines", {
      sourceViewportId: "stack-2",
    });
    expect(h.tg.setToolEnabled).toHaveBeenCalledWith("ReferenceLines");
    expect(r.getSource()).toBe("stack-2");
  });

  it("configures the source BEFORE enabling — enabling re-inits against it", () => {
    createReferenceLines().setSource("stack-2");
    expect(callOrder()).toEqual(["config", "enable"]);
  });

  it("re-points at a new source when focus moves to another cell", () => {
    const r = createReferenceLines();
    r.setSource("stack-1");
    r.setSource("stack-2");
    expect(h.tg.setToolConfiguration).toHaveBeenLastCalledWith("ReferenceLines", {
      sourceViewportId: "stack-2",
    });
    expect(r.getSource()).toBe("stack-2");
    expect(h.tg.setToolDisabled).not.toHaveBeenCalled(); // never flickers off in between
  });

  it("repeating the current source is a no-op", () => {
    const r = createReferenceLines();
    r.setSource("stack-1");
    h.tg.setToolConfiguration.mockClear();
    h.tg.setToolEnabled.mockClear();
    r.setSource("stack-1");
    expect(h.tg.setToolConfiguration).not.toHaveBeenCalled();
    expect(h.tg.setToolEnabled).not.toHaveBeenCalled();
  });

  it("disables the tool for a null source and can be switched back on", () => {
    const r = createReferenceLines();
    r.setSource("stack-1");
    r.setSource(null);
    expect(h.tg.setToolDisabled).toHaveBeenCalledWith("ReferenceLines");
    expect(r.getSource()).toBeNull();
    r.setSource("stack-1");
    expect(h.tg.setToolEnabled).toHaveBeenCalledTimes(2);
  });

  it("does nothing at all when the tool group is gone", () => {
    h.getToolGroup.mockReturnValue(undefined);
    const r = createReferenceLines();
    expect(() => r.setSource("stack-1")).not.toThrow();
    expect(r.getSource()).toBeNull(); // no group, no source claimed
  });

  it("uses the shared stack tool group by default and honours an override", () => {
    createReferenceLines().setSource("stack-1");
    expect(h.getToolGroup).toHaveBeenCalledWith("test-group");
    createReferenceLines("other-group").setSource("stack-1");
    expect(h.getToolGroup).toHaveBeenLastCalledWith("other-group");
  });

  it("turns the lines off on destroy and goes inert after", () => {
    const r = createReferenceLines();
    r.setSource("stack-1");
    r.destroy();
    expect(h.tg.setToolDisabled).toHaveBeenCalledWith("ReferenceLines");
    h.tg.setToolEnabled.mockClear();
    r.setSource("stack-2");
    expect(h.tg.setToolEnabled).not.toHaveBeenCalled();
  });

  it("survives a tool group that throws while being torn down", () => {
    const r = createReferenceLines();
    r.setSource("stack-1");
    h.tg.setToolDisabled.mockImplementationOnce(() => {
      throw new Error("group destroyed");
    });
    expect(() => r.destroy()).not.toThrow();
  });
});
