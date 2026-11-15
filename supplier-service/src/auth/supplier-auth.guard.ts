/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added bearer authentication, verified-principal attachment, and
 * role-aware NestJS route protection for issue #16; adopted shared public
 * error factories during issue #17 review.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; separated
 * mutation role metadata from guard installation so User verification runs
 * once per request for issue #22. Author review: Reviewed and approved by @ron.
 */
import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  supplierAuthenticationUnavailableException,
  supplierForbiddenException,
  supplierUnauthenticatedException,
} from "../http/supplier-http-errors";

import {
  SESSION_VERIFIER,
  SessionVerifier,
  UnauthenticatedSessionError,
  UserRole,
  VerifiedPrincipal,
} from "./session-verifier";

export const SUPPLIER_REQUIRED_ROLES = Symbol("SUPPLIER_REQUIRED_ROLES");
const BEARER_HEADER_PATTERN = /^Bearer [^\s]+$/;

interface SupplierHttpRequest {
  headers: {
    authorization?: string | string[];
  };
}

export interface AuthenticatedSupplierRequest extends SupplierHttpRequest {
  principal: VerifiedPrincipal;
}

@Injectable()
export class SupplierAuthGuard implements CanActivate {
  constructor(
    @Inject(SESSION_VERIFIER)
    private readonly verifier: SessionVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SupplierHttpRequest>();
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== "string" ||
      !BEARER_HEADER_PATTERN.test(authorization)
    ) {
      throw supplierUnauthenticatedException();
    }

    let principal: VerifiedPrincipal;
    try {
      principal = await this.verifier.verify(authorization);
    } catch (error) {
      if (error instanceof UnauthenticatedSessionError) {
        throw supplierUnauthenticatedException();
      }
      throw supplierAuthenticationUnavailableException();
    }

    (request as AuthenticatedSupplierRequest).principal = principal;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      SUPPLIER_REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles?.length && !requiredRoles.includes(principal.role)) {
      throw supplierForbiddenException();
    }

    return true;
  }
}

export function RequireAuthentication(...roles: UserRole[]) {
  return applyDecorators(
    SetMetadata(SUPPLIER_REQUIRED_ROLES, roles),
    UseGuards(SupplierAuthGuard),
  );
}

/** Adds role policy to a route already protected by SupplierAuthGuard. */
export function RequireSupplierRoles(...roles: UserRole[]) {
  return SetMetadata(SUPPLIER_REQUIRED_ROLES, roles);
}
