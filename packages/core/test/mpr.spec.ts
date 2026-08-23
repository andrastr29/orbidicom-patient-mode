import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const vp = {
    getProperties: vi.fn(() => ({ voiRange: { lower: 0, upper: 100 } })),
    setProperties: vi.fn(),
    resetProperties: vi.fn(),
    resetCamera: vi.fn(),
    render: vi.fn(),
    getCanvas: vi.fn(() => null),
  };
  const engine = {
    setViewports: vi.fn(),
    getViewport: vi.fn(() => vp),
    render: vi.fn(),
    destroy: vi.fn(),
  };
  const tg = { addViewport: vi.fn(), addTool: vi.fn(), setToolActive: vi.fn() };
  return {
    vp,
    engine,
    tg,
    RenderingEngine: vi.fn(() => engine),
    createToolGroup: vi.fn(() => tg),
    destroyToolGroup: vi.fn(),
    createAndCacheVolume: vi.fn(async () => ({ load: vi.fn() })),
    setVolumesForViewports: vi.fn(async () => undefined),
    removeVolumeLoadObject: vi.fn(),
  };
});

// mpr.ts imports ./init transitively, so the mocks must satisfy init.ts's imports too.
vi.mock("@cornerstonejs/core", () => ({
  RenderingEngine: h.RenderingEngine,
  init: vi.fn(),
  imageLoadPoolManager: { setMaxSimultaneousRequests: vi.fn() },
  Enums: {
    ViewportType: { ORTHOGRAPHIC: "orthographic", VOLUME_3D: "volume3d" },
    OrientationAxis: { AXIAL: "axial", CORONAL: "coronal", SAGITTAL: "sagittal" },
    RequestType: { Interaction: "interaction", Prefetch: "prefetch" },
  },
  volumeLoader: { createAndCacheVolume: h.createAndCacheVolume },
  setVolumesForViewports: h.setVolumesForViewports,
  cache: { removeVolumeLoadObject: h.removeVolumeLoadObject },
}));
vi.mock("@cornerstonejs/tools", () => {
  const T = (toolName: string) => Object.assign(class {}, { toolName });
  return {
    init: vi.fn(),
    addTool: vi.fn(),
    ToolGroupManager: { createToolGroup: h.createToolGroup, destroyToolGroup: h.destroyToolGroup },
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
  };
});
vi.mock("@cornerstonejs/dicom-image-loader", () => ({
  init: vi.fn(),
  wadors: { metaDataManager: { add: vi.fn() } },
}));

import {
  createMprView,
  isVolumeCapable,
  VR_PRESETS,
  defaultVrPreset,
} from "../src/cornerstone/mpr";

function els() {
  const div = () => ({ querySelector: vi.fn(() => null) }) as unknown as HTMLDivElement;
  return { axial: div(), coronal: div(), sagittal: div(), volume3d: div() };
}

describe("isVolumeCapable", () => {
  it("accepts multi-slice cross-sectional modalities", () => {
    expect(isVolumeCapable({ modality: "CT" }, 100)).toBe(true);
    expect(isVolumeCapable({ modality: "mr" }, 30)).toBe(true); // case-insensitive
    expect(isVolumeCapable({ modality: "PT" }, 64)).toBe(true);
  });
  it("rejects non-volumetric modalities and thin/short series", () => {
    expect(isVolumeCapable({ modality: "US" }, 100)).toBe(false);
    expect(isVolumeCapable({ modality: "XR" }, 100)).toBe(false);
    expect(isVolumeCapable({ modality: "CT" }, 4)).toBe(false); // below min
    expect(isVolumeCapable({ modality: undefined }, 100)).toBe(false);
  });
  it("accepts a series flagged volumetric regardless of modality (e.g. NIfTI)", () => {
    expect(isVolumeCapable({ modality: "NIfTI", volumetric: true }, 100)).toBe(true);
    expect(isVolumeCapable({ volumetric: true }, 100)).toBe(true);
    expect(isVolumeCapable({ modality: "NIfTI" }, 100)).toBe(false); // no flag, unknown modality
    expect(isVolumeCapable({ volumetric: true }, 4)).toBe(false); // min still applies
  });
  it("honors a custom minimum slice count", () => {
    expect(isVolumeCapable({ modality: "CT" }, 8, { min: 8 })).toBe(true);
    expect(isVolumeCapable({ modality: "CT" }, 7, { min: 8 })).toBe(false);
  });
});

describe("defaultVrPreset", () => {
  it("picks a modality-appropriate preset that exists in the curated list", () => {
    expect(defaultVrPreset("CT")).toBe("CT-Bone");
    expect(defaultVrPreset("mr")).toBe("MR-Default"); // case-insensitive
    expect(defaultVrPreset("PT")).toBe("CT-MIP");
    expect(defaultVrPreset(undefined)).toBe("CT-Bone");
    for (const m of ["CT", "MR", "PT", "NM", undefined]) {
      expect(VR_PRESETS).toContain(defaultVrPreset(m));
    }
  });
});

describe("createMprView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates 3 orthographic planes + a 3D volume pane, with separate tool groups", () => {
    createMprView(els());
    expect(h.engine.setViewports).toHaveBeenCalledOnce();
    const viewports = h.engine.setViewports.mock.calls[0][0] as {
      type: string;
      defaultOptions: { orientation?: string };
    }[];
    expect(viewports.slice(0, 3).map((v) => v.defaultOptions.orientation)).toEqual([
      "axial",
      "coronal",
      "sagittal",
    ]);
    expect(viewports[3].type).toBe("volume3d");
    // Two per-instance tool groups: crosshairs (3 ortho panes) + trackball (3D pane).
    expect(h.createToolGroup).toHaveBeenCalledTimes(2);
    expect(h.tg.addViewport).toHaveBeenCalledTimes(4); // 3 ortho + 1 vr
    const addedTools = h.tg.addTool.mock.calls.map((c) => c[0]);
    expect(addedTools).toContain("Crosshairs");
    expect(addedTools).toContain("TrackballRotate");
  });

  it("builds a volume, shows it in every pane, and lights the 3D pane with a preset", async () => {
    const onReady = vi.fn();
    const handle = createMprView(els(), { onReady });
    await handle.setVolume(["wadors:1", "wadors:2"], { modality: "CT" });
    expect(h.createAndCacheVolume).toHaveBeenCalledOnce();
    expect(h.setVolumesForViewports).toHaveBeenCalledOnce();
    // All four viewport ids passed to setVolumesForViewports.
    expect((h.setVolumesForViewports.mock.calls[0][2] as string[]).length).toBe(4);
    // The 3D pane received a preset.
    const presetCall = h.vp.setProperties.mock.calls.find(
      (c) => (c[0] as { preset?: string }).preset,
    );
    expect(presetCall?.[0]).toMatchObject({ preset: "CT-Bone" });
    expect(onReady).toHaveBeenCalled();
  });

  it("setPreset re-applies a chosen preset to the 3D pane", async () => {
    const handle = createMprView(els());
    await handle.setVolume(["wadors:1"], { modality: "CT" });
    h.vp.setProperties.mockClear();
    handle.setPreset("CT-Lung");
    expect(h.vp.setProperties).toHaveBeenCalledWith(
      { preset: "CT-Lung" },
      expect.stringContaining("orbidicom-mpr"),
    );
  });

  it("destroys both tool groups and the engine, and is safe before any volume is built", () => {
    const handle = createMprView(els());
    handle.destroy(); // no setVolume called → volume never cached
    expect(h.destroyToolGroup).toHaveBeenCalledTimes(2);
    expect(h.engine.destroy).toHaveBeenCalledOnce();
    expect(h.removeVolumeLoadObject).not.toHaveBeenCalled(); // guarded: nothing to evict
  });
});
