import { describe, it, expect } from "vitest";
import { importResults } from "../src/ai/import";
import { ImportError } from "../src/ai/errors";

describe("importResults", () => {
  it("routes ai-results/v1 to fromAiJson", () => {
    const set = importResults({
      schema: "orbidicom.ai-results/v1",
      provenance: { source: "inference" },
      results: [{ kind: "finding", id: "f", label: "x" }],
    });
    expect(set.provenance.format).toBe("ai-json");
  });
  it("routes measurements/v1 to fromOrbidicomJson (string input)", () => {
    const set = importResults(
      JSON.stringify({ schema: "orbidicom.measurements/v1", measurements: [] }),
    );
    expect(set.provenance.format).toBe("orbidicom-json");
  });
  it("throws ImportError on an unknown schema", () => {
    expect(() => importResults({ schema: "whatever" })).toThrow(ImportError);
  });
  it("throws ImportError on non-JSON string", () => {
    expect(() => importResults("not json")).toThrow(ImportError);
  });
});
