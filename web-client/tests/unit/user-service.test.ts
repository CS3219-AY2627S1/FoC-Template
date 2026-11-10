import { afterEach, describe, expect, it, vi } from "vitest";
import { userService } from "../../src/api/user-service";

describe("User Service Phase 7 client calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a current-password-verified replacement without returning a secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      userService.changeCurrentPassword("CurrentPass1!", "ReplacementPass1!", "access-token"),
    ).resolves.toBeUndefined();

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/v1/users/me/password");
    expect(request.method).toBe("PATCH");
    expect(request.body).toBe(
      JSON.stringify({ currentPassword: "CurrentPass1!", newPassword: "ReplacementPass1!" }),
    );
    expect(request.headers).toBeInstanceOf(Headers);
    expect((request.headers as Headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("loads the current administrator list with bearer authentication", async () => {
    const admins = [{ userId: "admin-1", username: "CampusAdmin", email: "admin@u.nus.edu", systemRole: "ADMIN" }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(admins), { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(userService.listAdmins("access-token")).resolves.toEqual(admins);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/v1/admin/admins");
    expect(request.method).toBe("GET");
    expect((request.headers as Headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("uses one encoded administrative identity query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ userId: "user-1" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(userService.findUserAccount("email", "student+one@u.nus.edu", "access-token")).resolves.toEqual({ userId: "user-1" });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/v1/admin/users?email=student%2Bone%40u.nus.edu");
    expect(request.method).toBe("GET");
    expect(request.headers).toBeInstanceOf(Headers);
    expect((request.headers as Headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("sends a Super Admin role change only for the selected target account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ userId: "user-1", systemRole: "ADMIN", roleVersion: 2 }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      userService.updateUserSystemRole("user-1", "ADMIN", "access-token"),
    ).resolves.toEqual({ userId: "user-1", systemRole: "ADMIN", roleVersion: 2 });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/v1/admin/users/user-1/system-role");
    expect(request.method).toBe("PATCH");
    expect(request.body).toBe(JSON.stringify({ systemRole: "ADMIN" }));
    expect(request.headers).toBeInstanceOf(Headers);
    expect((request.headers as Headers).get("Authorization")).toBe("Bearer access-token");
  });
});
