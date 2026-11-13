// Browser-safe configuration, read from the server environment at request time.
// NEXT_PUBLIC_* variables are frozen at build time, which would force a rebuild per
// environment; reading plain env vars here lets CI promote one image staging -> prod.
export type PublicConfig = {
  environment: string
  adminApiMode: "live"
  reportApiMode: "mock" | "live"
  // Origin of the API gateway. Empty string = same origin (the gateway also serves this UI).
  apiBaseUrl: string
  authEmulatorUrl: string | null
  firebase: {
    apiKey: string
    authDomain: string
    projectId: string
    appId?: string
  }
}

export function readPublicConfig(env: NodeJS.ProcessEnv = process.env): PublicConfig {
  const projectId = env.FOC_FIREBASE_PROJECT_ID || "demo-foc"
  const environment = env.FOC_ENVIRONMENT || "local"
  const authEmulatorUrl = env.FOC_FIREBASE_AUTH_EMULATOR_URL || null
  const requestedReportMode = env.FOC_REPORT_API_MODE ?? "mock"
  return {
    environment,
    // Ready Admin APIs are used everywhere; only Reports retain a local-only prototype.
    adminApiMode: "live",
    reportApiMode: environment === "local" && authEmulatorUrl && requestedReportMode === "mock" ? "mock" : "live",
    apiBaseUrl: (env.FOC_API_BASE_URL || "").replace(/\/+$/, ""),
    authEmulatorUrl,
    firebase: {
      // The Firebase web API key is a public identifier, not a secret.
      apiKey: env.FOC_FIREBASE_API_KEY || "demo-api-key",
      authDomain: env.FOC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      appId: env.FOC_FIREBASE_APP_ID || undefined,
    },
  }
}
