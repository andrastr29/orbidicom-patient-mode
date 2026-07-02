import { describe, it, expect } from "vitest";
import { bytesToBase64, base64ToBytes, encodeU8, decodeU8, isTaggedU8 } from "../src/ai/u8-codec";

describe("u8-codec base64", () => {
  it("round-trips bytes of every length-mod-3 (portable, no Buffer/btoa)", () => {
    for (const len of [0, 1, 2, 3, 4, 5, 255, 256, 1000]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 11) & 0xff;
      const b64 = bytesToBase64(bytes);
      const back = base64ToBytes(b64);
      expect(Array.from(back)).toEqual(Array.from(bytes));
    }
  });

  it("produces standard padded base64", () => {
    expect(bytesToBase64(new Uint8Array([102, 111, 111]))).toBe("Zm9v"); // "foo"
    expect(bytesToBase64(new Uint8Array([102, 111]))).toBe("Zm8="); // "fo"
    expect(bytesToBase64(new Uint8Array([102]))).toBe("Zg=="); // "f"
  });
});

describe("encodeU8 / decodeU8", () => {
  it("tags and untags nested Uint8Array fields losslessly", () => {
    const original = {
      a: new Uint8Array([1, 2, 3]),
      nested: { list: [new Uint8Array([255, 0, 128]), 42, "keep"] },
      plain: 7,
    };
    const encoded = encodeU8(original) as Record<string, unknown>;
    expect(isTaggedU8(encoded.a)).toBe(true);
    // Survives JSON.
    const decoded = decodeU8(JSON.parse(JSON.stringify(encoded))) as typeof original;
    expect(decoded.a).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded.a)).toEqual([1, 2, 3]);
    expect(decoded.nested.list[0]).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded.nested.list[0] as Uint8Array)).toEqual([255, 0, 128]);
    expect(decoded.nested.list[1]).toBe(42);
    expect(decoded.nested.list[2]).toBe("keep");
    expect(decoded.plain).toBe(7);
  });

  it("isTaggedU8 rejects non-tags", () => {
    expect(isTaggedU8({ $u8: 5 })).toBe(false);
    expect(isTaggedU8({ $u8: "x", other: 1 })).toBe(false);
    expect(isTaggedU8({ x: "y" })).toBe(false);
    expect(isTaggedU8(null)).toBe(false);
  });
});
