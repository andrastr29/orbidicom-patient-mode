import { describe, it, expect, vi } from "vitest";
import { LocalDataSource, type LocalTags } from "../src/datasources/local";
import type { SrTree } from "../src/sr/types";

function file(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name);
}

const tagsByName: Record<string, LocalTags> = {
  "a.dcm": {
    seriesInstanceUID: "S1",
    seriesNumber: 1,
    modality: "CT",
    seriesDescription: "Axial",
    sopInstanceUID: "i2",
    instanceNumber: 2,
  },
  "b.dcm": {
    seriesInstanceUID: "S1",
    seriesNumber: 1,
    modality: "CT",
    seriesDescription: "Axial",
    sopInstanceUID: "i1",
    instanceNumber: 1,
  },
  "c.dcm": {
    seriesInstanceUID: "S2",
    seriesNumber: 2,
    modality: "MR",
    seriesDescription: "T2",
    sopInstanceUID: "j1",
    instanceNumber: 1,
  },
  "report.dcm": {
    seriesInstanceUID: "SR1",
    seriesNumber: 9,
    modality: "SR",
    seriesDescription: "Report",
    sopInstanceUID: "sr1",
    instanceNumber: 1,
  },
  // Parses as DICOM but has no PixelData and blank modality (e.g. DICOMDIR) —
  // must be skipped rather than forming a phantom "Series" that hangs on select.
  DICOMDIR: {
    seriesInstanceUID: "local-series",
    seriesNumber: 0,
    modality: "",
    seriesDescription: "",
    sopInstanceUID: "dd1",
    instanceNumber: 1,
    hasPixelData: false,
  },
};

// A parseFile that throws for non-DICOM files (mirrors dicom-parser rejecting them).
const parseFile = async (f: File): Promise<LocalTags> => {
  const t = tagsByName[f.name];
  if (!t) throw new Error("not a DICOM file");
  return t;
};

describe("LocalDataSource", () => {
  it("groups files into series, orders by InstanceNumber, and returns the added count", async () => {
    let n = 0;
    const ds = new LocalDataSource({ parseFile, addFile: () => `dicomfile:${n++}` });

    const added = await ds.addFiles([file("a.dcm"), file("b.dcm"), file("c.dcm")]);
    expect(added).toBe(3);

    const series = await ds.getSeries([]);
    expect(series.map((s) => s.seriesInstanceUID)).toEqual(["S1", "S2"]);
    expect(series[0]).toMatchObject({
      studyInstanceUID: "local",
      modality: "CT",
      seriesDescription: "Axial",
      numberOfFrames: 2, // per-series image count (S1 has a.dcm + b.dcm)
    });
    expect(series[1].numberOfFrames).toBe(1);

    // a.dcm got id dicomfile:0 (instance 2), b.dcm got dicomfile:1 (instance 1).
    const s1Ids = await ds.getImageIds(series[0]);
    expect(s1Ids).toEqual(["dicomfile:1", "dicomfile:0"]);
    expect(await ds.getImageIds(series[1])).toEqual(["dicomfile:2"]);
  });

  it("expands multi-frame instances into per-frame imageIds and counts frames, not files", async () => {
    // A single multi-frame PET object (one file, three frames) — the DICOMweb path
    // already expands these; the local path must too, or frames 2..N are lost.
    const multi: Record<string, LocalTags> = {
      "pet.dcm": {
        seriesInstanceUID: "PT1",
        seriesNumber: 3,
        modality: "PT",
        seriesDescription: "PET WB",
        sopInstanceUID: "pt1",
        instanceNumber: 1,
        numberOfFrames: 3,
      },
    };
    const parse = async (f: File): Promise<LocalTags> => {
      const t = multi[f.name];
      if (!t) throw new Error("not a DICOM file");
      return t;
    };
    const ds = new LocalDataSource({ parseFile: parse, addFile: () => "dicomfile:7" });
    const added = await ds.addFiles([file("pet.dcm")]);
    expect(added).toBe(1); // one instance ingested...

    const series = await ds.getSeries([]);
    expect(series[0].numberOfFrames).toBe(3); // ...but three renderable frames

    // wadouri addresses frames with a 1-based ?frame=N query param.
    expect(await ds.getImageIds(series[0])).toEqual([
      "dicomfile:7?frame=1",
      "dicomfile:7?frame=2",
      "dicomfile:7?frame=3",
    ]);
  });

  it("drops non-renderable modalities (SR/PR/KO/PLAN)", async () => {
    const ds = new LocalDataSource({ parseFile, addFile: () => "dicomfile:x" });
    const added = await ds.addFiles([file("a.dcm"), file("report.dcm")]);
    expect(added).toBe(1); // SR report skipped
    const series = await ds.getSeries([]);
    expect(series.map((s) => s.seriesInstanceUID)).toEqual(["S1"]);
  });

  it("drops instances with no PixelData (DICOMDIR / blank-modality non-images)", async () => {
    const ds = new LocalDataSource({ parseFile, addFile: () => "dicomfile:x" });
    const added = await ds.addFiles([file("a.dcm"), file("DICOMDIR")]);
    expect(added).toBe(1); // DICOMDIR (hasPixelData:false) skipped — no phantom series
    const series = await ds.getSeries([]);
    expect(series.map((s) => s.seriesInstanceUID)).toEqual(["S1"]);
  });

  it("skips files that aren't DICOM (study folders contain DICOMDIR, READMEs, etc.)", async () => {
    const addFile = (() => {
      let n = 0;
      return () => `dicomfile:${n++}`;
    })();
    const ds = new LocalDataSource({ parseFile, addFile });

    const added = await ds.addFiles([
      file("README.txt"),
      file("a.dcm"),
      file("DICOMDIR"),
      file("b.dcm"),
    ]);
    expect(added).toBe(2); // only the two .dcm parsed
    const series = await ds.getSeries([]);
    expect(series).toHaveLength(1);
    expect(await ds.getImageIds(series[0])).toHaveLength(2);
  });

  it("dedupes repeated SOP instances (folder + its zip, or the same file twice)", async () => {
    let n = 0;
    const ds = new LocalDataSource({ parseFile, addFile: () => `dicomfile:${n++}` });
    const added = await ds.addFiles([file("a.dcm"), file("a.dcm"), file("b.dcm")]);
    expect(added).toBe(2); // second a.dcm (same sopInstanceUID i2) skipped
    const series = await ds.getSeries([]);
    expect(await ds.getImageIds(series[0])).toHaveLength(2);
  });

  it("returns [] for an unknown series and advertises a no-PACS capability set", async () => {
    const ds = new LocalDataSource({ parseFile, addFile: () => "dicomfile:x" });
    expect(await ds.getImageIds({ seriesInstanceUID: "nope" })).toEqual([]);
    expect(ds.capabilities).toMatchObject({ downloadArchive: false, multiStudy: false });
  });
});

describe("LocalDataSource encapsulated PDFs", () => {
  const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
  // A parseFile that returns an encapsulated-PDF report for doc.dcm, an image for
  // a.dcm, and rejects anything else (mirrors dicom-parser).
  const parsePdf = async (f: File): Promise<LocalTags> => {
    if (f.name === "doc.dcm")
      return {
        seriesInstanceUID: "DOC1",
        seriesNumber: 9,
        modality: "DOC",
        seriesDescription: "Report",
        sopInstanceUID: "pdf1",
        instanceNumber: 1,
        report: { kind: "pdf", bytes: PDF_BYTES },
      };
    if (f.name === "a.dcm")
      return {
        seriesInstanceUID: "S1",
        seriesNumber: 1,
        modality: "CT",
        seriesDescription: "Axial",
        sopInstanceUID: "i1",
        instanceNumber: 1,
      };
    throw new Error("not a DICOM file");
  };

  it("ingests an encapsulated-PDF instance (not dropped) and exposes it via listPdfs", async () => {
    const ds = new LocalDataSource({ parseFile: parsePdf, addFile: () => "dicomfile:x" });
    const added = await ds.addFiles([file("a.dcm"), file("doc.dcm")]);
    expect(added).toBe(2); // PDF report ingested, not dropped

    const series = await ds.getSeries([]);
    const doc = series.find((s) => s.seriesInstanceUID === "DOC1");
    expect(doc).toBeDefined();
    // A PDF-only series carries no displayable image frames.
    expect(doc!.numberOfFrames).toBe(0);
    expect(await ds.getImageIds(doc!)).toEqual([]);

    expect(ds.capabilities.encapsulatedPdf).toBe(true);
    expect(ds.listPdfs!(doc!)).toEqual([{ sopUid: "pdf1", bulkDataUri: null }]);
  });

  it("ingests an SR instance, lists it as a report, and returns its parsed tree", async () => {
    const tree: SrTree = {
      title: "Report",
      root: {
        valueType: "CONTAINER",
        children: [{ valueType: "TEXT", text: "No acute abnormality.", children: [] }],
      },
    };
    const parseSr = async (f: File): Promise<LocalTags> => {
      if (f.name !== "sr.dcm") throw new Error("not a DICOM file");
      return {
        seriesInstanceUID: "SR1",
        seriesNumber: 9,
        modality: "SR",
        seriesDescription: "Report",
        sopInstanceUID: "sr1",
        instanceNumber: 1,
        report: { kind: "sr", tree },
      };
    };
    const ds = new LocalDataSource({ parseFile: parseSr, addFile: () => "dicomfile:x" });
    expect(await ds.addFiles([file("sr.dcm")])).toBe(1);

    const sr = (await ds.getSeries([]))[0];
    expect(sr.seriesInstanceUID).toBe("SR1");
    expect(sr.numberOfFrames).toBe(0);
    expect(await ds.getImageIds(sr)).toEqual([]);
    expect(ds.capabilities.reports?.sr).toBe(true);
    expect(ds.listReports!(sr)).toEqual([expect.objectContaining({ sopUid: "sr1", kind: "sr" })]);

    const got = await ds.getStructuredReport!(sr, { sopUid: "sr1", kind: "sr" });
    expect(got.title).toBe("Report");
    expect(got.root.children[0]).toMatchObject({
      valueType: "TEXT",
      text: "No acute abnormality.",
    });
  });

  it("getPdfObjectUrl wraps the retained PDF bytes in an application/pdf object URL", async () => {
    const captured: Blob[] = [];
    const orig = globalThis.URL.createObjectURL;
    globalThis.URL.createObjectURL = vi.fn((b: Blob) => {
      captured.push(b);
      return "blob:local-pdf";
    }) as never;
    try {
      const ds = new LocalDataSource({ parseFile: parsePdf, addFile: () => "dicomfile:x" });
      await ds.addFiles([file("doc.dcm")]);
      const doc = (await ds.getSeries([]))[0];

      const url = await ds.getPdfObjectUrl!(doc, { sopUid: "pdf1", bulkDataUri: null });
      expect(url).toBe("blob:local-pdf");
      expect(captured[0].type).toBe("application/pdf");
      const bytes = new Uint8Array(await captured[0].arrayBuffer());
      expect(bytes).toEqual(PDF_BYTES);
    } finally {
      globalThis.URL.createObjectURL = orig;
    }
  });
});
