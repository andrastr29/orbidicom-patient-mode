export interface SeriesSummary {
  seriesInstanceUID: string;
  studyInstanceUID?: string;
  modality?: string;
  seriesDescription?: string;
  numberOfFrames?: number;
  /**
   * The series is a reconstructable 3D volume regardless of modality. Set by
   * sources whose data is inherently volumetric but carries no cross-sectional
   * DICOM modality (e.g. NIfTI), so the viewer can still offer MPR / 3D for it.
   */
  volumetric?: boolean;
  /**
   * Study-level facts, for grouping and labeling the series rail. Repeated on
   * every series of the same study; sources fill in whatever they have. Absent
   * for single-study sources (local files, NIfTI), which never group.
   */
  study?: {
    /** Raw DICOM DA string, e.g. "20240115". */
    studyDate?: string;
    studyDescription?: string;
    /** Already reduced to its Alphabetic component group. */
    patientName?: string;
    patientId?: string;
  };
}

export interface InstanceMetadata {
  imageId: string;
  [tag: string]: unknown;
}

import type { SrTree } from "./sr/types";
export type { SrTree, SrNode, SrCode, SrRef, SrValueType } from "./sr/types";
import type { SegInfo, SegLabelmap } from "./seg/parse";

/** A fully-decoded SEG instance: its segment definitions + per-source-image labelmaps. */
export interface SegmentationData {
  info: SegInfo;
  labelmaps: SegLabelmap[];
}

export interface DataSourceCapabilities {
  downloadArchive?: boolean;
  /** @deprecated mirror of `reports.pdf`, kept for back-compat. */
  encapsulatedPdf?: boolean;
  /** Which report documents this source can surface/render. */
  reports?: { pdf?: boolean; sr?: boolean };
  multiStudy?: boolean;
  /** Source can search a worklist of studies (e.g. QIDO-RS) via {@link DataSource.searchStudies}. */
  studySearch?: boolean;
  /** Source can upload instances (e.g. STOW-RS) via {@link DataSource.storeInstances}. */
  store?: boolean;
  /** Source can surface DICOM-SEG segmentations via {@link DataSource.listSegmentations}. */
  segmentations?: boolean;
}

/** A study returned by a worklist search ({@link DataSource.searchStudies}). */
export interface StudySummary {
  studyInstanceUID: string;
  /** Patient name, already reduced to its Alphabetic component group. */
  patientName?: string;
  patientId?: string;
  /** Study date as a raw DICOM DA string (e.g. "20240115"). */
  studyDate?: string;
  /** Study time as a raw DICOM TM string. */
  studyTime?: string;
  studyDescription?: string;
  accessionNumber?: string;
  modalitiesInStudy?: string[];
  numberOfSeries?: number;
  numberOfInstances?: number;
}

/**
 * Worklist filter. Each field maps to a QIDO-RS matching key; omitted fields are
 * not sent. Backends that cannot filter server-side may apply these client-side.
 */
export interface StudyQuery {
  patientName?: string;
  patientId?: string;
  accessionNumber?: string;
  /** A DICOM DA value or range, e.g. "20240115" or "20240101-20240131". */
  studyDate?: string;
  studyDescription?: string;
  /** Matches ModalitiesInStudy. */
  modality?: string;
  /** Cap the number of returned studies. */
  limit?: number;
  /** Skip this many studies (paging). */
  offset?: number;
}

/** Outcome of a {@link DataSource.storeInstances} upload (STOW-RS shape). */
export interface StoreResult {
  /** SOP Instance UIDs the server accepted (ReferencedSOPSequence). */
  stored: string[];
  /** Instances the server rejected (FailedSOPSequence), with a reason code if given. */
  failed: { sopUid?: string; reason?: string }[];
}

/** A DICOM-SEG segmentation instance discovered in a series. */
export interface SegmentationInstance {
  sopUid: string;
  /** Series Content/Description label, if present. */
  label?: string;
  /** Number of segments defined in the SEG. */
  segmentCount: number;
  /** Series Instance UID the segmentation is drawn over, if referenced. */
  referencedSeriesUid?: string;
}

/** An encapsulated-PDF instance found in a series (rendered, not stacked). */
export interface PdfInstance {
  sopUid: string;
  /** WADO-RS BulkDataURI for the EncapsulatedDocument, if the server advertised one. */
  bulkDataUri: string | null;
}

/** A renderable report document in a series (encapsulated PDF or Structured Report). */
export interface ReportInstance {
  sopUid: string;
  kind: "pdf" | "sr";
  instanceNumber?: number;
  description?: string;
  modality?: string;
  /** WADO-RS BulkDataURI for a PDF's EncapsulatedDocument, if advertised. */
  bulkDataUri?: string | null;
}

export interface DataSource {
  capabilities: DataSourceCapabilities;
  getSeries(studyUids: string[]): Promise<SeriesSummary[]>;
  getImageIds(series: SeriesSummary): Promise<string[]>;
  getMetadata?(imageId: string): Promise<InstanceMetadata>;
  /**
   * Optional cheap preview image for the series rail (e.g. a PACS thumbnail
   * endpoint). Return null when unavailable for this series; the viewer then
   * renders a preview client-side. Never required.
   */
  getThumbnail?(
    series: SeriesSummary,
    opts?: { signal?: AbortSignal },
  ): Promise<Blob | string | null>;
  downloadArchive?(studyUid: string): Promise<Blob | void>;
  /** Search the worklist for studies (advertise via `capabilities.studySearch`). */
  searchStudies?(query?: StudyQuery): Promise<StudySummary[]>;
  /**
   * Upload DICOM Part-10 instances (advertise via `capabilities.store`). Pass each
   * instance's raw bytes; `studyUid` targets a specific study endpoint if given.
   */
  storeInstances?(
    files: (ArrayBuffer | Uint8Array)[],
    opts?: { studyUid?: string },
  ): Promise<StoreResult>;
  /** DICOM-SEG segmentations found in a series during {@link getImageIds}. */
  listSegmentations?(series: SeriesSummary): SegmentationInstance[];
  /** Fetch and decode a SEG instance into segment definitions + per-image labelmaps. */
  getSegmentation?(series: SeriesSummary, seg: SegmentationInstance): Promise<SegmentationData>;
  /** @deprecated use {@link listReports}; kept so existing callers compile. */
  listPdfs?(series: SeriesSummary): PdfInstance[];
  /** Fetch an encapsulated PDF's bytes and return an object URL (application/pdf). */
  getPdfObjectUrl?(series: SeriesSummary, pdf: PdfInstance): Promise<string>;
  /** Report documents (PDF + SR) discovered in a series during {@link getImageIds}. */
  listReports?(series: SeriesSummary): ReportInstance[];
  /** Parse a Structured Report instance into a normalized {@link SrTree}. */
  getStructuredReport?(series: SeriesSummary, report: ReportInstance): Promise<SrTree>;
}
