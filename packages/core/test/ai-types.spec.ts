import { describe, it, expect } from "vitest";
import { isAIResultSet, type AIResultSet } from "../src/ai/types";

const valid: AIResultSet = {
  schema: "orbidicom.ai-results/v1",
  provenance: { source: "import", format: "ai-json" },
  results: [
    { kind: "finding", id: "f1", label: "Impression", reviewStatus: "pending", visible: true, text: "hello" },
  ],
};

describe("isAIResultSet", () => {
  it("accepts a well-formed result set", () => {
    expect(isAIResultSet(valid)).toBe(true);
  });
  it("rejects wrong schema", () => {
    expect(isAIResultSet({ ...valid, schema: "nope" })).toBe(false);
  });
  it("rejects missing results array", () => {
    expect(isAIResultSet({ schema: "orbidicom.ai-results/v1", provenance: {} })).toBe(false);
  });
  it("rejects a result with an unknown kind", () => {
    expect(isAIResultSet({ ...valid, results: [{ kind: "bogus" }] })).toBe(false);
  });
});
