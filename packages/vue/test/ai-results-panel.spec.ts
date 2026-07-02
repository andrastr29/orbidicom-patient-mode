import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AiResultsPanel from "../src/components/AiResultsPanel.vue";
import type { AIResultSet } from "@orbidicom/core";

const resultSet: AIResultSet = {
  schema: "orbidicom.ai-results/v1",
  provenance: { source: "inference", providerId: "mock", format: "ai-json" },
  results: [
    {
      kind: "measurement",
      id: "m1",
      label: "Lesion",
      reviewStatus: "pending",
      visible: true,
      measurement: {
        annotationUID: "m1",
        tool: "Length",
        label: "Lesion",
        imageId: "i",
        frameOfReferenceUID: "F",
        stats: [{ target: "t", name: "length", value: 24.3, unit: "mm" }],
        points: [
          [0, 0, 0],
          [24.3, 0, 0],
        ],
      },
    },
    {
      kind: "finding",
      id: "f1",
      label: "Impression",
      reviewStatus: "pending",
      visible: true,
      text: "likely benign",
    },
  ],
};

describe("AiResultsPanel", () => {
  it("renders a section per kind with counts", () => {
    const w = mount(AiResultsPanel, { props: { resultSet } });
    expect(w.text()).toContain("Measurements");
    expect(w.text()).toContain("Findings");
    expect(w.text()).toContain("Lesion");
    expect(w.text()).toContain("likely benign");
  });
  it("emits reject with the result id", async () => {
    const w = mount(AiResultsPanel, { props: { resultSet } });
    await w.get('[data-test="reject-m1"]').trigger("click");
    expect(w.emitted("reject")?.[0]).toEqual(["m1"]);
  });
  it("emits export with the chosen format", async () => {
    const w = mount(AiResultsPanel, { props: { resultSet } });
    await w.get('[data-test="export-json"]').trigger("click");
    expect(w.emitted("export")?.[0]).toEqual(["json"]);
  });
});
