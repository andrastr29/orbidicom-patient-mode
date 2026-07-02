import type { AIResultSet } from "../types";
import { ImportError } from "../errors";
import { fromOrbidicomJson } from "./from-orbidicom-json";
import { fromAiJson } from "./from-ai-json";

export { fromOrbidicomJson } from "./from-orbidicom-json";
export { fromAiJson } from "./from-ai-json";
export { fromDicomSeg } from "./from-dicom-seg";
export { fromDicomSr } from "./from-dicom-sr";

/**
 * Route a JSON import payload (string or parsed object) to the right importer by
 * its `schema` tag. DICOM `.dcm` SEG/SR file parsing is Phase 1b — use the
 * `fromDicomSeg` / `fromDicomSr` functions directly for those.
 */
export function importResults(input: string | object): AIResultSet {
  let obj: { schema?: unknown };
  if (typeof input === "string") {
    try {
      obj = JSON.parse(input);
    } catch {
      throw new ImportError("Import payload is not valid JSON");
    }
  } else {
    obj = input as { schema?: unknown };
  }
  if (obj?.schema === "orbidicom.ai-results/v1") return fromAiJson(obj);
  if (obj?.schema === "orbidicom.measurements/v1") return fromOrbidicomJson(obj);
  throw new ImportError(`Unrecognized import format: ${String(obj?.schema ?? "unknown")}`);
}
