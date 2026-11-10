# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated Voice Assist startup, configuration, validation and upstream client code.
# Author review: I validated correctness, and added boundary checks.

"""Every route re-checks the caller's current session with User (N3NFR3.1)."""

from typing import Annotated

from fastapi import Depends, Header, Request

from app.voice_assist.errors import ApiError
from app.voice_assist.schemas import Principal


async def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "UNAUTHENTICATED", "A bearer token is required.")
    return token.strip()


BearerToken = Annotated[str, Depends(bearer_token)]


async def authenticate(request: Request, token: BearerToken) -> Principal:
    return await request.app.state.identity.identity(token)


Requester = Annotated[Principal, Depends(authenticate)]
