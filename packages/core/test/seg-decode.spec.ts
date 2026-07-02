import { describe, it, expect } from "vitest";
import { decodeSegmentation } from "../src/seg/decode";

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

describe("decodeSegmentation", () => {
  it("decodes a 2-frame BINARY SEG into per-source labelmaps", () => {
    // frame0 px0=1, frame1 px1=1, LSB-first continuous => byte 0b00001001 = 0x09
    const data = decodeSegmentation(meta, Uint8Array.from([0x09]));
    expect(data.info.segments[0].label).toBe("Tumor");
    const byUid = Object.fromEntries(
      data.labelmaps.map((l) => [l.sourceSopInstanceUid, Array.from(l.data)]),
    );
    expect(byUid.sopA).toEqual([1, 0]);
    expect(byUid.sopB).toEqual([0, 1]);
  });
});
