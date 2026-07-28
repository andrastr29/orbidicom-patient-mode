import { wadors } from "@cornerstonejs/dicom-image-loader";
import type {
  DataSource,
  SeriesSummary,
  InstanceMetadata,
  DataSourceCapabilities,
} from "../datasource";
import { buildWadoRsImageId } from "../imageIds";
import { orderStudyGroups } from "../study-order";

const TAG = {
  STUDY_UID: "0020000D",
  SERIES_UID: "0020000E",
  SERIES_NUMBER: "00200011",
  SERIES_DESCRIPTION: "0008103E",
  MODALITY: "00080060",
  SOP_UID: "00080018",
  INSTANCE_NUMBER: "00200013",
  ROWS: "00280010",
  NUMBER_OF_FRAMES: "00280008",
  STUDY_DATE: "00080020",
  STUDY_DESCRIPTION: "00081030",
  PATIENT_NAME: "00100010",
  PATIENT_ID: "00100020",
} as const;

function first(obj: Record<string, unknown>, tag: string): string {
  const entry = obj?.[tag] as { Value?: unknown[] } | undefined;
  return String(entry?.Value?.[0] ?? "");
}
const num = (obj: Record<string, unknown>, tag: string) => Number(first(obj, tag)) || 0;

/** Read a Person Name tag, reducing it to its Alphabetic component group. */
function personName(obj: Record<string, unknown>, tag: string): string {
  const v = (obj?.[tag] as { Value?: unknown[] } | undefined)?.Value?.[0];
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return String((v as { Alphabetic?: string }).Alphabetic ?? "");
  return String(v);
}

export interface DicomJsonOptions {
  /**
   * Instance-level DICOM-JSON metadata (PS3.18 Annex F), as a WADO-RS `/metadata`
   * dump or a static manifest. Each object is one SOP instance's attribute set.
   */
  metadata: Record<string, unknown>[];
  /**
   * WADO-RS base URL used to build image ids for pixel retrieval. Omit for a
   * metadata-only source (series list + attributes, but no rendered frames).
   */
  root?: string;
}

/**
 * A {@link DataSource} backed by an in-memory DICOM-JSON document. The metadata is
 * served without any QIDO/WADO round-trip; frames stream from `root` via WADO-RS
 * (same image-id scheme as {@link DicomWebDataSource}). Useful for embedding a
 * pre-fetched study, or serving a study described by a static JSON manifest.
 */
export class DicomJsonDataSource implements DataSource {
  readonly capabilities: DataSourceCapabilities = {
    downloadArchive: false,
    multiStudy: true,
  };
  private instances: Record<string, unknown>[];
  private root?: string;
  private metaByImageId = new Map<string, InstanceMetadata>();

  constructor(opts: DicomJsonOptions) {
    this.instances = opts.metadata ?? [];
    this.root = opts.root ? opts.root.replace(/\/$/, "") : undefined;
  }

  async getSeries(studyUids: string[]): Promise<SeriesSummary[]> {
    const want = new Set(studyUids);
    const bySeries = new Map<string, { summary: SeriesSummary; number: number; count: number }>();
    for (const inst of this.instances) {
      const studyUid = first(inst, TAG.STUDY_UID);
      if (want.size && !want.has(studyUid)) continue; // empty query → every study
      const seriesUid = first(inst, TAG.SERIES_UID);
      if (!seriesUid) continue;
      let entry = bySeries.get(seriesUid);
      if (!entry) {
        const study: NonNullable<SeriesSummary["study"]> = {};
        const sd = first(inst, TAG.STUDY_DATE);
        if (sd) study.studyDate = sd;
        const sdesc = first(inst, TAG.STUDY_DESCRIPTION);
        if (sdesc) study.studyDescription = sdesc;
        const pn = personName(inst, TAG.PATIENT_NAME);
        if (pn) study.patientName = pn;
        const pid = first(inst, TAG.PATIENT_ID);
        if (pid) study.patientId = pid;
        entry = {
          summary: {
            seriesInstanceUID: seriesUid,
            studyInstanceUID: studyUid,
            modality: first(inst, TAG.MODALITY),
            seriesDescription: first(inst, TAG.SERIES_DESCRIPTION),
            numberOfFrames: 0,
            study,
          },
          number: num(inst, TAG.SERIES_NUMBER),
          count: 0,
        };
        bySeries.set(seriesUid, entry);
      }
      entry.count += 1;
    }
    return orderStudyGroups(
      [...bySeries.values()]
        .sort((a, b) => a.number - b.number)
        .map((e) => ({ ...e.summary, numberOfFrames: e.count })),
    );
  }

  async getImageIds(series: SeriesSummary): Promise<string[]> {
    const root = this.root;
    if (!root) return []; // metadata-only: no pixel transport
    const studyUid = series.studyInstanceUID;
    if (!studyUid)
      throw new Error("DicomJsonDataSource.getImageIds requires series.studyInstanceUID");
    const seriesUid = series.seriesInstanceUID;
    const insts = this.instances
      .filter((m) => first(m, TAG.SERIES_UID) === seriesUid && first(m, TAG.STUDY_UID) === studyUid)
      .sort((a, b) => num(a, TAG.INSTANCE_NUMBER) - num(b, TAG.INSTANCE_NUMBER));

    const imageIds: string[] = [];
    for (const meta of insts) {
      const sopUid = first(meta, TAG.SOP_UID);
      if (!sopUid || meta[TAG.ROWS] === undefined) continue; // skip non-image instances
      const frames = num(meta, TAG.NUMBER_OF_FRAMES) || 1;
      // Register once under frame 1; multiframe lookups fall back to this entry.
      wadors.metaDataManager.add(
        buildWadoRsImageId({ root, studyUid, seriesUid, sopUid, frame: 1 }),
        meta as Parameters<typeof wadors.metaDataManager.add>[1],
      );
      for (let f = 1; f <= frames; f++) {
        const id = buildWadoRsImageId({ root, studyUid, seriesUid, sopUid, frame: f });
        imageIds.push(id);
        this.metaByImageId.set(id, { imageId: id, ...meta });
      }
    }
    return imageIds;
  }

  async getMetadata(imageId: string): Promise<InstanceMetadata> {
    const meta = this.metaByImageId.get(imageId);
    if (!meta) throw new Error(`DicomJsonDataSource: no metadata for ${imageId}`);
    return meta;
  }
}
