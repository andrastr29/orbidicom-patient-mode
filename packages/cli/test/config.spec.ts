import { describe, it, expect } from "vitest";
import { configScript } from "../src/config";

describe("configScript", () => {
  it("emits an empty config when no PACS/study is given (local mode)", () => {
    const js = configScript({});
    expect(js).toContain('pacsUrl: ""');
    expect(js).toContain('studyUid: ""');
    expect(js).toContain("window.__ORBIDICOM_CONFIG__");
  });

  it("embeds --pacs and --study", () => {
    const js = configScript({ pacs: "/dicom-web", study: "1.2.840.113619" });
    expect(js).toContain('pacsUrl: "/dicom-web"');
    expect(js).toContain('studyUid: "1.2.840.113619"');
  });

  it("sanitizes quotes, backslashes and newlines so values can't break out", () => {
    const js = configScript({ pacs: 'https://x/"; alert(1);//', study: "a\\b\nc" });
    expect(js).not.toContain('alert(1)";');
    expect(js).not.toMatch(/[\r\n]\s*alert/);
    // The string literals stay single-line and quote-balanced.
    expect(js).toContain('pacsUrl: "https://x/; alert(1);//"');
    expect(js).toContain('studyUid: "abc"');
  });

  it("emits no auth block by default (so the source defaults to none/same-origin)", () => {
    expect(configScript({})).not.toContain("auth:");
    expect(configScript({ auth: "none" })).not.toContain("auth:");
  });

  it("embeds cookie auth", () => {
    expect(configScript({ auth: "cookie" })).toContain('auth: { kind: "cookie" }');
  });

  it("embeds bearer auth with a token", () => {
    expect(configScript({ auth: "bearer", token: "abc123" })).toContain(
      'auth: { kind: "bearer", token: "abc123" }',
    );
  });

  it("embeds basic auth with username/password", () => {
    expect(configScript({ auth: "basic", username: "u", password: "p" })).toContain(
      'auth: { kind: "basic", username: "u", password: "p" }',
    );
  });

  it("sanitizes auth values so they can't break out of the literal", () => {
    const js = configScript({ auth: "bearer", token: 'x"; alert(1);//' });
    expect(js).toContain('token: "x; alert(1);//"');
    expect(js).not.toMatch(/[\r\n]\s*alert/);
  });
});

describe("configScript features", () => {
  it("emits features.aiResults when --ai was set", () => {
    expect(configScript({ ai: true })).toContain("features: { aiResults: true }");
  });
  it("emits features.patient when --patient was set", () => {
    expect(configScript({ patient: true })).toContain("features: { patient: true }");
  });
  it("combines feature flags in one literal", () => {
    expect(configScript({ ai: true, patient: true })).toContain(
      "features: { aiResults: true, patient: true }",
    );
  });
  it("omits features when not set", () => {
    expect(configScript({})).not.toContain("features");
  });
});
