// Reads the DICOM metadata Cornerstone has cached for a displayed image and
// normalizes it into the flat shape the on-image overlay renders. Works for any
// data source: the values come from whatever metadata provider is registered
// (wadors for DICOMweb, the legacy file provider for local .dcm, the generic
// provider for NIfTI), so fields that a source doesn't carry are simply omitted.

/** Reads one Cornerstone metadata module for an imageId. Mirrors `metaData.get`. */
export type MetaGet = (module: string, imageId: string) => unknown;

export interface ImageMetadata {
  patientName?: string;
  patientId?: string;
  /** SOP Instance UID of this image — used to align per-slice overlays (e.g. SEG). */
  sopInstanceUID?: string;
  patientSex?: string;
  patientBirthDate?: string;
  studyDescription?: string;
  studyDate?: string;
  studyTime?: string;
  accessionNumber?: string;
  modality?: string;
  seriesNumber?: number;
  seriesDescription?: string;
  instanceNumber?: number;
  rows?: number;
  columns?: number;
  sliceThickness?: number;
  sliceLocation?: number;
  pixelSpacing?: [number, number];
}

// Lazily bind Cornerstone's metaData.get once, so importing this module for its
// types (e.g. in Node tests) never eagerly pulls @cornerstonejs/core.
let cachedGet: MetaGet | null = null;
async function ensureGet(): Promise<MetaGet> {
  if (cachedGet) return cachedGet;
  const { metaData } = await import("@cornerstonejs/core");
  cachedGet = (module, imageId) => metaData.get(module, imageId);
  return cachedGet;
}

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});

/** DICOM PN ("Family^Given^Middle") or { Alphabetic } -> a readable line. */
function personName(v: unknown): string | undefined {
  let raw: unknown = v;
  if (v && typeof v === "object" && "Alphabetic" in (v as Dict)) raw = (v as Dict).Alphabetic;
  if (raw == null || raw === "") return undefined;
  return String(raw)
    .split("^")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Normalize a DICOM date to "YYYY-MM-DD". Sources differ: wadors hands back the
 * raw "YYYYMMDD" string, while the wadouri loader pre-parses it into
 * `{ year, month, day }` (dicomParser.parseDA). Both are handled.
 */
function dicomDate(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "object") {
    const o = v as { year?: number; month?: number; day?: number };
    return o.year ? `${o.year}-${pad(o.month ?? 1)}-${pad(o.day ?? 1)}` : undefined;
  }
  const s = String(v);
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
}

/**
 * Normalize a DICOM time to "HH:MM:SS". wadors gives "HHMMSS(.ffffff)"; the
 * wadouri loader pre-parses it into `{ hours, minutes, seconds }`
 * (dicomParser.parseTM). Both are handled.
 */
function dicomTime(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "object") {
    const o = v as { hours?: number; minutes?: number; seconds?: number };
    if (o.hours == null && o.minutes == null && o.seconds == null) return undefined;
    return `${pad(o.hours ?? 0)}:${pad(o.minutes ?? 0)}:${pad(o.seconds ?? 0)}`;
  }
  const s = String(v);
  return /^\d{6}/.test(s) ? `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}` : s;
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  return String(v);
}

/**
 * Read + normalize the metadata Cornerstone holds for `imageId`. Fields whose
 * source modules are absent are omitted (NIfTI, for instance, carries no patient
 * or study tags). `get` is injectable for testing; it defaults to `metaData.get`.
 */
export async function readImageMetadata(imageId: string, get?: MetaGet): Promise<ImageMetadata> {
  const g = get ?? (await ensureGet());
  const patient = asDict(g("patientModule", imageId));
  // Sex/age live in patientStudyModule under the wadouri loader (wadors keeps
  // sex on patientModule too) — read both and prefer whichever is present.
  const patientStudy = asDict(g("patientStudyModule", imageId));
  const study = asDict(g("generalStudyModule", imageId));
  const series = asDict(g("generalSeriesModule", imageId));
  const image = asDict(g("generalImageModule", imageId));
  const pixel = asDict(g("imagePixelModule", imageId));
  const plane = asDict(g("imagePlaneModule", imageId));
  const sop = asDict(g("sopCommonModule", imageId));

  const spacing = plane.pixelSpacing;
  const pixelSpacing =
    Array.isArray(spacing) && spacing.length >= 2
      ? ([Number(spacing[0]), Number(spacing[1])] as [number, number])
      : undefined;

  const out: ImageMetadata = {
    patientName: personName(patient.patientName),
    // wadors -> patientId, wadouri -> patientID.
    patientId: str(patient.patientId ?? patient.patientID),
    sopInstanceUID: str(sop.sopInstanceUID),
    patientSex: str(patient.patientSex ?? patientStudy.patientSex),
    patientBirthDate: dicomDate(patient.patientBirthDate),
    studyDescription: str(study.studyDescription),
    studyDate: dicomDate(study.studyDate),
    studyTime: dicomTime(study.studyTime),
    accessionNumber: str(study.accessionNumber),
    modality: str(series.modality),
    seriesNumber: num(series.seriesNumber),
    seriesDescription: str(series.seriesDescription),
    instanceNumber: num(image.instanceNumber),
    rows: num(pixel.rows),
    columns: num(pixel.columns),
    sliceThickness: num(plane.sliceThickness),
    sliceLocation: num(plane.sliceLocation),
    pixelSpacing: pixelSpacing && pixelSpacing.every(Number.isFinite) ? pixelSpacing : undefined,
  };

  // Drop undefined keys so callers get a clean object (and tests can use toEqual).
  for (const k of Object.keys(out) as (keyof ImageMetadata)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

// --- full metadata reader (grouped, labelled rows for a panel) ----------------

export interface MetaRow {
  label: string;
  value: string;
}
export interface MetaGroup {
  id: string;
  rows: MetaRow[];
}

type Fmt = "name" | "date" | "time" | "num" | "mm" | "spacing" | "str";

interface FieldSpec {
  /** Cornerstone modules to try, in order (a tag may live in more than one). */
  modules: string[];
  /** Tag keys to try within a module, in order (handles wadors/wadouri drift). */
  keys: string[];
  label: string;
  fmt: Fmt;
}

function fmtValue(v: unknown, fmt: Fmt): string | undefined {
  switch (fmt) {
    case "name":
      return personName(v);
    case "date":
      return dicomDate(v);
    case "time":
      return dicomTime(v);
    case "num": {
      const n = num(v);
      return n == null ? undefined : String(n);
    }
    case "mm": {
      const n = num(v);
      return n == null ? undefined : `${n} mm`;
    }
    case "spacing": {
      if (!Array.isArray(v) || v.length < 2) return undefined;
      const a = Number(v[0]);
      const b = Number(v[1]);
      return Number.isFinite(a) && Number.isFinite(b) ? `${a} × ${b} mm` : undefined;
    }
    default:
      return str(v);
  }
}

const GROUP_SPECS: { id: string; fields: FieldSpec[] }[] = [
  {
    id: "patient",
    fields: [
      { modules: ["patientModule"], keys: ["patientName"], label: "Patient Name", fmt: "name" },
      {
        modules: ["patientModule"],
        keys: ["patientId", "patientID"],
        label: "Patient ID",
        fmt: "str",
      },
      {
        modules: ["patientModule", "patientStudyModule"],
        keys: ["patientSex"],
        label: "Sex",
        fmt: "str",
      },
      { modules: ["patientModule"], keys: ["patientBirthDate"], label: "Birth Date", fmt: "date" },
      { modules: ["patientStudyModule"], keys: ["patientAge"], label: "Age", fmt: "str" },
    ],
  },
  {
    id: "study",
    fields: [
      {
        modules: ["generalStudyModule"],
        keys: ["studyDescription"],
        label: "Study Description",
        fmt: "str",
      },
      { modules: ["generalStudyModule"], keys: ["studyDate"], label: "Study Date", fmt: "date" },
      { modules: ["generalStudyModule"], keys: ["studyTime"], label: "Study Time", fmt: "time" },
      {
        modules: ["generalStudyModule"],
        keys: ["accessionNumber"],
        label: "Accession #",
        fmt: "str",
      },
      {
        modules: ["generalStudyModule"],
        keys: ["studyInstanceUID"],
        label: "Study UID",
        fmt: "str",
      },
    ],
  },
  {
    id: "series",
    fields: [
      { modules: ["generalSeriesModule"], keys: ["modality"], label: "Modality", fmt: "str" },
      { modules: ["generalSeriesModule"], keys: ["seriesNumber"], label: "Series #", fmt: "num" },
      {
        modules: ["generalSeriesModule"],
        keys: ["seriesDescription"],
        label: "Series Description",
        fmt: "str",
      },
      {
        modules: ["generalSeriesModule"],
        keys: ["bodyPartExamined"],
        label: "Body Part",
        fmt: "str",
      },
      {
        modules: ["generalSeriesModule"],
        keys: ["seriesInstanceUID"],
        label: "Series UID",
        fmt: "str",
      },
    ],
  },
  {
    id: "image",
    fields: [
      {
        modules: ["generalImageModule"],
        keys: ["instanceNumber"],
        label: "Instance #",
        fmt: "num",
      },
      // "Matrix" (rows × columns) is synthesized below from imagePixelModule.
      {
        modules: ["imagePlaneModule"],
        keys: ["pixelSpacing"],
        label: "Pixel Spacing",
        fmt: "spacing",
      },
      {
        modules: ["imagePlaneModule"],
        keys: ["sliceThickness"],
        label: "Slice Thickness",
        fmt: "mm",
      },
      {
        modules: ["imagePlaneModule"],
        keys: ["sliceLocation"],
        label: "Slice Location",
        fmt: "num",
      },
      {
        modules: ["sopCommonModule", "generalImageModule"],
        keys: ["sopInstanceUID"],
        label: "SOP Instance UID",
        fmt: "str",
      },
    ],
  },
  {
    id: "equipment",
    fields: [
      {
        modules: ["generalEquipmentModule"],
        keys: ["manufacturer"],
        label: "Manufacturer",
        fmt: "str",
      },
      {
        modules: ["generalEquipmentModule"],
        keys: ["manufacturerModelName"],
        label: "Model",
        fmt: "str",
      },
      { modules: ["generalEquipmentModule"], keys: ["stationName"], label: "Station", fmt: "str" },
      {
        modules: ["generalEquipmentModule"],
        keys: ["softwareVersions"],
        label: "Software",
        fmt: "str",
      },
    ],
  },
];

// Every module any field references — fetched once per image.
const ALL_MODULES = [
  "patientModule",
  "patientStudyModule",
  "generalStudyModule",
  "generalSeriesModule",
  "generalImageModule",
  "imagePixelModule",
  "imagePlaneModule",
  "sopCommonModule",
  "generalEquipmentModule",
];

function resolveField(dicts: Record<string, Dict>, f: FieldSpec): string | undefined {
  for (const mod of f.modules) {
    const d = dicts[mod];
    if (!d) continue;
    for (const k of f.keys) {
      const out = fmtValue(d[k], f.fmt);
      if (out) return out;
    }
  }
  return undefined;
}

/**
 * Read the full, human-readable metadata for an image as labelled rows grouped
 * into Patient / Study / Series / Image / Equipment sections — the data behind
 * the metadata reader panel. Rows with no value and groups with no rows are
 * dropped, so a sparse source (e.g. NIfTI) yields only the sections it has.
 * `get` is injectable for testing; it defaults to `metaData.get`.
 */
export async function readMetadataGroups(imageId: string, get?: MetaGet): Promise<MetaGroup[]> {
  const g = get ?? (await ensureGet());
  const dicts: Record<string, Dict> = {};
  for (const m of ALL_MODULES) dicts[m] = asDict(g(m, imageId));

  const out: MetaGroup[] = [];
  for (const spec of GROUP_SPECS) {
    const rows: MetaRow[] = [];
    for (const f of spec.fields) {
      const value = resolveField(dicts, f);
      if (value) rows.push({ label: f.label, value });
    }
    // Synthesize the acquisition matrix (rows × columns) for the image group.
    if (spec.id === "image") {
      const cols = num(dicts.imagePixelModule?.columns);
      const r = num(dicts.imagePixelModule?.rows);
      if (cols && r) rows.unshift({ label: "Matrix", value: `${cols} × ${r}` });
    }
    if (rows.length) out.push({ id: spec.id, rows });
  }
  return out;
}
