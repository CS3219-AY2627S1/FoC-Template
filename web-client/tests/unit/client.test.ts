import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../../src/api/client";

describe("requestJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends same-origin API requests with the refresh cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "user-1" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestJson<{ id: string }>("/users/me")).resolves.toEqual({ id: "user-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/users/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("converts the User Service error envelope into a typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "invalid_input", message: "Display name is required" } }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(requestJson("/users/me")).rejects.toMatchObject({
      status: 422,
      code: "invalid_input",
      message: "Display name is required",
    });
  });
});
