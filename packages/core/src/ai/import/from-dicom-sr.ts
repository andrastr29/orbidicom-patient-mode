import type { SrTree, SrNode } from "../../sr/types";
import type { AIResultSet, FindingResult } from "../types";

/**
 * Convert an SR tree into value/text/code findings. Findings-only by design:
 * the SR readers do not surface SCOORD graphic data, so no on-image geometry is
 * reconstructable yet (see spec §6 / Phase 1 scope note).
 */
export function fromDicomSr(tree: SrTree): AIResultSet {
  const results: FindingResult[] = [];
  let i = 0;
  const push = (label: string, extra: Partial<FindingResult>) => {
    results.push({
      kind: "finding",
      id: `sr-${i++}`,
      label,
      reviewStatus: "pending",
      visible: true,
      ...extra,
    });
  };
  const walk = (n: SrNode) => {
    const label = n.conceptName?.meaning ?? n.valueType;
    if (n.valueType === "NUM" && n.num) {
      const unit = n.num.unit?.meaning ?? n.num.unit?.value ?? "";
      push(label, { value: `${n.num.value}${unit ? ` ${unit}` : ""}` });
    } else if (n.valueType === "TEXT" && n.text) {
      push(label, { text: n.text });
    } else if (n.valueType === "CODE" && n.code) {
      push(label, { value: n.code.meaning ?? n.code.value, code: n.code });
    }
    for (const c of n.children) walk(c);
  };
  walk(tree.root);
  return {
    schema: "orbidicom.ai-results/v1",
    provenance: { source: "import", format: "dicom-sr" },
    results,
  };
}
