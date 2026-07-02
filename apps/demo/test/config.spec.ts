import { describe, it, expect } from "vitest";
import { mergeConfig } from "../src/config";

describe("mergeConfig", () => {
  it("returns the base config when there are no query params", () => {
    expect(mergeConfig({ pacsUrl: "/dicom-web", studyUid: "1.2.3" }, "")).toEqual({
      pacsUrl: "/dicom-web",
      studyUid: "1.2.3",
      features: { aiResults: false },
    });
  });

  it("lets ?pacs= and ?study= override the base config", () => {
    expect(
      mergeConfig(
        { pacsUrl: "/dicom-web", studyUid: "1.2.3" },
        "?pacs=https://pacs.example/dicom-web&study=9.9.9",
      ),
    ).toEqual({
      pacsUrl: "https://pacs.example/dicom-web",
      studyUid: "9.9.9",
      features: { aiResults: false },
    });
  });

  it("preserves dotted Study Instance UIDs from the URL", () => {
    expect(mergeConfig({}, "?study=1.2.840.113619.2.55.3.604688").studyUid).toBe(
      "1.2.840.113619.2.55.3.604688",
    );
  });

  it("trims whitespace and ignores present-but-empty params", () => {
    expect(mergeConfig({ pacsUrl: "/dicom-web" }, "?pacs=&study=%20%20")).toEqual({
      pacsUrl: "/dicom-web",
      studyUid: "",
      features: { aiResults: false },
    });
  });

  it("defaults to empty strings when nothing is configured", () => {
    expect(mergeConfig({}, "")).toEqual({
      pacsUrl: "",
      studyUid: "",
      features: { aiResults: false },
    });
  });

  it("carries auth through from the base config but never from query params", () => {
    const base = {
      pacsUrl: "/dicom-web",
      auth: { kind: "bearer", token: "secret" } as const,
    };
    // A crafted ?auth= must not override or inject auth (it's not a query key).
    const merged = mergeConfig(base, "?auth=none&pacs=/x");
    expect(merged.auth).toEqual({ kind: "bearer", token: "secret" });
    expect(merged.pacsUrl).toBe("/x"); // pacs/study stay overridable
  });
});

describe("mergeConfig features", () => {
  it("keeps features from the base config", () => {
    expect(mergeConfig({ features: { aiResults: true } }, "").features?.aiResults).toBe(true);
  });
  it("enables aiResults via ?ai=1", () => {
    expect(mergeConfig({}, "?ai=1").features?.aiResults).toBe(true);
  });
  it("defaults aiResults off", () => {
    expect(mergeConfig({}, "").features?.aiResults).toBe(false);
  });
});
