import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("@cornerstonejs/dicom-image-loader", () => ({
  wadors: { metaDataManager: { add: h.add } },
}));

import { DicomWebDataSource } from "../src/datasources/dicomweb";
import { authHeaders } from "../src/auth";

const V = (s: string) => ({ Value: [s] });

const fakeClient = {
  searchForSeries: vi.fn(async () => [
    {
      "0020000E": V("S2"),
      "00080060": V("CT"),
      "00200011": V("2"),
      "0008103E": V("Axial"),
      "00201209": V("100"),
    },
    {
      "0020000E": V("S1"),
      "00080060": V("CT"),
      "00200011": V("1"),
      "0008103E": V("Scout"),
      "00201209": V("3"),
    },
    {
      "0020000E": V("SR1"),
      "00080060": V("SR"),
      "00200011": V("9"),
      "0008103E": V("Report"),
      "00201209": V("1"),
    },
  ]),
  retrieveSeriesMetadata: vi.fn(async () => [
    { "00080018": V("sop-2"), "00200013": V("2"), "00280010": V("512"), "00280008": V("1") },
    { "00080018": V("sop-1"), "00200013": V("1"), "00280010": V("512"), "00280008": V("2") },
  ]),
};

describe("authHeaders", () => {
  it("builds static auth headers and stays empty for none/cookie/token-fn", () => {
    expect(authHeaders({ kind: "bearer", token: "abc" })).toEqual({ Authorization: "Bearer abc" });
    expect(authHeaders({ kind: "basic", username: "u", password: "p" })).toEqual({
      Authorization: "Basic " + btoa("u:p"),
    });
    expect(authHeaders({ kind: "none" })).toEqual({});
    expect(authHeaders({ kind: "cookie" })).toEqual({});
    expect(authHeaders({ kind: "bearer", token: () => "x" })).toEqual({});
  });
});

describe("DicomWebDataSource", () => {
  it("lists image + SR report series, sorted by SeriesNumber (SR is rendered, not dropped)", async () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: fakeClient as never });
    const series = await ds.getSeries(["study-1"]);
    expect(series.map((s) => s.seriesInstanceUID)).toEqual(["S1", "S2", "SR1"]);
    expect(series[0]).toMatchObject({ modality: "CT", seriesDescription: "Scout" });
  });

  it("emits numberOfFrames undefined (not 0) when the PACS omits the instance count", async () => {
    // NumberOfSeriesRelatedInstances (0020,1209) is an optional QIDO return field;
    // a missing count must NOT read as a zero-instance report and suppress previews.
    const noCount = {
      searchForSeries: vi.fn(async () => [
        { "0020000E": V("CT1"), "00080060": V("CT"), "00200011": V("1"), "0008103E": V("Axial") },
      ]),
      retrieveSeriesMetadata: vi.fn(async () => []),
    };
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: noCount as never });
    const series = await ds.getSeries(["study-1"]);
    expect(series[0]!.numberOfFrames).toBeUndefined();
  });

  it("still drops non-renderable, non-report modalities (PR/KO/PLAN)", async () => {
    const koClient = {
      searchForSeries: vi.fn(async () => [
        { "0020000E": V("PR1"), "00080060": V("PR"), "00200011": V("1") },
        { "0020000E": V("KO1"), "00080060": V("KO"), "00200011": V("2") },
        { "0020000E": V("CT1"), "00080060": V("CT"), "00200011": V("3"), "00201209": V("5") },
      ]),
      retrieveSeriesMetadata: vi.fn(async () => []),
    };
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: koClient as never });
    const series = await ds.getSeries(["study-1"]);
    expect(series.map((s) => s.seriesInstanceUID)).toEqual(["CT1"]);
  });

  it("getImageIds orders by InstanceNumber, expands frames, registers root-aware metadata", async () => {
    h.add.mockClear();
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: fakeClient as never });
    const ids = await ds.getImageIds({ seriesInstanceUID: "S1", studyInstanceUID: "study-1" });
    expect(ids).toEqual([
      "wadors:/pacs/dicom-web/studies/study-1/series/S1/instances/sop-1/frames/1",
      "wadors:/pacs/dicom-web/studies/study-1/series/S1/instances/sop-1/frames/2",
      "wadors:/pacs/dicom-web/studies/study-1/series/S1/instances/sop-2/frames/1",
    ]);
    expect(h.add).toHaveBeenCalledWith(
      "wadors:/pacs/dicom-web/studies/study-1/series/S1/instances/sop-1/frames/1",
      expect.anything(),
    );
  });

  it("strips a trailing slash from root", async () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web/", client: fakeClient as never });
    const ids = await ds.getImageIds({ seriesInstanceUID: "S1", studyInstanceUID: "study-1" });
    expect(ids[0]).toBe(
      "wadors:/pacs/dicom-web/studies/study-1/series/S1/instances/sop-1/frames/1",
    );
  });

  it("fills study-level facts from the series-search response", async () => {
    const client = {
      searchForSeries: async () => [
        {
          "0020000E": { Value: ["S1"] },
          "00200011": { Value: [1] },
          "00080060": { Value: ["CT"] },
          "0008103E": { Value: ["Axial"] },
          "00080020": { Value: ["20240115"] },
          "00081030": { Value: ["CHEST CT"] },
          "00100010": { Value: [{ Alphabetic: "DOE^JANE" }] },
          "00100020": { Value: ["PID-7"] },
        },
      ],
    };
    const ds = new DicomWebDataSource({ root: "/dw", client: client as never });
    const [s] = await ds.getSeries(["ST1"]);
    expect(s.study).toEqual({
      studyDate: "20240115",
      studyDescription: "CHEST CT",
      patientName: "DOE^JANE",
      patientId: "PID-7",
    });
  });

  it("omits absent study facts rather than storing empty strings", async () => {
    const client = {
      searchForSeries: async () => [
        { "0020000E": { Value: ["S1"] }, "00080060": { Value: ["CT"] } },
      ],
    };
    const ds = new DicomWebDataSource({ root: "/dw", client: client as never });
    const [s] = await ds.getSeries(["ST1"]);
    expect(s.study).toEqual({});
  });
});

describe("DicomWebDataSource encapsulated PDFs", () => {
  const pdfClient = {
    searchForSeries: vi.fn(async () => [
      { "0020000E": V("DOC1"), "00080060": V("DOC"), "00200011": V("1"), "0008103E": V("Report") },
    ]),
    retrieveSeriesMetadata: vi.fn(async () => [
      // Encapsulated PDF: PDF SOP class + a BulkDataURI, no Rows → not an image.
      {
        "00080018": V("pdf-sop"),
        "00080016": V("1.2.840.10008.5.1.4.1.1.104.1"),
        "00200013": V("1"),
        "00420011": {
          BulkDataURI:
            "http://orthanc/internal/studies/study-1/series/DOC1/instances/pdf-sop/bulk/00420011",
        },
      },
    ]),
  };

  /** Build a WADO-RS-style multipart/related body wrapping `payload`. */
  function multipart(payload: string): ArrayBuffer {
    const enc = new TextEncoder();
    const head = enc.encode("--b\r\nContent-Type: application/octet-stream\r\n\r\n");
    const body = enc.encode(payload);
    const tail = enc.encode("\r\n--b--\r\n");
    const out = new Uint8Array(head.length + body.length + tail.length);
    out.set(head, 0);
    out.set(body, head.length);
    out.set(tail, head.length + body.length);
    return out.buffer;
  }

  it("lists a DOC (encapsulated-PDF report) series — report modalities are NOT filtered", async () => {
    // Regression guard: a standalone DOC report series (Modality DOC, its own
    // Series UID — the common encapsulated-PDF shape) must appear in the rail.
    // DOC/OT are deliberately absent from NON_RENDERABLE_MODALITIES. If a DOC
    // series is missing from the viewer, the QIDO /series response lacked it, not
    // this code.
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: pdfClient as never });
    const series = await ds.getSeries(["study-1"]);
    expect(series.map((s) => s.seriesInstanceUID)).toContain("DOC1");
    expect(series.find((s) => s.seriesInstanceUID === "DOC1")).toMatchObject({ modality: "DOC" });
  });

  it("excludes PDFs from imageIds and exposes them via listPdfs", async () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: pdfClient as never });
    const series = { seriesInstanceUID: "DOC1", studyInstanceUID: "study-1" };
    const ids = await ds.getImageIds(series);
    expect(ids).toEqual([]);
    expect(ds.listPdfs(series)).toEqual([
      {
        sopUid: "pdf-sop",
        bulkDataUri: expect.stringContaining(
          "/studies/study-1/series/DOC1/instances/pdf-sop/bulk/00420011",
        ),
      },
    ]);
  });

  it("getPdfObjectUrl fetches the bulk payload (rebased onto root), strips the multipart envelope, returns a pdf object URL", async () => {
    const captured: Blob[] = [];
    const origCreate = globalThis.URL.createObjectURL;
    globalThis.URL.createObjectURL = vi.fn((b: Blob) => {
      captured.push(b);
      return "blob:pdf";
    }) as never;
    const fetchFn = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'multipart/related; type="application/octet-stream"' },
      arrayBuffer: async () => multipart("%PDF-1.7 hello"),
    })) as unknown as typeof fetch;
    try {
      const ds = new DicomWebDataSource({
        root: "/pacs/dicom-web",
        client: pdfClient as never,
        fetchFn,
      });
      const series = { seriesInstanceUID: "DOC1", studyInstanceUID: "study-1" };
      const url = await ds.getPdfObjectUrl(series, {
        sopUid: "pdf-sop",
        bulkDataUri: "http://orthanc/x/studies/study-1/series/DOC1/instances/pdf-sop/bulk/00420011",
      });
      expect(url).toBe("blob:pdf");
      expect(fetchFn).toHaveBeenCalledWith(
        "/pacs/dicom-web/studies/study-1/series/DOC1/instances/pdf-sop/bulk/00420011",
        expect.objectContaining({ credentials: expect.any(String) }),
      );
      const bytes = new Uint8Array(await captured[0].arrayBuffer());
      expect(new TextDecoder().decode(bytes)).toBe("%PDF-1.7 hello");
    } finally {
      globalThis.URL.createObjectURL = origCreate;
    }
  });
});

describe("DicomWebDataSource structured reports", () => {
  const seq = (...items: Record<string, unknown>[]) => ({ Value: items });
  const code = (val: string, scheme: string, meaning: string) => ({
    "00080100": V(val),
    "00080102": V(scheme),
    "00080104": V(meaning),
  });
  const srClient = {
    searchForSeries: vi.fn(async () => [
      { "0020000E": V("SR1"), "00080060": V("SR"), "00200011": V("9"), "0008103E": V("Report") },
    ]),
    retrieveSeriesMetadata: vi.fn(async () => [
      {
        "00080018": V("sr-sop"),
        "00080016": V("1.2.840.10008.5.1.4.1.1.88.11"), // Basic Text SR
        "00200013": V("1"),
        "0040A040": V("CONTAINER"),
        "0040A043": seq(code("111060", "DCM", "Report")),
        "0040A730": seq({
          "0040A010": V("CONTAINS"),
          "0040A040": V("TEXT"),
          "0040A043": seq(code("121071", "DCM", "Finding")),
          "0040A160": V("No acute abnormality."),
        }),
      },
    ]),
  };

  it("excludes SR from imageIds, lists it as a report, and parses getStructuredReport", async () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: srClient as never });
    const series = { seriesInstanceUID: "SR1", studyInstanceUID: "study-1" };
    expect(await ds.getImageIds(series)).toEqual([]); // SR carries no pixel frames
    expect(ds.listReports!(series)).toEqual([
      expect.objectContaining({ sopUid: "sr-sop", kind: "sr" }),
    ]);
    const tree = await ds.getStructuredReport!(series, { sopUid: "sr-sop", kind: "sr" });
    expect(tree.title).toBe("Report");
    expect(tree.root.children[0]).toMatchObject({
      valueType: "TEXT",
      text: "No acute abnormality.",
    });
  });
});

describe("DicomWebDataSource study search (QIDO-RS)", () => {
  const studyClient = {
    searchForStudies: vi.fn(async () => [
      {
        "0020000D": V("1.2.3"),
        "00100010": { vr: "PN", Value: [{ Alphabetic: "DOE^JANE" }] },
        "00100020": V("PID-1"),
        "00080020": V("20240115"),
        "00081030": V("CHEST CT"),
        "00080050": V("ACC-9"),
        "00080061": { Value: ["CT", "SR"] },
        "00201206": V("3"),
        "00201208": V("250"),
      },
    ]),
    searchForSeries: vi.fn(async () => []),
    retrieveSeriesMetadata: vi.fn(async () => []),
  };

  it("advertises the studySearch capability", () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: studyClient as never });
    expect(ds.capabilities.studySearch).toBe(true);
  });

  it("maps QIDO-RS study results into StudySummary (PatientName from the Alphabetic component)", async () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: studyClient as never });
    const studies = await ds.searchStudies();
    expect(studies).toEqual([
      {
        studyInstanceUID: "1.2.3",
        patientName: "DOE^JANE",
        patientId: "PID-1",
        studyDate: "20240115",
        studyDescription: "CHEST CT",
        accessionNumber: "ACC-9",
        modalitiesInStudy: ["CT", "SR"],
        numberOfSeries: 3,
        numberOfInstances: 250,
      },
    ]);
  });

  it("passes query filters through as QIDO tag params (omitting empty fields)", async () => {
    const client = {
      searchForStudies: vi.fn(async () => []),
      searchForSeries: vi.fn(async () => []),
      retrieveSeriesMetadata: vi.fn(async () => []),
    };
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: client as never });
    await ds.searchStudies({ patientId: "PID-1", modality: "CT", limit: 25 });
    expect(client.searchForStudies).toHaveBeenCalledWith({
      queryParams: { "00100020": "PID-1", "00080061": "CT", limit: "25" },
    });
  });

  it("calls searchForStudies with no params when the query is empty", async () => {
    const client = {
      searchForStudies: vi.fn(async () => []),
      searchForSeries: vi.fn(async () => []),
      retrieveSeriesMetadata: vi.fn(async () => []),
    };
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: client as never });
    await ds.searchStudies();
    expect(client.searchForStudies).toHaveBeenCalledWith(undefined);
  });
});

describe("DicomWebDataSource DICOM-SEG", () => {
  const SEG = "1.2.840.10008.5.1.4.1.1.66.4";
  const SEQ = (...items: Record<string, unknown>[]) => ({ Value: items });
  const segClient = {
    searchForStudies: vi.fn(async () => []),
    searchForSeries: vi.fn(async () => [
      { "0020000E": V("SEG1"), "00080060": V("SEG"), "00200011": V("5") },
    ]),
    retrieveSeriesMetadata: vi.fn(async () => [
      {
        "00080018": V("seg-sop"),
        "00080016": V(SEG),
        "0008103E": V("Tumor seg"),
        "00200013": V("1"),
        "00280010": V(2),
        "00280011": V(2),
        "00280008": V(2),
        "00081115": SEQ({ "0020000E": V("CT-SERIES") }),
        "00620002": SEQ(
          { "00620004": V(1), "00620005": V("Tumor") },
          { "00620004": V(2), "00620005": V("Edema") },
        ),
      },
    ]),
  };

  it("advertises the segmentations capability", () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: segClient as never });
    expect(ds.capabilities.segmentations).toBe(true);
  });

  it("routes a SEG instance out of imageIds and lists it as a segmentation", async () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: segClient as never });
    const series = { seriesInstanceUID: "SEG1", studyInstanceUID: "study-1" };
    // A SEG carries Rows/PixelData but is not a renderable stack — it must not
    // leak into the image ids (which would stack the labelmap as grayscale).
    expect(await ds.getImageIds(series)).toEqual([]);
    expect(ds.listSegmentations!(series)).toEqual([
      {
        sopUid: "seg-sop",
        label: "Tumor seg",
        segmentCount: 2,
        referencedSeriesUid: "CT-SERIES",
      },
    ]);
  });
});

describe("DicomWebDataSource STOW-RS upload", () => {
  it("advertises the store capability", () => {
    const ds = new DicomWebDataSource({ root: "/pacs/dicom-web", client: fakeClient as never });
    expect(ds.capabilities.store).toBe(true);
  });

  it("POSTs instances as multipart/related and parses the store response", async () => {
    let body: BodyInit | undefined;
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      body = init.body!;
      return {
        ok: true,
        json: async () => ({
          "00081199": { Value: [{ "00081155": V("sop-a") }, { "00081155": V("sop-b") }] },
          "00081198": { Value: [{ "00081155": V("sop-c"), "00081197": V("272") }] },
        }),
      };
    }) as unknown as typeof fetch;
    const ds = new DicomWebDataSource({
      root: "/pacs/dicom-web",
      client: fakeClient as never,
      fetchFn,
    });
    const dcm = new TextEncoder().encode("DICM-bytes").buffer;
    const result = await ds.storeInstances([dcm]);
    expect(result).toEqual({
      stored: ["sop-a", "sop-b"],
      failed: [{ sopUid: "sop-c", reason: "272" }],
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "/pacs/dicom-web/studies",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": expect.stringContaining('multipart/related; type="application/dicom"'),
        }),
      }),
    );
    const text = new TextDecoder().decode(body as Uint8Array);
    expect(text).toContain("Content-Type: application/dicom");
    expect(text).toContain("DICM-bytes");
  });

  it("targets a study-specific URL when a studyUid is given", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const ds = new DicomWebDataSource({
      root: "/pacs/dicom-web",
      client: fakeClient as never,
      fetchFn,
    });
    await ds.storeInstances([new Uint8Array([1, 2, 3])], { studyUid: "1.2.3" });
    expect(fetchFn).toHaveBeenCalledWith("/pacs/dicom-web/studies/1.2.3", expect.anything());
  });

  it("throws on a non-OK STOW response", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const ds = new DicomWebDataSource({
      root: "/pacs/dicom-web",
      client: fakeClient as never,
      fetchFn,
    });
    await expect(ds.storeInstances([new Uint8Array([1])])).rejects.toThrow(/409/);
  });

  it("routes a SEG out of the stack and decodes it into per-source-image labelmaps", async () => {
    const refSrc = (sop: string) => ({
      "00089124": { Value: [{ "00082112": { Value: [{ "00081155": V(sop) }] } }] },
    });
    const frame = (segNum: string, srcSop: string) => ({
      "0062000A": { Value: [{ "0062000B": V(segNum) }] },
      ...refSrc(srcSop),
    });
    const segMeta = {
      "00080016": V("1.2.840.10008.5.1.4.1.1.66.4"), // SOP Class = Segmentation Storage
      "00080018": V("seg-1"), // SOP Instance UID
      "0008103E": V("Tumor SEG"), // Series Description (label)
      "00280010": V("1"), // Rows
      "00280011": V("2"), // Columns
      "00280008": V("2"), // NumberOfFrames
      "00620002": { Value: [{ "00620004": V("1"), "00620005": V("Tumor") }] }, // Segment Sequence
      "00081115": { Value: [{ "0020000E": V("S1") }] }, // Referenced Series
      "52009230": { Value: [frame("1", "sopA"), frame("1", "sopB")] }, // Per-frame Functional Groups
      "7FE00010": {
        BulkDataURI: "https://pacs/studies/study-1/series/Sseg/instances/seg-1/pixeldata",
      },
    };
    const client = {
      searchForSeries: vi.fn(async () => []),
      retrieveSeriesMetadata: vi.fn(async () => [segMeta]),
    };
    // BINARY bitstream (LSB-first, continuous): frame0 px0=1, frame1 px1=1 -> 0b1001 = 0x09.
    const segPixels = Uint8Array.from([0x09]);
    const fetchFn = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => segPixels.slice().buffer,
      headers: { get: () => "application/octet-stream" },
    })) as unknown as typeof fetch;

    const ds = new DicomWebDataSource({
      root: "/pacs/dicom-web",
      client: client as never,
      fetchFn,
    });
    const series = { seriesInstanceUID: "Sseg", studyInstanceUID: "study-1" } as never;

    const ids = await ds.getImageIds(series);
    expect(ids).toEqual([]); // SEG is routed out of the image stack
    const segList = ds.listSegmentations(series);
    expect(segList).toEqual([
      { sopUid: "seg-1", label: "Tumor SEG", segmentCount: 1, referencedSeriesUid: "S1" },
    ]);

    const data = await ds.getSegmentation!(series, segList[0]);
    expect(data.info.segments.map((s) => s.label)).toEqual(["Tumor"]);
    const bySop = Object.fromEntries(
      data.labelmaps.map((l) => [l.sourceSopInstanceUid, Array.from(l.data)]),
    );
    expect(bySop).toEqual({ sopA: [1, 0], sopB: [0, 1] });
    expect(fetchFn).toHaveBeenCalled();
  });
});

describe("DicomWebDataSource.getThumbnail", () => {
  const series = {
    seriesInstanceUID: "S1",
    studyInstanceUID: "ST1",
    modality: "CT",
    numberOfFrames: 100,
  };

  it("fetches the WADO-RS series thumbnail and returns the JPEG blob", async () => {
    const blob = new Blob(["jpg"], { type: "image/jpeg" });
    const fetchFn = vi.fn(
      async () => ({ ok: true, blob: async () => blob }) as unknown as Response,
    );
    const ds = new DicomWebDataSource({
      root: "/pacs/dicom-web",
      client: fakeClient as never,
      fetchFn,
    });
    const out = await ds.getThumbnail(series);
    expect(out).toBe(blob);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/pacs/dicom-web/studies/ST1/series/S1/thumbnail?viewport=200,200");
    expect(init.headers).toMatchObject({ Accept: "image/jpeg" });
  });

  it("returns null on a non-ok response", async () => {
    const fetchFn = vi.fn(
      async () => ({ ok: false, blob: async () => new Blob() }) as unknown as Response,
    );
    const ds = new DicomWebDataSource({ root: "/r", client: fakeClient as never, fetchFn });
    await expect(ds.getThumbnail(series)).resolves.toBeNull();
  });

  it("returns null when the fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network");
    });
    const ds = new DicomWebDataSource({ root: "/r", client: fakeClient as never, fetchFn });
    await expect(ds.getThumbnail(series)).resolves.toBeNull();
  });

  it("returns null (no fetch) when the series has no studyInstanceUID", async () => {
    const fetchFn = vi.fn();
    const ds = new DicomWebDataSource({ root: "/r", client: fakeClient as never, fetchFn });
    await expect(ds.getThumbnail({ seriesInstanceUID: "S1" })).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns null on a 0-byte blob", async () => {
    const fetchFn = vi.fn(
      async () => ({ ok: true, blob: async () => new Blob([]) }) as unknown as Response,
    );
    const ds = new DicomWebDataSource({ root: "/r", client: fakeClient as never, fetchFn });
    await expect(ds.getThumbnail(series)).resolves.toBeNull();
  });
});
