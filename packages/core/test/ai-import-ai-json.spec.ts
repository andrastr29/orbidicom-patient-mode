import { describe, it, expect } from "vitest";
import { fromAiJson } from "../src/ai/import/from-ai-json";
import { ImportError } from "../src/ai/errors";

const doc = {
  schema: "orbidicom.ai-results/v1",
  provenance: { source: "inference", providerId: "mock" },
  results: [
    {
      kind: "finding",
      id: "f1",
      label: "Impression",
      reviewStatus: "pending",
      visible: true,
      text: "x",
    },
  ],
};

describe("fromAiJson", () => {
  it("passes a valid AIResultSet through and marks it as an import", () => {
    const set = fromAiJson(doc);
    expect(set.provenance.source).toBe("import");
    expect(set.provenance.format).toBe("ai-json");
    expect(set.results[0].label).toBe("Impression");
  });
  it("backfills visible/reviewStatus defaults", () => {
    const set = fromAiJson({
      ...doc,
      results: [{ kind: "finding", id: "f2", label: "y" }],
    });
    expect(set.results[0].visible).toBe(true);
    expect(set.results[0].reviewStatus).toBe("pending");
  });
  it("throws ImportError on invalid input", () => {
    expect(() => fromAiJson({ schema: "nope" })).toThrow(ImportError);
  });
});
