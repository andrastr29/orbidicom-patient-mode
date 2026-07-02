import { describe, it, expect } from "vitest";
import { fromDicomSeg } from "../src/ai/import/from-dicom-seg";

const V = (s: string | number) => ({ Value: [s] });
const SEQ = (...items: unknown[]) => ({ Value: items });
const frame = (segNum: string, srcSop: string) => ({
  "0062000A": SEQ({ "0062000B": V(segNum) }),
  "00089124": SEQ({ "00082112": SEQ({ "00081155": V(srcSop) }) }),
});
const meta: Record<string, unknown> = {
  "00080016": V("1.2.840.10008.5.1.4.1.1.66.4"),
  "00620001": V("BINARY"),
  "00280010": V(1),
  "00280011": V(2),
  "00280008": V(2),
  "00620002": SEQ({ "00620004": V(1), "00620005": V("Tumor") }),
  "00081115": SEQ({ "0020000E": V("S1") }),
  "52009230": SEQ(frame("1", "sopA"), frame("1", "sopB")),
};

describe("fromDicomSeg", () => {
  it("produces one accepted SegmentationResult with stats and retained bytes", () => {
    const bytes = Uint8Array.from([0x09]);
    const set = fromDicomSeg(meta, bytes, { rowMm: 1, colMm: 1, sliceMm: 2 });
    expect(set.provenance.format).toBe("dicom-seg");
    expect(set.results).toHaveLength(1);
    const r = set.results[0];
    expect(r.kind).toBe("segmentation");
    if (r.kind === "segmentation") {
      expect(r.sourceBytes).toBe(bytes);
      expect(r.stats?.[0]).toEqual({
        segment: 1,
        label: "Tumor",
        voxels: 2,
        areaMm2: 2,
        volumeMm3: 4,
      });
    }
  });
});
