import { isAIResultSet, type AIResultSet, type AIResult } from "../types";
import { ImportError } from "../errors";

/** Parse a generic `orbidicom.ai-results/v1` document, normalizing defaults. */
export function fromAiJson(input: unknown): AIResultSet {
  if (!isAIResultSet(input)) {
    throw new ImportError("Not a valid orbidicom.ai-results/v1 document");
  }
  const results: AIResult[] = input.results.map((r) => ({
    ...r,
    visible: r.visible ?? true,
    reviewStatus: r.reviewStatus ?? "pending",
  }));
  return {
    schema: "orbidicom.ai-results/v1",
    provenance: { ...input.provenance, source: "import", format: "ai-json" },
    results,
  };
}
