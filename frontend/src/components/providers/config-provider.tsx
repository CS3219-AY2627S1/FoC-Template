"use client"

import { createContext, useContext } from "react"

import type { PublicConfig } from "@/lib/runtime-config"

const ConfigContext = createContext<PublicConfig | null>(null)

export function ConfigProvider({ config, children }: { config: PublicConfig; children: React.ReactNode }) {
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
}

export function useConfig(): PublicConfig {
  const config = useContext(ConfigContext)
  if (!config) throw new Error("useConfig must be used inside <ConfigProvider>")
  return config
}
