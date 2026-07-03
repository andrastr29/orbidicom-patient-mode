import { api } from "dicomweb-client";
import { wadors } from "@cornerstonejs/dicom-image-loader";
import type {
  DataSource,
  SeriesSummary,
  DataSourceCapabilities,
  PdfInstance,
  ReportInstance,
  SrTree,
  StudySummary,
  StudyQuery,
  StoreResult,
  SegmentationInstance,
  SegmentationData,
} from "../datasource";
import type { AuthStrategy } from "../auth";
import { authHeaders } from "../auth";
import { buildWadoRsImageId } from "../imageIds";
import { srTreeFromJson } from "../sr/from-json";
import { isSegmentation, parseSeg } from "../seg/parse";
import { decodeSegmentation } from "../seg/decode";

const TAG = {
  SERIES_UID: "0020000E",
  SERIES_NUMBER: "00200011",
  SERIES_DESCRIPTION: "0008103E",
  MODALITY: "00080060",
  NUM_SERIES_INSTANCES: "00201209",
  SOP_UID: "00080018",
  SOP_CLASS_UID: "00080016",
  NUMBER_OF_FRAMES: "00280008",
  INSTANCE_NUMBER: "00200013",
  ROWS: "00280010",
  PIXEL_DATA: "7FE00010",
  ENCAPSULATED_DOCUMENT: "00420011",
  CONTENT_SEQUENCE: "0040A730", // SR document root content
  CONTENT_LABEL: "00700080",
  CONTENT_DESCRIPTION: "00700081",
  // Study-level QIDO-RS query/return tags.
  STUDY_UID: "0020000D",
  PATIENT_NAME: "00100010",
  PATIENT_ID: "00100020",
  STUDY_DATE: "00080020",
  STUDY_TIME: "00080030",
  STUDY_DESCRIPTION: "00081030",
  ACCESSION_NUMBER: "00080050",
  MODALITIES_IN_STUDY: "00080061",
  NUM_STUDY_SERIES: "00201206",
  NUM_STUDY_INSTANCES: "00201208",
  // STOW-RS response sequences.
  REF_SOP_SEQUENCE: "00081199",
  FAILED_SOP_SEQUENCE: "00081198",
  REF_SOP_INSTANCE_UID: "00081155",
  FAILURE_REASON: "00081197",
} as const;

// Encapsulated PDF Storage SOP Class UID.
const ENCAPSULATED_PDF_SOP = "1.2.840.10008.5.1.4.1.1.104.1";

// Modalities the viewer cannot display: presentation states, key objects and RT
// plans reference other series with nothing to render on their own. SR is NOT
// listed here — Structured Reports are rendered (see getStructuredReport); PDF
// reports (DOC/OT) are likewise kept and handled by the encapsulated-PDF path.
const NON_RENDERABLE_MODALITIES = new Set(["PR", "KO", "PLAN"]);

/** The subset of dicomweb-client we use — lets tests inject a fake. */
export interface DICOMwebClientLike {
  searchForStudies(opts?: {
    queryParams?: Record<string, string>;
  }): Promise<Record<string, unknown>[]>;
  searchForSeries(opts: { studyInstanceUID: string }): Promise<Record<string, unknown>[]>;
  retrieveSeriesMetadata(opts: {
    studyInstanceUID: string;
    seriesInstanceUID: string;
  }): Promise<Record<string, unknown>[]>;
}

function first(obj: Record<string, unknown>, tag: string): string {
  const entry = obj?.[tag] as { Value?: unknown[] } | undefined;
  return String(entry?.Value?.[0] ?? "");
}
const num = (obj: Record<string, unknown>, tag: string) => Number(first(obj, tag)) || 0;

/**
 * Like {@link num}, but returns `undefined` when the tag is absent/empty rather
 * than collapsing it to 0. Used for optional QIDO counts (e.g.
 * NumberOfSeriesRelatedInstances) so "the server didn't return a count" isn't
 * conflated with "this series genuinely has zero instances" — the latter marks a
 * report, the former must not disable image previews.
 */
const numOpt = (obj: Record<string, unknown>, tag: string): number | undefined => {
  const raw = first(obj, tag);
  return raw === "" ? undefined : Number(raw) || 0;
};

/** Read a multi-valued string tag (e.g. ModalitiesInStudy), or undefined if empty. */
function multi(obj: Record<string, unknown>, tag: string): string[] | undefined {
  const vals = (obj?.[tag] as { Value?: unknown[] } | undefined)?.Value;
  return vals && vals.length ? vals.map(String) : undefined;
}

/** Read a Person Name tag, reducing it to its Alphabetic component group. */
function personName(obj: Record<string, unknown>, tag: string): string {
  const v = (obj?.[tag] as { Value?: unknown[] } | undefined)?.Value?.[0];
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return String((v as { Alphabetic?: string }).Alphabetic ?? "");
  return String(v);
}

export interface DicomWebOptions {
  /** DICOMweb base URL, e.g. "/pacs/dicom-web" or "https://host/dicom-web". */
  root: string;
  auth?: AuthStrategy;
  /** Inject a pre-built client (tests, or a custom transport). */
  client?: DICOMwebClientLike;
  /** Inject fetch (tests, or a custom transport) for the PDF bulk-data path. */
  fetchFn?: typeof fetch;
}

/**
 * A {@link DataSource} backed by a DICOMweb server (QIDO for the series list,
 * WADO-RS for metadata + frames). PACS-agnostic: the base URL and auth are
 * constructor arguments.
 */
export class DicomWebDataSource implements DataSource {
  readonly capabilities: DataSourceCapabilities = {
    downloadArchive: false,
    encapsulatedPdf: true,
    reports: { pdf: true, sr: true },
    multiStudy: true,
    studySearch: true,
    store: true,
    segmentations: true,
  };
  private root: string;
  private client: DICOMwebClientLike;
  private pdfsBySeries = new Map<string, PdfInstance[]>();
  // Structured Reports found per series during getImageIds, with their (already
  // fetched) DICOM-JSON metadata cached so getStructuredReport needs no extra call.
  private srBySeries = new Map<
    string,
    { sopUid: string; instanceNumber: number; modality: string; meta: Record<string, unknown> }[]
  >();
  private segsBySeries = new Map<string, SegmentationInstance[]>();
  // Full SEG instance metadata (per-frame groups + dims + PixelData BulkDataURI),
  // cached during getImageIds so getSegmentation needs no second metadata fetch.
  private segMetaBySop = new Map<string, Record<string, unknown>>();
  private fetchFn: typeof fetch;
  private headers: Record<string, string>;
  // Cookie auth rides on credentials; otherwise stay same-origin.
  private credentials: RequestCredentials;

  constructor(opts: DicomWebOptions) {
    this.root = opts.root.replace(/\/$/, "");
    const auth = opts.auth ?? { kind: "none" };
    this.headers = authHeaders(auth);
    this.credentials = auth.kind === "cookie" ? "include" : "same-origin";
    this.fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.client =
      opts.client ??
      (new api.DICOMwebClient({
        url: this.root,
        singlepart: false,
        headers: this.headers,
        withCredentials: auth.kind === "cookie",
        // dicomweb-client types omit some options; cast to pass them through.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any) as unknown as DICOMwebClientLike);
  }

  /**
   * Search the PACS worklist via QIDO-RS (`/studies`). Each {@link StudyQuery}
   * field is sent as a matching key; an empty query lists studies (server-capped).
   */
  async searchStudies(query: StudyQuery = {}): Promise<StudySummary[]> {
    const queryParams: Record<string, string> = {};
    if (query.patientName) queryParams[TAG.PATIENT_NAME] = query.patientName;
    if (query.patientId) queryParams[TAG.PATIENT_ID] = query.patientId;
    if (query.accessionNumber) queryParams[TAG.ACCESSION_NUMBER] = query.accessionNumber;
    if (query.studyDate) queryParams[TAG.STUDY_DATE] = query.studyDate;
    if (query.studyDescription) queryParams[TAG.STUDY_DESCRIPTION] = query.studyDescription;
    if (query.modality) queryParams[TAG.MODALITIES_IN_STUDY] = query.modality;
    if (query.limit != null) queryParams.limit = String(query.limit);
    if (query.offset != null) queryParams.offset = String(query.offset);
    const opts = Object.keys(queryParams).length ? { queryParams } : undefined;
    const list = await this.client.searchForStudies(opts);
    return list.map((s) => ({
      studyInstanceUID: first(s, TAG.STUDY_UID),
      patientName: personName(s, TAG.PATIENT_NAME) || undefined,
      patientId: first(s, TAG.PATIENT_ID) || undefined,
      studyDate: first(s, TAG.STUDY_DATE) || undefined,
      studyTime: first(s, TAG.STUDY_TIME) || undefined,
      studyDescription: first(s, TAG.STUDY_DESCRIPTION) || undefined,
      accessionNumber: first(s, TAG.ACCESSION_NUMBER) || undefined,
      modalitiesInStudy: multi(s, TAG.MODALITIES_IN_STUDY),
      numberOfSeries: num(s, TAG.NUM_STUDY_SERIES) || undefined,
      numberOfInstances: num(s, TAG.NUM_STUDY_INSTANCES) || undefined,
    }));
  }

  /**
   * Upload Part-10 instances via STOW-RS — POSTs them as a single
   * `multipart/related; type="application/dicom"` body to `/studies` (or
   * `/studies/{uid}`), then parses the Store-Instances response into a
   * {@link StoreResult}.
   */
  async storeInstances(
    files: (ArrayBuffer | Uint8Array)[],
    opts: { studyUid?: string } = {},
  ): Promise<StoreResult> {
    const url = opts.studyUid ? `${this.root}/studies/${opts.studyUid}` : `${this.root}/studies`;
    const body = buildMultipartRelated(files, STOW_BOUNDARY, "application/dicom");
    const res = await this.fetchFn(url, {
      method: "POST",
      credentials: this.credentials,
      headers: {
        "Content-Type": `multipart/related; type="application/dicom"; boundary=${STOW_BOUNDARY}`,
        Accept: "application/dicom+json",
        ...this.headers,
      },
      // A Uint8Array is a valid BufferSource body; cast past the typed-array generic.
      body: body as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(`STOW-RS upload failed: ${res.status}`);
    const json = await res.json().catch(() => null);
    return parseStowResponse(json);
  }

  async getSeries(studyUids: string[]): Promise<SeriesSummary[]> {
    const pairs: { summary: SeriesSummary; number: number }[] = [];
    for (const studyInstanceUID of studyUids) {
      const list = await this.client.searchForSeries({ studyInstanceUID });
      for (const s of list) {
        const modality = first(s, TAG.MODALITY);
        if (NON_RENDERABLE_MODALITIES.has(modality)) continue;
        pairs.push({
          summary: {
            seriesInstanceUID: first(s, TAG.SERIES_UID),
            studyInstanceUID,
            modality,
            seriesDescription: first(s, TAG.SERIES_DESCRIPTION),
            // Optional QIDO field: undefined (not 0) when the PACS omits it, so a
            // missing count doesn't read as a zero-instance report and suppress previews.
            numberOfFrames: numOpt(s, TAG.NUM_SERIES_INSTANCES),
          },
          number: num(s, TAG.SERIES_NUMBER),
        });
      }
    }
    return pairs.sort((a, b) => a.number - b.number).map((p) => p.summary);
  }

  async getImageIds(series: SeriesSummary): Promise<string[]> {
    const studyUid = series.studyInstanceUID;
    if (!studyUid)
      throw new Error("DicomWebDataSource.getImageIds requires series.studyInstanceUID");
    const seriesUid = series.seriesInstanceUID;
    const instances = await this.client.retrieveSeriesMetadata({
      studyInstanceUID: studyUid,
      seriesInstanceUID: seriesUid,
    });
    const ordered = instances
      .slice()
      .sort((a, b) => num(a, TAG.INSTANCE_NUMBER) - num(b, TAG.INSTANCE_NUMBER));

    const imageIds: string[] = [];
    const pdfs: PdfInstance[] = [];
    const segs: SegmentationInstance[] = [];
    const srs: {
      sopUid: string;
      instanceNumber: number;
      modality: string;
      meta: Record<string, unknown>;
    }[] = [];
    for (const meta of ordered) {
      const sopUid = first(meta, TAG.SOP_UID);
      if (!sopUid) continue;
      if (first(meta, TAG.SOP_CLASS_UID) === ENCAPSULATED_PDF_SOP) {
        const enc = meta[TAG.ENCAPSULATED_DOCUMENT] as { BulkDataURI?: string } | undefined;
        pdfs.push({ sopUid, bulkDataUri: enc?.BulkDataURI ?? null });
        continue;
      }
      // A Segmentation: it carries Rows/PixelData (a labelmap), so without this it
      // would be stacked as a grayscale image. Route it to listSegmentations instead.
      if (isSegmentation(meta)) {
        const info = parseSeg(meta);
        const label =
          first(meta, TAG.SERIES_DESCRIPTION) ||
          first(meta, TAG.CONTENT_DESCRIPTION) ||
          first(meta, TAG.CONTENT_LABEL);
        segs.push({
          sopUid,
          label: label || undefined,
          segmentCount: info.segments.length,
          referencedSeriesUid: info.referencedSeriesUid,
        });
        this.segMetaBySop.set(sopUid, meta);
        continue;
      }
      // A Structured Report: its Content Sequence is already inline in this
      // metadata, so cache it for getStructuredReport (no extra fetch).
      if (meta[TAG.CONTENT_SEQUENCE] !== undefined) {
        srs.push({
          sopUid,
          instanceNumber: num(meta, TAG.INSTANCE_NUMBER),
          modality: first(meta, TAG.MODALITY),
          meta,
        });
        continue;
      }
      if (meta[TAG.ROWS] === undefined) continue; // non-image, non-report — not renderable
      const frames = num(meta, TAG.NUMBER_OF_FRAMES) || 1;
      // Register once under frame 1; multiframe lookups fall back to this entry.
      wadors.metaDataManager.add(
        buildWadoRsImageId({ root: this.root, studyUid, seriesUid, sopUid, frame: 1 }),
        meta as Parameters<typeof wadors.metaDataManager.add>[1],
      );
      for (let f = 1; f <= frames; f++) {
        imageIds.push(
          buildWadoRsImageId({ root: this.root, studyUid, seriesUid, sopUid, frame: f }),
        );
      }
    }
    this.pdfsBySeries.set(seriesUid, pdfs);
    this.srBySeries.set(seriesUid, srs);
    this.segsBySeries.set(seriesUid, segs);
    return imageIds;
  }

  /** DICOM-SEG segmentations found during the last {@link getImageIds} for this series. */
  listSegmentations(series: SeriesSummary): SegmentationInstance[] {
    return this.segsBySeries.get(series.seriesInstanceUID) ?? [];
  }

  /**
   * Fetch and decode a SEG into segment definitions + per-source-image labelmaps.
   * Uses the metadata cached during {@link getImageIds} (per-frame groups, dims) and
   * fetches only the packed PixelData bitstream via its BulkDataURI. BINARY SEGs only.
   */
  async getSegmentation(
    series: SeriesSummary,
    seg: SegmentationInstance,
  ): Promise<SegmentationData> {
    void series;
    const meta = this.segMetaBySop.get(seg.sopUid);
    if (!meta) throw new Error(`DicomWebDataSource: no SEG metadata for SOP ${seg.sopUid}`);
    const pd = meta[TAG.PIXEL_DATA] as { BulkDataURI?: string } | undefined;
    if (!pd?.BulkDataURI) throw new Error(`SEG ${seg.sopUid} has no PixelData BulkDataURI`);

    const res = await this.fetchFn(proxyBulkUrl(this.root, pd.BulkDataURI), {
      credentials: this.credentials,
      headers: { Accept: 'multipart/related; type="application/octet-stream"', ...this.headers },
    });
    if (!res.ok) throw new Error(`SEG pixel-data fetch failed: ${res.status}`);
    const payload = extractBulkPayload(
      await res.arrayBuffer(),
      res.headers.get("Content-Type") ?? "",
    );
    return decodeSegmentation(meta, new Uint8Array(payload));
  }

  /** Encapsulated PDFs found during the last {@link getImageIds} for this series. */
  listPdfs(series: SeriesSummary): PdfInstance[] {
    return this.pdfsBySeries.get(series.seriesInstanceUID) ?? [];
  }

  /** All report documents (PDF + SR) found during the last {@link getImageIds}. */
  listReports(series: SeriesSummary): ReportInstance[] {
    const sid = series.seriesInstanceUID;
    const pdfs: ReportInstance[] = (this.pdfsBySeries.get(sid) ?? []).map((p) => ({
      sopUid: p.sopUid,
      kind: "pdf",
      bulkDataUri: p.bulkDataUri,
    }));
    const srs: ReportInstance[] = (this.srBySeries.get(sid) ?? []).map((s) => ({
      sopUid: s.sopUid,
      kind: "sr",
      instanceNumber: s.instanceNumber,
      modality: s.modality,
    }));
    return [...pdfs, ...srs];
  }

  /** Parse a cached SR instance's metadata into a normalized {@link SrTree}. */
  async getStructuredReport(series: SeriesSummary, report: ReportInstance): Promise<SrTree> {
    const entry = this.srBySeries
      .get(series.seriesInstanceUID)
      ?.find((s) => s.sopUid === report.sopUid);
    if (!entry) throw new Error(`DicomWebDataSource: no SR for SOP ${report.sopUid}`);
    return srTreeFromJson(entry.meta);
  }

  /**
   * Fetch an encapsulated PDF's bytes through the DICOMweb endpoint and return an
   * object URL (application/pdf). The caller renders it (e.g. via pdf.js) and must
   * revoke the URL when done.
   *
   * Prefers the server-advertised BulkDataURI (rebased onto our root so it stays
   * same-origin), falling back to Orthanc's `/bulk/<tag>` form. WADO-RS bulk data
   * comes back as multipart/related, so the MIME envelope is stripped.
   */
  async getPdfObjectUrl(series: SeriesSummary, pdf: PdfInstance): Promise<string> {
    const studyUid = series.studyInstanceUID;
    if (!studyUid)
      throw new Error("DicomWebDataSource.getPdfObjectUrl requires series.studyInstanceUID");
    const seriesUid = series.seriesInstanceUID;
    const instanceUrl = `${this.root}/studies/${studyUid}/series/${seriesUid}/instances/${pdf.sopUid}`;

    let bulkUri = pdf.bulkDataUri;
    if (!bulkUri) {
      try {
        const metaRes = await this.fetchFn(`${instanceUrl}/metadata`, {
          credentials: this.credentials,
          headers: { Accept: "application/dicom+json", ...this.headers },
        });
        if (metaRes.ok) {
          const json = (await metaRes.json()) as Record<string, { BulkDataURI?: string }>[];
          bulkUri = json?.[0]?.[TAG.ENCAPSULATED_DOCUMENT]?.BulkDataURI ?? null;
        }
      } catch {
        /* fall back to the constructed path below */
      }
    }

    const url = bulkUri
      ? proxyBulkUrl(this.root, bulkUri)
      : `${instanceUrl}/bulk/${TAG.ENCAPSULATED_DOCUMENT}`;
    const res = await this.fetchFn(url, {
      credentials: this.credentials,
      headers: { Accept: 'multipart/related; type="application/octet-stream"', ...this.headers },
    });
    if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    const payload = extractBulkPayload(buf, res.headers.get("Content-Type") ?? "");
    return URL.createObjectURL(new Blob([payload], { type: "application/pdf" }));
  }

  /**
   * WADO-RS rendered thumbnail for the series ({@link DataSource.getThumbnail}).
   * Returns a JPEG Blob, or null if the server has no thumbnail for it (the viewer
   * then renders one client-side). Never throws — a missing endpoint is expected.
   */
  async getThumbnail(
    series: SeriesSummary,
    opts: { signal?: AbortSignal } = {},
  ): Promise<Blob | null> {
    const studyUid = series.studyInstanceUID;
    if (!studyUid) return null;
    const url =
      `${this.root}/studies/${studyUid}/series/${series.seriesInstanceUID}` +
      `/thumbnail?viewport=200,200`;
    try {
      const res = await this.fetchFn(url, {
        signal: opts.signal,
        credentials: this.credentials,
        headers: { Accept: "image/jpeg", ...this.headers },
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.size > 0 ? blob : null;
    } catch {
      return null;
    }
  }
}

// A fixed multipart boundary for STOW-RS bodies. DICOM instances are binary, so a
// collision with this ASCII token is vanishingly unlikely.
const STOW_BOUNDARY = "orbidicomStowBoundary";

/** Assemble parts into a single `multipart/related` body of the given content type. */
function buildMultipartRelated(
  parts: (ArrayBuffer | Uint8Array)[],
  boundary: string,
  type: string,
): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const p of parts) {
    chunks.push(enc.encode(`--${boundary}\r\nContent-Type: ${type}\r\n\r\n`));
    chunks.push(p instanceof Uint8Array ? p : new Uint8Array(p));
    chunks.push(enc.encode("\r\n"));
  }
  chunks.push(enc.encode(`--${boundary}--\r\n`));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Parse a STOW-RS Store-Instances response dataset into a {@link StoreResult}. */
function parseStowResponse(json: unknown): StoreResult {
  const ds = (Array.isArray(json) ? json[0] : json) as Record<string, unknown> | null;
  const seq = (tag: string) =>
    (ds?.[tag] as { Value?: Record<string, unknown>[] } | undefined)?.Value ?? [];
  const stored = seq(TAG.REF_SOP_SEQUENCE)
    .map((it) => first(it, TAG.REF_SOP_INSTANCE_UID))
    .filter(Boolean);
  const failed = seq(TAG.FAILED_SOP_SEQUENCE).map((it) => ({
    sopUid: first(it, TAG.REF_SOP_INSTANCE_UID) || undefined,
    reason: first(it, TAG.FAILURE_REASON) || undefined,
  }));
  return { stored, failed };
}

/** Re-base a (possibly absolute / internal) BulkDataURI onto our same-origin root. */
function proxyBulkUrl(root: string, uri: string): string {
  const i = uri.indexOf("/studies/");
  return i >= 0 ? `${root}${uri.slice(i)}` : uri;
}

/**
 * Extract the payload of a WADO-RS bulk-data response. Servers return
 * multipart/related; strip the MIME part headers and the trailing boundary.
 * A single-part response is returned unchanged.
 */
function extractBulkPayload(buf: ArrayBuffer, contentType: string): ArrayBuffer {
  if (!/multipart/i.test(contentType)) return buf;
  const bytes = new Uint8Array(buf);
  let start = -1;
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) {
      start = i + 4;
      break;
    }
  }
  if (start < 0) return buf;
  let end = bytes.length;
  for (let i = bytes.length - 4; i > start; i--) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 45 && bytes[i + 3] === 45) {
      end = i;
      break;
    }
  }
  return buf.slice(start, end);
}
