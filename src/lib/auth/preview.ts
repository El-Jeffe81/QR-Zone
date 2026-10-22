/**
 * Live-preview auth constants (server-only — NEVER import from the client).
 *
 * The app-builder template used to bake a shared "preview" OAuth client id and
 * secret into this file so the sandbox live preview could sign in with no
 * injected configuration. That hard-coded credential has been removed: the
 * broker client now comes ONLY from `STUDIO_AUTH_CLIENT_ID` /
 * `STUDIO_AUTH_CLIENT_SECRET` (see `server.ts`), with no default. Without them
 * federated sign-in stays off. The live GitHub Pages site is static and never
 * runs this code.
 *
 * What remains here is non-secret configuration: the broker issuer default and
 * the host patterns Better Auth accepts for a dynamic (per-request) baseURL.
 */
/** The shared auth broker issuer (OIDC discovery lives under it). */
export const STUDIO_ISSUER_DEFAULT = "https://auth.studio.example";

/**
 * Live-preview host patterns (`*.studio-sandboexample.com`). Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.studio-sandboexample.com"] as const;
