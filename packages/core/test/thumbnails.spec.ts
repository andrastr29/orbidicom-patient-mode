import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DataSource, SeriesSummary } from "../src/datasource";
import type { Thumbnailer } from "../src/cornerstone/thumbnail";
import { createThumbnailProvider } from "../src/thumbnails";

// The provider statically imports createThumbnailer, which transitively loads the
// real @cornerstonejs image-loader (registers a Worker at import) and crashes in
// the node test env. Every test here injects a fake thumbnailer, so the real one
// is never needed — stub it out, mirroring thumbnail.spec.ts / stack.spec.ts.
vi.mock("../src/cornerstone/thumbnail", () => ({ createThumbnailer: vi.fn() }));

let urlSeq = 0;
beforeEach(() => {
  urlSeq = 0;
  vi.clearAllMocks();
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(
    () => `blob:mock/${urlSeq++}`,
  );
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

function S(seriesInstanceUID: string, numberOfFrames = 10): SeriesSummary {
  return { seriesInstanceUID, numberOfFrames };
}

function fakeSource(ids: string[] = ["a", "b", "c"], extra: Partial<DataSource> = {}): DataSource {
  return {
    capabilities: {},
    getSeries: vi.fn(async () => []),
    getImageIds: vi.fn(async () => ids),
    ...extra,
  } as unknown as DataSource;
}

function fakeThumbnailer(blob: Blob | null = new Blob(["jpg"])): Thumbnailer {
  return { render: vi.fn(async () => blob), destroy: vi.fn() };
}

describe("createThumbnailProvider", () => {
  it("renders the middle slice client-side and caches the URL", async () => {
    const source = fakeSource(["a", "b", "c"]);
    const thumbnailer = fakeThumbnailer();
    const p = createThumbnailProvider({ source, thumbnailer });

    const url1 = await p.get(S("X"));
    const url2 = await p.get(S("X"));
    expect(url1).toBe("blob:mock/0");
    expect(url2).toBe("blob:mock/0"); // cached
    expect(thumbnailer.render).toHaveBeenCalledTimes(1);
    expect(thumbnailer.render).toHaveBeenCalledWith("b", { signal: expect.anything() });
  });

  it("uses the backend fast path and skips the client render", async () => {
    const getThumbnail = vi.fn(async () => new Blob(["fast"]));
    const source = fakeSource(["a"], { getThumbnail });
    const thumbnailer = fakeThumbnailer();
    const p = createThumbnailProvider({ source, thumbnailer });

    expect(await p.get(S("X"))).toBe("blob:mock/0");
    expect(getThumbnail).toHaveBeenCalledTimes(1);
    expect(source.getImageIds).not.toHaveBeenCalled();
    expect(thumbnailer.render).not.toHaveBeenCalled();
  });

  it("passes a URL string from the fast path through unchanged", async () => {
    const getThumbnail = vi.fn(async () => "https://pacs/thumb.jpg");
    const source = fakeSource(["a"], { getThumbnail });
    const p = createThumbnailProvider({ source, thumbnailer: fakeThumbnailer() });
    expect(await p.get(S("X"))).toBe("https://pacs/thumb.jpg");
    expect(
      (URL as unknown as { createObjectURL: ReturnType<typeof vi.fn> }).createObjectURL,
    ).not.toHaveBeenCalled();
  });

  it("falls back to client render when the fast path returns null", async () => {
    const getThumbnail = vi.fn(async () => null);
    const source = fakeSource(["a", "b"], { getThumbnail });
    const thumbnailer = fakeThumbnailer();
    const p = createThumbnailProvider({ source, thumbnailer });
    expect(await p.get(S("X"))).toBe("blob:mock/0");
    expect(thumbnailer.render).toHaveBeenCalledTimes(1);
  });

  it("falls back to client render when the fast path throws", async () => {
    const getThumbnail = vi.fn(async () => {
      throw new Error("no thumbnail endpoint");
    });
    const source = fakeSource(["a", "b"], { getThumbnail });
    const thumbnailer = fakeThumbnailer();
    const p = createThumbnailProvider({ source, thumbnailer });
    expect(await p.get(S("X"))).toBe("blob:mock/0");
    expect(thumbnailer.render).toHaveBeenCalledTimes(1);
  });

  it("short-circuits non-renderable series to null with no network", async () => {
    const source = fakeSource();
    const p = createThumbnailProvider({ source, thumbnailer: fakeThumbnailer() });
    expect(await p.get(S("DOC", 0))).toBeNull();
    expect(source.getImageIds).not.toHaveBeenCalled();
  });

  it("negative-caches when there are no imageIds (calls getImageIds once)", async () => {
    const source = fakeSource([]);
    const p = createThumbnailProvider({ source, thumbnailer: fakeThumbnailer() });
    expect(await p.get(S("X"))).toBeNull();
    expect(await p.get(S("X"))).toBeNull();
    expect(source.getImageIds).toHaveBeenCalledTimes(1);
  });

  it("negative-caches a failed render and does not retry", async () => {
    const source = fakeSource(["a"]);
    const thumbnailer = fakeThumbnailer(null); // capture failed
    const p = createThumbnailProvider({ source, thumbnailer });
    expect(await p.get(S("X"))).toBeNull();
    expect(await p.get(S("X"))).toBeNull();
    expect(thumbnailer.render).toHaveBeenCalledTimes(1);
  });

  it("evicts the least-recently-used entry and revokes its URL", async () => {
    const source = fakeSource(["a"]);
    const p = createThumbnailProvider({ source, thumbnailer: fakeThumbnailer(), cacheSize: 1 });
    await p.get(S("X")); // blob:mock/0
    await p.get(S("Y")); // blob:mock/1 — evicts X
    expect(
      (URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> }).revokeObjectURL,
    ).toHaveBeenCalledWith("blob:mock/0");
  });

  it("de-duplicates concurrent requests for the same series", async () => {
    const source = fakeSource(["a"]);
    const thumbnailer = fakeThumbnailer();
    const p = createThumbnailProvider({ source, thumbnailer });
    const [u1, u2] = await Promise.all([p.get(S("X")), p.get(S("X"))]);
    expect(u1).toBe(u2);
    expect(thumbnailer.render).toHaveBeenCalledTimes(1);
  });

  it("caps concurrent resolutions at the configured limit", async () => {
    const render = vi.fn(() => new Promise<Blob>(() => {})); // never resolves
    const source = fakeSource(["a"]);
    const p = createThumbnailProvider({
      source,
      thumbnailer: { render, destroy: vi.fn() },
      concurrency: 1,
    });
    void p.get(S("X"));
    void p.get(S("Y"));
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("destroy revokes cached URLs and destroys the renderer", async () => {
    const source = fakeSource(["a"]);
    const thumbnailer = fakeThumbnailer();
    const p = createThumbnailProvider({ source, thumbnailer });
    await p.get(S("X")); // blob:mock/0
    p.destroy();
    expect(
      (URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> }).revokeObjectURL,
    ).toHaveBeenCalledWith("blob:mock/0");
    expect(thumbnailer.destroy).toHaveBeenCalledTimes(1);
  });
});
