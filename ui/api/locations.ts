// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: Team-approved destination search client; review pending; see ../../order-service/usage-log.md.
import { api } from './client'

export type DestinationLocation = { id: string; name: string; code: string }
export const searchLocations = (query: string, signal: AbortSignal) =>
  api<{ locations: DestinationLocation[] }>(`/orders/locations?query=${encodeURIComponent(query)}&limit=20`, { signal })
    .then(body => body.locations)
