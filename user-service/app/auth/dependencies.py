# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21, 2026-09-24
# Scope: Implemented session, account-status, and role guards.
# Author review: I validated correctness and added boundary checks where needed.

"""FastAPI dependencies that turn a Bearer header into a checked principal."""

# ruff: noqa: B008

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ApiError
from app.auth.service import AuthenticatedPrincipal, AuthenticationService
from app.db import get_db_session
from app.models import SystemRole

_ROLE_RANK = {
    SystemRole.USER: 1,
    SystemRole.ADMIN: 2,
    SystemRole.SUPER_ADMIN: 3,
}


def get_authentication_service(request: Request) -> AuthenticationService:
    """Retrieve the app-scoped auth service without exposing signing material."""

    return request.app.state.authentication_service


async def get_current_principal(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedPrincipal:
    """Require a valid Bearer JWT backed by a current database session."""

    if authorization is None:
        raise ApiError(401, "INVALID_ACCESS_TOKEN", "Authentication is required.")
    scheme, separator, token = authorization.partition(" ")
    if scheme.casefold() != "bearer" or not separator or not token.strip():
        raise ApiError(401, "INVALID_ACCESS_TOKEN", "Authentication is required.")
    service: AuthenticationService = request.app.state.authentication_service
    return await service.authenticate_access_token(session, access_token=token.strip())


def has_minimum_role(actual_role: SystemRole, required_role: SystemRole) -> bool:
    """Apply the fixed, server-side User < Admin < Super Admin role hierarchy."""

    return _ROLE_RANK[actual_role] >= _ROLE_RANK[required_role]


async def require_self_access(
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
) -> AuthenticatedPrincipal:
    """Allow every active system role to use the inherited self-service capabilities."""

    if not has_minimum_role(principal.user.system_role, SystemRole.USER):
        raise ApiError(403, "INSUFFICIENT_ROLE", "The current role cannot use this resource.")
    return principal


async def require_admin(
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
) -> AuthenticatedPrincipal:
    """Allow the inherited administrative role tier to view safe account details."""

    if not has_minimum_role(principal.user.system_role, SystemRole.ADMIN):
        raise ApiError(403, "INSUFFICIENT_ROLE", "Admin access is required.")
    return principal


async def require_super_admin(
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
) -> AuthenticatedPrincipal:
    """Require the one role allowed to change another account's system role."""

    if principal.user.system_role != SystemRole.SUPER_ADMIN:
        raise ApiError(403, "INSUFFICIENT_ROLE", "Super Admin access is required.")
    return principal
