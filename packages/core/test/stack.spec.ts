import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const vp = {
    setStack: vi.fn().mockResolvedValue(undefined),
    render: vi.fn(),
    getCurrentImageIdIndex: vi.fn(() => 0),
    getProperties: vi.fn(() => ({ voiRange: { lower: 0, upper: 100 }, invert: false })),
    setProperties: vi.fn(),
    scroll: vi.fn(),
    setImageIdIndex: vi.fn(),
    setViewPresentation: vi.fn(),
    flip: vi.fn(),
    resetProperties: vi.fn(),
    resetCamera: vi.fn(),
  };
  const engine = {
    enableElement: vi.fn(),
    disableElement: vi.fn(),
    getViewport: vi.fn(() => vp),
    resize: vi.fn(),
    destroy: vi.fn(),
  };
  // A single stable tool group so tests can assert add/removeViewports on it.
  const toolGroup = { addViewport: vi.fn(), removeViewports: vi.fn() };
  const prefetcher = { recenter: vi.fn(), destroy: vi.fn() };
  return {
    vp,
    engine,
    RenderingEngine: vi.fn(() => engine),
    toolGroup,
    getToolGroup: vi.fn(() => toolGroup),
    evtAdd: vi.fn(),
    evtRemove: vi.fn(),
    prefetcher,
    createPrefetcher: vi.fn(() => prefetcher),
  };
});

vi.mock("../src/cornerstone/prefetch", () => ({ createPrefetcher: h.createPrefetcher }));

vi.mock("@cornerstonejs/core", () => ({
  RenderingEngine: h.RenderingEngine,
  Enums: {
    ViewportType: { STACK: "stack" },
    Events: {
      STACK_NEW_IMAGE: "a",
      VOI_MODIFIED: "b",
      IMAGE_RENDERED: "c",
      IMAGE_CACHE_IMAGE_ADDED: "d",
    },
  },
  eventTarget: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  cache: { isLoaded: vi.fn(() => false) },
}));
// stack.ts imports ./init, which imports the real dicom-image-loader; stub it so
// the loader's internals don't evaluate against the mocked core.
vi.mock("@cornerstonejs/dicom-image-loader", () => ({
  init: vi.fn(),
  wadors: { metaDataManager: { add: vi.fn() } },
}));
vi.mock("@cornerstonejs/tools", () => {
  // init.ts (imported transitively) builds TOOLS/ALL_TOOLS at module load, so the
  // tool classes must exist on the mock even though stack tests don't call init.
  const T = (toolName: string) => Object.assign(class {}, { toolName });
  return {
    init: vi.fn(),
    addTool: vi.fn(),
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
    ToolGroupManager: { getToolGroup: h.getToolGroup },
    utilities: {
      stackPrefetch: { enable: vi.fn(), disable: vi.fn() },
      cine: { playClip: vi.fn(), stopClip: vi.fn() },
      triggerAnnotationRenderForViewportIds: vi.fn(),
    },
    annotation: { state: { removeAllAnnotations: vi.fn() } },
  };
});

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

import * as csTools from "@cornerstonejs/tools";
import { createStack } from "../src/cornerstone/stack";

function fakeEl(): HTMLDivElement {
  return {
    addEventListener: h.evtAdd,
    removeEventListener: h.evtRemove,
    querySelector: vi.fn(() => null),
  } as unknown as HTMLDivElement;
}

describe("createStack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enables a STACK viewport and exposes the full handle", () => {
    const handle = createStack(fakeEl());
    expect(h.engine.enableElement).toHaveBeenCalledWith(expect.objectContaining({ type: "stack" }));
    for (const m of [
      "setStack",
      "setWindowLevel",
      "scroll",
      "setIndex",
      "playCine",
      "stopCine",
      "invert",
      "rotate",
      "flipH",
      "reset",
      "clearAnnotations",
      "captureSliceJpeg",
      "destroy",
    ]) {
      expect(typeof (handle as unknown as Record<string, unknown>)[m]).toBe("function");
    }
    handle.destroy(); // release so the shared engine resets for the next test
  });

  it("setStack loads imageIds and renders; destroy is safe and idempotent", async () => {
    const handle = createStack(fakeEl());
    await handle.setStack(["wadors:x", "wadors:y"]);
    expect(h.vp.setStack).toHaveBeenCalledWith(["wadors:x", "wadors:y"], 0);
    expect(h.vp.render).toHaveBeenCalled();
    handle.destroy();
    handle.destroy();
    // The last live viewport is gone, so the shared engine is torn down once.
    expect(h.engine.destroy).toHaveBeenCalledTimes(1);
  });

  it("warms the series with our own prefetcher, not cornerstone's stackPrefetch", async () => {
    const handle = createStack(fakeEl());
    await handle.setStack(["wadors:x", "wadors:y"]);

    expect(h.createPrefetcher).toHaveBeenCalledWith(["wadors:x", "wadors:y"]);
    // stackPrefetch re-centers by clearing the WHOLE global prefetch pool, which
    // would wipe every other grid cell's queued frames. We must not use it.
    expect(csTools.utilities.stackPrefetch.enable).not.toHaveBeenCalled();

    handle.destroy();
    expect(h.prefetcher.destroy).toHaveBeenCalled();
  });

  it("re-centers the prefetch queue when the displayed slice changes", async () => {
    const handle = createStack(fakeEl());
    await handle.setStack(["wadors:x", "wadors:y"]);

    const onNewImage = h.evtAdd.mock.calls.find(([type]) => type === "a")![1];
    onNewImage({ detail: { imageIdIndex: 1 } });

    expect(h.prefetcher.recenter).toHaveBeenCalledWith(1);
    handle.destroy(); // the shared engine is module state; don't leak a viewport
  });

  it("captureSliceJpeg resolves null once the viewport is destroyed", async () => {
    const handle = createStack(fakeEl());
    handle.destroy();
    await expect(handle.captureSliceJpeg()).resolves.toBeNull();
  });

  it("captureSliceJpeg resolves null when there is no rendered image canvas", async () => {
    // No getCanvas() on the viewport and querySelector('canvas') → null models a
    // report/SR/PDF cell: nothing to capture, so it resolves null (not an error).
    const handle = createStack(fakeEl());
    await expect(handle.captureSliceJpeg()).resolves.toBeNull();
    handle.destroy();
  });

  // Regression: every grid cell used to get its OWN RenderingEngine. Cornerstone
  // 5's default engine eagerly allocates a POOL of webGlContextCount (=7) WebGL
  // contexts PER engine, so N cells burned ~7·N contexts; a 2×2 grid crossed the
  // browser's ~16-context ceiling and the browser discarded the OLDEST context —
  // the first-loaded cell went black and never recovered. All cells must share
  // ONE engine so the pooled contexts are bounded and reused.
  it("shares a single RenderingEngine across all cells", () => {
    const a = createStack(fakeEl());
    const b = createStack(fakeEl());
    const c = createStack(fakeEl());

    // Exactly one engine constructed for three cells.
    expect(h.RenderingEngine).toHaveBeenCalledTimes(1);
    // Each cell still enables its own distinct viewport on that one engine.
    expect(h.engine.enableElement).toHaveBeenCalledTimes(3);
    const viewportIds = h.engine.enableElement.mock.calls.map((args) => args[0].viewportId);
    expect(new Set(viewportIds).size).toBe(3);

    // All viewports join the tool group under the SAME shared engine id.
    expect(h.toolGroup.addViewport).toHaveBeenCalledTimes(3);
    const engineIds = h.toolGroup.addViewport.mock.calls.map((args) => args[1]);
    expect(new Set(engineIds).size).toBe(1);
    // addViewport references the same engine id createStack enabled the viewport on.
    expect(engineIds[0]).toBe(h.RenderingEngine.mock.calls[0][0]);

    a.destroy();
    b.destroy();
    c.destroy();
  });

  it("can opt a viewport out of the tool group entirely (the offscreen thumbnailer)", () => {
    const s = createStack(fakeEl(), {}, { toolGroupId: null });
    const id = h.engine.enableElement.mock.calls[0][0].viewportId;
    // It still gets a viewport on the shared engine — just no tool group, so
    // display-only tools never draw into it.
    expect(h.engine.enableElement).toHaveBeenCalledTimes(1);
    expect(h.toolGroup.addViewport).not.toHaveBeenCalled();
    s.destroy();
    expect(h.engine.disableElement).toHaveBeenCalledWith(id);
    expect(h.toolGroup.removeViewports).not.toHaveBeenCalled();
  });

  it("exposes its viewport id so engine-level APIs can address the cell", () => {
    const a = createStack(fakeEl());
    const b = createStack(fakeEl());
    expect(a.getViewportId()).toBe(h.engine.enableElement.mock.calls[0][0].viewportId);
    expect(a.getViewportId()).not.toBe(b.getViewportId());
    a.destroy();
    b.destroy();
  });

  it("destroy releases only this cell's viewport, tearing the engine down after the last", () => {
    const a = createStack(fakeEl());
    const b = createStack(fakeEl());
    const aId = h.engine.enableElement.mock.calls[0][0].viewportId;
    const bId = h.engine.enableElement.mock.calls[1][0].viewportId;

    a.destroy();
    // Cell A's viewport is removed from the engine + tool group, but the shared
    // engine stays alive for cell B (destroying it would black out B).
    expect(h.engine.disableElement).toHaveBeenCalledWith(aId);
    expect(h.toolGroup.removeViewports).toHaveBeenCalledWith(expect.any(String), aId);
    expect(h.engine.destroy).not.toHaveBeenCalled();

    b.destroy();
    // Last viewport gone → engine torn down exactly once.
    expect(h.engine.disableElement).toHaveBeenCalledWith(bId);
    expect(h.engine.destroy).toHaveBeenCalledTimes(1);
  });
});
