import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const stack = {
  setStack: vi.fn().mockResolvedValue(undefined),
  setWindowLevel: vi.fn(),
  scroll: vi.fn(),
  setIndex: vi.fn(),
  playCine: vi.fn(),
  stopCine: vi.fn(),
  invert: vi.fn(),
  rotate: vi.fn(),
  flipH: vi.fn(),
  reset: vi.fn(),
  clearAnnotations: vi.fn(),
  refreshAnnotations: vi.fn(),
  showSegmentation: vi.fn().mockResolvedValue(true),
  hideSegmentation: vi.fn(),
  captureSliceJpeg: vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/jpeg" })),
  destroy: vi.fn(),
  getViewport: vi.fn(() => null),
};
// Hoisted so the vi.mock factory (which Vitest lifts above imports) can read them.
const {
  setPrimaryTool,
  collectMeasurements,
  deleteAnnotation,
  initCornerstone,
  mprHandle,
  createMprView,
  annotationHistory,
} = vi.hoisted(() => {
  const mprHandle = {
    setVolume: vi.fn().mockResolvedValue(undefined),
    setWindowLevel: vi.fn(),
    setPreset: vi.fn(),
    reset: vi.fn(),
    captureJpeg: vi.fn().mockResolvedValue(null),
    destroy: vi.fn(),
  };
  return {
    setPrimaryTool: vi.fn(),
    collectMeasurements: vi.fn(() => [] as unknown[]),
    deleteAnnotation: vi.fn(),
    // Hoisted so a test can hold Cornerstone init open and let the studyUids
    // watcher run before onMounted resumes.
    initCornerstone: vi.fn().mockResolvedValue(undefined),
    annotationHistory: {
      undo: vi.fn(() => false),
      redo: vi.fn(() => false),
      canUndo: vi.fn(() => false),
      canRedo: vi.fn(() => false),
      reset: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    },
    mprHandle,
    // Fire onReady synchronously so the viewer's mprReady gate flips (the preset
    // picker is disabled until the volume is ready); the real handle fires it
    // after the volume builds.
    createMprView: vi.fn((_els: unknown, cb?: { onReady?: () => void }) => {
      cb?.onReady?.();
      return mprHandle;
    }),
  };
});
vi.mock("@orbidicom/core", () => {
  // Minimal stand-ins for the pure hotkey helpers (the real ones live in core).
  const DEFAULT_KEYMAP: Record<string, unknown> = {
    z: { kind: "tool", tool: "Zoom" },
    i: { kind: "invert" },
    k: { kind: "keyImage" },
    " ": { kind: "cine" },
    ArrowRight: { kind: "scroll", delta: 1 },
    "1": { kind: "preset", index: 0 },
  };
  const resolveHotkey = (
    e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
    map: Record<string, unknown> = DEFAULT_KEYMAP,
  ) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return map[k] ?? null;
  };
  const resolveEditCommand = (e: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  }) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "z") return e.shiftKey ? { kind: "redo" } : { kind: "undo" };
    if (k === "y") return { kind: "redo" };
    return null;
  };
  return {
    initCornerstone,
    setPrimaryTool,
    createStack: vi.fn(() => stack),
    readImageMetadata: vi.fn(async () => ({ patientName: "TEST^PATIENT", patientId: "ID1" })),
    readMetadataGroups: vi.fn(async () => [
      { id: "patient", rows: [{ label: "Patient Name", value: "TEST PATIENT" }] },
    ]),
    // CT exposes the first standard window so the "1" preset hotkey has a target.
    windowPresetsFor: (m: string) =>
      m === "CT"
        ? [{ modality: "CT", name: "Soft Tissue", windowWidth: 400, windowCenter: 40 }]
        : [],
    resolveHotkey,
    resolveEditCommand,
    DEFAULT_KEYMAP,
    collectMeasurements,
    measurementsToJson: vi.fn(() => "{}"),
    measurementsToCsv: vi.fn(() => ""),
    keyImagesToJson: vi.fn(() => "{}"),
    buildMeasurementSr: vi.fn(() => ({})),
    dicomJsonToPart10: vi.fn(() => new Uint8Array([1, 2, 3])),
    onMeasurementsChanged: vi.fn(() => () => {}),
    annotationHistory,
    startAnnotationHistory: vi.fn(() => () => {}),
    deleteAnnotation,
    getAnnotationDeleteTargets: vi.fn(() => []),
    subscribeOverlayReposition: vi.fn(() => () => {}),
    createMprView,
    createThumbnailProvider: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(null),
      release: vi.fn(),
      destroy: vi.fn(),
    })),
    isVolumeCapable: (_s: unknown, n: number) => n >= 16,
    // Mirrors core's modality-based report test (SR/DOC/KO/PR/AU are non-image).
    isImageSeries: (s: { modality?: string }) =>
      !new Set(["SR", "DOC", "KO", "PR", "AU"]).has((s.modality ?? "").toUpperCase()),
    // Mirrors core's normalization of a raw DICOM DA ("YYYYMMDD" -> "YYYY-MM-DD");
    // the series rail's per-study header (formatDicomDate, via i18n) depends on it.
    dicomDate: (v: unknown) => {
      if (v == null || v === "") return undefined;
      const s = String(v);
      return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
    },
    // Mirrors core's study-order.ts: whole study blocks reordered newest-first,
    // order *within* a study untouched, and the input returned unchanged when
    // fewer than two distinct studies are present.
    orderStudyGroups: <T extends { studyInstanceUID?: string; study?: { studyDate?: string } }>(
      ser: T[],
    ): T[] => {
      const groups = new Map<string, T[]>();
      for (const s of ser) {
        const key = s.studyInstanceUID ?? "";
        const g = groups.get(key);
        if (g) g.push(s);
        else groups.set(key, [s]);
      }
      if (groups.size < 2) return ser;
      return [...groups.values()]
        .map((list, order) => ({ list, order, date: list[0]?.study?.studyDate ?? "" }))
        .sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : a.order - b.order))
        .flatMap((g) => g.list);
    },
    // Honors a custom protocol function; any built-in name defaults to single view.
    applyHangingProtocol: (
      ser: unknown[],
      proto: unknown,
      opts: { maxCells: number },
    ): { cellCount: number; assignments: number[] } =>
      typeof proto === "function"
        ? (proto as (s: unknown[], o: unknown) => { cellCount: number; assignments: number[] })(
            ser,
            opts,
          )
        : { cellCount: 1, assignments: [ser.length ? 0 : -1] },
    VR_PRESETS: ["CT-Bone", "CT-Soft-Tissue", "CT-Lung", "MR-Default"],
    defaultVrPreset: (m?: string) => (String(m).toUpperCase() === "MR" ? "MR-Default" : "CT-Bone"),
    // AI & Results (Phase 1) — the Viewer imports these at module scope. Stubs are
    // enough for the gate tests (the panel opens without invoking any of them).
    importResults: vi.fn(() => ({
      schema: "orbidicom.ai-results/v1",
      provenance: {},
      results: [],
    })),
    applyResultSet: vi.fn(async () => ({ annotationUids: [], segmentationIds: [] })),
    removeApplied: vi.fn(),
    removeAppliedSegmentations: vi.fn(),
    exportAccepted: vi.fn(() => "{}"),
    TOOLS: {
      WindowLevel: "WindowLevel",
      Pan: "Pan",
      Zoom: "Zoom",
      Length: "Length",
      Angle: "Angle",
      Rectangle: "Rectangle",
      Ellipse: "Ellipse",
      Probe: "Probe",
    },
  };
});

import Viewer from "../src/components/Viewer.vue";

const source = {
  capabilities: { downloadArchive: false, encapsulatedPdf: false, multiStudy: false },
  getSeries: vi.fn(async () => [
    {
      seriesInstanceUID: "S1",
      studyInstanceUID: "ST",
      modality: "CT",
      seriesDescription: "Axial",
      numberOfFrames: 2,
    },
  ]),
  getImageIds: vi.fn(async () => ["wadors:1", "wadors:2"]),
};

const volumeSource = {
  capabilities: { downloadArchive: false, encapsulatedPdf: false, multiStudy: false },
  getSeries: vi.fn(async () => [
    {
      seriesInstanceUID: "V1",
      studyInstanceUID: "ST",
      modality: "CT",
      seriesDescription: "Volume",
      numberOfFrames: 20,
    },
  ]),
  getImageIds: vi.fn(async () => Array.from({ length: 20 }, (_, i) => `wadors:${i}`)),
};

const twoSeriesSource = {
  capabilities: { downloadArchive: false, encapsulatedPdf: false, multiStudy: false },
  getSeries: vi.fn(async () => [
    { seriesInstanceUID: "A", studyInstanceUID: "ST", modality: "CT", seriesDescription: "Ax" },
    { seriesInstanceUID: "B", studyInstanceUID: "ST", modality: "CT", seriesDescription: "Cor" },
  ]),
  getImageIds: vi.fn(async () => ["wadors:1", "wadors:2"]),
};

const segSource = {
  capabilities: {
    downloadArchive: false,
    encapsulatedPdf: false,
    multiStudy: false,
    segmentations: true,
  },
  getSeries: vi.fn(async () => [
    {
      seriesInstanceUID: "S1",
      studyInstanceUID: "ST",
      modality: "CT",
      seriesDescription: "Axial",
      numberOfFrames: 2,
    },
  ]),
  getImageIds: vi.fn(async () => ["wadors:1", "wadors:2"]),
  listSegmentations: vi.fn(() => [
    { sopUid: "seg-1", label: "Tumor", segmentCount: 1, referencedSeriesUid: "S1" },
  ]),
  getSegmentation: vi.fn(async () => ({
    info: { segmentationType: "BINARY", rows: 1, columns: 2, numberOfFrames: 2, segments: [] },
    labelmaps: [],
  })),
};

const pdfSource = {
  capabilities: { downloadArchive: false, encapsulatedPdf: true, multiStudy: false },
  getSeries: vi.fn(async () => [
    {
      seriesInstanceUID: "DOC1",
      studyInstanceUID: "ST",
      modality: "DOC",
      seriesDescription: "Report",
    },
  ]),
  getImageIds: vi.fn(async () => [] as string[]),
  listPdfs: vi.fn(() => [{ sopUid: "pdf1", bulkDataUri: null }]),
  getPdfObjectUrl: vi.fn(async () => "blob:report"),
};

// A source whose series summary under-counts images: getSeries reports the QIDO
// instance count (1 multi-frame instance) while getImageIds expands it to 5
// frames. Mirrors DicomWebDataSource on a multi-frame PET/CT series.
const multiFrameSource = {
  capabilities: { downloadArchive: false, encapsulatedPdf: false, multiStudy: false },
  getSeries: vi.fn(async () => [
    {
      seriesInstanceUID: "PT1",
      studyInstanceUID: "ST",
      modality: "PT",
      seriesDescription: "PET WB",
      numberOfFrames: 1, // instance count from QIDO, not frames
    },
  ]),
  getImageIds: vi.fn(async () => Array.from({ length: 5 }, (_, i) => `wadors:${i + 1}`)),
};

describe("Viewer", () => {
  it("reconciles the rail image count to the frames actually loaded (multi-frame series)", async () => {
    const w = mount(Viewer, { props: { source: multiFrameSource as never, studyUids: ["ST"] } });
    await flushPromises();
    // Rail must reflect the 5 loaded frames, not the QIDO instance count of 1.
    const rail = w.find(".rail__item").text();
    expect(rail).toContain("5 img");
    expect(rail).not.toContain("1 img");
  });

  it("loads series from the data source on mount and renders the rail + first stack", async () => {
    const w = mount(Viewer, { props: { source: source as never, studyUids: ["ST"] } });
    await flushPromises();
    expect(source.getSeries).toHaveBeenCalledWith(["ST"]);
    expect(w.find(".rail__item").text()).toContain("Axial");
    expect(source.getImageIds).toHaveBeenCalled();
    expect(stack.setStack).toHaveBeenCalledWith(["wadors:1", "wadors:2"]);
  });

  it("hides the download button when the source can't archive", async () => {
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    expect(w.find(".tbtn--download").exists()).toBe(false);
  });

  it("info button toggles the overlay between full info and blurred patient data", async () => {
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    const btn = w.find(".tbtn--overlay");

    // full: overlay visible, not blurred.
    expect(w.find(".ovlroot").exists()).toBe(true);
    expect(w.find(".ovl--blur").exists()).toBe(false);

    // -> private: overlay stays visible, patient block blurred.
    await btn.trigger("click");
    expect(w.find(".ovlroot").exists()).toBe(true);
    expect(w.find(".ovl--blur").exists()).toBe(true);

    // -> back to full: overlay still visible, blur removed (no hidden state).
    await btn.trigger("click");
    expect(w.find(".ovlroot").exists()).toBe(true);
    expect(w.find(".ovl--blur").exists()).toBe(false);
  });

  it("opens the metadata panel from the toolbar button", async () => {
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    expect(w.find(".metapanel").exists()).toBe(false);
    await w.find(".tbtn--meta").trigger("click");
    await flushPromises();
    expect(w.find(".metapanel").exists()).toBe(true);
    expect(w.find(".metapanel").text()).toContain("TEST PATIENT");
  });

  it("renders a PdfView (not an image stack) for an encapsulated-PDF series", async () => {
    stack.setStack.mockClear();
    const w = mount(Viewer, {
      props: { source: pdfSource as never, studyUids: ["ST"] },
      global: {
        stubs: { PdfView: { props: ["src"], template: '<div class="pdfstub">{{ src }}</div>' } },
      },
    });
    await flushPromises();
    expect(pdfSource.getPdfObjectUrl).toHaveBeenCalled();
    expect(stack.setStack).not.toHaveBeenCalled();
    expect(w.find(".pdfstub").text()).toBe("blob:report");
  });

  it("shows the number of grid cells chosen in the layout selector", async () => {
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    // Single view by default: exactly one visible cell.
    expect(w.findAll(".cell:not(.cell--hidden)").length).toBe(1);
    await w.find(".layout__select").setValue("6");
    await flushPromises();
    expect(w.findAll(".cell:not(.cell--hidden)").length).toBe(6);
  });

  it("applies the stacked 2×1 grid class for the '2v' layout and clears it afterward", async () => {
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    await w.find(".layout__select").setValue("2v");
    await flushPromises();
    const grid = w.find(".grid");
    expect(grid.classes()).toContain("grid--n2");
    expect(grid.classes()).toContain("grid--n2-stacked");
    expect(w.findAll(".cell:not(.cell--hidden)").length).toBe(2); // still a 2-cell grid
    // Any other layout choice clears the stacked flag.
    await w.find(".layout__select").setValue("4");
    await flushPromises();
    expect(w.find(".grid").classes()).not.toContain("grid--n2-stacked");
  });

  it("collapses and re-expands the series rail via the rail toggle", async () => {
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    expect(w.find(".content").classes()).not.toContain("rail-collapsed");
    await w.find(".rail-toggle").trigger("click");
    expect(w.find(".content").classes()).toContain("rail-collapsed");
    await w.find(".rail-toggle").trigger("click");
    expect(w.find(".content").classes()).not.toContain("rail-collapsed");
  });

  it("keyboard shortcuts drive tool / view / preset actions on the active cell", async () => {
    setPrimaryTool.mockClear();
    stack.invert.mockClear();
    stack.setWindowLevel.mockClear();
    mount(Viewer, { props: { source: source as never } });
    await flushPromises();

    // 'z' selects the Zoom tool.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" }));
    expect(setPrimaryTool).toHaveBeenCalledWith("Zoom");

    // 'i' inverts the active stack.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i" }));
    expect(stack.invert).toHaveBeenCalled();

    // '1' applies the first window preset for the active (CT) modality.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    expect(stack.setWindowLevel).toHaveBeenCalledWith(400, 40);
  });

  it("ignores non-undo shortcuts modified with Ctrl/Cmd (browser shortcuts pass through)", async () => {
    setPrimaryTool.mockClear();
    stack.invert.mockClear();
    mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    // Ctrl+I is a browser/OS combo, not one of ours — invert must not fire.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true }));
    expect(stack.invert).not.toHaveBeenCalled();
  });

  it("maps Ctrl+Z to undo and Ctrl+Shift+Z to redo (and refreshes overlays)", async () => {
    annotationHistory.undo.mockClear().mockReturnValue(true);
    annotationHistory.redo.mockClear().mockReturnValue(true);
    stack.refreshAnnotations.mockClear();
    mount(Viewer, { props: { source: source as never } });
    await flushPromises();

    // (Prior tests leave Viewers mounted on the shared window listener, so assert
    // the command mapping rather than exact call counts.)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    expect(annotationHistory.undo).toHaveBeenCalled();
    expect(annotationHistory.redo).not.toHaveBeenCalled();
    expect(stack.refreshAnnotations).toHaveBeenCalled();

    annotationHistory.undo.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true }));
    expect(annotationHistory.redo).toHaveBeenCalled();
    expect(annotationHistory.undo).not.toHaveBeenCalled();
  });

  it("flags the current slice as a key image with 'k' (star activates, export appears)", async () => {
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    expect(w.find(".tbtn--keyimage").classes()).not.toContain("tbtn--active");
    expect(w.find(".tbtn--export-keyimages").exists()).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    await flushPromises();

    expect(w.find(".tbtn--keyimage").classes()).toContain("tbtn--active");
    expect(w.find(".tbtn--export-keyimages").exists()).toBe(true);

    // Pressing 'k' again unflags it.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k" }));
    await flushPromises();
    expect(w.find(".tbtn--keyimage").classes()).not.toContain("tbtn--active");
  });

  it("uploads measurements as a DICOM SR via STOW when the source supports store", async () => {
    collectMeasurements.mockReturnValue([{ annotationUID: "a" } as never]);
    const storeInstances = vi.fn().mockResolvedValue({ stored: ["1.2.3"], failed: [] });
    const storeSource = {
      capabilities: {
        downloadArchive: false,
        encapsulatedPdf: false,
        multiStudy: false,
        store: true,
      },
      getSeries: vi.fn(async () => [
        {
          seriesInstanceUID: "S1",
          studyInstanceUID: "ST",
          modality: "CT",
          seriesDescription: "Axial",
          numberOfFrames: 2,
        },
      ]),
      getImageIds: vi.fn(async () => ["wadors:1", "wadors:2"]),
      storeInstances,
    };
    try {
      const w = mount(Viewer, { props: { source: storeSource as never, studyUids: ["ST"] } });
      await flushPromises();

      const btn = w.find(".tbtn--upload-sr");
      expect(btn.exists()).toBe(true);
      await btn.trigger("click"); // opens the confirm modal
      await w.find(".modal__btn--primary").trigger("click"); // confirm upload
      await flushPromises();

      expect(storeInstances).toHaveBeenCalled();
      expect(storeInstances.mock.calls[0][1]).toEqual({ studyUid: "ST" });
    } finally {
      collectMeasurements.mockReturnValue([]); // restore for other tests
    }
  });

  it("lists a series' segmentations and toggles one onto the active stack", async () => {
    stack.showSegmentation.mockClear().mockResolvedValue(true);
    segSource.getSegmentation.mockClear();
    const w = mount(Viewer, { props: { source: segSource as never } });
    await flushPromises();

    const items = w.findAll(".segs__item");
    expect(items).toHaveLength(1);
    expect(items[0].text()).toContain("Tumor");

    await items[0].find("input").setValue(true);
    await flushPromises();

    expect(segSource.getSegmentation).toHaveBeenCalled();
    expect(stack.showSegmentation).toHaveBeenCalled();

    // Toggling off removes it.
    await items[0].find("input").setValue(false);
    await flushPromises();
    expect(stack.hideSegmentation).toHaveBeenCalledWith("seg-seg-1");
  });

  it("downloads the active slice as a JPEG (image + annotations) with a sensible filename", async () => {
    stack.captureSliceJpeg.mockClear();
    // jsdom doesn't implement object URLs or anchor navigation — stub them.
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    let downloadName = "";
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();

    const btn = w.find(".tbtn--download-image");
    expect(btn.exists()).toBe(true); // CT series loaded → image stack present
    await btn.trigger("click");
    expect(stack.captureSliceJpeg).toHaveBeenCalled();
    await flushPromises();

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    // series "Axial", first slice (1-based) → "Axial_1.jpg"
    expect(downloadName).toBe("Axial_1.jpg");
    clickSpy.mockRestore();
  });

  it("shows the measurement-export buttons only when measurements exist, and downloads JSON", async () => {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    let downloadName = "";
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    // No measurements → export group hidden.
    collectMeasurements.mockReturnValue([]);
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    expect(w.find(".tbtn--export-measurements").exists()).toBe(false);

    // Measurements present → group shows after an annotation-change bump.
    collectMeasurements.mockReturnValue([{ tool: "Length" }]);
    // doClearAnnotations bumps annotationVersion; simpler: remount to re-evaluate.
    const w2 = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    const group = w2.find(".tbtn--export-measurements");
    expect(group.exists()).toBe(true);
    await group.findAll("button")[0].trigger("click"); // JSON
    await flushPromises();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(downloadName).toMatch(/Axial_measurements_.*\.json$/);
    clickSpy.mockRestore();
  });

  it("offers MPR for a volume-capable series and builds the volume on selection", async () => {
    createMprView.mockClear();
    mprHandle.setVolume.mockClear();
    const w = mount(Viewer, { props: { source: volumeSource as never } });
    await flushPromises();

    // The MPR option is present for a 20-slice CT and the MPR panes aren't shown yet.
    const opts = w.findAll(".layout__select option").map((o) => o.attributes("value"));
    expect(opts).toContain("mpr");
    expect(w.find(".mpr").exists()).toBe(false);

    await w.find(".layout__select").setValue("mpr");
    await flushPromises();

    expect(createMprView).toHaveBeenCalledOnce();
    expect(mprHandle.setVolume).toHaveBeenCalled();
    expect(w.find(".mpr").exists()).toBe(true);
    // The stack grid stays mounted (hidden), not destroyed.
    expect(w.find(".grid--hidden").exists()).toBe(true);
  });

  it("applies an initial hanging protocol, opening a multi-cell grid on load", async () => {
    const protocol = () => ({ cellCount: 2, assignments: [0, 1] });
    const w = mount(Viewer, {
      props: { source: twoSeriesSource as never, hangingProtocol: protocol as never },
    });
    await flushPromises();
    // The grid switched to 2-up (the default would have been a single cell).
    expect(w.find(".grid--n2").exists()).toBe(true);
    expect(twoSeriesSource.getImageIds).toHaveBeenCalledTimes(2); // both cells loaded
  });

  it("keeps the cine-speed dropdown in sync with each cell's own autoplay fps", async () => {
    const protocol = () => ({ cellCount: 2, assignments: [0, 1] });
    const w = mount(Viewer, {
      props: { source: twoSeriesSource as never, hangingProtocol: protocol as never },
    });
    await flushPromises();

    const cells = w.findAll(".cell");
    const speed = () => w.find(".slicebar__speed");
    const play = () => w.find(".slicebar__play");

    // Cell 0: pick 5 fps, then start autoplay.
    await speed().setValue("5");
    stack.playCine.mockClear();
    await play().trigger("click");
    expect(stack.playCine).toHaveBeenLastCalledWith(5);

    // Focus cell 1: pick 20 fps, then start autoplay.
    await cells[1].trigger("pointerdown");
    await speed().setValue("20");
    stack.playCine.mockClear();
    await play().trigger("click");
    expect(stack.playCine).toHaveBeenLastCalledWith(20);

    // Back to cell 0 — the dropdown must show ITS fps (5), not cell 1's 20.
    await cells[0].trigger("pointerdown");
    expect((speed().element as HTMLSelectElement).value).toBe("5");
  });

  it("renders a 3D pane with a preset picker that drives setPreset", async () => {
    mprHandle.setPreset.mockClear();
    const w = mount(Viewer, { props: { source: volumeSource as never } });
    await flushPromises();
    await w.find(".layout__select").setValue("mpr");
    await flushPromises();

    const presetSelect = w.find(".mpr__preset select");
    expect(presetSelect.exists()).toBe(true);
    // CT volume defaults to the CT-Bone preset.
    expect((presetSelect.element as HTMLSelectElement).value).toBe("CT-Bone");

    await presetSelect.setValue("CT-Lung");
    expect(mprHandle.setPreset).toHaveBeenCalledWith("CT-Lung");
  });

  it("hides the AI & Results button and panel by default (no features prop)", async () => {
    const w = mount(Viewer, { props: { source: source as never } });
    await flushPromises();
    expect(w.find(".tbtn--ai").exists()).toBe(false);
    expect(w.find(".aipanel").exists()).toBe(false);
  });

  it("shows the AI & Results button when features.aiResults is on, and toggles the panel", async () => {
    const w = mount(Viewer, {
      props: { source: source as never, features: { aiResults: true } },
    });
    await flushPromises();
    const btn = w.find(".tbtn--ai");
    expect(btn.exists()).toBe(true);
    // Button gates the panel: hidden until first click, shown after.
    expect(w.find(".aipanel").exists()).toBe(false);
    await btn.trigger("click");
    expect(w.find(".aipanel").exists()).toBe(true);
    await btn.trigger("click");
    expect(w.find(".aipanel").exists()).toBe(false);
  });
});

describe("multi-study lifecycle", () => {
  const mk = (uid: string, studyUid: string, date: string, frames = 3) => ({
    seriesInstanceUID: uid,
    studyInstanceUID: studyUid,
    modality: "CT",
    numberOfFrames: frames,
    study: { studyDate: date, studyDescription: `Study ${studyUid}` },
  });

  // `frames` sizes every series, so the same fixture covers the stack tests (3)
  // and the MPR ones (>= the 16-slice volume threshold).
  function twoStudySource(frames = 3) {
    const byStudy: Record<string, ReturnType<typeof mk>[]> = {
      OLD: [mk("O1", "OLD", "20240101", frames)],
      NEW: [mk("N1", "NEW", "20260314", frames)],
      MID: [mk("M1", "MID", "20250101", frames)],
    };
    return {
      capabilities: { downloadArchive: false, multiStudy: true, studySearch: true },
      getSeries: async (uids: string[]) => uids.flatMap((u) => byStudy[u] ?? []),
      getImageIds: async (s: { seriesInstanceUID: string }) =>
        Array.from({ length: frames }, (_, i) => `${s.seriesInstanceUID}-${i}`),
      searchStudies: async () => [],
    };
  }
  const rail = (w: ReturnType<typeof mount>) => w.findComponent({ name: "SeriesRail" });
  const uidsOf = (w: ReturnType<typeof mount>) =>
    (rail(w).props("series") as { seriesInstanceUID: string }[]).map((s) => s.seriesInstanceUID);

  it("keeps a cell on the same series when a newer study is inserted above it", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD"] },
    });
    await flushPromises();
    expect(uidsOf(w)).toEqual(["O1"]);

    // Newest-first ordering puts N1 at index 0, so the cell showing index 0 (O1)
    // must follow O1 to its new index 1.
    await w.setProps({ studyUids: ["OLD", "NEW"] });
    await flushPromises();
    expect(uidsOf(w)).toEqual(["N1", "O1"]);
    expect(rail(w).props("active")).toBe(1);
  });

  it("preserves the layout when adding a study", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD"], hangingProtocol: "single" },
    });
    await flushPromises();
    const before = w.findComponent({ name: "Toolbar" }).props("layout");
    await w.setProps({ studyUids: ["OLD", "NEW"] });
    await flushPromises();
    expect(w.findComponent({ name: "Toolbar" }).props("layout")).toBe(before);
  });

  it("emits update:studyUids when a study is added", async () => {
    const w = mount(Viewer, { props: { source: twoStudySource() as never, studyUids: ["OLD"] } });
    await flushPromises();
    await w.setProps({ studyUids: ["OLD", "NEW"] });
    await flushPromises();
    const ev = w.emitted("update:studyUids");
    expect(ev?.[ev.length - 1]).toEqual([["OLD", "NEW"]]);
  });

  it("is idempotent when the same study uid is added twice", async () => {
    const src = twoStudySource();
    const spy = vi.spyOn(src, "getSeries");
    const w = mount(Viewer, { props: { source: src as never, studyUids: ["OLD"] } });
    await flushPromises();
    const after = spy.mock.calls.length;
    await w.setProps({ studyUids: ["OLD", "OLD"] });
    await flushPromises();
    expect(spy.mock.calls.length).toBe(after);
  });

  it("passes every displayed series index to the rail", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    const displayed = rail(w).props("displayed") as number[];
    expect(Array.isArray(displayed)).toBe(true);
    expect(displayed.every((i) => i >= 0)).toBe(true);
  });

  it("removes the closed study's series and keeps other cells on their series", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    expect(uidsOf(w)).toEqual(["N1", "O1"]);
    // Close the study at index 0, so O1 shifts from 1 to 0.
    rail(w).vm.$emit("close-study", "NEW");
    await flushPromises();
    expect(uidsOf(w)).toEqual(["O1"]);
  });

  // The add path is covered above; this is the close-direction twin — a surviving
  // cell whose series shifts DOWN when the block above it is removed. Without the
  // remap this cell would keep index 1 (now out of range) or, with one more study
  // open, silently render a different patient's scan.
  it("re-points a surviving cell when the block above it is closed", async () => {
    const twoUp = () => ({ cellCount: 2, assignments: [0, 1] });
    const w = mount(Viewer, {
      props: {
        source: twoStudySource() as never,
        studyUids: ["OLD", "NEW"],
        hangingProtocol: twoUp as never,
      },
    });
    await flushPromises();
    expect(uidsOf(w)).toEqual(["N1", "O1"]);
    // Cell 1 holds O1 at flat index 1.
    await w.findAll(".cell")[1].trigger("pointerdown");
    expect(rail(w).props("active")).toBe(1);

    rail(w).vm.$emit("close-study", "NEW");
    await flushPromises();
    expect(uidsOf(w)).toEqual(["O1"]);
    // Cell 1 still shows O1 — now at flat index 0, not a stale 1.
    expect(rail(w).props("active")).toBe(0);
    // Cell 0's series is gone, so it is blank rather than pointing at O1 too.
    expect(rail(w).props("displayed")).toEqual([0]);
  });

  // Mid-session adds must not re-run the hanging protocol (it would wipe key
  // images and annotations) — but an EMPTY viewer has no such work to lose, and
  // leaving the stage black after a study is added would look like a failed load.
  it("hangs the first study added to an empty viewer", async () => {
    const src = twoStudySource();
    const spy = vi.spyOn(src, "getImageIds");
    const w = mount(Viewer, { props: { source: src as never, studyUids: [] } });
    await flushPromises();
    expect(uidsOf(w)).toEqual([]);

    await w.setProps({ studyUids: ["NEW"] });
    await flushPromises();
    expect(uidsOf(w)).toEqual(["N1"]);
    expect(spy).toHaveBeenCalled();
    expect(rail(w).props("active")).toBe(0);
  });

  it("emits update:studyUids on close", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    rail(w).vm.$emit("close-study", "NEW");
    await flushPromises();
    const ev = w.emitted("update:studyUids");
    expect(ev?.[ev.length - 1]).toEqual([["OLD"]]);
  });

  it("releases the closed study's thumbnails", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    const provider = rail(w).props("provider") as { release: (u: string[]) => void };
    const spy = vi.spyOn(provider, "release");
    rail(w).vm.$emit("close-study", "NEW");
    await flushPromises();
    expect(spy).toHaveBeenCalledWith(["N1"]);
  });

  it("closes immediately when the study has no annotations or key images", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    rail(w).vm.$emit("close-study", "NEW");
    await flushPromises();
    expect(w.find(".modal").exists()).toBe(false);
    expect(rail(w).props("series")).toHaveLength(1);
  });

  it("asks for confirmation when the study has key images, and closes only on confirm", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    // Flag the active cell's image as a key image, then close that study. Driven
    // through the real toolbar button (as the pre-existing key-image test does)
    // rather than a raw $emit, whose hyphenated name isn't what Toolbar declares.
    await w.find(".tbtn--keyimage").trigger("click");
    await flushPromises();
    rail(w).vm.$emit("close-study", "NEW");
    await flushPromises();
    expect(w.find(".modal").exists()).toBe(true);
    expect(rail(w).props("series")).toHaveLength(2); // not closed yet
    await w.find(".modal__btn--danger").trigger("click");
    await flushPromises();
    expect(rail(w).props("series")).toHaveLength(1);
  });

  it("drops a study when it disappears from the studyUids prop", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    await w.setProps({ studyUids: ["OLD"] });
    await flushPromises();
    expect(uidsOf(w)).toEqual(["O1"]);
  });

  // C1 — the MPR is a second handle covering the whole stage, and exitMpr is
  // otherwise only reachable from the layout picker. Blanking the cell it was
  // built from has to tear it down, or the closed study keeps rendering (and
  // keeps being exportable via captureJpeg) after the rail has forgotten it.
  it("leaves MPR when the study behind the reconstruction is closed", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource(20) as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    await w.find(".layout__select").setValue("mpr");
    await flushPromises();
    expect(w.find(".mpr").exists()).toBe(true);

    mprHandle.destroy.mockClear();
    // Cell 0 holds N1, and the volume was built from it.
    rail(w).vm.$emit("close-study", "NEW");
    await flushPromises();
    expect(mprHandle.destroy).toHaveBeenCalled();
    expect(w.find(".mpr").exists()).toBe(false);
    expect(w.find(".grid--hidden").exists()).toBe(false); // back to the stack grid
  });

  // The mount load is async and the studyUids watcher is live from setup, so a
  // host can complete a whole swap inside mount's getSeries window. This holds
  // the OLD fetch open so that window is controllable.
  function gatedSource() {
    const src = twoStudySource();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const inner = src.getSeries;
    src.getSeries = async (uids: string[]) => {
      if (uids.includes("OLD")) await gate;
      return inner(uids);
    };
    return { src, release: () => open() };
  }

  // C2a — the mount load must not reinstate a study the host has already
  // dismissed, nor reassign series.value under a cell that has moved on.
  it("does not let the mount load overwrite a study the host swapped to mid-flight", async () => {
    const { src, release } = gatedSource();
    const w = mount(Viewer, { props: { source: src as never, studyUids: ["OLD"] } });
    await flushPromises();
    await w.setProps({ studyUids: ["NEW"] });
    await flushPromises();
    expect(uidsOf(w)).toEqual(["N1"]);

    release();
    await flushPromises();
    expect(uidsOf(w)).toEqual(["N1"]);
    expect(rail(w).props("active")).toBe(0); // the cell still points at its own series
    const ev = w.emitted("update:studyUids");
    expect(ev?.[ev.length - 1]).toEqual([["NEW"]]);
  });

  // C2b — the open set must be derived from what actually loaded, not written
  // straight from the prop: doing the latter makes the watcher skip a study it
  // never fetched, and lets the mount's own study be merged a second time.
  it("loads a study appended to studyUids while the mount load is still in flight", async () => {
    const { src, release } = gatedSource();
    const spy = vi.spyOn(src, "getSeries");
    const w = mount(Viewer, { props: { source: src as never, studyUids: ["OLD"] } });
    await flushPromises();
    await w.setProps({ studyUids: ["OLD", "NEW"] });
    await flushPromises();
    release();
    await flushPromises();

    expect(uidsOf(w)).toEqual(["N1", "O1"]);
    const ev = w.emitted("update:studyUids");
    expect([...((ev?.[ev.length - 1]?.[0] as string[]) ?? [])].sort()).toEqual(["NEW", "OLD"]);
    expect(spy.mock.calls.flat(2).filter((u) => u === "OLD")).toHaveLength(1);
  });

  // I1 — "no cell is hung" is not "no session state". A study can be open, and
  // carry key images, while every cell happens to be blank.
  it("keeps another open study's key images when a study is added after the cells emptied", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    // Cell 0 holds N1 (newest first): flag a key image, then move the cell to O1.
    await w.find(".tbtn--keyimage").trigger("click");
    expect(w.find(".tbtn--export-keyimages").exists()).toBe(true);
    rail(w).vm.$emit("select", 1);
    await flushPromises();

    // Closing OLD empties every cell — but NEW is still open, with its flag.
    rail(w).vm.$emit("close-study", "OLD");
    await flushPromises();
    expect(uidsOf(w)).toEqual(["N1"]);

    await w.setProps({ studyUids: ["NEW", "MID"] });
    await flushPromises();
    expect(uidsOf(w)).toEqual(["N1", "M1"]);
    expect(w.find(".tbtn--export-keyimages").exists()).toBe(true);
  });

  // I2 — the idempotence guard is checked before an await, so it has to consult
  // the in-flight set too or a second prop change re-enters the same add.
  it("fetches a study once when two prop changes race the same add", async () => {
    const src = twoStudySource();
    // Hold NEW's fetch open so the second prop change genuinely lands mid-flight —
    // without a gate the first add resolves first and openStudyUids alone covers it.
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const inner = src.getSeries;
    src.getSeries = async (uids: string[]) => {
      if (uids.includes("NEW")) await gate;
      return inner(uids);
    };
    const spy = vi.spyOn(src, "getSeries");
    const w = mount(Viewer, { props: { source: src as never, studyUids: ["OLD"] } });
    await flushPromises();
    spy.mockClear();

    await w.setProps({ studyUids: ["OLD", "NEW"] });
    await w.setProps({ studyUids: ["OLD", "NEW", "MID"] });
    await flushPromises();
    open();
    await flushPromises();

    expect(spy.mock.calls.flat(2).filter((u) => u === "NEW")).toHaveLength(1);
    expect(uidsOf(w)).toEqual(["N1", "M1", "O1"]);
    const ev = w.emitted("update:studyUids");
    expect([...((ev?.[ev.length - 1]?.[0] as string[]) ?? [])].sort()).toEqual([
      "MID",
      "NEW",
      "OLD",
    ]);
  });

  // I3 — user work outlives the cell that displayed it, so both the confirm gate
  // and the purge must key off the series, not off what is currently hung.
  it("confirms and purges key images on a series that has since left its cell", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
    });
    await flushPromises();
    await w.find(".tbtn--keyimage").trigger("click"); // key image on N1
    rail(w).vm.$emit("select", 1); // the cell moves to O1
    await flushPromises();
    expect(w.find(".tbtn--export-keyimages").exists()).toBe(true);

    rail(w).vm.$emit("close-study", "NEW");
    await flushPromises();
    expect(w.find(".modal").exists()).toBe(true); // N1's flag is still work to lose
    await w.find(".modal__btn--danger").trigger("click");
    await flushPromises();
    expect(uidsOf(w)).toEqual(["O1"]);
    expect(w.find(".tbtn--export-keyimages").exists()).toBe(false);
  });

  it("deletes measurements drawn on a closed study's series after the cell moved on", async () => {
    collectMeasurements.mockReturnValue([{ annotationUID: "m1", imageId: "N1-1" }]);
    try {
      const w = mount(Viewer, {
        props: { source: twoStudySource() as never, studyUids: ["OLD", "NEW"] },
      });
      await flushPromises();
      rail(w).vm.$emit("select", 1); // the cell leaves N1 for O1
      await flushPromises();
      deleteAnnotation.mockClear();

      rail(w).vm.$emit("close-study", "NEW");
      await flushPromises();
      expect(w.find(".modal").exists()).toBe(true);
      await w.find(".modal__btn--danger").trigger("click");
      await flushPromises();
      expect(deleteAnnotation).toHaveBeenCalledWith("m1");
    } finally {
      collectMeasurements.mockReturnValue([]);
    }
  });

  // Minor — study-scoped actions must target what is open, not props.studyUids[0],
  // which can name a study this session has already closed. Two cells, so the
  // closed study's cell stays blank (another visible cell is still hung, so the
  // re-hang below correctly leaves it alone) and the fallback is reached.
  it("targets a still-open study for the archive download when the active cell is blank", async () => {
    const downloadArchive = vi.fn();
    const twoUp = () => ({ cellCount: 2, assignments: [0, 1] });
    const src = {
      ...twoStudySource(),
      capabilities: { downloadArchive: true, multiStudy: true, studySearch: true },
      downloadArchive,
    };
    // NEW is first in the prop *and* the study being closed.
    const w = mount(Viewer, {
      props: {
        source: src as never,
        studyUids: ["NEW", "OLD"],
        hangingProtocol: twoUp as never,
      },
    });
    await flushPromises();
    rail(w).vm.$emit("close-study", "NEW"); // blanks cell 0, the active one
    await flushPromises();
    expect(uidsOf(w)).toEqual(["O1"]);
    expect(rail(w).props("active")).toBe(-1); // active cell really is empty

    await w.find(".tbtn--download").trigger("click");
    expect(downloadArchive).toHaveBeenCalledWith("OLD");
  });

  // Round-2 Important — the bootstrap fetch must not run once the watcher has
  // claimed the session. DicomJsonDataSource and LocalDataSource read an empty
  // uid list as "every study I hold", and those extra studies would land in the
  // rail outside openStudyUids, where the close pass can never reach them.
  function catchAllSource() {
    const src = twoStudySource();
    const inner = src.getSeries;
    src.getSeries = async (uids: string[]) =>
      uids.length ? inner(uids) : inner(["OLD", "NEW", "MID"]);
    return src;
  }

  it("does not bootstrap-fetch every study when the watcher claimed the session first", async () => {
    const src = catchAllSource();
    // Hold Cornerstone init open so the watcher runs before onMounted resumes.
    let ready!: () => void;
    initCornerstone.mockReturnValueOnce(
      new Promise<void>((r) => {
        ready = r;
      }),
    );
    const w = mount(Viewer, { props: { source: src as never, studyUids: ["OLD"] } });
    await w.setProps({ studyUids: ["NEW"] });
    await flushPromises();
    ready();
    await flushPromises();

    // Only the requested study — no unrequested patient's series in the rail.
    expect(uidsOf(w)).toEqual(["N1"]);
  });

  it("still bootstrap-fetches for a host that never passes studyUids", async () => {
    const src = catchAllSource();
    const w = mount(Viewer, { props: { source: src as never } });
    await flushPromises();
    // No uids to claim the session with, so the source decides what it holds.
    expect(uidsOf(w)).toEqual(["N1", "M1", "O1"]);
  });

  // Round-2 residual — replacing one study with another must not leave a black
  // stage. The merge sees a non-empty session so it doesn't re-hang, then the
  // close pass blanks the old study's cell; at cellCount === 1 the "pick a
  // series" chip is suppressed, so nothing at all would be on screen.
  it("hangs the replacement when a host swaps one study for another", async () => {
    const w = mount(Viewer, {
      props: { source: twoStudySource() as never, studyUids: ["OLD"] },
    });
    await flushPromises();
    expect(rail(w).props("active")).toBe(0);
    stack.setStack.mockClear();

    await w.setProps({ studyUids: ["NEW"] });
    await flushPromises();

    expect(uidsOf(w)).toEqual(["N1"]);
    expect(rail(w).props("active")).toBe(0);
    expect(rail(w).props("displayed")).toEqual([0]);
    expect(stack.setStack).toHaveBeenLastCalledWith(["N1-0", "N1-1", "N1-2"]);
  });
});

describe("add-study affordance", () => {
  const base = {
    getSeries: async () => [
      { seriesInstanceUID: "S1", studyInstanceUID: "ST", modality: "CT", numberOfFrames: 2 },
    ],
    getImageIds: async () => ["S1-a", "S1-b"],
  };

  it("is hidden when the source doesn't advertise multiStudy + studySearch", async () => {
    const w = mount(Viewer, {
      props: {
        source: { ...base, capabilities: { multiStudy: false, studySearch: false } } as never,
        studyUids: ["ST"],
      },
    });
    await flushPromises();
    expect(w.find(".rail-add").exists()).toBe(false);
  });

  it("is shown and opens the worklist overlay when the capability is advertised", async () => {
    const w = mount(Viewer, {
      props: {
        source: {
          ...base,
          capabilities: { multiStudy: true, studySearch: true },
          searchStudies: async () => [],
        } as never,
        studyUids: ["ST"],
      },
    });
    await flushPromises();
    expect(w.find(".rail-add").exists()).toBe(true);
    await w.find(".rail-add").trigger("click");
    expect(w.findComponent({ name: "StudyList" }).exists()).toBe(true);
  });
});
