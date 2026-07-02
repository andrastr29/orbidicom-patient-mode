import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/args";

describe("parseArgs", () => {
  it("defaults to the serve command in local mode", () => {
    const o = parseArgs([]);
    expect(o.command).toBe("serve");
    expect(o.pacs).toBeUndefined();
    expect(o.open).toBe(true);
  });

  it("parses --pacs, --port and --no-open", () => {
    const o = parseArgs(["--pacs", "https://example/dicom-web", "--port", "5999", "--no-open"]);
    expect(o.command).toBe("serve");
    expect(o.pacs).toBe("https://example/dicom-web");
    expect(o.port).toBe(5999);
    expect(o.open).toBe(false);
  });

  it("recognizes the ai and init subcommands", () => {
    expect(parseArgs(["ai"]).command).toBe("ai");
    expect(parseArgs(["init"]).command).toBe("init");
  });

  it("parses --auth with bearer --token", () => {
    const o = parseArgs(["--pacs", "/dicom-web", "--auth", "bearer", "--token", "abc"]);
    expect(o.auth).toBe("bearer");
    expect(o.token).toBe("abc");
  });

  it("parses --auth basic with --username/--password and --auth cookie", () => {
    const b = parseArgs(["--auth", "basic", "--username", "u", "--password", "p"]);
    expect(b.auth).toBe("basic");
    expect(b.username).toBe("u");
    expect(b.password).toBe("p");
    expect(parseArgs(["--auth", "cookie"]).auth).toBe("cookie");
  });
});

describe("parseArgs --ai", () => {
  it("sets ai:true on the serve command", () => {
    expect(parseArgs(["serve", "--ai"]).ai).toBe(true);
  });
});
