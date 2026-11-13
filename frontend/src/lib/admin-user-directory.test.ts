import { describe, expect, it, vi } from "vitest"
import { createAdminApi } from "./admin-api"
import { ApiError } from "./api"

const user = { id: "p", userId: "uid", username: "Alex", email: "a@u.nus.edu", roles: ["requester"], penalty: 0, isCourierSuspended: false, suspensionEndDate: null, status: "ACTIVE" }
describe("real Admin User directory", () => {
  it("loads an initial server page and preserves server totals without fetching all users", async () => {
    const request = vi.fn().mockResolvedValue({ items: [user], page: 1, size: 20, totalItems: 23, totalPages: 2 })
    const result = await createAdminApi(request).users({ page: 1, searchBy: "id", q: "" })
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/users/admin/search?page=1&size=20&searchBy=id", { signal: undefined })
    expect(result).toMatchObject({ items: [{ userId: "uid", active: true, usableBalance: null }], totalItems: 23, totalPages: 2 })
  })
  it("sends trimmed name/ID filters and page to the real directory", async () => {
    const request = vi.fn().mockResolvedValue({ items: [], page: 2, size: 20, totalItems: 0, totalPages: 0 })
    const api = createAdminApi(request)
    const signal = new AbortController().signal
    await api.users({ page: 2, searchBy: "name", q: " Alex & Lee " }, signal)
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/users/admin/search?page=2&size=20&searchBy=name&q=Alex+%26+Lee", { signal })
  })
  it("propagates real directory failures without mock data or a fetch-all fallback", async () => {
    const request = vi.fn()
    for (const status of [401, 403, 404, 503]) {
      const failure = new ApiError(status, "FAILURE", "Directory unavailable")
      request.mockRejectedValue(failure)
      await expect(createAdminApi(request).users({ page: 1, searchBy: "id", q: "uid" })).rejects.toBe(failure)
    }
    expect(request.mock.calls.every(([p]) => p.startsWith("/api/users/admin/search?"))).toBe(true)
  })
})
