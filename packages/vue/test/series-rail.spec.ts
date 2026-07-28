import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SeriesRail from "../src/components/SeriesRail.vue";

const series = [
  { seriesInstanceUID: "S1", modality: "CT", seriesDescription: "Axial", numberOfFrames: 120 },
  { seriesInstanceUID: "S2", modality: "MR", seriesDescription: "", numberOfFrames: 30 },
];

function providerStub(url: string | null) {
  return { get: vi.fn(async () => url), release: vi.fn(), destroy: vi.fn() };
}

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

  it("keeps already-loaded thumbnails when a study is appended", async () => {
    const provider = providerStub("blob:mock/thumb");
    const w = mount(SeriesRail, { props: { series, active: 0, provider } });
    await flushPromises();
    expect(provider.get).toHaveBeenCalledTimes(2);
    // Append a third series (a new study arriving mid-session).
    await w.setProps({
      series: [...series, { seriesInstanceUID: "S3", modality: "CT", numberOfFrames: 9 }],
    });
    await flushPromises();
    // Only the new row resolves — the first two keep their cached previews.
    expect(provider.get).toHaveBeenCalledTimes(3);
    expect(w.findAll(".rail__item")[0].find(".rail__img").exists()).toBe(true);
  });

  it("keeps thumbnails when the array is merely reordered", async () => {
    const provider = providerStub("blob:mock/thumb");
    const w = mount(SeriesRail, { props: { series, active: 0, provider } });
    await flushPromises();
    expect(provider.get).toHaveBeenCalledTimes(2);
    await w.setProps({ series: [series[1], series[0]] });
    await flushPromises();
    expect(provider.get).toHaveBeenCalledTimes(2); // no refetch
  });

  it("drops preview state only for series that disappeared", async () => {
    const provider = providerStub("blob:mock/thumb");
    const w = mount(SeriesRail, { props: { series, active: 0, provider } });
    await flushPromises();
    await w.setProps({ series: [series[0]] }); // S2 removed
    await flushPromises();
    expect(provider.get).toHaveBeenCalledTimes(2); // S1 not refetched
    expect(w.findAll(".rail__item").length).toBe(1);
  });

  it("re-observes surviving pending rows against the new observer after a removal-triggered rebuild", async () => {
    const provider = providerStub("blob:mock/thumb");
    const instances: {
      observedEls: Element[];
      cb: (e: { target: Element; isIntersecting: boolean }[]) => void;
    }[] = [];
    class FakeIO {
      observedEls: Element[] = [];
      cb: (e: { target: Element; isIntersecting: boolean }[]) => void;
      constructor(cb: (e: { target: Element; isIntersecting: boolean }[]) => void) {
        this.cb = cb;
        instances.push(this);
      }
      observe(el: Element) {
        this.observedEls.push(el);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeIO);
    try {
      const three = [
        { seriesInstanceUID: "S1", modality: "CT", numberOfFrames: 10 },
        { seriesInstanceUID: "S2", modality: "CT", numberOfFrames: 10 },
        { seriesInstanceUID: "S3", modality: "CT", numberOfFrames: 10 },
      ];
      const w = mount(SeriesRail, { props: { series: three, active: 0, provider } });
      await flushPromises();
      // Nothing intersects, so all three rows stay pending (bound, not loaded).
      expect(provider.get).not.toHaveBeenCalled();
      expect(instances.length).toBe(1);
      expect(instances[0].observedEls.length).toBe(3);
      // Remove S3 — a genuine disappearance, so the observer is disconnected
      // and rebuilt. S1 and S2 survive but were still pending on the OLD
      // observer, which is now dead.
      await w.setProps({ series: [three[0], three[1]], active: 0, provider });
      await flushPromises();
      expect(instances.length).toBe(2); // rebuilt
      // The survivors must be re-registered on the NEW instance, not stranded
      // on the disconnected one.
      expect(instances[1].observedEls.length).toBe(2);
      // Prove it end-to-end: intersecting on the new observer still resolves.
      instances[1].cb([{ target: instances[1].observedEls[0], isIntersecting: true }]);
      await flushPromises();
      expect(provider.get).toHaveBeenCalledTimes(1);
      expect(w.findAll(".rail__item")[0].find(".rail__img").exists()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("multi-study grouping", () => {
  const twoStudies = [
    {
      seriesInstanceUID: "N1",
      studyInstanceUID: "NEW",
      modality: "MR",
      seriesDescription: "Ax T1",
      numberOfFrames: 176,
      study: { studyDate: "20260314", studyDescription: "MR Brain", patientName: "DOE^JANE" },
    },
    {
      seriesInstanceUID: "N2",
      studyInstanceUID: "NEW",
      modality: "MR",
      seriesDescription: "Ax T2",
      numberOfFrames: 48,
      study: { studyDate: "20260314", studyDescription: "MR Brain", patientName: "DOE^JANE" },
    },
    {
      seriesInstanceUID: "O1",
      studyInstanceUID: "OLD",
      modality: "MR",
      seriesDescription: "Ax T1 SE",
      numberOfFrames: 24,
      study: { studyDate: "20241102", studyDescription: "MR Brain prior", patientName: "DOE^JANE" },
    },
  ];

  it("renders no study headers for a single study (backward compatibility)", () => {
    const w = mount(SeriesRail, { props: { series, active: 0 } });
    expect(w.findAll(".rail__group").length).toBe(0);
    expect(w.findAll(".rail__item").length).toBe(2);
  });

  it("renders one header per study when two studies are present", () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    const headers = w.findAll(".rail__group");
    expect(headers.length).toBe(2);
    expect(headers[0].text()).toContain("MR Brain");
    expect(headers[0].text()).toContain("2"); // series count
    expect(headers[1].text()).toContain("MR Brain prior");
  });

  it("restarts series ordinals at 1 within each study", async () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    // Group 2 collapses by default (Task 6); expand it to see its ordinal too.
    await w.findAll(".rail__group-toggle")[1].trigger("click");
    const ords = w.findAll(".rail__ord").map((o) => o.text());
    expect(ords).toEqual(["1", "2", "1"]);
  });

  it("still emits the flat index on select, not a per-group index", async () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    // Group 2 collapses by default (Task 6); expand it to reach its row.
    await w.findAll(".rail__group-toggle")[1].trigger("click");
    await w.findAll(".rail__item")[2].trigger("click");
    expect(w.emitted("select")?.[0]).toEqual([2]);
  });

  it("shows the study description on line 2 when all studies share a patient", () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    const sub = w.findAll(".rail__group-sub")[0];
    expect(sub.text()).toContain("MR Brain");
    expect(sub.text()).not.toContain("DOE");
  });

  it("shows the patient name on line 2 when studies span more than one patient", () => {
    const crossPatient = [
      twoStudies[0],
      { ...twoStudies[2], study: { ...twoStudies[2].study, patientName: "ROE^RICHARD" } },
    ];
    const w = mount(SeriesRail, { props: { series: crossPatient, active: 0 } });
    const subs = w.findAll(".rail__group-sub").map((s) => s.text());
    expect(subs[0]).toContain("DOE");
    expect(subs[1]).toContain("ROE");
  });

  it("falls back to the description, then to a positional label, and never shows a UID", () => {
    const sparse = [
      {
        seriesInstanceUID: "A1",
        studyInstanceUID: "1.2.840.113619.2.55.QUITELONGUID",
        modality: "CT",
      },
      {
        seriesInstanceUID: "B1",
        studyInstanceUID: "STB",
        modality: "CT",
        study: { studyDescription: "No date here" },
      },
    ];
    const w = mount(SeriesRail, { props: { series: sparse, active: 0 } });
    const text = w.findAll(".rail__group").map((h) => h.text());
    expect(text.join(" ")).not.toContain("1.2.840");
    expect(text.join(" ")).toContain("No date here");
    expect(text.some((x) => /Study\s*1|Study\s*2/.test(x))).toBe(true);
  });

  it("emits close-study with the study uid when a header's close button is clicked", async () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    await w.findAll(".rail__group-close")[1].trigger("click");
    expect(w.emitted("close-study")?.[0]).toEqual(["OLD"]);
  });

  // CSS-only concern (mobile layout for .rail__group) isn't testable in jsdom,
  // which doesn't apply media queries — this instead pins the DOM structure the
  // mobile styles rely on: each group header sits immediately before its own
  // rows, in study order, with every series accounted for under the right group.
  it("renders each group header immediately before its own rows, in study order", async () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    // Group 2 collapses by default (Task 6); expand it to see its row in the DOM.
    await w.findAll(".rail__group-toggle")[1].trigger("click");
    const kinds = Array.from(w.element.children).map((el) =>
      el.classList.contains("rail__group") ? "group" : "item",
    );
    expect(kinds).toEqual(["group", "item", "item", "group", "item"]);

    const items = w.findAll(".rail__item");
    expect(items).toHaveLength(3);
    expect(items[0].text()).toContain("Ax T1");
    expect(items[1].text()).toContain("Ax T2");
    expect(items[2].text()).toContain("Ax T1 SE");
  });

  it("expands the first group and collapses the rest by default", () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    // Group 1 (2 series) is expanded; group 2's single row is not rendered.
    expect(w.findAll(".rail__item").length).toBe(2);
  });

  it("expands a collapsed group when its header is clicked", async () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    await w.findAll(".rail__group-toggle")[1].trigger("click");
    expect(w.findAll(".rail__item").length).toBe(3);
  });

  // The mobile styles dim a collapsed prior and hide its close button, and both
  // hang off this modifier class. jsdom applies no media queries, so the styling
  // itself can't be asserted — but the hook can, which is what keeps it from
  // silently detaching from the collapse state it is supposed to reflect.
  it("marks collapsed groups with the modifier class the mobile styles hook", async () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    const collapsed = () =>
      w.findAll(".rail__group").map((h) => h.classes().includes("rail__group--collapsed"));
    // Group 1 is expanded by default, group 2 collapsed.
    expect(collapsed()).toEqual([false, true]);

    await w.findAll(".rail__group-toggle")[1].trigger("click");
    expect(collapsed()).toEqual([false, false]);
  });

  it("expands a non-first group that holds a displayed series", () => {
    // A hanging protocol loaded the *older* study into a cell: its group must not
    // start collapsed, or the row the user is looking at would be invisible.
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 2, displayed: [2] } });
    expect(w.findAll(".rail__item").length).toBe(3);
  });

  it("does not re-default a group the user collapsed when a study is added", async () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    await w.findAll(".rail__group-toggle")[0].trigger("click"); // collapse group 1
    expect(w.findAll(".rail__item").length).toBe(0);
    const third = {
      seriesInstanceUID: "X1",
      studyInstanceUID: "THIRD",
      modality: "CT",
      numberOfFrames: 10,
      study: { studyDate: "20200101", studyDescription: "Older still" },
    };
    await w.setProps({ series: [...twoStudies, third] });
    // Group 1 stays collapsed (user's choice) and the new group starts collapsed.
    expect(w.findAll(".rail__item").length).toBe(0);
  });

  it("requests no thumbnails for a collapsed group", async () => {
    const provider = providerStub("blob:x");
    mount(SeriesRail, { props: { series: twoStudies, active: 0, provider } });
    await flushPromises();
    // Only the 2 expanded rows resolve; the collapsed study's row is never rendered.
    expect(provider.get).toHaveBeenCalledTimes(2);
  });

  it("keeps a group expanded once displayed/active moves on, instead of re-defaulting it closed", async () => {
    // Group 2 auto-expands because its series is displayed (rule 2, first render only).
    const w = mount(SeriesRail, {
      props: { series: twoStudies, active: 2, displayed: [2] },
    });
    expect(w.findAll(".rail__item").length).toBe(3);
    // The user then looks at group 1: displayed/active moves away from group 2's row.
    await w.setProps({ active: 0, displayed: [0] });
    // Group 2 must stay expanded — rule 2 only decided the default, it doesn't keep
    // re-evaluating on every render and silently collapsing the row the user was
    // just browsing.
    expect(w.findAll(".rail__item").length).toBe(3);
  });

  it("discards a group's collapse state when its study leaves and returns, starting fresh", async () => {
    const w = mount(SeriesRail, { props: { series: twoStudies, active: 0 } });
    // Group 1 starts expanded by default (first group); collapse it.
    await w.findAll(".rail__group-toggle")[0].trigger("click");
    expect(w.findAll(".rail__item").length).toBe(0);
    // The study closes (its series leave `series` entirely)...
    const old = twoStudies.filter((s) => s.studyInstanceUID === "OLD");
    await w.setProps({ series: old, active: 0 });
    // ...and is re-added later. It must start fresh (default-expanded, as the new
    // first group), not restore the stale collapsed choice from before it left.
    await w.setProps({ series: twoStudies, active: 0 });
    expect(w.findAll(".rail__item").length).toBe(2);
  });

  it("re-registers a still-pending row whose element unmounted on collapse, once its group re-expands", async () => {
    const provider = providerStub("blob:mock/thumb");
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
      const w = mount(SeriesRail, { props: { series: twoStudies, active: 0, provider } });
      await flushPromises();
      // Group 1 (N1, N2) is expanded by default and both rows are observed.
      expect(observedEls.length).toBe(2);
      // Expand group 2: its row (O1) mounts, binds, and registers — but nothing
      // intersects it, so it stays pending (never resolved).
      await w.findAll(".rail__group-toggle")[1].trigger("click");
      expect(observedEls.length).toBe(3);
      expect(provider.get).not.toHaveBeenCalled();
      // Collapse it again: O1's element unmounts while still pending.
      await w.findAll(".rail__group-toggle")[1].trigger("click");
      // Re-expand: a fresh element mounts. Without the fix, O1's stale `observed`
      // entry from the first mount would make bindThumb's guard short-circuit,
      // and the new element would never be registered — permanently orphaned.
      await w.findAll(".rail__group-toggle")[1].trigger("click");
      expect(observedEls.length).toBe(4); // O1 re-registered on the new element
      // Prove it end-to-end: intersecting the re-registered element still loads.
      trigger([{ target: observedEls[3], isIntersecting: true }]);
      await flushPromises();
      expect(provider.get).toHaveBeenCalledTimes(1);
      expect(w.findAll(".rail__item")[2].find(".rail__img").exists()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
