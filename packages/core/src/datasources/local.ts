import type {
  DataSource,
  SeriesSummary,
  DataSourceCapabilities,
  PdfInstance,
  ReportInstance,
  SrTree,
} from "../datasource";
import { srTreeFromParser, type ParserDataSet } from "../sr/from-parser";

// Encapsulated PDF Storage SOP Class UID (mirrors DicomWebDataSource).
const ENCAPSULATED_PDF_SOP = "1.2.840.10008.5.1.4.1.1.104.1";

/** A non-image report document carried by an instance (rendered, not stacked).
 *  A PDF carries its decoded bytes; an SR carries its parsed tree (parsed at
 *  ingestion, since the dicom-parser DataSet isn't retained afterwards). */
export type LocalReportPayload = { kind: "pdf"; bytes: Uint8Array } | { kind: "sr"; tree: SrTree };

export interface LocalTags {
  seriesInstanceUID: string;
  seriesNumber: number;
  modality: string;
  seriesDescription: string;
  sopInstanceUID: string;
  instanceNumber: number;
  /** NumberOfFrames (0028,0008) — how many frames this one instance carries.
   *  Multi-frame objects (Enhanced PET/CT, NM, cine) pack every slice into a
   *  single file; each frame is a separately-addressable image. Absent/≤1 means a
   *  classic single-frame instance. */
  numberOfFrames?: number;
  /** Whether the instance has PixelData (7FE0,0010). Instances without it
   *  (DICOMDIR, presentation states, structured reports, etc.) aren't renderable
   *  and are skipped so they can't form a phantom series that hangs on select.
   *  Optional: when omitted (e.g. an injected parseFile in tests) the instance is
   *  treated as renderable; only an explicit `false` skips it. */
  hasPixelData?: boolean;
  /** Present when the instance is a report document (e.g. an encapsulated PDF).
   *  Such instances carry no PixelData but are still rendered, so they bypass the
   *  hasPixelData / non-renderable-modality skips in {@link LocalDataSource.addFiles}. */
  report?: LocalReportPayload;
}

interface LocalInstance {
  imageId: string;
  instanceNumber: number;
  /** Frames in this instance (≥1). >1 means it's expanded into per-frame imageIds. */
  frames: number;
}

interface LocalReport {
  sopUid: string;
  instanceNumber: number;
  payload: LocalReportPayload;
}

// Modalities that carry no displayable pixel data (they reference other series):
// Presentation State, Structured Report, Key Object, RT Plan. Kept out of the
// viewer so selecting one can't hang on a series with nothing to decode. Mirrors
// DicomWebDataSource.
const NON_RENDERABLE_MODALITIES = new Set(["PR", "SR", "KO", "PLAN"]);

export interface LocalOptions {
  /** Register a File with the wadouri loader, returning its imageId. */
  addFile?: (file: File) => string | Promise<string>;
  /** Parse a file to the tags we group/sort by. Default: read bytes + dicom-parser. */
  parseFile?: (file: File) => Promise<LocalTags>;
}

/**
 * A {@link DataSource} for local `.dcm` files with no PACS. Files are registered
 * with Cornerstone's wadouri file manager (each yields a `dicomfile:` imageId)
 * and grouped into series via parsed DICOM tags. All files are treated as one
 * synthetic study ("local"), so {@link getSeries} ignores its `studyUids` arg.
 */
export class LocalDataSource implements DataSource {
  readonly capabilities: DataSourceCapabilities = {
    downloadArchive: false,
    encapsulatedPdf: true,
    reports: { pdf: true, sr: true },
    multiStudy: false,
  };
  private series = new Map<
    string,
    {
      summary: SeriesSummary;
      seriesNumber: number;
      instances: LocalInstance[];
      reports: LocalReport[];
    }
  >();
  private addFile: (file: File) => string | Promise<string>;
  private parseFile: (file: File) => Promise<LocalTags>;
  private seenSops = new Set<string>();

  constructor(opts: LocalOptions = {}) {
    this.addFile = opts.addFile ?? defaultAddFile;
    this.parseFile = opts.parseFile ?? defaultParseFile;
  }

  /**
   * Parse + register a batch of dropped/selected files. Call before getSeries.
   *
   * Files that aren't DICOM (fail to parse) are skipped rather than throwing, so
   * a dropped study folder or unzipped archive can contain DICOMDIR, READMEs,
   * thumbnails, etc. Returns the number of DICOM instances actually added.
   */
  async addFiles(files: File[]): Promise<number> {
    let added = 0;
    for (const file of files) {
      let t: LocalTags;
      try {
        t = await this.parseFile(file);
      } catch {
        continue; // not a DICOM file — skip it
      }
      // Report documents (encapsulated PDFs, …) carry no PixelData but are still
      // rendered as their own series, so they bypass the skips below. Deduped by
      // SOP UID like image instances.
      if (t.report) {
        if (t.sopInstanceUID && this.seenSops.has(t.sopInstanceUID)) continue;
        if (t.sopInstanceUID) this.seenSops.add(t.sopInstanceUID);
        this.entryFor(t).reports.push({
          sopUid: t.sopInstanceUID,
          instanceNumber: t.instanceNumber,
          payload: t.report,
        });
        added++;
        continue;
      }
      // Skip non-renderable modalities (SR/PR/KO/PLAN) and any instance without
      // PixelData (DICOMDIR / presentation states / reports — often blank
      // modality). Either would hang the viewer on a series with nothing to decode.
      if (NON_RENDERABLE_MODALITIES.has(t.modality?.toUpperCase())) continue;
      if (t.hasPixelData === false) continue;
      // Skip an instance already ingested (e.g. dropping a folder AND its zip, or
      // the same SOP under two subfolders) so slices aren't duplicated.
      if (t.sopInstanceUID && this.seenSops.has(t.sopInstanceUID)) continue;
      const imageId = await this.addFile(file);
      if (t.sopInstanceUID) this.seenSops.add(t.sopInstanceUID);
      this.entryFor(t).instances.push({
        imageId,
        instanceNumber: t.instanceNumber,
        frames: Math.max(1, t.numberOfFrames ?? 1),
      });
      added++;
    }
    return added;
  }

  /** Get or create the series entry for a parsed instance's tags. */
  private entryFor(t: LocalTags) {
    let entry = this.series.get(t.seriesInstanceUID);
    if (!entry) {
      entry = {
        summary: {
          seriesInstanceUID: t.seriesInstanceUID,
          studyInstanceUID: "local",
          modality: t.modality,
          seriesDescription: t.seriesDescription,
        },
        seriesNumber: t.seriesNumber,
        instances: [],
        reports: [],
      };
      this.series.set(t.seriesInstanceUID, entry);
    }
    return entry;
  }

  async getSeries(_studyUids: string[]): Promise<SeriesSummary[]> {
    return [...this.series.values()]
      .sort((a, b) => a.seriesNumber - b.seriesNumber)
      .map((e) => ({
        ...e.summary,
        // Count renderable frames, not files: a multi-frame instance is many images.
        numberOfFrames: e.instances.reduce((n, i) => n + i.frames, 0),
      }));
  }

  async getImageIds(series: SeriesSummary): Promise<string[]> {
    const entry = this.series.get(series.seriesInstanceUID);
    if (!entry) return [];
    return entry.instances
      .slice()
      .sort((a, b) => a.instanceNumber - b.instanceNumber)
      .flatMap((i) => framesToImageIds(i.imageId, i.frames));
  }

  /** @deprecated use {@link listReports}. Encapsulated PDFs ingested for this series. */
  listPdfs(series: SeriesSummary): PdfInstance[] {
    const entry = this.series.get(series.seriesInstanceUID);
    if (!entry) return [];
    return entry.reports
      .filter((r) => r.payload.kind === "pdf")
      .slice()
      .sort((a, b) => a.instanceNumber - b.instanceNumber)
      .map((r) => ({ sopUid: r.sopUid, bulkDataUri: null }));
  }

  /** Report documents (PDF + SR) ingested for this series. */
  listReports(series: SeriesSummary): ReportInstance[] {
    const entry = this.series.get(series.seriesInstanceUID);
    if (!entry) return [];
    return entry.reports
      .slice()
      .sort((a, b) => a.instanceNumber - b.instanceNumber)
      .map((r) => ({
        sopUid: r.sopUid,
        kind: r.payload.kind,
        instanceNumber: r.instanceNumber,
        ...(r.payload.kind === "pdf" ? { bulkDataUri: null } : {}),
      }));
  }

  /** Wrap a retained encapsulated-PDF's bytes in an application/pdf object URL.
   *  The caller renders it (e.g. via pdf.js) and must revoke the URL when done. */
  async getPdfObjectUrl(series: SeriesSummary, pdf: PdfInstance): Promise<string> {
    const entry = this.series.get(series.seriesInstanceUID);
    const report = entry?.reports.find((r) => r.sopUid === pdf.sopUid && r.payload.kind === "pdf");
    if (!report || report.payload.kind !== "pdf")
      throw new Error(`LocalDataSource: no PDF for SOP ${pdf.sopUid}`);
    // Copy into a fresh ArrayBuffer so the Blob part is unambiguously an
    // ArrayBuffer (mirrors DicomWebDataSource; sidesteps the Uint8Array/Blob
    // SharedArrayBuffer variance in the DOM lib types).
    const bytes = report.payload.bytes;
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    return URL.createObjectURL(new Blob([ab], { type: "application/pdf" }));
  }

  /** Return a Structured Report's tree (parsed at ingestion). */
  async getStructuredReport(series: SeriesSummary, report: ReportInstance): Promise<SrTree> {
    const entry = this.series.get(series.seriesInstanceUID);
    const found = entry?.reports.find((r) => r.sopUid === report.sopUid && r.payload.kind === "sr");
    if (!found || found.payload.kind !== "sr")
      throw new Error(`LocalDataSource: no SR for SOP ${report.sopUid}`);
    return found.payload.tree;
  }
}

/** Expand a wadouri file imageId into one imageId per frame.
 *  Single-frame instances keep their bare imageId (unchanged legacy behavior);
 *  multi-frame instances get a 1-based `?frame=N` query param, which the wadouri
 *  loader maps to pixelDataFrame N-1. */
function framesToImageIds(imageId: string, frames: number): string[] {
  if (frames <= 1) return [imageId];
  return Array.from({ length: frames }, (_v, i) => `${imageId}?frame=${i + 1}`);
}

// --- default wiring to Cornerstone / dicom-parser ----------------------------
// Lazy dynamic imports so importing LocalDataSource for its types never eagerly
// pulls the loader/parser (and keeps the module ESM-clean — no require()).

let loaderP: Promise<{ wadouri: { fileManager: { add: (f: File) => string } } }> | undefined;
async function defaultAddFile(file: File): Promise<string> {
  loaderP ??= import("@cornerstonejs/dicom-image-loader") as unknown as typeof loaderP;
  const loader = await loaderP!;
  return loader.wadouri.fileManager.add(file);
}

const DICM_MAGIC = [0x44, 0x49, 0x43, 0x4d]; // "DICM" at byte offset 128
// A headerless dataset (no 128-byte preamble — common on CD/DVD exports) is still
// parsed, but only up to this size, so a large non-DICOM payload dropped inside a
// study folder can't OOM the tab during the magic-byte sniff.
const NO_PREAMBLE_MAX_BYTES = 80 * 1024 * 1024;

type DicomElement = { dataOffset: number; length: number };
type ParsedDataSet = {
  string: (tag: string) => string | undefined;
  elements?: Record<string, DicomElement | undefined>;
  byteArray?: Uint8Array;
};
let parserP:
  | Promise<{
      parseDicom: (b: Uint8Array, opts?: { TransferSyntaxUID?: string }) => ParsedDataSet;
    }>
  | undefined;
async function defaultParseFile(file: File): Promise<LocalTags> {
  parserP ??= import("dicom-parser").then((m) => m.default) as unknown as typeof parserP;
  const dicomParser = await parserP!;

  // Cheap magic-byte sniff first (only the first 132 bytes): a Part-10 DICOM file
  // has "DICM" at offset 128. Buffer the whole file only once it's worth it; a
  // headerless dataset has no magic, so parse it too — but only when small enough.
  const head = new Uint8Array(await file.slice(0, 132).arrayBuffer());
  const hasPreamble = head.length >= 132 && DICM_MAGIC.every((b, i) => head[128 + i] === b);
  if (!hasPreamble && file.size > NO_PREAMBLE_MAX_BYTES) throw new Error("not a DICOM file");

  const bytes = new Uint8Array(await file.arrayBuffer());
  let ds: ParsedDataSet;
  try {
    ds = dicomParser.parseDicom(bytes);
  } catch {
    // Headerless / no-preamble datasets — retry as Implicit VR Little Endian.
    ds = dicomParser.parseDicom(bytes, { TransferSyntaxUID: "1.2.840.10008.1.2" });
  }
  // Encapsulated PDF (Encapsulated PDF Storage SOP class, or any instance carrying
  // an EncapsulatedDocument 0042,0011): slice its bytes out so getPdfObjectUrl can
  // wrap them in a Blob. These have no PixelData but are rendered, not skipped.
  const encEl = ds.elements?.["x00420011"];
  const isPdf = ds.string("x00080016") === ENCAPSULATED_PDF_SOP || encEl !== undefined;
  let report: LocalReportPayload | undefined;
  if (isPdf && encEl && ds.byteArray) {
    report = {
      kind: "pdf",
      bytes: ds.byteArray.slice(encEl.dataOffset, encEl.dataOffset + encEl.length),
    };
  } else if (ds.elements?.["x0040a730"] !== undefined) {
    // Structured Report: an SR Content Sequence (0040,A730) is present. Parse it
    // now — the dicom-parser DataSet isn't retained past this function.
    report = { kind: "sr", tree: srTreeFromParser(ds as unknown as ParserDataSet) };
  }

  return {
    seriesInstanceUID: ds.string("x0020000e") || "local-series",
    seriesNumber: Number(ds.string("x00200011")) || 0,
    modality: ds.string("x00080060") || "",
    seriesDescription: ds.string("x0008103e") || "",
    sopInstanceUID: ds.string("x00080018") || "",
    instanceNumber: Number(ds.string("x00200013")) || 0,
    // NumberOfFrames (0028,0008): multi-frame objects (Enhanced PET/CT, NM, cine)
    // pack every slice into one file. Absent → single-frame.
    numberOfFrames: Number(ds.string("x00280008")) || 1,
    // PixelData (7FE0,0010) present → a renderable image. Absent → DICOMDIR,
    // presentation state, structured report, etc. — skipped by addFiles.
    hasPixelData: ds.elements?.["x7fe00010"] !== undefined,
    report,
  };
}
