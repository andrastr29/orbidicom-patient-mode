/**
 * Synchronized scrolling across grid cells — scroll one viewport, the others
 * follow to the same anatomical level.
 *
 * The sync is **position-based, not index-based**: Cornerstone's image-slice
 * synchronizer reads the source slice's `imagePositionPatient` and jumps each
 * target to its nearest slice. Two series with different slice counts or spacing
 * (the T1 / T2 case) therefore stay anatomically aligned instead of drifting
 * apart, and a series that shares no frame of reference with the source is
 * registered on the fly (`calculateViewportsSpatialRegistration`).
 *
 * Only coplanar viewports participate — the synchronizer itself skips a target
 * whose plane differs from the source's (axial ↔ sagittal simply does nothing,
 * which is the honest answer: there is no matching slice to jump to).
 *
 * Parallel to reference lines: this moves the other viewports, that only draws
 * on them. The two are independent toggles and compose freely.
 */
import { synchronizers, SynchronizerManager, type Synchronizer } from "@cornerstonejs/tools";
import { STACK_ENGINE_ID } from "./stack";

export interface ScrollSyncHandle {
  /**
   * Declare the exact set of viewports that should scroll together. Idempotent
   * and diffing: pass the full set on every change (cells loading, the grid
   * resizing, the feature toggling off with `[]`) and the handle adds/removes
   * only what actually changed.
   *
   * Fewer than two viewports means nothing to synchronize, so the set is cleared.
   */
  setViewports: (viewportIds: readonly string[]) => void;
  /** Currently synchronized viewport ids, in insertion order (for tests/debug). */
  getViewports: () => string[];
  destroy: () => void;
}

let syncSeq = 0;

/**
 * Create a scroll synchronizer over one rendering engine's stack viewports.
 * The synchronizer is created lazily on the first non-empty `setViewports`, so a
 * viewer that never turns the feature on pays nothing.
 */
export function createScrollSync(renderingEngineId: string = STACK_ENGINE_ID): ScrollSyncHandle {
  // Cornerstone keeps synchronizers in a global registry keyed by id and throws
  // on a duplicate, so each handle claims its own id for its whole lifetime.
  const synchronizerId = `orbidicom-scroll-sync-${syncSeq++}`;
  let sync: Synchronizer | null = null;
  let destroyed = false;
  // Insertion-ordered mirror of the synchronizer's membership. Cornerstone can
  // report members, but keeping our own set makes the diff below trivial.
  const members = new Set<string>();

  const detach = (viewportId: string) => {
    members.delete(viewportId);
    try {
      sync?.remove({ renderingEngineId, viewportId });
    } catch {
      /* viewport already gone with its engine — nothing left to detach */
    }
  };

  return {
    setViewports(viewportIds) {
      if (destroyed) return;
      // A lone viewport has nothing to follow; treat it the same as "off" so the
      // caller can pass the live cell list without special-casing 1×1 layouts.
      const wanted = new Set(viewportIds.length > 1 ? viewportIds : []);

      for (const id of [...members]) if (!wanted.has(id)) detach(id);
      if (wanted.size === 0) return;

      if (!sync) sync = synchronizers.createImageSliceSynchronizer(synchronizerId);
      for (const viewportId of wanted) {
        if (members.has(viewportId)) continue;
        // Every member is both a source and a target: scrolling any one of them
        // drives all the others.
        sync.add({ renderingEngineId, viewportId });
        members.add(viewportId);
      }
    },
    getViewports() {
      return [...members];
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      members.clear();
      if (!sync) return;
      sync = null;
      // destroySynchronizer (not synchronizer.destroy) — it also drops the entry
      // from Cornerstone's global registry, which is what frees the id.
      try {
        SynchronizerManager.destroySynchronizer(synchronizerId);
      } catch {
        /* already gone */
      }
    },
  };
}
