import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAdminApi } from "./use-admin-api"

const mocks = vi.hoisted(() => ({ request: vi.fn(), config: { environment: "local", authEmulatorUrl: "http://localhost:9099" as string | null, adminApiMode: "mock" as "mock" | "live" } }))
vi.mock("@/hooks/use-api", () => ({ useApi: () => mocks.request }))
vi.mock("@/components/providers/config-provider", () => ({ useConfig: () => mocks.config }))
afterEach(cleanup)

describe("Admin runtime provider selection", () => {
  it.each([
    ["local", "http://localhost:9099", "mock", "live"], ["local", null, "live", "live"],
    ["staging", null, "live", "live"], ["production", null, "live", "live"],
    ["staging", "http://localhost:9099", "live", "live"],
    ["local", "http://localhost:9099", "live", "live"],
  ] as const)("selects safe transport for %s with emulator %s and mode %s", (environment, authEmulatorUrl, adminApiMode, expected) => {
    mocks.config = { environment, authEmulatorUrl, adminApiMode }
    const { result } = renderHook(() => useAdminApi())
    expect(result.current.mode).toBe(expected)
  })
})
