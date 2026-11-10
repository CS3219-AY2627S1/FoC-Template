# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Implemented bearer-token parsing and current-role administrator checks.
# Author review: I validated correctness and supplied additional boundary checks.

"""Every dashboard request re-checks the caller's current session and role (N2NFR1.1-1.3)."""

from typing import Annotated

from fastapi import Depends, Header, Request

from app.admin.errors import ApiError
from app.admin.schemas import Principal


async def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "UNAUTHENTICATED", "A bearer token is required.")
    return token.strip()


BearerToken = Annotated[str, Depends(bearer_token)]


async def authenticate(request: Request, token: BearerToken) -> Principal:
    return await request.app.state.identity.identity(token)


async def require_admin(principal: Annotated[Principal, Depends(authenticate)]) -> Principal:
    # N2F1.1.1: the role comes from User's current state, never from the token's claims.
    if principal.system_role not in ("ADMIN", "SUPER_ADMIN"):
        raise ApiError(403, "FORBIDDEN", "Administrator access is required.")
    return principal


Admin = Annotated[Principal, Depends(require_admin)]
