import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import StudyList from "../src/components/StudyList.vue";
import { setLang } from "../src/i18n";

const STUDIES = [
  {
    studyInstanceUID: "1.2.3",
    patientName: "DOE^JANE",
    patientId: "PID-1",
    studyDate: "20240115",
    studyDescription: "CHEST CT",
    modalitiesInStudy: ["CT", "SR"],
    numberOfSeries: 3,
  },
  {
    studyInstanceUID: "4.5.6",
    patientName: "ROE^JOHN",
    studyDate: "20240220",
    studyDescription: "BRAIN MR",
    modalitiesInStudy: ["MR"],
    numberOfSeries: 5,
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSource(searchStudies = vi.fn(async () => STUDIES), studySearch = true): any {
  return { capabilities: { studySearch }, searchStudies, getSeries: vi.fn(), getImageIds: vi.fn() };
}

describe("StudyList", () => {
  beforeEach(() => setLang("en"));

  it("renders the filter form and a search button", () => {
    const w = mount(StudyList, { props: { source: makeSource() } });
    expect(w.find(".studylist__search").exists()).toBe(true);
    expect(w.findAll(".studylist__f").length).toBeGreaterThanOrEqual(3);
  });

  it("searches on submit and renders one row per study", async () => {
    const w = mount(StudyList, { props: { source: makeSource() } });
    await w.find(".studylist__filters").trigger("submit");
    await flushPromises();
    const rows = w.findAll(".studylist__row");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("DOE^JANE");
    expect(rows[0].text()).toContain("CHEST CT");
    expect(rows[0].text()).toContain("CT, SR");
  });

  it("passes only the non-empty filters to searchStudies", async () => {
    const search = vi.fn(async () => STUDIES);
    const w = mount(StudyList, { props: { source: makeSource(search) } });
    await w.find(".studylist__f--id").setValue("PID-1");
    await w.find(".studylist__f--mod").setValue("CT");
    await w.find(".studylist__filters").trigger("submit");
    await flushPromises();
    expect(search).toHaveBeenCalledWith({ patientId: "PID-1", modality: "CT" });
  });

  it("emits open with the study UID when a row is clicked", async () => {
    const w = mount(StudyList, { props: { source: makeSource() } });
    await w.find(".studylist__filters").trigger("submit");
    await flushPromises();
    await w.findAll(".studylist__row")[1].trigger("click");
    expect(w.emitted("open")?.[0]).toEqual(["4.5.6"]);
  });

  it("shows an empty state when the search returns nothing", async () => {
    const w = mount(StudyList, { props: { source: makeSource(vi.fn(async () => [])) } });
    await w.find(".studylist__filters").trigger("submit");
    await flushPromises();
    expect(w.find(".studylist__empty").exists()).toBe(true);
    expect(w.findAll(".studylist__row")).toHaveLength(0);
  });

  it("does not search when the source lacks the studySearch capability", async () => {
    const search = vi.fn(async () => STUDIES);
    const w = mount(StudyList, { props: { source: makeSource(search, false) } });
    await w.find(".studylist__filters").trigger("submit");
    await flushPromises();
    expect(search).not.toHaveBeenCalled();
  });

  it("disables rows for studies that are already open", async () => {
    const source = {
      capabilities: { studySearch: true },
      searchStudies: async () => [
        { studyInstanceUID: "A", patientName: "DOE^JANE", numberOfSeries: 2 },
        { studyInstanceUID: "B", patientName: "DOE^JANE", numberOfSeries: 3 },
      ],
    };
    const w = mount(StudyList, { props: { source: source as never, openUids: ["A"] } });
    await w.find(".studylist__search").trigger("submit");
    await flushPromises();
    const rows = w.findAll(".studylist__row");
    expect(rows[0].classes()).toContain("studylist__row--open");
    await rows[0].trigger("click");
    expect(w.emitted("open")).toBeUndefined(); // already-open row doesn't re-emit
    await rows[1].trigger("click");
    expect(w.emitted("open")?.[0]).toEqual(["B"]);
  });
});
