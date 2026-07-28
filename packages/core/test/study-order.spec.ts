import { describe, it, expect } from "vitest";
import { orderStudyGroups } from "../src/study-order";
import type { SeriesSummary } from "../src/datasource";

const s = (uid: string, studyUid: string, date?: string): SeriesSummary => ({
  seriesInstanceUID: uid,
  studyInstanceUID: studyUid,
  study: date ? { studyDate: date } : {},
});

const uids = (list: SeriesSummary[]) => list.map((x) => x.seriesInstanceUID);

describe("orderStudyGroups", () => {
  it("puts the newest study first and keeps each study's series contiguous", () => {
    const out = orderStudyGroups([
      s("A1", "OLD", "20240101"),
      s("A2", "OLD", "20240101"),
      s("B1", "NEW", "20260314"),
      s("B2", "NEW", "20260314"),
    ]);
    expect(uids(out)).toEqual(["B1", "B2", "A1", "A2"]);
  });

  it("preserves within-study order exactly", () => {
    const out = orderStudyGroups([
      s("A3", "OLD", "20240101"),
      s("A1", "OLD", "20240101"),
      s("B1", "NEW", "20260314"),
    ]);
    // The caller already sorted within the study; this must not reshuffle it.
    expect(uids(out)).toEqual(["B1", "A3", "A1"]);
  });

  it("sorts undated studies last", () => {
    const out = orderStudyGroups([s("U1", "NODATE"), s("D1", "DATED", "20200101")]);
    expect(uids(out)).toEqual(["D1", "U1"]);
  });

  it("breaks ties between same-dated studies by first appearance", () => {
    const out = orderStudyGroups([s("B1", "SECOND", "20260314"), s("A1", "FIRST", "20260314")]);
    expect(uids(out)).toEqual(["B1", "A1"]);
  });

  it("is a no-op for a single study", () => {
    const one = [s("A1", "ST", "20240101"), s("A2", "ST", "20240101")];
    expect(uids(orderStudyGroups(one))).toEqual(["A1", "A2"]);
  });

  it("tolerates series with no studyInstanceUID (local-file sources)", () => {
    const local: SeriesSummary[] = [{ seriesInstanceUID: "L1" }, { seriesInstanceUID: "L2" }];
    expect(uids(orderStudyGroups(local))).toEqual(["L1", "L2"]);
  });
});
