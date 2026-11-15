/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: tested Supplier bearer validation, principal attachment, role checks,
 * and exact 401/403/503 fail-closed guard behavior for issue #16.
 * Author review: Reviewed and approved by @ron.
 */
import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  SessionVerificationUnavailableError,
  SessionVerifier,
  UnauthenticatedSessionError,
  UserRole,
} from "./session-verifier";
import {
  AuthenticatedSupplierRequest,
  SupplierAuthGuard,
} from "./supplier-auth.guard";

const USER_ID = "67ef02dc-814d-49e2-b6c2-9bdc433924c0";
const AUTHORIZATION = "Bearer header.payload.signature";

function createContext(request: {
  headers: { authorization?: string | string[] };
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

function createGuard(requiredRoles?: UserRole[]) {
  const verifier = {
    verify: jest.fn().mockResolvedValue({ id: USER_ID, role: "MEMBER" }),
  };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  };

  return {
    guard: new SupplierAuthGuard(
      verifier as SessionVerifier,
      reflector as unknown as Reflector,
    ),
    verifier,
  };
}

describe("SupplierAuthGuard", () => {
  it.each([
    undefined,
    "",
    "Basic credentials",
    "bearer token",
    "Bearer ",
    "Bearer two tokens",
  ])("returns 401 for missing or malformed bearer input %p", async (value) => {
    const { guard, verifier } = createGuard();
    const request = { headers: { authorization: value } };

    await expect(guard.canActivate(createContext(request))).rejects.toEqual(
      expect.objectContaining({
        response: {
          code: "UNAUTHENTICATED",
          message: "A valid bearer token is required.",
        },
        status: 401,
      }),
    );
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("attaches the verified principal and forwards the header unchanged", async () => {
    const { guard, verifier } = createGuard();
    const request = { headers: { authorization: AUTHORIZATION } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(verifier.verify).toHaveBeenCalledWith(AUTHORIZATION);
    expect(
      (request as unknown as AuthenticatedSupplierRequest).principal,
    ).toEqual({ id: USER_ID, role: "MEMBER" });
  });

  it("returns 401 when User Service rejects the token", async () => {
    const { guard, verifier } = createGuard();
    verifier.verify.mockRejectedValue(new UnauthenticatedSessionError());

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: AUTHORIZATION } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    new SessionVerificationUnavailableError(),
    new Error("unexpected verifier failure"),
  ])("returns 503 for verification failure %#", async (failure) => {
    const { guard, verifier } = createGuard();
    verifier.verify.mockRejectedValue(failure);

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: AUTHORIZATION } }),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        response: {
          code: "AUTHENTICATION_UNAVAILABLE",
          message: "Authentication is temporarily unavailable.",
        },
        status: 503,
      }),
    );
  });

  it("returns 403 when the verified principal lacks a required role", async () => {
    const { guard } = createGuard(["ADMINISTRATOR"]);

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: AUTHORIZATION } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a verified principal with the required role", async () => {
    const { guard, verifier } = createGuard(["ADMINISTRATOR"]);
    verifier.verify.mockResolvedValue({
      id: USER_ID,
      role: "ADMINISTRATOR",
    });

    await expect(
      guard.canActivate(
        createContext({ headers: { authorization: AUTHORIZATION } }),
      ),
    ).resolves.toBe(true);
  });
});
