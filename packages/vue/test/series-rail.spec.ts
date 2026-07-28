import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SeriesRail from "../src/components/SeriesRail.vue";

const series = [
  { seriesInstanceUID: "S1", modality: "CT", seriesDescription: "Axial", numberOfFrames: 120 },
  { seriesInstanceUID: "S2", modality: "MR", seriesDescription: "", numberOfFrames: 30 },
];

describe("SeriesRail", () => {
  it("renders a row per series with description/modality/count and emits select", async () => {
    const w = mount(SeriesRail, { props: { series, active: 0 } });
    const items = w.findAll(".rail__item");
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("Axial");
    expect(items[0].text()).toContain("CT");
    expect(items[0].text()).toContain("120");
    await items[1].trigger("click");
    expect(w.emitted("select")?.[0]).toEqual([1]);
  });

  it("falls back to modality when description is blank", () => {
    const w = mount(SeriesRail, { props: { series, active: 0 } });
    expect(w.findAll(".rail__item")[1].text()).toContain("MR");
  });

  it("omits the image count for a no-image report series (e.g. DOC)", () => {
    const reports = [
      {
        seriesInstanceUID: "DOC1",
        modality: "DOC",
        seriesDescription: "REPORT PDF",
        numberOfFrames: 0,
      },
    ];
    const w = mount(SeriesRail, { props: { series: reports, active: 0 } });
    const item = w.findAll(".rail__item")[0];
    expect(item.text()).toContain("DOC");
    expect(item.text()).not.toContain("img"); // no "· 0 img" for report series
  });

  function providerStub(url: string | null) {
    return { get: vi.fn(async () => url), release: vi.fn(), destroy: vi.fn() };
  }

  it("shows the rendered thumbnail once the provider resolves a URL", async () => {
    const provider = providerStub("blob:mock/thumb");
    const w = mount(SeriesRail, { props: { series, active: 0, provider } });
    await flushPromises();
    const img = w.findAll(".rail__item")[0].find(".rail__img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe("blob:mock/thumb");
    expect(provider.get).toHaveBeenCalled();
  });

  it("shows a loading spinner on the thumbnail until the provider resolves", async () => {
    let resolve!: (v: string | null) => void;
    const provider = {
      get: vi.fn(() => new Promise<string | null>((r) => (resolve = r))),
      release: vi.fn(),
      destroy: vi.fn(),
    };
    // A single series, so the one pending get() is the one we resolve.
    const one = [{ seriesInstanceUID: "S1", modality: "CT", numberOfFrames: 120 }];
    const w = mount(SeriesRail, { props: { series: one, active: 0, provider } });
    await flushPromises(); // get is still pending → the row stays in the loading state
    const item = () => w.findAll(".rail__item")[0];
    expect(item().find(".rail__spinner").exists()).toBe(true);
    expect(item().find(".rail__img").exists()).toBe(false);
    resolve("blob:mock/thumb");
    await flushPromises();
    expect(item().find(".rail__spinner").exists()).toBe(false);
    expect(item().find(".rail__img").exists()).toBe(true);
  });

  it("shows the document glyph for a no-image report series and skips the provider", async () => {
    const provider = providerStub("blob:x");
    const reports = [
      {
        seriesInstanceUID: "DOC1",
        modality: "DOC",
        seriesDescription: "REPORT",
        numberOfFrames: 0,
      },
    ];
    const w = mount(SeriesRail, { props: { series: reports, active: 0, provider } });
    await flushPromises();
    expect(w.findAll(".rail__item")[0].find(".rail__glyph--doc").exists()).toBe(true);
    expect(provider.get).not.toHaveBeenCalled();
  });

  it("shows the no-preview glyph when the provider resolves null", async () => {
    const provider = providerStub(null);
    const w = mount(SeriesRail, { props: { series, active: 0, provider } });
    await flushPromises();
    expect(w.findAll(".rail__item")[0].find(".rail__glyph--none").exists()).toBe(true);
  });

  it("shows the document glyph for a report modality (SR) even when it reports instances", async () => {
    const provider = providerStub("blob:x");
    const reports = [
      { seriesInstanceUID: "SR1", modality: "SR", seriesDescription: "Report", numberOfFrames: 1 },
    ];
    const w = mount(SeriesRail, { props: { series: reports, active: 0, provider } });
    await flushPromises();
    expect(w.findAll(".rail__item")[0].find(".rail__glyph--doc").exists()).toBe(true);
    expect(provider.get).not.toHaveBeenCalled();
  });

  it("still loads a thumbnail for an image series whose instance count is unknown", async () => {
    const provider = providerStub("blob:mock/thumb");
    // numberOfFrames omitted: a PACS that doesn't return the count must not disable previews.
    const unknown = [{ seriesInstanceUID: "CT1", modality: "CT", seriesDescription: "Axial" }];
    const w = mount(SeriesRail, { props: { series: unknown, active: 0, provider } });
    await flushPromises();
    expect(provider.get).toHaveBeenCalled();
    expect(w.findAll(".rail__item")[0].find(".rail__img").attributes("src")).toBe(
      "blob:mock/thumb",
    );
  });

  it("defers loading until a row scrolls into view when IntersectionObserver exists", async () => {
    const observedEls: Element[] = [];
    let trigger!: (entries: { target: Element; isIntersecting: boolean }[]) => void;
    class FakeIO {
      constructor(cb: (entries: { target: Element; isIntersecting: boolean }[]) => void) {
        trigger = cb;
      }
      observe(el: Element) {
        observedEls.push(el);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeIO);
    try {
      const provider = providerStub("blob:mock/thumb");
      const w = mount(SeriesRail, { props: { series, active: 0, provider } });
      await flushPromises();
      expect(provider.get).not.toHaveBeenCalled(); // observed, not loaded
      expect(observedEls.length).toBe(series.length);
      trigger([{ target: observedEls[0], isIntersecting: true }]); // first row scrolls in
      await flushPromises();
      expect(provider.get).toHaveBeenCalledTimes(1);
      expect(w.findAll(".rail__item")[0].find(".rail__img").attributes("src")).toBe(
        "blob:mock/thumb",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("disconnects and rebuilds the observer when the study (series list) is replaced", async () => {
    let disconnects = 0;
    let constructed = 0;
    class FakeIO {
      constructor() {
        constructed++;
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnects++;
      }
    }
    vi.stubGlobal("IntersectionObserver", FakeIO);
    try {
      const w = mount(SeriesRail, {
        props: { series, active: 0, provider: providerStub("blob:x") },
      });
      await flushPromises();
      expect(constructed).toBe(1);
      // Switch studies: brand-new series array with different UIDs.
      await w.setProps({
        series: [
          {
            seriesInstanceUID: "NEW1",
            modality: "CT",
            seriesDescription: "New",
            numberOfFrames: 5,
          },
        ],
      });
      await flushPromises();
      expect(disconnects).toBe(1); // old observer released
      expect(constructed).toBe(2); // fresh observer for the new study
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
