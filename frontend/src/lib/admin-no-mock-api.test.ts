import { describe, expect, it, vi } from "vitest"
import { createAdminApi } from "./admin-api"
import { readPublicConfig } from "./runtime-config"
describe("ready-only admin transport", () => {
  it("ignores stale mock flags and always checks real roles", async () => {
    expect(readPublicConfig({ NODE_ENV: "test", FOC_ENVIRONMENT: "local", FOC_FIREBASE_AUTH_EMULATOR_URL: "http://localhost:9099", FOC_ADMIN_API_MODE: "mock" }).adminApiMode).toBe("live")
    const request = vi.fn().mockResolvedValue({ userId: "uid", roles: ["admin"] })
    const api = createAdminApi(request)
    expect(api.mode).toBe("live")
    await api.roleContext("uid")
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/users/role-context", { signal: undefined })
  })
})
