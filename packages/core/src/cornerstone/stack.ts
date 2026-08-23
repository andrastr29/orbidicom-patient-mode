import {
  RenderingEngine,
  Enums,
  eventTarget,
  cache,
  metaData,
  type Types,
} from "@cornerstonejs/core";
import { ToolGroupManager, utilities as csToolsUtils, annotation } from "@cornerstonejs/tools";
import { TOOL_GROUP_ID } from "./init";
import { createPrefetcher, type Prefetcher } from "./prefetch";
import { voiToWl, nextFrame, compositeSliceJpeg, type WindowLevel } from "./capture";
import { renderSegmentation, removeSegmentationFromViewport } from "./seg";
import type { SegmentationData } from "../datasource";

export type { WindowLevel };

let seq = 0;

// All stack viewports (grid cells + the offscreen thumbnailer) share ONE
// RenderingEngine. Cornerstone 5's default engine (ContextPoolRenderingEngine)
// EAGERLY allocates a pool of `webGlContextCount` (=7 by default) WebGL contexts
// PER engine, so a fresh engine per grid cell burned ~7 contexts each. A 2×2 grid
// then demanded ~28 contexts and blew past the browser's ~16-context ceiling; the
// browser discards the OLDEST context, so the first-loaded cell went black, and
// stayed black, since there is no context-restore path and reselecting a series
// reuses the same dead engine. One shared engine keeps every cell's viewport in a
// single bounded 7-context pool (the pool spreads viewports across its contexts),
// exactly how createMprView already drives its four panes from one engine.
/**
 * Id of that one shared engine. Exported because anything that has to name a
 * stack viewport to Cornerstone (scroll synchronizers, reference lines) needs
 * the `{ renderingEngineId, viewportId }` pair, and this is the engine half.
 */
export const STACK_ENGINE_ID = "orbidicom-stack-engine";
const SHARED_ENGINE_ID = STACK_ENGINE_ID;
let sharedEngine: RenderingEngine | null = null;
// Live viewports on the shared engine, so it is torn down only once the last cell
// (or the thumbnailer) is gone, and lazily rebuilt on the next createStack.
let liveViewports = 0;

function acquireEngine(): RenderingEngine {
  if (!sharedEngine) sharedEngine = new RenderingEngine(SHARED_ENGINE_ID);
  liveViewports++;
  return sharedEngine;
}

// Remove one cell's viewport from the shared engine + tool group without
// disturbing the others; destroy the engine only when it holds no more viewports.
function releaseEngine(viewportId: string, toolGroupId: string | null): void {
  const engine = sharedEngine;
  if (!engine) return;
  if (toolGroupId) {
    try {
      ToolGroupManager.getToolGroup(toolGroupId)?.removeViewports(SHARED_ENGINE_ID, viewportId);
    } catch {
      /* tool group already gone */
    }
  }
  try {
    engine.disableElement(viewportId);
  } catch {
    /* viewport already removed / engine mid-teardown */
  }
  liveViewports = Math.max(0, liveViewports - 1);
  if (liveViewports === 0) {
    try {
      engine.destroy();
    } catch {
      /* mid-teardown */
    }
    sharedEngine = null;
  }
}

export interface SliceInfo {
  index: number;
  count: number;
}
export interface PrefetchProgress {
  /** Frames decoded into cache so far. */
  loaded: number;
  /** Total frames in the current stack. */
  total: number;
}
export interface StackCallbacks {
  onSlice?: (s: SliceInfo) => void;
  onVoi?: (wl: WindowLevel) => void;
  onReady?: () => void;
  /** Background warm-up progress as stackPrefetch decodes the series. */
  onPrefetch?: (p: PrefetchProgress) => void;
}

export interface StackHandle {
  setStack: (imageIds: string[]) => Promise<void>;
  setWindowLevel: (ww: number, wc: number) => void;
  scroll: (delta: number) => void;
  setIndex: (index: number) => void;
  playCine: (fps: number) => void;
  stopCine: () => void;
  invert: () => void;
  rotate: () => void;
  flipH: () => void;
  reset: () => void;
  clearAnnotations: () => void;
  /**
   * Re-render the annotation SVG overlay for this viewport after the global
   * annotation state changed elsewhere (e.g. an undo/redo). State is global; the
   * overlay only updates when a render is triggered for this element.
   */
  refreshAnnotations: () => void;
  /**
   * This cell's Cornerstone viewport id, paired with {@link STACK_ENGINE_ID} to
   * address the viewport in engine-level APIs (scroll sync, reference lines).
   * Stable for the handle's lifetime.
   */
  getViewportId: () => string;
  /**
   * The live Cornerstone stack viewport for this cell. Used by the UI overlay to
   * project annotation world coordinates to canvas pixels (worldToCanvas) and to
   * read the current image id. Read-only use: do not mutate state through it.
   */
  getViewport: () => Types.IStackViewport;
  /**
   * Draw a decoded DICOM-SEG as a labelmap over this stack. Resolves to false (a
   * no-op) if none of the SEG's source images are in the current stack.
   */
  showSegmentation: (data: SegmentationData, segmentationId: string) => Promise<boolean>;
  /** Remove a previously-shown segmentation's labelmap from this stack. */
  hideSegmentation: (segmentationId: string) => void;
  /**
   * Composite the active slice (rendered image + the measurement/annotation SVG
   * overlay) into an opaque JPEG Blob. Does NOT include the metadata text overlay
   * (that's a separate DOM layer outside the viewport canvas/SVG). Resolves to the
   * Blob; the caller triggers the download. Resolves null if the viewport is
   * destroyed or has no rendered image canvas (e.g. report/SR/PDF cells).
   * @param quality JPEG quality 0..1 (default 0.95, visually lossless).
   */
  captureSliceJpeg: (quality?: number) => Promise<Blob | null>;
  destroy: () => void;
}

export interface StackOptions {
  /**
   * Tool group this viewport joins, or `null` to join none. Defaults to the
   * viewer's shared group.
   *
   * The offscreen thumbnailer passes `null`. It needs no interaction, and group
   * membership is not free: display-only tools draw into *every* viewport in the
   * group, so reference lines would be composited straight into the thumbnail
   * JPEGs (captureSliceJpeg includes the annotation SVG layer).
   */
  toolGroupId?: string | null;
}

export function createStack(
  element: HTMLDivElement,
  cb: StackCallbacks = {},
  opts: StackOptions = {},
): StackHandle {
  const n = seq++;
  const viewportId = `stack-${n}`;
  const toolGroupId = opts.toolGroupId === undefined ? TOOL_GROUP_ID : opts.toolGroupId;
  const engine = acquireEngine();
  engine.enableElement({ viewportId, type: Enums.ViewportType.STACK, element });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vp = engine.getViewport(viewportId) as any;
  if (toolGroupId) {
    ToolGroupManager.getToolGroup(toolGroupId)?.addViewport(viewportId, SHARED_ENGINE_ID);
  }

  let count = 0;
  let cineOn = false;
  let destroyed = false;
  // Track view transforms locally, because reading them back from the viewport is
  // unreliable, which made rotate not advance and flip not toggle.
  let rotation = 0;
  let flippedH = false;

  // Re-fit on layout/orientation change (was rendering stretched on mobile).
  const ro = new ResizeObserver(() => {
    if (destroyed) return;
    try {
      engine.resize(true, false);
    } catch {
      /* mid-teardown */
    }
  });
  ro.observe(element);

  const emitSlice = () => cb.onSlice?.({ index: vp.getCurrentImageIdIndex?.() ?? 0, count });
  const emitVoi = () => {
    const wl = voiToWl(vp.getProperties?.()?.voiRange);
    if (wl) cb.onVoi?.(wl);
  };

  // The listener is element-scoped, so every slice change for THIS viewport
  // fires it. (The old detail.element guard never matched -> counter stuck at 1.)
  const onStackNewImage = (e: Event) => {
    const idx = (e as CustomEvent).detail?.imageIdIndex;
    const index = typeof idx === "number" ? idx : (vp.getCurrentImageIdIndex?.() ?? 0);
    cb.onSlice?.({ index, count });
    // Warm outward from where the user actually is, not from where the series
    // was opened; otherwise scrolling ahead of the warm region stays slow.
    prefetcher?.recenter(index);
  };
  const onVoiModified = (e: Event) => {
    if ((e as CustomEvent).detail?.viewportId === viewportId) emitVoi();
  };
  let readyFired = false;
  const onRendered = (e: Event) => {
    if (!readyFired && (e as CustomEvent).detail?.viewportId === viewportId) {
      readyFired = true;
      cb.onReady?.();
    }
  };

  // Background warm-up progress. stackPrefetch decodes the whole series into the
  // shared cache; we count how many of THIS stack's frames have landed so the UI
  // can show a non-blocking "caching" bar while the user already scrolls.
  let stackIds = new Set<string>();
  const loadedIds = new Set<string>();
  let prefetcher: Prefetcher | null = null;
  const emitPrefetch = () => cb.onPrefetch?.({ loaded: loadedIds.size, total: stackIds.size });
  // The cache event is global (all viewports share one cache), so filter to the
  // ids that belong to this stack before counting.
  const onCacheAdded = (e: Event) => {
    const id = (e as CustomEvent).detail?.image?.imageId as string | undefined;
    if (id && stackIds.has(id) && !loadedIds.has(id)) {
      loadedIds.add(id);
      emitPrefetch();
    }
  };

  element.addEventListener(Enums.Events.STACK_NEW_IMAGE, onStackNewImage as EventListener);
  eventTarget.addEventListener(Enums.Events.VOI_MODIFIED, onVoiModified as EventListener);
  element.addEventListener(Enums.Events.IMAGE_RENDERED, onRendered as EventListener);
  eventTarget.addEventListener(Enums.Events.IMAGE_CACHE_IMAGE_ADDED, onCacheAdded as EventListener);

  // Redraw the annotation SVG overlay for this viewport. The annotation *state*
  // is global (and may have been mutated elsewhere by undo/redo or clear); the
  // drawn overlay only updates when a render is triggered for this element.
  const refreshAnnotationOverlay = () => {
    csToolsUtils.triggerAnnotationRenderForViewportIds([viewportId]);
    vp.render();
  };

  return {
    async setStack(imageIds: string[]) {
      if (destroyed || imageIds.length === 0) return;
      count = imageIds.length;
      readyFired = false;
      rotation = 0;
      flippedH = false;
      // Reset warm-up tracking for the new series. Pre-seed with frames already
      // in cache (e.g. revisiting a series) so progress reflects reality and the
      // bar doesn't get stuck below 100% when no new cache events will fire.
      stackIds = new Set(imageIds);
      loadedIds.clear();
      for (const id of imageIds) {
        try {
          if (cache.isLoaded(id)) loadedIds.add(id);
        } catch {
          /* isLoaded is best-effort */
        }
      }
      emitPrefetch();
      await vp.setStack(imageIds, 0);
      vp.render();
      emitSlice();
      emitVoi();
      // Warm the ENTIRE series in the background so the first scroll/cine pass
      // doesn't pay a network round-trip + decode per slice. Frames go into the
      // low-priority Prefetch pool nearest-to-current first, so the active slice
      // (Interaction priority) always preempts the warm-up.
      //
      // NOT cornerstone's stackPrefetch: it re-centers by clearing the entire
      // GLOBAL prefetch pool, which would wipe every other grid cell's queued
      // frames, and an idle cell only re-queues on its own slice change, so it
      // would never recover. See ./prefetch.
      prefetcher?.destroy();
      prefetcher = createPrefetcher(imageIds);
    },
    setWindowLevel(ww: number, wc: number) {
      if (destroyed) return;
      vp.setProperties({ voiRange: { lower: wc - ww / 2, upper: wc + ww / 2 } });
      vp.render();
    },
    scroll(delta: number) {
      if (destroyed) return;
      vp.scroll(delta);
    },
    setIndex(index: number) {
      if (destroyed) return;
      vp.setImageIdIndex(Math.max(0, Math.min(count - 1, index)));
    },
    playCine(fps: number) {
      if (destroyed || cineOn) return;
      cineOn = true;
      csToolsUtils.cine.playClip(element, { framesPerSecond: fps, loop: true });
    },
    stopCine() {
      if (destroyed || !cineOn) return;
      cineOn = false;
      csToolsUtils.cine.stopClip(element);
    },
    invert() {
      if (destroyed) return;
      vp.setProperties({ invert: !vp.getProperties().invert });
      vp.render();
    },
    rotate() {
      if (destroyed) return;
      rotation = (rotation + 90) % 360;
      vp.setViewPresentation({ rotation });
      vp.render();
    },
    flipH() {
      if (destroyed) return;
      // flip() mirrors the camera on every call (a real toggle). setViewPresentation
      // ({flipHorizontal}) can't undo a flip, so we track + call flip() each time.
      flippedH = !flippedH;
      vp.flip({ flipHorizontal: true });
    },
    reset() {
      if (destroyed) return;
      rotation = 0;
      flippedH = false;
      vp.resetProperties();
      vp.resetCamera(); // restores flip (flipHorizontal:false) + initial viewUp
      vp.setViewPresentation({ rotation: 0 });
      vp.render();
      emitVoi();
    },
    clearAnnotations() {
      if (destroyed) return;
      annotation.state.removeAllAnnotations();
      // removeAllAnnotations() only clears state; the drawn measurements stay on
      // the SVG overlay until an annotation render is triggered for this element.
      refreshAnnotationOverlay();
    },
    refreshAnnotations() {
      if (destroyed) return;
      refreshAnnotationOverlay();
    },
    getViewportId() {
      return viewportId;
    },
    getViewport() {
      return vp as Types.IStackViewport;
    },
    async showSegmentation(data: SegmentationData, segmentationId: string) {
      if (destroyed) return false;
      // Pair each current image id with its SOP Instance UID (from Cornerstone's
      // metadata) so the labelmap rasters can be aligned to the right slices.
      const stack = [...stackIds].map((imageId) => ({
        imageId,
        sopInstanceUID: String(
          (metaData.get("sopCommonModule", imageId) as { sopInstanceUID?: string } | undefined)
            ?.sopInstanceUID ?? "",
        ),
      }));
      const drawn = await renderSegmentation({ viewportId, segmentationId, stack, data });
      if (drawn) vp.render();
      return drawn;
    },
    hideSegmentation(segmentationId: string) {
      if (destroyed) return;
      removeSegmentationFromViewport(viewportId, segmentationId);
      vp.render();
    },
    async captureSliceJpeg(quality = 0.95) {
      if (destroyed) return null;
      // render() is rAF-deferred: flush it and wait a frame so the 2D canvas
      // holds the current slice even right after a slice/transform change.
      vp.render?.();
      await nextFrame();
      if (destroyed) return null;
      const canvas: HTMLCanvasElement | null =
        (typeof vp.getCanvas === "function" ? vp.getCanvas() : null) ??
        element.querySelector("canvas");
      if (!canvas) return null;
      return compositeSliceJpeg(element, canvas, quality);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ro.disconnect();
      prefetcher?.destroy();
      prefetcher = null;
      if (cineOn) {
        try {
          csToolsUtils.cine.stopClip(element);
        } catch {
          /* ignore */
        }
      }
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onStackNewImage as EventListener);
      eventTarget.removeEventListener(Enums.Events.VOI_MODIFIED, onVoiModified as EventListener);
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, onRendered as EventListener);
      eventTarget.removeEventListener(
        Enums.Events.IMAGE_CACHE_IMAGE_ADDED,
        onCacheAdded as EventListener,
      );
      // Remove just THIS cell's viewport; the shared engine (and its WebGL
      // contexts) lives on for the other cells until the last one is released.
      releaseEngine(viewportId, toolGroupId);
    },
  };
}
