# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23, 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated Supplier token and current-role authorization checks; applied lint fixes.
# Author review: I validated correctness, and added boundary checks.

"""Verify User Service tokens and ask for fresh management decisions."""

from functools import lru_cache
from typing import Annotated, Literal
from uuid import UUID, uuid4

import httpx
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import (
    InvalidTokenError,
    PyJWKClientConnectionError,
    PyJWKClientError,
)
from pydantic import BaseModel, ConfigDict, ValidationError

from app.config import Settings, get_settings
from app.errors import ApiError

bearer = HTTPBearer(auto_error=False)


class AuthorizationDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subjectId: UUID
    accountStatus: Literal["ACTIVE", "DELETED"]
    systemRole: Literal["USER", "ADMIN", "SUPER_ADMIN"]
    allowed: bool


@lru_cache
def jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, timeout=3, lifespan=300)


ManagementAction = Literal["SUPPLIER_CREATE", "SUPPLIER_UPDATE", "SUPPLIER_DEACTIVATE"]


def verify_access_token(
    credentials: HTTPAuthorizationCredentials | None,
    settings: Settings,
) -> tuple[UUID, str]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError(401, "UNAUTHENTICATED", "A bearer token is required")
    if not settings.user_service_base_url:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authorization is unavailable")

    token = credentials.credentials
    jwks_url = settings.user_service_base_url.rstrip("/") + "/.well-known/jwks.json"
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise InvalidTokenError("Untrusted token header")
        signing_key = jwks_client(jwks_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "sid", "roleVersion"]},
        )
        subject_id = UUID(claims["sub"])
        UUID(claims["sid"])
        role_version = claims["roleVersion"]
        if isinstance(role_version, bool) or not isinstance(role_version, int) or role_version < 1:
            raise InvalidTokenError("Invalid role version")
    except PyJWKClientConnectionError as error:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authorization is unavailable") from error
    except (InvalidTokenError, PyJWKClientError, KeyError, TypeError, ValueError) as error:
        raise ApiError(401, "UNAUTHENTICATED", "Invalid bearer token") from error

    return subject_id, token


def require_authenticated_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UUID:
    subject_id, _token = verify_access_token(credentials, settings)
    return subject_id


def authorize_supplier_management(
    credentials: HTTPAuthorizationCredentials | None,
    settings: Settings,
    action: ManagementAction,
) -> UUID:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError(401, "UNAUTHENTICATED", "A bearer token is required")
    if not settings.user_service_base_url or not settings.supplier_service_shared_secret:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authorization is unavailable")
    subject_id, token = verify_access_token(credentials, settings)

    decision_url = (
        settings.user_service_base_url.rstrip("/") + "/v1/internal/authorization-decisions"
    )
    try:
        response = httpx.post(
            decision_url,
            headers={
                "Authorization": f"Bearer {token}",
                "X-FoC-Service-Secret": settings.supplier_service_shared_secret,
                "X-Correlation-ID": str(uuid4()),
            },
            json={"action": action},
            timeout=3,
        )
    except httpx.RequestError as error:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authorization is unavailable") from error
    if response.status_code == 401:
        raise ApiError(401, "UNAUTHENTICATED", "Invalid or expired session")
    if response.status_code != 200:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authorization is unavailable")
    try:
        decision = AuthorizationDecision.model_validate(response.json())
    except (ValueError, ValidationError) as error:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authorization is unavailable") from error
    if decision.subjectId != subject_id:
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authorization is unavailable")
    if not decision.allowed or decision.accountStatus != "ACTIVE":
        raise ApiError(403, "FORBIDDEN", "Supplier management requires an administrator")
    if decision.systemRole not in ("ADMIN", "SUPER_ADMIN"):
        raise ApiError(503, "AUTH_UNAVAILABLE", "Authorization is unavailable")
    return subject_id


def require_supplier_create_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UUID:
    return authorize_supplier_management(credentials, settings, "SUPPLIER_CREATE")


def require_supplier_read_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> UUID:
    # The published v1 decision contract has no read-specific admin action.
    # UPDATE currently carries the same current ADMIN threshold for this read.
    return authorize_supplier_management(credentials, settings, "SUPPLIER_UPDATE")
