import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface FakeRequest {
  requestFn: () => Promise<unknown>;
  type: string;
  additionalDetails: { imageId?: string };
}

const h = vi.hoisted(() => {
  const PREFETCH = "prefetch";
  const CACHE_REMOVED = "cacheRemoved";
  // Frames the cache reports as already decoded.
  const loaded = new Set<string>();
  // Requests sitting in the pool, NOT yet started. The real pool shift()s a
  // request out before running it, so "in the pool" == "not started" — the
  // distinction the prefetcher's reclaim logic depends on.
  const queue: FakeRequest[] = [];
  // In-flight loads, keyed by imageId, resolved/rejected by the test.
  const inFlight = new Map<string, { resolve: () => void; reject: (e: unknown) => void }>();
  const listeners = new Map<string, ((e: Event) => void)[]>();

  return {
    PREFETCH,
    CACHE_REMOVED,
    loaded,
    queue,
    inFlight,
    listeners,
    pool: {
      addRequest: vi.fn(
        (
          requestFn: () => Promise<unknown>,
          type: string,
          additionalDetails: { imageId?: string },
        ) => {
          queue.push({ requestFn, type, additionalDetails });
        },
      ),
      filterRequests: vi.fn((keep: (r: FakeRequest) => boolean) => {
        const survivors = queue.filter((r) => keep(r));
        queue.length = 0;
        queue.push(...survivors);
      }),
    },
    imageLoader: {
      loadAndCacheImage: vi.fn(
        (imageId: string) =>
          new Promise<void>((resolve, reject) => {
            inFlight.set(imageId, {
              resolve: () => {
                loaded.add(imageId);
                inFlight.delete(imageId);
                resolve();
              },
              reject: (e: unknown) => {
                inFlight.delete(imageId);
                reject(e);
              },
            });
          }),
      ),
    },
    cache: { isLoaded: vi.fn((id: string) => loaded.has(id)) },
    eventTarget: {
      addEventListener: vi.fn((type: string, fn: (e: Event) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      }),
      removeEventListener: vi.fn((type: string, fn: (e: Event) => void) => {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((f) => f !== fn),
        );
      }),
    },
  };
});

vi.mock("@cornerstonejs/core", () => ({
  Enums: {
    RequestType: { Prefetch: h.PREFETCH, Interaction: "interaction" },
    Events: { IMAGE_CACHE_IMAGE_REMOVED: h.CACHE_REMOVED },
  },
  eventTarget: h.eventTarget,
  cache: h.cache,
  imageLoader: h.imageLoader,
  imageLoadPoolManager: h.pool,
}));

import { createPrefetcher, QUEUE_DEPTH } from "../src/cornerstone/prefetch";

const { PREFETCH, CACHE_REMOVED } = h;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `img:${i}`);
/** Index of each frame currently queued in the pool, in queue order. */
const queuedIndices = () =>
  h.queue.map((r) => Number(r.additionalDetails.imageId!.replace("img:", "")));

/** Start the `n` frontmost pooled requests, as the real pool's drain would. */
function drain(n: number): void {
  for (const req of h.queue.splice(0, n)) void req.requestFn();
}

/** Settle an in-flight load, then let the prefetcher's `.then` handler run. */
async function complete(index: number): Promise<void> {
  h.inFlight.get(`img:${index}`)!.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function fail(index: number): Promise<void> {
  h.inFlight.get(`img:${index}`)!.reject(new Error("bad frame"));
  await Promise.resolve();
  await Promise.resolve();
}

function evict(index: number): void {
  h.loaded.delete(`img:${index}`);
  for (const fn of h.listeners.get(CACHE_REMOVED) ?? []) {
    fn({ detail: { imageId: `img:${index}` } } as unknown as Event);
  }
}

describe("createPrefetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    h.loaded.clear();
    h.queue.length = 0;
    h.inFlight.clear();
    h.listeners.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues no more than QUEUE_DEPTH frames at a time", () => {
    createPrefetcher(ids(400));
    expect(h.queue.length).toBe(QUEUE_DEPTH);
  });

  it("queues the frames nearest the opening slice first", () => {
    createPrefetcher(ids(400));
    // Series opens at index 0, so nearest-first is simply ascending.
    expect(queuedIndices().slice(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it("refills as frames settle, so the whole series is eventually requested", async () => {
    const total = 40;
    createPrefetcher(ids(total));
    const requested = new Set<string>();

    // Drain and settle until the prefetcher stops handing out work.
    for (let guard = 0; guard < 200 && (h.queue.length || h.inFlight.size); guard++) {
      const starting = [...h.queue];
      drain(starting.length);
      for (const r of starting) requested.add(r.additionalDetails.imageId!);
      for (const r of starting) await complete(Number(r.additionalDetails.imageId!.slice(4)));
    }

    expect(requested.size).toBe(total);
  });

  it("does not request frames already in the cache", () => {
    for (let i = 0; i < 10; i++) h.loaded.add(`img:${i}`);
    createPrefetcher(ids(400));
    expect(queuedIndices()).not.toContain(5);
    expect(queuedIndices()[0]).toBe(10);
  });

  it("re-centers the queue on the new slice, nearest-first in both directions", () => {
    const p = createPrefetcher(ids(400));
    // Nothing has started, so the whole queue is still reclaimable.
    p.recenter(300);
    vi.advanceTimersByTime(200);

    expect(queuedIndices().slice(0, 5)).toEqual([300, 299, 301, 298, 302]);
  });

  it("leaves other viewports' pooled requests untouched when re-centering", () => {
    const p = createPrefetcher(ids(400));
    // A neighbouring grid cell's prefetch and an interaction fetch, sharing the
    // one global pool. Wiping these is the exact bug this design exists to avoid.
    const foreign: FakeRequest = {
      requestFn: async () => {},
      type: PREFETCH,
      additionalDetails: { imageId: "other-series:7" },
    };
    const interaction: FakeRequest = {
      requestFn: async () => {},
      type: "interaction",
      additionalDetails: { imageId: "img:0" },
    };
    h.queue.push(foreign, interaction);

    p.recenter(300);
    vi.advanceTimersByTime(200);

    expect(h.queue).toContain(foreign);
    expect(h.queue).toContain(interaction);
  });

  it("cannot reclaim a frame that already started loading", () => {
    const p = createPrefetcher(ids(400));
    drain(QUEUE_DEPTH); // every queued frame is now in flight
    p.recenter(300);
    vi.advanceTimersByTime(200);

    // The in-flight frames occupy their slots until they settle, so only the
    // remaining capacity is re-centered — and none of 0..19 is re-queued.
    expect(queuedIndices()).not.toContain(0);
    expect(queuedIndices().length).toBe(0);
  });

  it("debounces a scrub into a single re-center on the final slice", () => {
    const p = createPrefetcher(ids(400));
    for (let i = 1; i <= 50; i++) p.recenter(i);
    vi.advanceTimersByTime(200);

    expect(h.pool.filterRequests).toHaveBeenCalledTimes(1);
    expect(queuedIndices()[0]).toBe(50);
  });

  it("issues no requests for a single-frame stack", () => {
    createPrefetcher(["img:0"]);
    expect(h.pool.addRequest).not.toHaveBeenCalled();
  });

  it("re-queues a frame evicted from the cache, ahead of more distant ones", async () => {
    createPrefetcher(ids(40));
    drain(QUEUE_DEPTH);
    await complete(3); // frame 3 is cached, so frame 20 takes its slot
    expect(queuedIndices()).not.toContain(3);

    evict(3);
    // The queue is already at capacity, so frame 3 waits rather than overflowing
    // it — but as the nearest frame we still want, it takes the next free slot.
    await complete(4);

    expect(queuedIndices()).toContain(3);
  });

  it("drops a frame that fails to load rather than retrying it", async () => {
    createPrefetcher(ids(40));
    drain(QUEUE_DEPTH);
    await fail(3);

    // The failed frame frees its slot to the next frame we want, so the queue
    // keeps moving — but it never comes back. A frame that cannot load must not
    // spin the queue forever.
    expect(queuedIndices()).toEqual([20]);
    for (let guard = 0; guard < 100 && (h.queue.length || h.inFlight.size); guard++) {
      drain(h.queue.length);
      for (const id of [...h.inFlight.keys()]) await complete(Number(id.slice(4)));
    }
    const attempts = h.imageLoader.loadAndCacheImage.mock.calls.filter(
      ([id]) => id === "img:3",
    ).length;
    expect(attempts).toBe(1);
  });

  it("removes its own pooled requests on destroy, and no one else's", () => {
    const p = createPrefetcher(ids(400));
    const foreign: FakeRequest = {
      requestFn: async () => {},
      type: PREFETCH,
      additionalDetails: { imageId: "other-series:7" },
    };
    h.queue.push(foreign);

    p.destroy();

    expect(h.queue).toEqual([foreign]);
    expect(h.eventTarget.removeEventListener).toHaveBeenCalledWith(
      CACHE_REMOVED,
      expect.any(Function),
    );
  });
});
