import { Enums, cache, eventTarget, imageLoader, imageLoadPoolManager } from "@cornerstonejs/core";

const REQUEST_TYPE = Enums.RequestType.Prefetch;

/**
 * How many frames we keep handed to the shared request pool at once.
 *
 * This is the crux of the design. Cornerstone's own stackPrefetch dumps the
 * ENTIRE series into the pool up front, so scrolling mid-warm-up had to wait out
 * a queue of hundreds of now-stale frames before the newly-nearest ones ran —
 * jump to slice 300 of 400 and the pool kept grinding through 40, 41, 42. A
 * queue this short drains in about one round-trip, so a slice change re-centers
 * almost immediately. Twice the Prefetch concurrency set in init.ts: enough to
 * keep the pipe full, short enough to stay fresh.
 */
export const QUEUE_DEPTH = 20;

/** A scrub fires a slice change per frame; only where it comes to rest matters. */
const RECENTER_DEBOUNCE_MS = 100;

export interface Prefetcher {
  /** Re-order the queue around `index`. Debounced; safe to call per slice change. */
  recenter: (index: number) => void;
  destroy: () => void;
}

const NOOP: Prefetcher = { recenter() {}, destroy() {} };

/**
 * Warms an entire stack into the Cornerstone image cache in the background,
 * always fetching the frames nearest the current slice first.
 *
 * One per stack viewport. Every viewport shares the one global request pool, so
 * this only ever touches its OWN requests in it — a neighbouring grid cell's
 * queued frames must survive our re-centering, or scrolling one cell would
 * silently stall the warm-up of the others.
 */
export function createPrefetcher(imageIds: string[]): Prefetcher {
  if (imageIds.length <= 1) return NOOP;

  const indexOf = new Map(imageIds.map((id, i) => [id, i]));
  /** Frames we still want but have not handed to the pool. Disjoint from `active`. */
  const pending = new Set<number>();
  /** Frames handed to the pool: queued in it, or already in flight. */
  const active = new Set<number>();

  let center = 0;
  /** `pending` ordered by distance from `center`, consumed by pump(). */
  let order: number[] = [];
  let orderDirty = true;
  let destroyed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const isLoaded = (id: string): boolean => {
    try {
      return cache.isLoaded(id);
    } catch {
      return false; // isLoaded is best-effort
    }
  };

  imageIds.forEach((id, i) => {
    if (!isLoaded(id)) pending.add(i);
  });

  const request = (i: number, id: string): void => {
    const settle = () => {
      // Either way the slot is freed. A frame that failed is NOT re-queued: a bad
      // frame must not spin the queue forever.
      active.delete(i);
      pump();
    };
    // Priority stays 0 even though the pool sorts priority groups ascending, so
    // `|i - center|` looks tempting. RequestPoolManager keys those groups in a
    // plain object it never prunes, so a 2000-slice series would leave 2000 empty
    // arrays behind for getSortedPriorityGroups() to walk on every drain. In a
    // queue this short, insertion order is the only order that matters anyway.
    try {
      imageLoadPoolManager.addRequest(
        () =>
          imageLoader
            .loadAndCacheImage(id, { requestType: REQUEST_TYPE, priority: 0 })
            .then(settle, settle),
        REQUEST_TYPE,
        { imageId: id },
        0,
      );
    } catch {
      active.delete(i); // prefetch is an optimization; never let it break loading
    }
  };

  function pump(): void {
    if (destroyed) return;
    if (orderDirty) {
      order = [...pending].sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
      orderDirty = false;
    }
    while (active.size < QUEUE_DEPTH) {
      const i = order.shift();
      if (i === undefined) return;
      if (!pending.has(i)) continue; // already taken by an earlier pump
      pending.delete(i);
      const id = imageIds[i]!; // `order` only ever holds indices seeded from imageIds
      if (isLoaded(id)) continue; // landed in cache while it sat in `order`
      active.add(i);
      request(i, id);
    }
  }

  const reorder = (): void => {
    if (destroyed) return;
    // Reclaim what we queued but that has not started, so it can be re-sorted
    // around the new cursor. The pool shift()s a request out of the queue before
    // running it, so anything still IN the pool has not begun — which makes this
    // callback an exact list of what is safe to take back. In-flight frames are
    // not cancellable and simply run to completion.
    imageLoadPoolManager.filterRequests((req) => {
      if (req.type !== REQUEST_TYPE) return true;
      const id = req.additionalDetails?.imageId;
      const i = id === undefined ? undefined : indexOf.get(id);
      if (i === undefined || !active.has(i)) return true; // not ours — leave it alone
      active.delete(i);
      pending.add(i);
      return false;
    });
    orderDirty = true;
    pump();
  };

  eventTarget.addEventListener(Enums.Events.IMAGE_CACHE_IMAGE_REMOVED, onCacheRemoved);
  pump();

  function onCacheRemoved(e: Event): void {
    const id = (e as CustomEvent).detail?.imageId as string | undefined;
    const i = id === undefined ? undefined : indexOf.get(id);
    if (i === undefined || active.has(i) || pending.has(i)) return;
    // Evicted under cache pressure — we still want it, so put it back in line.
    pending.add(i);
    orderDirty = true;
    pump();
  }

  return {
    recenter(index: number) {
      if (destroyed) return;
      center = index;
      timer ??= setTimeout(() => {
        timer = undefined;
        reorder();
      }, RECENTER_DEBOUNCE_MS);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(timer);
      eventTarget.removeEventListener(Enums.Events.IMAGE_CACHE_IMAGE_REMOVED, onCacheRemoved);
      // Drop our not-yet-started requests from the shared pool; leave everyone else's.
      imageLoadPoolManager.filterRequests(
        (req) =>
          req.type !== REQUEST_TYPE ||
          req.additionalDetails?.imageId === undefined ||
          !indexOf.has(req.additionalDetails.imageId),
      );
      pending.clear();
      active.clear();
    },
  };
}
