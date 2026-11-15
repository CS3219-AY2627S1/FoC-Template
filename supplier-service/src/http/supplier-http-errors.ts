/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: centralized stable Supplier public HTTP error definitions and
 * exception factories during issue #17 review remediation.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-26; added stable
 * mutation conflict and precondition errors for issue #22.
 * Author review: Reviewed and approved by @ron.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

export interface SupplierHttpErrorDefinition {
  code: string;
  message: string;
}

export const SUPPLIER_HTTP_ERRORS = {
  invalidRequest: {
    code: "SUPPLIER_VALIDATION_FAILED",
    message: "The request is invalid.",
  },
  unauthenticated: {
    code: "UNAUTHENTICATED",
    message: "A valid bearer token is required.",
  },
  forbidden: {
    code: "FORBIDDEN",
    message: "You do not have permission to perform this action.",
  },
  supplierNotFound: {
    code: "SUPPLIER_NOT_FOUND",
    message: "The Supplier was not found.",
  },
  supplierAlreadyExists: {
    code: "SUPPLIER_ALREADY_EXISTS",
    message: "A Supplier already exists at this location.",
  },
  supplierVersionConflict: {
    code: "SUPPLIER_VERSION_CONFLICT",
    message: "The Supplier has changed. Reload it and try again.",
  },
  supplierPreconditionRequired: {
    code: "SUPPLIER_PRECONDITION_REQUIRED",
    message: "Provide the current Supplier ETag in the If-Match header.",
  },
  serviceUnavailable: {
    code: "SERVICE_UNAVAILABLE",
    message: "The service is temporarily unavailable.",
  },
  internalServerError: {
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
  },
  authenticationUnavailable: {
    code: "AUTHENTICATION_UNAVAILABLE",
    message: "Authentication is temporarily unavailable.",
  },
} as const satisfies Readonly<Record<string, SupplierHttpErrorDefinition>>;

export const DEFAULT_SUPPLIER_HTTP_ERRORS: Readonly<
  Record<number, SupplierHttpErrorDefinition>
> = {
  [HttpStatus.BAD_REQUEST]: SUPPLIER_HTTP_ERRORS.invalidRequest,
  [HttpStatus.UNAUTHORIZED]: SUPPLIER_HTTP_ERRORS.unauthenticated,
  [HttpStatus.FORBIDDEN]: SUPPLIER_HTTP_ERRORS.forbidden,
  [HttpStatus.NOT_FOUND]: SUPPLIER_HTTP_ERRORS.supplierNotFound,
  [HttpStatus.CONFLICT]: SUPPLIER_HTTP_ERRORS.supplierAlreadyExists,
  [HttpStatus.PRECONDITION_FAILED]:
    SUPPLIER_HTTP_ERRORS.supplierVersionConflict,
  [HttpStatus.PRECONDITION_REQUIRED]:
    SUPPLIER_HTTP_ERRORS.supplierPreconditionRequired,
  [HttpStatus.SERVICE_UNAVAILABLE]: SUPPLIER_HTTP_ERRORS.serviceUnavailable,
};

export function supplierValidationException(
  message: string,
  fieldErrors: Readonly<Record<string, string>>,
): BadRequestException {
  return new BadRequestException({
    code: SUPPLIER_HTTP_ERRORS.invalidRequest.code,
    message,
    fieldErrors,
  });
}

export function supplierUnauthenticatedException(): UnauthorizedException {
  return new UnauthorizedException(SUPPLIER_HTTP_ERRORS.unauthenticated);
}

export function supplierForbiddenException(
  message: string = SUPPLIER_HTTP_ERRORS.forbidden.message,
): ForbiddenException {
  return new ForbiddenException({
    code: SUPPLIER_HTTP_ERRORS.forbidden.code,
    message,
  });
}

export function supplierNotFoundException(): NotFoundException {
  return new NotFoundException(SUPPLIER_HTTP_ERRORS.supplierNotFound);
}

export function supplierAlreadyExistsException(
  existingSupplierId: string,
): ConflictException {
  return new ConflictException({
    ...SUPPLIER_HTTP_ERRORS.supplierAlreadyExists,
    existingSupplierId,
  });
}

export function supplierVersionConflictException(): PreconditionFailedException {
  return new PreconditionFailedException(
    SUPPLIER_HTTP_ERRORS.supplierVersionConflict,
  );
}

export function supplierPreconditionRequiredException(): HttpException {
  return new HttpException(
    SUPPLIER_HTTP_ERRORS.supplierPreconditionRequired,
    HttpStatus.PRECONDITION_REQUIRED,
  );
}

export function supplierAuthenticationUnavailableException(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    SUPPLIER_HTTP_ERRORS.authenticationUnavailable,
  );
}
