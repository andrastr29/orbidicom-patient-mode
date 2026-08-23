/**
 * MPR / volume reconstruction: builds a 3D volume from a series' image ids and
 * shows it in a four-up hanging protocol: three linked orthographic planes
 * (axial / coronal / sagittal) with a crosshairs tool, plus a 3D volume-rendering
 * (VR) pane with selectable presets (CT-Bone, CT-Soft-Tissue, …), the same layout
 * OHIF uses. Parallel to `createStack`; owns its own RenderingEngine and
 * per-instance tool groups so it never collides with the stack viewer.
 *
 * Rendering and crosshair/VR correctness require a real WebGL browser + a true
 * volumetric series, so they can't be exercised in jsdom. Unit tests cover wiring,
 * the preset/tool plumbing, and the `isVolumeCapable` gate only.
 */
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  cache,
} from "@cornerstonejs/core";
import {
  ToolGroupManager,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  CrosshairsTool,
  TrackballRotateTool,
  Enums as csToolsEnums,
} from "@cornerstonejs/tools";
import { MPR_TOOL_GROUP_ID } from "./init";
import { voiToWl, nextFrame, compositeSliceJpeg, type WindowLevel } from "./capture";
import type { SeriesSummary } from "../datasource";

/** Orthographic reconstruction planes plus the 3D volume-rendering pane. */
export type MprPane = "axial" | "coronal" | "sagittal" | "volume3d";

/**
 * Volume-rendering presets offered in the 3D pane. A curated, radiology-relevant
 * subset of Cornerstone's built-in `CONSTANTS.VIEWPORT_PRESETS`; every name here
 * exists there, so `setProperties({ preset })` always resolves.
 */
export const VR_PRESETS = [
  "CT-Bone",
  "CT-Soft-Tissue",
  "CT-Lung",
  "CT-Muscle",
  "CT-Cardiac",
  "CT-MIP",
  "MR-Default",
  "MR-Angio",
  "MR-MIP",
] as const;

export type VrPreset = (typeof VR_PRESETS)[number];

/** A sensible default VR preset for a series' modality. */
export function defaultVrPreset(modality?: string): VrPreset {
  const m = (modality ?? "").toUpperCase();
  if (m === "MR") return "MR-Default";
  if (m === "PT" || m === "NM") return "CT-MIP";
  return "CT-Bone";
}

export interface MprCallbacks {
  /** Fired once the volume is built and shown in all panes. */
  onReady?: () => void;
  onVoi?: (wl: WindowLevel) => void;
  /** Fired if the volume can't be built (e.g. inconsistent geometry). */
  onError?: (e: unknown) => void;
}

export interface MprHandle {
  setVolume: (imageIds: string[], opts?: { modality?: string }) => Promise<void>;
  setWindowLevel: (ww: number, wc: number) => void;
  /** Apply a 3D volume-rendering preset to the VR pane. */
  setPreset: (preset: string) => void;
  reset: () => void;
  /** Composite one pane (default axial) to a JPEG, same approach as the stack. */
  captureJpeg: (pane?: MprPane, quality?: number) => Promise<Blob | null>;
  destroy: () => void;
}

const VOLUME_MODALITIES = new Set(["CT", "MR", "PT", "NM"]);

/**
 * Whether a series is worth (and likely able to be) reconstructed in 3D: a
 * multi-slice cross-sectional volume. This is a cheap pre-gate on modality +
 * slice count; true geometry validation (consistent frame of reference, regular
 * spacing) only happens at load time; see the runtime guard in `createMprView`.
 */
export function isVolumeCapable(
  series: Pick<SeriesSummary, "modality" | "volumetric">,
  sliceCount: number,
  opts: { min?: number } = {},
): boolean {
  if (sliceCount < (opts.min ?? 16)) return false;
  // A source can mark a series volumetric directly (e.g. NIfTI, which carries no
  // DICOM modality); otherwise fall back to the cross-sectional modalities.
  if (series.volumetric) return true;
  return VOLUME_MODALITIES.has((series.modality ?? "").toUpperCase());
}

let mprSeq = 0;

const ORTHO_PANES: Exclude<MprPane, "volume3d">[] = ["axial", "coronal", "sagittal"];

export function createMprView(
  els: {
    axial: HTMLDivElement;
    coronal: HTMLDivElement;
    sagittal: HTMLDivElement;
    volume3d: HTMLDivElement;
  },
  cb: MprCallbacks = {},
): MprHandle {
  const n = mprSeq++;
  const engineId = `orbidicom-mpr-engine-${n}`;
  // Per-instance tool group ids so repeated MPR sessions never reuse/leak bindings.
  // The orthographic planes get crosshairs; the 3D pane gets trackball rotation.
  const orthoTgId = `${MPR_TOOL_GROUP_ID}-${n}`;
  const vrTgId = `${MPR_TOOL_GROUP_ID}-vr-${n}`;
  // Any unregistered scheme falls through to the streaming volume loader; the
  // scheme name here is decorative, the id just has to be unique.
  const volumeId = `cornerstoneStreamingImageVolume:orbidicom-mpr-${n}`;
  const ids: Record<MprPane, string> = {
    axial: `mpr-axial-${n}`,
    coronal: `mpr-coronal-${n}`,
    sagittal: `mpr-sagittal-${n}`,
    volume3d: `mpr-3d-${n}`,
  };
  const elOf: Record<MprPane, HTMLDivElement> = els;
  const orthoIds = ORTHO_PANES.map((p) => ids[p]);
  const allIds = [...orthoIds, ids.volume3d];
  let currentPreset: string = "CT-Bone";

  const engine = new RenderingEngine(engineId);
  let destroyed = false;
  let volumeBuilt = false;

  const { OrientationAxis, ViewportType } = Enums;
  engine.setViewports([
    {
      viewportId: ids.axial,
      element: els.axial,
      type: ViewportType.ORTHOGRAPHIC,
      defaultOptions: { orientation: OrientationAxis.AXIAL },
    },
    {
      viewportId: ids.coronal,
      element: els.coronal,
      type: ViewportType.ORTHOGRAPHIC,
      defaultOptions: { orientation: OrientationAxis.CORONAL },
    },
    {
      viewportId: ids.sagittal,
      element: els.sagittal,
      type: ViewportType.ORTHOGRAPHIC,
      defaultOptions: { orientation: OrientationAxis.SAGITTAL },
    },
    {
      viewportId: ids.volume3d,
      element: els.volume3d,
      type: ViewportType.VOLUME_3D,
      defaultOptions: { background: [0, 0, 0] },
    },
  ]);

  const { MouseBindings } = csToolsEnums;

  // Orthographic tool group: crosshairs (reslice) + pan/zoom/scroll.
  const orthoTg = ToolGroupManager.createToolGroup(orthoTgId)!;
  for (const id of orthoIds) orthoTg.addViewport(id, engineId);
  orthoTg.addTool(WindowLevelTool.toolName);
  orthoTg.addTool(PanTool.toolName);
  orthoTg.addTool(ZoomTool.toolName);
  orthoTg.addTool(StackScrollTool.toolName);
  orthoTg.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor: () => "rgb(56, 178, 189)",
  });
  orthoTg.setToolActive(CrosshairsTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  orthoTg.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
  orthoTg.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary_And_Secondary }],
  });
  orthoTg.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // 3D tool group: trackball rotate (primary), zoom (right), pan (middle).
  const vrTg = ToolGroupManager.createToolGroup(vrTgId)!;
  vrTg.addViewport(ids.volume3d, engineId);
  vrTg.addTool(TrackballRotateTool.toolName);
  vrTg.addTool(ZoomTool.toolName);
  vrTg.addTool(PanTool.toolName);
  vrTg.setToolActive(TrackballRotateTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  vrTg.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
  vrTg.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vpOf = (pane: MprPane): any => engine.getViewport(ids[pane]);
  const emitVoi = () => {
    const wl = voiToWl(vpOf("axial")?.getProperties?.()?.voiRange);
    if (wl) cb.onVoi?.(wl);
  };

  return {
    async setVolume(imageIds: string[], opts: { modality?: string } = {}) {
      if (destroyed || imageIds.length === 0) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vol = (await volumeLoader.createAndCacheVolume(volumeId, { imageIds })) as any;
        // The volume is cached now, so mark it built BEFORE the teardown check,
        // otherwise a destroy() that raced the await would skip cache eviction and
        // leak the (large) volume. If we already tore down, evict it right here.
        volumeBuilt = true;
        if (destroyed) {
          try {
            cache.removeVolumeLoadObject(volumeId);
          } catch {
            /* not cached / already evicted */
          }
          return;
        }
        vol?.load?.(); // progressive streaming load
        // Re-check before the next await: a destroy() that raced this point has
        // already evicted the volume (volumeBuilt was set above), and the engine's
        // viewports are gone, so calling setVolumesForViewports would throw.
        if (destroyed) return;
        await setVolumesForViewports(engine, [{ volumeId }], allIds);
        if (destroyed) return;
        // Light the 3D pane with a modality-appropriate VR preset.
        currentPreset = defaultVrPreset(opts.modality);
        vpOf("volume3d")?.setProperties?.({ preset: currentPreset }, volumeId);
        engine.render();
        cb.onReady?.();
        emitVoi();
      } catch (e) {
        cb.onError?.(e);
      }
    },
    setWindowLevel(ww: number, wc: number) {
      if (destroyed) return;
      const voiRange = { lower: wc - ww / 2, upper: wc + ww / 2 };
      // Window/Level only applies to the grayscale planes; the 3D pane is driven
      // by its rendering preset, not a VOI range.
      for (const pane of ORTHO_PANES) vpOf(pane)?.setProperties?.({ voiRange }, volumeId);
      engine.render();
    },
    setPreset(preset: string) {
      if (destroyed) return;
      currentPreset = preset;
      vpOf("volume3d")?.setProperties?.({ preset }, volumeId);
      engine.render();
    },
    reset() {
      if (destroyed) return;
      for (const pane of ORTHO_PANES) {
        const vp = vpOf(pane);
        vp?.resetProperties?.();
        vp?.resetCamera?.();
      }
      // resetProperties on the 3D pane would clear the active preset, so reset the
      // camera only, then re-assert the current preset.
      const vr = vpOf("volume3d");
      vr?.resetCamera?.();
      vr?.setProperties?.({ preset: currentPreset }, volumeId);
      engine.render();
      emitVoi();
    },
    async captureJpeg(pane: MprPane = "axial", quality = 0.95) {
      if (destroyed) return null;
      const vp = vpOf(pane);
      vp?.render?.();
      await nextFrame();
      if (destroyed) return null;
      const canvas: HTMLCanvasElement | null =
        (typeof vp?.getCanvas === "function" ? vp.getCanvas() : null) ??
        elOf[pane].querySelector("canvas");
      if (!canvas) return null;
      return compositeSliceJpeg(elOf[pane], canvas, quality);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const id of [orthoTgId, vrTgId]) {
        try {
          ToolGroupManager.destroyToolGroup(id);
        } catch {
          /* group may already be gone */
        }
      }
      try {
        engine.destroy();
      } catch {
        /* mid-teardown */
      }
      // Volumes are large (GPU texture + RAM); evict if it was actually cached.
      try {
        if (volumeBuilt) cache.removeVolumeLoadObject(volumeId);
      } catch {
        /* never cached / already evicted */
      }
    },
  };
}
