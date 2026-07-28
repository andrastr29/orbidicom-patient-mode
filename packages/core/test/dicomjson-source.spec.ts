import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("@cornerstonejs/dicom-image-loader", () => ({
  wadors: { metaDataManager: { add: h.add } },
}));

import { DicomJsonDataSource } from "../src/datasources/dicomjson";

const V = (s: string | number) => ({ Value: [s] });

// Instance-level DICOM-JSON, as a WADO-RS /metadata dump or a static manifest.
const META: Record<string, unknown>[] = [
  // study-1 / series S2, second instance (InstanceNumber 2).
  {
    "0020000D": V("study-1"),
    "0020000E": V("S2"),
    "00200011": V("2"),
    "0008103E": V("Axial"),
    "00080060": V("CT"),
    "00080018": V("sop-2b"),
    "00200013": V("2"),
    "00280010": V("512"),
    "00280008": V("1"),
  },
  // study-1 / series S2, first instance (InstanceNumber 1).
  {
    "0020000D": V("study-1"),
    "0020000E": V("S2"),
    "00200011": V("2"),
    "00080060": V("CT"),
    "00080018": V("sop-2a"),
    "00200013": V("1"),
    "00280010": V("512"),
    "00280008": V("1"),
  },
  // study-1 / series S1, a single 3-frame instance (Scout).
  {
    "0020000D": V("study-1"),
    "0020000E": V("S1"),
    "00200011": V("1"),
    "0008103E": V("Scout"),
    "00080060": V("CT"),
    "00080018": V("sop-1"),
    "00200013": V("1"),
    "00280010": V("512"),
    "00280008": V("3"),
  },
];

describe("DicomJsonDataSource", () => {
  it("is a multi-study source", () => {
    expect(new DicomJsonDataSource({ metadata: META }).capabilities.multiStudy).toBe(true);
  });

  it("groups instances into series, sorted by SeriesNumber", async () => {
    const ds = new DicomJsonDataSource({ metadata: META, root: "/dicom-web" });
    const series = await ds.getSeries(["study-1"]);
    expect(series.map((s) => s.seriesInstanceUID)).toEqual(["S1", "S2"]);
    expect(series[0]).toMatchObject({
      modality: "CT",
      seriesDescription: "Scout",
      studyInstanceUID: "study-1",
    });
    expect(series[1].numberOfFrames).toBe(2); // S2 has two instances
  });

  it("filters series to the requested study UIDs", async () => {
    const ds = new DicomJsonDataSource({ metadata: META, root: "/dicom-web" });
    expect(await ds.getSeries(["other"])).toEqual([]);
  });

  it("builds WADO-RS imageIds ordered by InstanceNumber and registers metadata", async () => {
    h.add.mockClear();
    const ds = new DicomJsonDataSource({ metadata: META, root: "/dicom-web" });
    const ids = await ds.getImageIds({ seriesInstanceUID: "S2", studyInstanceUID: "study-1" });
    expect(ids).toEqual([
      "wadors:/dicom-web/studies/study-1/series/S2/instances/sop-2a/frames/1",
      "wadors:/dicom-web/studies/study-1/series/S2/instances/sop-2b/frames/1",
    ]);
    expect(h.add).toHaveBeenCalledWith(
      "wadors:/dicom-web/studies/study-1/series/S2/instances/sop-2a/frames/1",
      expect.anything(),
    );
  });

  it("expands a multiframe instance into one imageId per frame", async () => {
    const ds = new DicomJsonDataSource({ metadata: META, root: "/dicom-web" });
    const ids = await ds.getImageIds({ seriesInstanceUID: "S1", studyInstanceUID: "study-1" });
    expect(ids).toEqual([
      "wadors:/dicom-web/studies/study-1/series/S1/instances/sop-1/frames/1",
      "wadors:/dicom-web/studies/study-1/series/S1/instances/sop-1/frames/2",
      "wadors:/dicom-web/studies/study-1/series/S1/instances/sop-1/frames/3",
    ]);
  });

  it("yields no imageIds without a root (metadata-only mode)", async () => {
    const ds = new DicomJsonDataSource({ metadata: META });
    expect(await ds.getImageIds({ seriesInstanceUID: "S1", studyInstanceUID: "study-1" })).toEqual(
      [],
    );
  });

  it("exposes per-image metadata via getMetadata", async () => {
    const ds = new DicomJsonDataSource({ metadata: META, root: "/dicom-web" });
    const id = "wadors:/dicom-web/studies/study-1/series/S1/instances/sop-1/frames/2";
    await ds.getImageIds({ seriesInstanceUID: "S1", studyInstanceUID: "study-1" });
    const meta = await ds.getMetadata(id);
    expect(meta.imageId).toBe(id);
    expect(meta["00080018"]).toEqual(V("sop-1"));
  });

  it("fills study-level facts from instance metadata", async () => {
    const ds = new DicomJsonDataSource({
      metadata: [
        {
          "0020000D": { Value: ["ST1"] },
          "0020000E": { Value: ["S1"] },
          "00200011": { Value: [1] },
          "00080060": { Value: ["MR"] },
          "00080020": { Value: ["20231002"] },
          "00081030": { Value: ["BRAIN MR"] },
          "00100010": { Value: [{ Alphabetic: "ROE^RICHARD" }] },
          "00100020": { Value: ["PID-9"] },
        },
      ],
    });
    const [s] = await ds.getSeries(["ST1"]);
    expect(s.study).toEqual({
      studyDate: "20231002",
      studyDescription: "BRAIN MR",
      patientName: "ROE^RICHARD",
      patientId: "PID-9",
    });
  });
});
