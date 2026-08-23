/**
 * DICOM-SR generation: turn collected {@link Measurement}s into a Comprehensive
 * SR dataset (DICOM-JSON), shaped after TID 1500 "Measurement Report". This is the
 * write counterpart of {@link srTreeFromJson}: the output round-trips back through
 * that reader, and a host can encode it to Part-10 (e.g. dcmjs) and push it with
 * {@link DicomWebDataSource.storeInstances} (STOW-RS).
 *
 * Framework-agnostic + pure: no Cornerstone, no DOM. Concept codes are best-effort
 * (SCT/DCM/UCUM); the human-readable meanings are authoritative for display.
 */
import type { Measurement } from "../cornerstone/measurements";
import type { SrCode } from "./types";

// Comprehensive SR Storage SOP Class.
const COMPREHENSIVE_SR_SOP = "1.2.840.10008.5.1.4.1.1.88.33";

const REPORT_TITLE: SrCode = {
  value: "126000",
  scheme: "DCM",
  meaning: "Imaging Measurement Report",
};
const MEASUREMENTS_GROUP: SrCode = {
  value: "126010",
  scheme: "DCM",
  meaning: "Imaging Measurements",
};
const MEASUREMENT_GROUP: SrCode = { value: "125007", scheme: "DCM", meaning: "Measurement Group" };
const TRACKING_IDENTIFIER: SrCode = {
  value: "112039",
  scheme: "DCM",
  meaning: "Tracking Identifier",
};

// Canonical stat name (index suffixes like "value[0]" collapse to "value") → concept.
const STAT_CONCEPT: Record<string, SrCode> = {
  length: { value: "410668003", scheme: "SCT", meaning: "Length" },
  angle: { value: "814280004", scheme: "SCT", meaning: "Angle" },
  area: { value: "42798000", scheme: "SCT", meaning: "Area" },
  mean: { value: "373098007", scheme: "SCT", meaning: "Mean" },
  max: { value: "56851009", scheme: "SCT", meaning: "Maximum" },
  min: { value: "255605001", scheme: "SCT", meaning: "Minimum" },
  stdDev: { value: "386136009", scheme: "SCT", meaning: "Standard Deviation" },
  value: { value: "113051", scheme: "DCM", meaning: "Pixel Value" },
};

// Cornerstone display unit → UCUM coded unit.
const UNIT_UCUM: Record<string, SrCode> = {
  mm: { value: "mm", scheme: "UCUM", meaning: "millimeter" },
  cm: { value: "cm", scheme: "UCUM", meaning: "centimeter" },
  "mm²": { value: "mm2", scheme: "UCUM", meaning: "square millimeter" },
  mm2: { value: "mm2", scheme: "UCUM", meaning: "square millimeter" },
  "cm²": { value: "cm2", scheme: "UCUM", meaning: "square centimeter" },
  deg: { value: "deg", scheme: "UCUM", meaning: "degree" },
  HU: { value: "[hnsf'U]", scheme: "UCUM", meaning: "Hounsfield unit" },
  "": { value: "1", scheme: "UCUM", meaning: "no units" },
};

const conceptFor = (name: string): SrCode =>
  STAT_CONCEPT[name.replace(/\[\d+\]$/, "")] ?? { value: name, scheme: "99ORBI", meaning: name };
const unitFor = (u: string): SrCode =>
  UNIT_UCUM[u] ?? { value: u || "1", scheme: "UCUM", meaning: u || "no units" };

type Json = Record<string, unknown>;
const E = (vr: string, ...values: unknown[]): Json => ({ vr, Value: values });
function codeSeq(c: SrCode): Json {
  return E("SQ", {
    "00080100": E("SH", c.value ?? ""),
    "00080102": E("SH", c.scheme ?? ""),
    "00080104": E("LO", c.meaning ?? ""),
  });
}

function container(concept: SrCode, children: Json[], relationship?: string): Json {
  const item: Json = {
    "0040A040": E("CS", "CONTAINER"),
    "0040A050": E("CS", "SEPARATE"), // ContinuityOfContent
    "0040A043": codeSeq(concept),
    "0040A730": E("SQ", ...children),
  };
  if (relationship) item["0040A010"] = E("CS", relationship);
  return item;
}

function textItem(concept: SrCode, text: string): Json {
  return {
    "0040A010": E("CS", "HAS OBS CONTEXT"),
    "0040A040": E("CS", "TEXT"),
    "0040A043": codeSeq(concept),
    "0040A160": E("UT", text),
  };
}

function numItem(concept: SrCode, value: number, unit: SrCode): Json {
  return {
    "0040A010": E("CS", "CONTAINS"),
    "0040A040": E("CS", "NUM"),
    "0040A043": codeSeq(concept),
    "0040A300": E("SQ", {
      "0040A30A": E("DS", String(value)), // NumericValue
      "004008EA": codeSeq(unit), // MeasurementUnitsCodeSequence
    }),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const da = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const tm = (d: Date) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// 2.25-rooted UID from a decimal rendering of randomness: a valid, registration-free
// arc (ISO/IEC 9834-8). Deterministic alternative is injectable via opts.sopInstanceUid.
function defaultUid(): string {
  const rand = Math.floor(Math.random() * 1e15);
  return `2.25.${Date.now()}${rand}`;
}

export interface MeasurementSrOptions {
  /** SOP Instance UID for the SR; defaults to a generated 2.25 UID. Inject for tests. */
  sopInstanceUid?: string;
  /** Clock for Content Date/Time; defaults to `new Date()`. Inject for tests. */
  now?: () => Date;
}

/**
 * Build a Comprehensive SR (DICOM-JSON) measurement report from `measurements`.
 * Each measurement becomes a Measurement Group (its label as the Tracking
 * Identifier) holding one NUM content item per finite statistic.
 */
export function buildMeasurementSr(
  measurements: Measurement[],
  opts: MeasurementSrOptions = {},
): Json {
  const when = (opts.now ?? (() => new Date()))();
  const groups: Json[] = measurements.map((m) => {
    const children: Json[] = [textItem(TRACKING_IDENTIFIER, m.label || m.annotationUID)];
    for (const s of m.stats) {
      children.push(numItem(conceptFor(s.name), s.value, unitFor(s.unit)));
    }
    return container(MEASUREMENT_GROUP, children, "CONTAINS");
  });

  return {
    "00080016": E("UI", COMPREHENSIVE_SR_SOP),
    "00080018": E("UI", opts.sopInstanceUid ?? defaultUid()),
    "00080060": E("CS", "SR"),
    "00080023": E("DA", da(when)), // ContentDate
    "00080033": E("TM", tm(when)), // ContentTime
    "0040A040": E("CS", "CONTAINER"),
    "0040A050": E("CS", "SEPARATE"),
    "0040A043": codeSeq(REPORT_TITLE),
    "0040A730": E("SQ", container(MEASUREMENTS_GROUP, groups, "CONTAINS")),
  };
}
