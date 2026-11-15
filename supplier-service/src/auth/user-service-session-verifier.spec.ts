/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: contract-tested User Service request forwarding, response validation,
 * failure mapping, no-cache behavior, and timeout enforcement for issue #16.
 * Author review: Reviewed and approved by @ron.
 */
import {
  SessionVerificationUnavailableError,
  UnauthenticatedSessionError,
} from "./session-verifier";
import { UserServiceSessionVerifier } from "./user-service-session-verifier";

const USER_ID = "67ef02dc-814d-49e2-b6c2-9bdc433924c0";
const AUTHORIZATION = "Bearer header.payload.signature";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createVerifier(
  fetchImplementation: jest.Mock,
  timeoutMs = 100,
): UserServiceSessionVerifier {
  return new UserServiceSessionVerifier(
    {
      userServiceBaseUrl: "http://user-service:3001/base-path",
      timeoutMs,
    },
    fetchImplementation as unknown as typeof fetch,
  );
}

describe("UserServiceSessionVerifier", () => {
  it.each(["MEMBER", "ADMINISTRATOR"] as const)(
    "returns a verified %s principal and forwards the bearer header unchanged",
    async (role) => {
      const fetchImplementation = jest
        .fn()
        .mockResolvedValue(jsonResponse({ id: USER_ID, role }));
      const verifier = createVerifier(fetchImplementation);

      await expect(verifier.verify(AUTHORIZATION)).resolves.toEqual({
        id: USER_ID,
        role,
      });

      expect(fetchImplementation).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImplementation.mock.calls[0] as [
        URL,
        RequestInit,
      ];
      expect(url.toString()).toBe("http://user-service:3001/auth/verify");
      expect(init).toMatchObject({
        method: "GET",
        redirect: "error",
        headers: { Authorization: AUTHORIZATION },
      });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    },
  );

  it("does not cache successful verification", async () => {
    const fetchImplementation = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ id: USER_ID, role: "MEMBER" })),
      );
    const verifier = createVerifier(fetchImplementation);

    await verifier.verify(AUTHORIZATION);
    await verifier.verify(AUTHORIZATION);

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("maps User Service 401 to an unauthenticated session", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(
      jsonResponse(
        { error: "UNAUTHENTICATED", message: "Invalid or expired token" },
        401,
      ),
    );

    await expect(
      createVerifier(fetchImplementation).verify(AUTHORIZATION),
    ).rejects.toBeInstanceOf(UnauthenticatedSessionError);
  });

  it.each([400, 403, 404, 500])(
    "fails closed for downstream status %s",
    async (status) => {
      const fetchImplementation = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: "unexpected" }, status));

      await expect(
        createVerifier(fetchImplementation).verify(AUTHORIZATION),
      ).rejects.toBeInstanceOf(SessionVerificationUnavailableError);
    },
  );

  it.each([
    null,
    { id: "not-a-uuid", role: "MEMBER" },
    { id: USER_ID, role: "OWNER" },
    { id: USER_ID },
  ])("fails closed for malformed success body %#", async (body) => {
    const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(body));

    await expect(
      createVerifier(fetchImplementation).verify(AUTHORIZATION),
    ).rejects.toBeInstanceOf(SessionVerificationUnavailableError);
  });

  it("fails closed when a success body is not JSON", async () => {
    const fetchImplementation = jest
      .fn()
      .mockResolvedValue(new Response("not JSON", { status: 200 }));

    await expect(
      createVerifier(fetchImplementation).verify(AUTHORIZATION),
    ).rejects.toBeInstanceOf(SessionVerificationUnavailableError);
  });

  it("fails closed when User Service is unavailable", async () => {
    const fetchImplementation = jest
      .fn()
      .mockRejectedValue(new Error("connection refused"));

    await expect(
      createVerifier(fetchImplementation).verify(AUTHORIZATION),
    ).rejects.toBeInstanceOf(SessionVerificationUnavailableError);
  });

  it("enforces the configured timeout", async () => {
    const fetchImplementation = jest.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );

    await expect(
      createVerifier(fetchImplementation, 5).verify(AUTHORIZATION),
    ).rejects.toBeInstanceOf(SessionVerificationUnavailableError);
  });
});
