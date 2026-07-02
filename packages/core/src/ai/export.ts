import {
  measurementsToJson,
  measurementsToCsv,
  type Measurement,
} from "../cornerstone/measurements";
import type { AIResultSet } from "./types";
import { encodeU8 } from "./u8-codec";

const isAccepted = (status: string) => status === "accepted";

/** Collect the Measurements from accepted measurement results. */
function acceptedMeasurements(set: AIResultSet): Measurement[] {
  return set.results
    .filter((r) => r.kind === "measurement" && isAccepted(r.reviewStatus))
    .map(
      (r) => (r as Extract<AIResultSet["results"][number], { kind: "measurement" }>).measurement,
    );
}

/**
 * Serialize the accepted subset of a result set.
 * - "json"/"csv": measurements only, via the existing measurement serializers.
 * - "ai-json": the whole set filtered to accepted results (the generic format).
 */
export function exportAccepted(
  set: AIResultSet,
  format: "json" | "csv" | "ai-json",
  now: () => string = () => new Date().toISOString(),
): string {
  if (format === "json") return measurementsToJson(acceptedMeasurements(set), now);
  if (format === "csv") return measurementsToCsv(acceptedMeasurements(set));
  const filtered: AIResultSet = {
    ...set,
    results: set.results.filter((r) => isAccepted(r.reviewStatus)),
  };
  // Encode Uint8Array fields (segmentation.labelmaps[].data, sourceBytes) as a
  // tagged `{ "$u8": base64 }` form so they survive JSON round-trips losslessly.
  return JSON.stringify(encodeU8(filtered), null, 2);
}
