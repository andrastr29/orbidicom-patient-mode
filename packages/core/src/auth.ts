export type AuthStrategy =
  | { kind: "none" }
  | { kind: "basic"; username: string; password: string }
  | { kind: "bearer"; token: string | (() => string | Promise<string>) }
  | { kind: "cookie" }
  | { kind: "custom"; bootstrap?: () => Promise<void>; headers?: () => HeadersInit };

/**
 * Synchronous request headers for an auth strategy. Covers the static cases:
 * basic (base64 Authorization), bearer-with-string-token, and custom headers().
 * `none`/`cookie` add no headers (cookie auth rides on `withCredentials`).
 * Async cases (a bearer token *function* and custom `bootstrap()`) are the
 * caller's responsibility (handled in the Vue layer), so they return `{}` here.
 */
export function authHeaders(auth: AuthStrategy): Record<string, string> {
  switch (auth.kind) {
    case "basic":
      return { Authorization: "Basic " + btoa(`${auth.username}:${auth.password}`) };
    case "bearer":
      return typeof auth.token === "string" ? { Authorization: "Bearer " + auth.token } : {};
    case "custom":
      return (auth.headers?.() as Record<string, string>) ?? {};
    case "none":
    case "cookie":
    default:
      return {};
  }
}
