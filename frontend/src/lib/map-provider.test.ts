import { afterEach, describe, expect, it, vi } from "vitest"
import { coordinates, photonAddresses, searchAddresses } from "./map-provider"

afterEach(() => vi.restoreAllMocks())

describe("Public map provider contract", () => {
  it("converts GeoJSON longitude/latitude and rejects invalid coordinates without inventing places", () => {
    const result = photonAddresses({ features: [
      { geometry: { type: "Point", coordinates: [103.77, 1.29] }, properties: { name: "The Deck", city: "Singapore" } },
      { geometry: { type: "Point", coordinates: [181, 1] }, properties: { name: "Invalid" } },
      { geometry: { type: "Point", coordinates: [103, 91] }, properties: { name: "Invalid" } },
    ] })
    expect(result).toEqual([expect.objectContaining({ latitude: 1.29, longitude: 103.77, label: "The Deck, Singapore" })])
    expect(coordinates("0", "0")).toEqual({ latitude: 0, longitude: 0 })
    expect(coordinates("", "103")).toBeNull()
    expect(coordinates("NaN", "103")).toBeNull()
    expect(() => photonAddresses({})).toThrow("invalid response")
  })

  it("sends bounded anonymous address searches without Firebase credentials", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ features: [] })))
    const signal = new AbortController().signal
    await searchAddresses("  NUS & library  ", signal)
    const [url, options] = fetch.mock.calls[0]
    expect(new URL(String(url)).searchParams.get("q")).toBe("NUS & library")
    expect(new URL(String(url)).searchParams.get("limit")).toBe("5")
    expect(options).toEqual(expect.objectContaining({ credentials: "omit", headers: { Accept: "application/json" }, signal: expect.any(AbortSignal) }))
    expect(options?.headers).not.toHaveProperty("Authorization")
  })

  it("surfaces provider failures and does not call the provider for short searches", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429 }))
    const signal = new AbortController().signal
    expect(await searchAddresses("ab", signal)).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    await expect(searchAddresses("Library", signal)).rejects.toThrow("enter coordinates manually")
  })
})
