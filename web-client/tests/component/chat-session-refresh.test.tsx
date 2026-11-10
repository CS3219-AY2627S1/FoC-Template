import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "../../src/app/auth-provider";
import { useAuth } from "../../src/app/use-auth";
import type { AuthContextValue } from "../../src/app/auth-context";
import { userService, type CurrentUser } from "../../src/api/user-service";
import { ApiRequestError } from "../../src/api/client";

let auth: AuthContextValue;
const user: CurrentUser = { userId: "alice", username: "alice", email: "alice@u.nus.edu", displayName: "Alice", systemRole: "USER", accountStatus: "ACTIVE" };
const session = (accessToken: string) => ({ accessToken, tokenType: "Bearer" as const, expiresAt: "2030-01-01T00:00:00Z" });
function Probe() { auth = useAuth(); return <p>{auth.status}</p>; }
beforeEach(() => {
  vi.spyOn(userService, "refreshSession").mockResolvedValueOnce(session("expired-token")).mockResolvedValue(session("fresh-token"));
  vi.spyOn(userService, "getCurrentUser").mockResolvedValue(user);
  vi.spyOn(userService, "revokeCurrentSession").mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function mount() { await act(async () => { render(<AuthProvider><Probe /></AuthProvider>); }); expect(screen.getByText("authenticated")).toBeVisible(); }
const expired = () => new ApiRequestError(401, "Expired", { code: "INVALID_SESSION" });

it("rotates the restoration cookie once when StrictMode remounts effects", async () => {
  await act(async () => { render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>); });
  expect(screen.getByText("authenticated")).toBeVisible();
  expect(userService.refreshSession).toHaveBeenCalledTimes(1);
});

it("shares one token refresh across concurrent Chat HTTP recovery and WebSocket authentication", async () => {
  await mount();
  const operation = vi.fn(async (token: string) => { if (token === "expired-token") throw expired(); return token; });
  await act(async () => { expect(await Promise.all([auth.withCurrentAccess(operation), auth.withCurrentAccess(operation), auth.withCurrentAccess(operation)])).toEqual(["fresh-token", "fresh-token", "fresh-token"]); });
  expect(userService.refreshSession).toHaveBeenCalledTimes(2); // restoration + one shared renewal
  expect(screen.getByText("authenticated")).toBeVisible();
});
it("keeps the session when a retried Chat operation fails with a dependency error", async () => {
  await mount();
  const operation = vi.fn(async (token: string) => { if (token === "expired-token") throw expired(); throw new ApiRequestError(503, "Unavailable", { code: "SERVICE_NOT_READY" }); });
  await act(async () => { await expect(auth.withCurrentAccess(operation)).rejects.toMatchObject({ code: "SERVICE_NOT_READY" }); });
  expect(screen.getByText("authenticated")).toBeVisible();
});
it("does not restore a signed-out user when an earlier token refresh finally completes", async () => {
  await mount();
  let finish!: (value: CurrentUser) => void;
  vi.mocked(userService.getCurrentUser).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const operation = vi.fn(async () => { throw expired(); });
  const result = expect(auth.withCurrentAccess(operation)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(async () => { await auth.signOut(); finish(user); await result; });
  expect(screen.getByText("anonymous")).toBeVisible();
});
