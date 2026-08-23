import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import type { CliOptions } from "./args";
import { configScript } from "./config.js";

/**
 * Resolve the prebuilt demo's directory. Published layout: the demo build is
 * bundled into this package's `public/` (see scripts/bundle-demo.mjs). When
 * running from the monorepo source, fall back to apps/demo/dist.
 */
export function demoDistDir(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // …/packages/cli/dist
  const bundled = resolve(here, "../public");
  if (existsSync(join(bundled, "index.html"))) return bundled;
  return resolve(here, "../../../apps/demo/dist"); // dev / monorepo fallback
}

export interface ServeHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

export async function serve(opts: CliOptions, root: string = demoDistDir()): Promise<ServeHandle> {
  const handler = sirv(root, { single: true, dev: false });
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    // Inject runtime config so the static bundle connects to the chosen PACS
    // without rebuilding; the same role as config.js in the container image.
    if (path === "/config.js") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(configScript(opts));
      return;
    }
    handler(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
  });
  await new Promise<void>((r) => server.listen(opts.port, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  return {
    port,
    url: `http://localhost:${port}/`,
    close: () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))),
  };
}

/** Open a URL in the default browser (best-effort, never throws). */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(cmd, [url], { stdio: "ignore", detached: true, shell: cmd === "start" });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* headless / no browser; the printed URL is enough */
  }
}
