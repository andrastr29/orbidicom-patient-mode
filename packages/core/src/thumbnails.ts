import type { DataSource, SeriesSummary } from "./datasource";
import { isImageSeries } from "./hanging";
import { createThumbnailer, type Thumbnailer } from "./cornerstone/thumbnail";

/** Resolves a stable preview URL (or null) for a series, cheaply and at most once. */
export interface ThumbnailProvider {
  get(series: SeriesSummary): Promise<string | null>;
  /** Revoke and forget previews for these series (e.g. their study was closed). */
  release(seriesUids: string[]): void;
  destroy(): void;
}

export interface ThumbnailProviderOptions {
  source: DataSource;
  /** Inject a renderer (tests); defaults to a real offscreen Thumbnailer. */
  thumbnailer?: Thumbnailer;
  /** Max cached entries before LRU eviction. Default 200. */
  cacheSize?: number;
  /** Max concurrent thumbnail resolutions. Default 3. */
  concurrency?: number;
}

/**
 * Orchestrates series previews: prefers a backend `getThumbnail` fast path, else
 * renders the middle slice client-side. Caches results (an object URL, or a cached
 * `null` for non-renderable/failed series) in an LRU keyed by seriesInstanceUID,
 * de-duplicates in-flight requests, and caps concurrency. Framework-agnostic.
 */
export function createThumbnailProvider(opts: ThumbnailProviderOptions): ThumbnailProvider {
  const { source } = opts;
  const cacheSize = opts.cacheSize ?? 200;
  const concurrency = opts.concurrency ?? 3;

  // Insertion-ordered Map == LRU: re-inserting moves a key to the newest slot.
  const cache = new Map<string, string | null>();
  const inflight = new Map<string, Promise<string | null>>();
  const abort = new AbortController();
  let renderer = opts.thumbnailer ?? null;
  let destroyed = false;

  // --- tiny concurrency limiter ---
  let active = 0;
  const queue: Array<() => void> = [];
  function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            queue.shift()?.();
          });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
  }

  function thumb(): Thumbnailer {
    if (!renderer) renderer = createThumbnailer();
    return renderer;
  }

  function touch(key: string): string | null {
    const v = cache.get(key) ?? null;
    cache.delete(key);
    cache.set(key, v);
    return v;
  }

  function store(key: string, value: string | null): string | null {
    if (destroyed) {
      if (typeof value === "string") URL.revokeObjectURL(value);
      return null;
    }
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > cacheSize) {
      const oldest = cache.keys().next().value as string;
      const old = cache.get(oldest);
      cache.delete(oldest);
      if (typeof old === "string") URL.revokeObjectURL(old);
    }
    return value;
  }

  function resolve(series: SeriesSummary): Promise<string | null> {
    const key = series.seriesInstanceUID;
    const n = series.numberOfFrames;
    // Never renderable, so cache a null preview and never touch the network:
    //  - a non-image modality (SR/DOC/KO/PR/AU) is a report, OR
    //  - an explicit zero-or-fewer instance count.
    // An absent count (undefined) is "unknown", NOT a report, so image series on a
    // PACS that omits NumberOfSeriesRelatedInstances still get a client render.
    if (!isImageSeries(series) || (n != null && n <= 0)) {
      return Promise.resolve(store(key, null));
    }

    return limit(async () => {
      if (destroyed) return null;
      if (source.getThumbnail) {
        try {
          const r = await source.getThumbnail(series, { signal: abort.signal });
          if (r != null && r !== "") {
            const url = typeof r === "string" ? r : URL.createObjectURL(r);
            return store(key, url);
          }
        } catch {
          /* fall through to client render */
        }
      }
      if (destroyed) return null;
      try {
        const ids = await source.getImageIds(series);
        if (!ids.length) return store(key, null);
        const mid = ids[Math.floor(ids.length / 2)]!;
        const blob = await thumb().render(mid, { signal: abort.signal });
        if (!blob) return store(key, null);
        return store(key, URL.createObjectURL(blob));
      } catch {
        return store(key, null);
      }
    });
  }

  return {
    get(series: SeriesSummary): Promise<string | null> {
      const key = series.seriesInstanceUID;
      if (cache.has(key)) return Promise.resolve(touch(key));
      const existing = inflight.get(key);
      if (existing) return existing;
      const p = resolve(series).finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },
    release(seriesUids: string[]) {
      for (const key of seriesUids) {
        const v = cache.get(key);
        if (typeof v === "string") URL.revokeObjectURL(v);
        cache.delete(key);
      }
      // In-flight resolutions are left alone: `store()` will write them into a
      // cache nobody is asking about, and the next get() re-resolves cleanly.
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      for (const v of cache.values()) if (typeof v === "string") URL.revokeObjectURL(v);
      cache.clear();
      renderer?.destroy();
      renderer = null;
    },
  };
}
