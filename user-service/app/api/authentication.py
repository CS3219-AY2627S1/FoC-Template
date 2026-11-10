# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Implemented login, refresh, logout, and JWKS handlers.
# Author review: I validated correctness and added boundary checks where needed.

"""Session endpoints and public JWKS publication for Phase 2."""

# ruff: noqa: B008

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import AccessSessionResponse, SessionCreateRequest
from app.auth.dependencies import (
    AuthenticatedPrincipal,
    get_authentication_service,
    get_current_principal,
)
from app.auth.service import AuthenticationService, IssuedSession
from app.core.config import Settings
from app.db import get_db_session

REFRESH_COOKIE_NAME = "foc_refresh_token"

router = APIRouter(prefix="/v1/auth", tags=["authentication"])
jwks_router = APIRouter(tags=["authentication"])


def _refresh_cookie_is_secure(settings: Settings) -> bool:
    return settings.environment == "production"


def _set_refresh_cookie(response: Response, issued: IssuedSession, settings: Settings) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=issued.refresh_token,
        max_age=settings.jwt_refresh_token_ttl_seconds,
        httponly=True,
        secure=_refresh_cookie_is_secure(settings),
        samesite="lax",
        path="/v1/auth",
    )


def _access_response(issued: IssuedSession) -> AccessSessionResponse:
    return AccessSessionResponse(
        access_token=issued.access_token,
        expires_at=issued.access_token_expires_at,
    )


@router.post("/sessions", response_model=AccessSessionResponse)
async def create_session(
    body: SessionCreateRequest,
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    authentication_service: Annotated[AuthenticationService, Depends(get_authentication_service)],
) -> AccessSessionResponse:
    """Authenticate one active account and set its opaque refresh-token cookie."""

    issued = await authentication_service.login(session, email=body.email, password=body.password)
    _set_refresh_cookie(response, issued, request.app.state.settings)
    return _access_response(issued)


@router.post("/sessions/refresh", response_model=AccessSessionResponse)
async def refresh_session(
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    authentication_service: Annotated[AuthenticationService, Depends(get_authentication_service)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> AccessSessionResponse:
    """Rotate a valid refresh cookie and revoke the previous session record."""

    issued = await authentication_service.refresh(session, refresh_token=refresh_token)
    _set_refresh_cookie(response, issued, request.app.state.settings)
    return _access_response(issued)


@router.delete("/sessions/current", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_current_session(
    request: Request,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    authentication_service: Annotated[AuthenticationService, Depends(get_authentication_service)],
    principal: Annotated[AuthenticatedPrincipal, Depends(get_current_principal)],
) -> None:
    """Revoke the bearer token's server-side session and remove its cookie."""

    await authentication_service.logout(session, session_id=principal.session_id)
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/v1/auth",
        httponly=True,
        secure=_refresh_cookie_is_secure(request.app.state.settings),
        samesite="lax",
    )


@jwks_router.get("/.well-known/jwks.json")
async def jwks(
    authentication_service: Annotated[AuthenticationService, Depends(get_authentication_service)],
) -> dict[str, list[dict[str, str]]]:
    """Expose only the active RSA public signing key for token verifiers."""

    return {"keys": [authentication_service.public_jwk()]}
