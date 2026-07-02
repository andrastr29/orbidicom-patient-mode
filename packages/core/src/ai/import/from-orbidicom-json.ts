import type { Measurement } from "../../cornerstone/measurements";
import type { AIResultSet, MeasurementResult } from "../types";
import { ImportError } from "../errors";

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const isNumericTriple = (x: unknown): boolean =>
  Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === "number");

/** Validate a single measurement before mapping. Throws {@link ImportError}. */
function assertMeasurement(m: unknown, i: number): asserts m is Measurement {
  if (!isObj(m)) {
    throw new ImportError(`orbidicom.measurements/v1: invalid measurement at index ${i}`);
  }
  const ok =
    typeof m.tool === "string" &&
    typeof m.frameOfReferenceUID === "string" &&
    typeof m.imageId === "string" &&
    Array.isArray(m.points) &&
    m.points.every(isNumericTriple) &&
    Array.isArray(m.stats);
  if (!ok) {
    throw new ImportError(`orbidicom.measurements/v1: invalid measurement at index ${i}`);
  }
}

/** Parse an `orbidicom.measurements/v1` document into an AIResultSet. */
export function fromOrbidicomJson(input: unknown): AIResultSet {
  const doc = input as { schema?: unknown; measurements?: unknown };
  if (doc?.schema !== "orbidicom.measurements/v1") {
    throw new ImportError(`Expected orbidicom.measurements/v1, got ${String(doc?.schema)}`);
  }
  if (!Array.isArray(doc.measurements)) {
    throw new ImportError("orbidicom.measurements/v1: missing measurements array");
  }
  // Validate the whole set first — all-or-nothing, so a malformed item never
  // imports "successfully" and then crashes downstream.
  doc.measurements.forEach((m, i) => assertMeasurement(m, i));
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
