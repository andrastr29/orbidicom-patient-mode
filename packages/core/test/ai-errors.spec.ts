import { describe, it, expect } from "vitest";
import { ImportError } from "../src/ai/errors";

describe("ImportError", () => {
  it("is an Error carrying a reason and name", () => {
    const e = new ImportError("bad schema");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ImportError");
    expect(e.reason).toBe("bad schema");
    expect(e.message).toBe("bad schema");
  });
});
