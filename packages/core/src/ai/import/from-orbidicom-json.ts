import type { Measurement } from "../../cornerstone/measurements";
import type { AIResultSet, MeasurementResult } from "../types";
import { ImportError } from "../errors";

/** Parse an `orbidicom.measurements/v1` document into an AIResultSet. */
export function fromOrbidicomJson(input: unknown): AIResultSet {
  const doc = input as { schema?: unknown; measurements?: unknown };
  if (doc?.schema !== "orbidicom.measurements/v1") {
    throw new ImportError(`Expected orbidicom.measurements/v1, got ${String(doc?.schema)}`);
  }
  if (!Array.isArray(doc.measurements)) {
    throw new ImportError("orbidicom.measurements/v1: missing measurements array");
  }
  const results: MeasurementResult[] = (doc.measurements as Measurement[]).map((m, i) => ({
    kind: "measurement",
    id: m.annotationUID || `m-${i}`,
    label: m.label || m.tool,
    reviewStatus: "accepted",
    visible: true,
    measurement: m,
  }));
  return {
    schema: "orbidicom.ai-results/v1",
    provenance: { source: "import", format: "orbidicom-json" },
    results,
  };
}
