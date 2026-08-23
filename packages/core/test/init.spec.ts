import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above const declarations, so shared spies must
// live in vi.hoisted() to exist by the time the factories run.
const h = vi.hoisted(() => {
  const tg = {
    addTool: vi.fn(),
    setToolActive: vi.fn(),
    setToolPassive: vi.fn(),
  };
  return {
    coreInit: vi.fn().mockResolvedValue(undefined),
    toolsInit: vi.fn().mockResolvedValue(undefined),
    addTool: vi.fn(),
    setMax: vi.fn(),
    tg,
    createToolGroup: vi.fn(() => tg),
    getToolGroup: vi.fn(() => tg),
  };
});

vi.mock("@cornerstonejs/core", () => ({
  init: h.coreInit,
  imageLoadPoolManager: { setMaxSimultaneousRequests: h.setMax },
  Enums: { RequestType: { Interaction: "interaction", Prefetch: "prefetch" } },
  utilities: { roundNumber: (v: number) => String(Math.round(v * 100) / 100) },
}));
vi.mock("@cornerstonejs/dicom-image-loader", () => ({ init: vi.fn() }));
vi.mock("@cornerstonejs/tools", () => {
  const T = (toolName: string) => Object.assign(class {}, { toolName });
  return {
    init: h.toolsInit,
    addTool: h.addTool,
    ToolGroupManager: { createToolGroup: h.createToolGroup, getToolGroup: h.getToolGroup },
    Enums: {
      MouseBindings: { Primary: 1, Secondary: 2, Primary_And_Secondary: 3, Wheel: 4, Auxiliary: 5 },
    },
    WindowLevelTool: T("WindowLevel"),
    ZoomTool: T("Zoom"),
    PanTool: T("Pan"),
    StackScrollTool: T("StackScroll"),
    LengthTool: T("Length"),
    AngleTool: T("Angle"),
    EllipticalROITool: T("EllipticalROI"),
    RectangleROITool: T("RectangleROI"),
    CircleROITool: T("CircleROI"),
    ProbeTool: T("Probe"),
    CrosshairsTool: T("Crosshairs"),
    TrackballRotateTool: T("TrackballRotate"),
    ReferenceLinesTool: T("ReferenceLines"),
  };
});

import {
  initCornerstone,
  setPrimaryTool,
  probeTextLines,
  TOOLS,
  TOOL_GROUP_ID,
} from "../src/cornerstone/init";

describe("initCornerstone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the orbidicom tool group id (no docorbit branding)", () => {
    expect(TOOL_GROUP_ID).toBe("orbidicom");
  });

  it("initializes core + tools once and is idempotent", async () => {
    await initCornerstone();
    await initCornerstone();
    expect(h.coreInit).toHaveBeenCalledTimes(1);
    expect(h.toolsInit).toHaveBeenCalledTimes(1);
  });

  it("configures the tool group per tool: plain circle, single-finger zoom", async () => {
    // initCornerstone() is idempotent, so the module imported at the top of this
    // file has already done its wiring by now. Re-import it fresh to observe the
    // one-time tool-group setup.
    vi.resetModules();
    const fresh = await import("../src/cornerstone/init");
    await fresh.initCornerstone();
    // CircleROI ships as the *annotation* circle: no stats pass, so no value text box.
    expect(h.tg.addTool).toHaveBeenCalledWith(fresh.TOOLS.Circle, { calculateStats: false });
    // Zoom keeps its single-finger drag override.
    expect(h.tg.addTool).toHaveBeenCalledWith(fresh.TOOLS.Zoom, { pinchToZoom: false });
    // Every other tool joins with library defaults; the measuring ROIs keep theirs.
    expect(h.tg.addTool).toHaveBeenCalledWith(fresh.TOOLS.Ellipse, undefined);
  });

  it("labels the Probe with its value only, never the voxel index", async () => {
    vi.resetModules();
    const fresh = await import("../src/cornerstone/init");
    await fresh.initCornerstone();
    const call = h.tg.addTool.mock.calls.find((c) => c[0] === fresh.TOOLS.Probe);
    expect(typeof (call?.[1] as { getTextLines?: unknown })?.getTextLines).toBe("function");
  });

  it("gives the stack group the ReferenceLines display tool, with no bindings", async () => {
    vi.resetModules();
    const fresh = await import("../src/cornerstone/init");
    await fresh.initCornerstone();
    expect(h.addTool).toHaveBeenCalledWith(expect.objectContaining({ toolName: "ReferenceLines" }));
    expect(h.tg.addTool).toHaveBeenCalledWith("ReferenceLines");
    // Display-only: it must never be bound to a mouse button or touch gesture.
    const activated = h.tg.setToolActive.mock.calls.map((c) => c[0]);
    expect(activated).not.toContain("ReferenceLines");
  });

  it("setPrimaryTool clears all bindings then re-activates pan + zoom + the chosen tool", () => {
    setPrimaryTool(TOOLS.Zoom);
    expect(h.tg.setToolPassive).toHaveBeenCalledWith(expect.any(String), {
      removeAllBindings: true,
    });
    const activated = h.tg.setToolActive.mock.calls.map((c) => c[0]);
    expect(activated).toContain(TOOLS.Pan);
    expect(activated).toContain(TOOLS.Zoom);
  });
});

describe("probeTextLines", () => {
  const at = (stats: unknown) => probeTextLines({ cachedStats: { t1: stats } } as never, "t1");

  it("renders the value with its modality unit and no coordinates", () => {
    // Cornerstone's default leads with "(i, j, k)"; a probe is read for its value.
    expect(at({ value: 42.123, modalityUnit: "HU", index: [1, 2, 3] })).toEqual(["42.12 HU"]);
  });

  it("renders one line per component for a multi-value (e.g. fused PT/CT) probe", () => {
    expect(at({ value: [10, 20], modalityUnit: ["HU", "SUV"] })).toEqual(["10 HU", "20 SUV"]);
  });

  it("still renders the value when the voxel index is missing", () => {
    // The stock formatter returns nothing at all in this case.
    expect(at({ value: 7, modalityUnit: "HU" })).toEqual(["7 HU"]);
  });

  it("omits a missing unit rather than printing 'undefined'", () => {
    expect(at({ value: 7 })).toEqual(["7"]);
  });

  it("renders nothing until the probe has a value", () => {
    expect(at({ modalityUnit: "HU" })).toBeUndefined();
    expect(at(undefined)).toBeUndefined();
  });
});
