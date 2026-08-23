import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// prefetch.spec.ts drives the prefetcher against a fake pool, which is where the
// queueing logic is pinned. This file does the opposite: it wires the prefetcher
// to the REAL Cornerstone RequestPoolManager, so the assumptions the design rests
// on are checked against the actual implementation rather than my model of it.
// that addRequest drains synchronously, that a request still sitting in the pool
// has not started, and above all that filterRequests spares everyone else's work.
const h = vi.hoisted(() => ({
  starts: [] as string[],
  resolvers: new Map<string, () => void>(),
}));

vi.mock("@cornerstonejs/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cornerstonejs/core")>();
  return {
    ...actual,
    // The only fake: never actually fetch a frame. Everything else (the pool,
    // its queue, its concurrency accounting, filterRequests) is the real thing.
    imageLoader: {
      loadAndCacheImage: (imageId: string) =>
        new Promise<void>((resolve) => {
          h.starts.push(imageId);
          h.resolvers.set(imageId, () => {
            h.resolvers.delete(imageId);
            resolve();
          });
        }),
    },
  };
});

import { Enums, imageLoadPoolManager } from "@cornerstonejs/core";
import { createPrefetcher, type Prefetcher } from "../src/cornerstone/prefetch";

const PREFETCH = Enums.RequestType.Prefetch;
/** The real pool schedules its next drain through `window`, absent in node. */
vi.stubGlobal("window", {
  setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
  clearTimeout: (id: unknown) => clearTimeout(id as never),
});

const ids = (n: number) => Array.from({ length: n }, (_, i) => `img:${i}`);
const IN_FLIGHT = 4; // Prefetch concurrency, shrunk from init.ts's 10 to keep this legible

/** imageIds still queued (i.e. NOT yet started) in the real pool. */
const pooled = (): string[] =>
  Object.values(imageLoadPoolManager.getRequestPool()[PREFETCH])
    .flat()
    .map((r) => r.additionalDetails.imageId as string);

const settleAll = async () => {
  for (const resolve of [...h.resolvers.values()]) resolve();
  await vi.advanceTimersByTimeAsync(20); // let the pool's grabDelay drain fire
};

const live: Prefetcher[] = [];
const make = (n: number): Prefetcher => {
  const p = createPrefetcher(ids(n));
  live.push(p);
  return p;
};

describe("createPrefetcher against the real request pool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.starts.length = 0;
    h.resolvers.clear();
    imageLoadPoolManager.clearRequestStack(PREFETCH);
    imageLoadPoolManager.setMaxSimultaneousRequests(PREFETCH, IN_FLIGHT);
  });
  afterEach(async () => {
    // The pool is a global singleton and tracks in-flight count internally, with
    // no reset. Leave requests hanging and the NEXT test starts with no free
    // slots and never fetches anything. Stop the prefetchers, empty the queue,
    // then let every in-flight request settle so that count returns to zero.
    for (const p of live.splice(0)) p.destroy();
    imageLoadPoolManager.clearRequestStack(PREFETCH);
    await settleAll();
    imageLoadPoolManager.clearRequestStack(PREFETCH);
    vi.useRealTimers();
  });

  it("starts the frames nearest the opening slice, up to the pool's concurrency", () => {
    make(400);
    // addRequest drains synchronously, so the pool is already running frames.
    expect(h.starts).toEqual(["img:0", "img:1", "img:2", "img:3"]);
  });

  it("fetches the frames nearest the new slice after the user scrolls away", async () => {
    const p = make(400);
    expect(h.starts).toHaveLength(IN_FLIGHT);

    p.recenter(300);
    await vi.advanceTimersByTimeAsync(150); // debounce
    await settleAll(); // free the in-flight slots

    // THE BUG THIS FIXES: with cornerstone's stackPrefetch these would still be
    // img:4, img:5, img:6: the queue kept grinding outward from the opening
    // slice while the user sat on 300.
    expect(h.starts.slice(IN_FLIGHT, IN_FLIGHT + 4)).toEqual([
      "img:300",
      "img:299",
      "img:301",
      "img:298",
    ]);
  });

  it("leaves another viewport's queued frames in the pool when re-centering", async () => {
    const p = make(400);
    // A neighbouring grid cell queues a frame behind ours. stackPrefetch would
    // drop this on the floor (it re-centers via clearRequestStack, which empties
    // the whole global Prefetch pool) and that cell's warm-up would never resume.
    imageLoadPoolManager.addRequest(async () => {}, PREFETCH, { imageId: "other:1" }, 0);
    expect(pooled()).toContain("other:1");

    p.recenter(300);
    await vi.advanceTimersByTimeAsync(150);

    expect(pooled()).toContain("other:1");
  });

  it("takes only its own frames out of the pool on destroy", async () => {
    const p = make(400);
    imageLoadPoolManager.addRequest(async () => {}, PREFETCH, { imageId: "other:1" }, 0);

    p.destroy();

    expect(pooled()).toEqual(["other:1"]);
  });
});
