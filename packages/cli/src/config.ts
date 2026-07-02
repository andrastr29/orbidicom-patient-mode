/** Strip characters that would break out of the JS string literals below.
 *  Values are operator-supplied on the command line, so this is belt-and-braces. */
function sanitize(v: string): string {
  return v.replace(/["\\\r\n]/g, "");
}

export interface ConfigOptions {
  pacs?: string;
  study?: string;
  /** PACS auth strategy. "none"/omitted → same-origin (no header, cookies still
   *  sent same-origin). NOTE: basic/bearer credentials are embedded in the
   *  client-readable config.js — only use them on trusted/internal deployments. */
  auth?: "none" | "basic" | "bearer" | "cookie";
  token?: string;
  username?: string;
  password?: string;
  /** Enable the in-app AI & Results panel (features.aiResults). */
  ai?: boolean;
}

/** Serialize the auth strategy as a JS object literal, or "" for none/default. */
function authLiteral(opts: ConfigOptions): string {
  switch (opts.auth) {
    case "cookie":
      return `\n  auth: { kind: "cookie" },`;
    case "bearer":
      return `\n  auth: { kind: "bearer", token: "${sanitize(opts.token ?? "")}" },`;
    case "basic":
      return `\n  auth: { kind: "basic", username: "${sanitize(opts.username ?? "")}", password: "${sanitize(opts.password ?? "")}" },`;
    default:
      return ""; // none / unset → omit; the source defaults to same-origin
  }
}

/**
 * Generate the runtime `config.js` the served demo loads before its app module.
 * Mirrors the container entrypoint (deploy/docker-entrypoint.d) so `npx orbidicom`
 * and the Docker image produce an identical `window.__ORBIDICOM_CONFIG__` shape.
 */
export function configScript(opts: ConfigOptions): string {
  const pacsUrl = sanitize(opts.pacs ?? "");
  const studyUid = sanitize(opts.study ?? "");
  const featuresLiteral = opts.ai ? `\n  features: { aiResults: true },` : "";
  return `window.__ORBIDICOM_CONFIG__ = {\n  pacsUrl: "${pacsUrl}",\n  studyUid: "${studyUid}",${authLiteral(opts)}${featuresLiteral}\n};\n`;
}
