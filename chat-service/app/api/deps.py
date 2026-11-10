# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Request identity.

In FoC the API gateway verifies the user's JWT and injects ``X-User-Id`` (stripping
any client-supplied copy), so by default this service trusts that header, like every
other FoC backend. With ``CHAT_AUTH_MODE=jwt`` it verifies a bearer JWT itself instead,
so it can also run without the gateway. Other backends use ``X-Service-Key``.
"""

from __future__ import annotations

import secrets
import uuid

import jwt
from fastapi import Depends, Header, HTTPException, status

from app.state import AppState, get_state
from foc_shared.auth import HEADER_USER_ID


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, message)


def _user_from_jwt(authorization: str | None, state: AppState) -> uuid.UUID:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("missing bearer token")
    settings = state.settings
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp"]},
        )
        return uuid.UUID(str(claims["sub"]))
    except (jwt.PyJWTError, ValueError) as exc:
        raise _unauthorized("invalid token") from exc


def current_user(
    x_user_id: str | None = Header(default=None, alias=HEADER_USER_ID),
    authorization: str | None = Header(default=None),
    state: AppState = Depends(get_state),
) -> uuid.UUID:
    if state.settings.chat_auth_mode == "jwt":
        return _user_from_jwt(authorization, state)
    if not x_user_id:
        raise _unauthorized("missing caller identity")
    try:
        return uuid.UUID(x_user_id)
    except ValueError as exc:
        raise _unauthorized("invalid caller identity") from exc


def require_service(
    x_service_key: str | None = Header(default=None),
    state: AppState = Depends(get_state),
) -> None:
    if not x_service_key or not any(
        secrets.compare_digest(x_service_key, key) for key in state.settings.service_key_set
    ):
        raise _unauthorized("invalid service key")
