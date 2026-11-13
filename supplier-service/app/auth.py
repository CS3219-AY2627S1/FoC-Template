# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write synchronous HTTPBearer-based identity and administrator dependencies using the application-scoped UserServiceClient, validate bearer syntax, reject duplicate authorization headers, and translate trusted client failures into safe protected-route errors.
# Author review: Keith confirmed review of authentication-dependency changes.
# Details: ../ai/usage-log.md; ai-20260930-021

"""Composable synchronous dependencies for explicitly protected routes."""

import re
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.clients.user_service import (
    AuthenticationUnavailableError,
    InvalidSessionError,
    TrustedIdentity,
    UserServiceClient,
)


bearer = HTTPBearer(auto_error=False)
_BEARER_CREDENTIAL = re.compile(r"[A-Za-z0-9._~+/-]+=*")


class ProtectedRouteError(HTTPException):
    """An authentication/authorization failure with a safe public envelope."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(
            status_code=status_code,
            detail={"error": {"code": code, "message": message}},
            headers={"WWW-Authenticate": "Bearer"} if status_code == 401 else None,
        )


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> TrustedIdentity:
    """Resolve an opaque bearer credential once per dependency graph/request."""
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
        or not _BEARER_CREDENTIAL.fullmatch(credentials.credentials)
        or len(request.headers.getlist("authorization")) != 1
    ):
        raise ProtectedRouteError(
            401, "AUTHENTICATION_REQUIRED", "Invalid authentication credentials"
        )

    client: UserServiceClient = request.app.state.user_service_client
    try:
        return client.resolve_identity(credentials.credentials)
    except InvalidSessionError:
        raise ProtectedRouteError(
            401, "AUTHENTICATION_REQUIRED", "Invalid authentication credentials"
        ) from None
    except AuthenticationUnavailableError:
        raise ProtectedRouteError(
            503, "AUTHENTICATION_UNAVAILABLE", "Authentication temporarily unavailable"
        ) from None


def require_admin(
    user: Annotated[TrustedIdentity, Depends(get_current_user)],
) -> TrustedIdentity:
    """Authorize only the role returned by User Service."""
    if user.role != "admin":
        raise ProtectedRouteError(403, "FORBIDDEN", "Administrator access required")
    return user
