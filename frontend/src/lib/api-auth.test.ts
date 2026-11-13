import { describe, expect, it } from "vitest"

import { ApiError, requireBearerToken } from "@/lib/api"

describe("requireBearerToken", () => {
  it("returns a usable Firebase token", () => {
    expect(requireBearerToken("firebase-id-token")).toBe("firebase-id-token")
  })

  it("rejects an absent token before a network request can be made", () => {
    expect(() => requireBearerToken(null)).toThrowError(ApiError)
    expect(() => requireBearerToken(null)).toThrow("Sign in to continue.")
  })
})
