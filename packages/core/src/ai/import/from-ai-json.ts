import { isAIResultSet, type AIResultSet, type AIResult } from "../types";
import { ImportError } from "../errors";
import { decodeU8 } from "../u8-codec";

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** A `[number, number, number]` triple. */
function isNumericTriple(x: unknown): boolean {
  return Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === "number");
}

/** Validate a `kind:"measurement"` result's payload. Throws {@link ImportError}. */
function validateMeasurement(r: Record<string, unknown>, where: string): void {
  const m = r.measurement;
  if (!isObj(m)) throw new ImportError(`ai-results/v1: ${where} is missing a measurement object`);
  if (!Array.isArray(m.points) || !m.points.every(isNumericTriple)) {
    throw new ImportError(`ai-results/v1: ${where} has invalid measurement.points`);
  }
  if (!Array.isArray(m.stats)) {
    throw new ImportError(`ai-results/v1: ${where} has invalid measurement.stats`);
  }
}

/** Validate a `kind:"segmentation"` result's payload. Throws {@link ImportError}. */
function validateSegmentation(r: Record<string, unknown>, where: string): void {
  const s = r.segmentation;
  if (!isObj(s)) throw new ImportError(`ai-results/v1: ${where} is missing a segmentation object`);
  if (!isObj(s.info)) {
    throw new ImportError(`ai-results/v1: ${where} has invalid segmentation.info`);
  }
  if (!Array.isArray(s.labelmaps)) {
    throw new ImportError(`ai-results/v1: ${where} has invalid segmentation.labelmaps`);
  }
}

/** Deep-validate each result's kind-specific payload (after `$u8` decode). */
function validateResults(results: unknown[]): void {
  results.forEach((r, i) => {
    const o = r as Record<string, unknown>;
    const where = `result ${o.id != null ? `"${String(o.id)}"` : `#${i}`}`;
    if (o.kind === "measurement") validateMeasurement(o, where);
    else if (o.kind === "segmentation") validateSegmentation(o, where);
    // kind:"finding" carries no required payload.
  });
}

/**
 * Parse a generic `orbidicom.ai-results/v1` document, normalizing defaults.
 *
 * `Uint8Array` fields tagged as `{ "$u8": base64 }` (from ai-json export) are
 * decoded back to real typed arrays FIRST, then each result's payload is deeply
 * validated so a malformed set is rejected up-front (all-or-nothing) with a clear
 * `ImportError` instead of crashing later at apply/export.
 */
export function fromAiJson(input: unknown): AIResultSet {
  const decoded = decodeU8(input);
  if (!isAIResultSet(decoded)) {
    throw new ImportError("Not a valid orbidicom.ai-results/v1 document");
  }
  validateResults(decoded.results);
  const results: AIResult[] = decoded.results.map((r) => ({
    ...r,
    visible: r.visible ?? true,
    reviewStatus: r.reviewStatus ?? "pending",
  }));
  return {
    schema: "orbidicom.ai-results/v1",
    provenance: { ...decoded.provenance, source: "import", format: "ai-json" },
    results,
  };
}
