import type { Measurement } from "../cornerstone/measurements";
import type { SegmentationData } from "../datasource";
import type { SrCode } from "../sr/types";

/** A coded concept (SNOMED-CT / DCM …). Reuses the SR code shape. */
export type CodedConcept = SrCode;

/** Per-segment measured-section stats (volume/area). */
export interface SegmentStat {
  segment: number;
  label: string;
  voxels: number;
  areaMm2?: number;
  volumeMm3?: number;
}

/** Where a result set came from — drives provenance badge + export tagging. */
export interface ResultProvenance {
  source: "import" | "inference";
  format?: "orbidicom-json" | "dicom-sr" | "dicom-seg" | "ai-json";
  providerId?: string;
  modelId?: string;
  modelName?: string;
  modelVersion?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  createdAt?: string;
}

export type ReviewStatus = "pending" | "accepted" | "rejected";

interface ResultBase {
  id: string;
  label: string;
  reviewStatus: ReviewStatus;
  visible: boolean;
  confidence?: number;
  code?: CodedConcept;
}

export interface SegmentationResult extends ResultBase {
  kind: "segmentation";
  segmentation: SegmentationData;
  sourceBytes?: Uint8Array;
  stats?: SegmentStat[];
}

export interface MeasurementResult extends ResultBase {
  kind: "measurement";
  measurement: Measurement;
}

export interface FindingResult extends ResultBase {
  kind: "finding";
  text?: string;
  value?: string;
  targetSopInstanceUid?: string;
}

export type AIResult = SegmentationResult | MeasurementResult | FindingResult;

export interface AIResultSet {
  schema: "orbidicom.ai-results/v1";
  provenance: ResultProvenance;
  results: AIResult[];
}

const KINDS = new Set(["segmentation", "measurement", "finding"]);

/** Runtime guard: is `x` a structurally-valid AIResultSet? */
export function isAIResultSet(x: unknown): x is AIResultSet {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.schema !== "orbidicom.ai-results/v1") return false;
  if (typeof o.provenance !== "object" || o.provenance === null) return false;
  if (!Array.isArray(o.results)) return false;
  return o.results.every(
    (r) => typeof r === "object" && r !== null && KINDS.has((r as { kind?: unknown }).kind as string),
  );
}
