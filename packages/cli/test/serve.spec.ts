import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serve } from "../src/serve";
import type { CliOptions } from "../src/args";

function opts(over: Partial<CliOptions> = {}): CliOptions {
  return { command: "serve", port: 0, open: false, rest: [], ...over };
}

describe("serve", () => {
  it("serves an injected config.js that reflects --pacs/--study", async () => {
    const root = mkdtempSync(join(tmpdir(), "orbi-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>x</title>");
    const s = await serve(opts({ pacs: "/dicom-web", study: "1.2.3" }), root);
    try {
      const res = await fetch(`http://localhost:${s.port}/config.js`);
      const body = await res.text();
      expect(res.headers.get("content-type")).toContain("javascript");
      expect(body).toContain('pacsUrl: "/dicom-web"');
      expect(body).toContain('studyUid: "1.2.3"');
    } finally {
      await s.close();
    }
  });

  it("serves an injected config.js with features.aiResults when --ai is set", async () => {
    const root = mkdtempSync(join(tmpdir(), "orbi-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>x</title>");
    const s = await serve(opts({ ai: true }), root);
    try {
      const res = await fetch(`http://localhost:${s.port}/config.js`);
      const body = await res.text();
      expect(body).toContain("features: { aiResults: true }");
    } finally {
      await s.close();
    }
  });

  it("binds an OS-assigned port when port is 0 and serves static files", async () => {
    const root = mkdtempSync(join(tmpdir(), "orbi-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>orbi</title>");
    const s = await serve(opts(), root);
    try {
      expect(s.port).toBeGreaterThan(0);
      const res = await fetch(`http://localhost:${s.port}/`);
      expect(await res.text()).toContain("orbi");
    } finally {
      await s.close();
    }
  });
});
