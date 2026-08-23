// Runtime configuration read from a classic <script src="config.js"> that runs
// before the app module. In a container the file is regenerated at startup from
// environment variables (see deploy/docker-entrypoint.d), so the same image can
// be pointed at any PACS without a rebuild. In dev a default empty config ships
// in public/config.js.

import type { AuthStrategy } from "@orbidicom/core";

export interface RuntimeConfig {
  /**
   * DICOMweb (WADO-RS / QIDO-RS) base URL the browser calls. Empty string means
   * local-file-only. With the bundled nginx reverse proxy this is typically
   * "/dicom-web" (same-origin, so no CORS configuration is needed on the PACS).
   */
  pacsUrl?: string;
  /** Optional Study Instance UID to auto-open on load. */
  studyUid?: string;
  /**
   * PACS auth strategy. Omitted → same-origin (no Authorization header; the
   * browser still sends same-origin cookies). Use "cookie" for cross-origin
   * session cookies. SECURITY: "basic"/"bearer" embed the credential in this
   * client-readable config, so only for trusted/internal deployments.
   */
  auth?: AuthStrategy;
  /** Optional per-deployment feature toggles. */
  features?: { aiResults?: boolean };
}

declare global {
  interface Window {
    __ORBIDICOM_CONFIG__?: RuntimeConfig;
  }
}

/**
 * Merge URL query params over a base config. `?pacs=` and `?study=` win when
 * present and non-empty, so a single static bundle (or `npx orbidicom`) can be
 * pointed at any PACS/study without rebuilding or editing config.js, e.g.
 * `…/?pacs=/dicom-web&study=1.2.840…`. Pure (no DOM) so it is unit-testable.
 */
export function mergeConfig(base: RuntimeConfig, search: string): RuntimeConfig {
  const params = new URLSearchParams(search);
  const pick = (key: string, fallback?: string): string => {
    const v = params.get(key);
    return v != null && v.trim() !== "" ? v.trim() : (fallback ?? "").trim();
  };
  // Auth comes from the base config ONLY (never a query param), so a crafted
  // link can't inject or downgrade credentials.
  const aiParam = params.get("ai");
  const aiResults =
    aiParam != null ? aiParam === "1" || aiParam === "true" : (base.features?.aiResults ?? false);
  return {
    pacsUrl: pick("pacs", base.pacsUrl),
    studyUid: pick("study", base.studyUid),
    auth: base.auth,
    features: { aiResults },
  };
}

export function runtimeConfig(): RuntimeConfig {
  const base = window.__ORBIDICOM_CONFIG__ ?? {};
  const search = typeof window !== "undefined" ? window.location.search : "";
  return mergeConfig(base, search);
}
