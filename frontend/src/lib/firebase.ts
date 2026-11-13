import { getApp, getApps, initializeApp } from "firebase/app"
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth"

import type { PublicConfig } from "@/lib/runtime-config"

let auth: Auth | null = null

// Browser-only: call from effects or event handlers, never during server rendering.
export function getFirebaseAuth(config: PublicConfig): Auth {
  if (auth) return auth

  const app = getApps().length ? getApp() : initializeApp(config.firebase)
  auth = getAuth(app)
  if (config.authEmulatorUrl) {
    connectAuthEmulator(auth, config.authEmulatorUrl, { disableWarnings: true })
  }
  return auth
}
