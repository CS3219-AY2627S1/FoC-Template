# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Implemented current-session identity checks through User Service.
# Author review: I validated correctness and supplied additional boundary checks.

"""Current-session identity from User, exactly as Order and Credit verify it."""

import asyncio

import httpx
from pydantic import ValidationError

from app.admin.errors import ApiError, unavailable
from app.admin.schemas import Principal
from app.core.config import Settings


class UserDirectory:
    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    async def identity(self, token: str) -> Principal:
        base = self.settings.user_service_base_url
        if not base:
            raise unavailable("AUTH_UNAVAILABLE")
        try:
            # Wall-clock bound as well as per-socket limits; redirects cannot leak credentials.
            async with asyncio.timeout(self.settings.dependency_timeout_seconds):
                response = await self.http.get(
                    base + "/v1/users/me",
                    headers={"Authorization": f"Bearer {token}"},
                    follow_redirects=False,
                    timeout=self.settings.dependency_timeout_seconds,
                )
        except (httpx.HTTPError, TimeoutError):
            raise unavailable("AUTH_UNAVAILABLE") from None
        if response.status_code in (401, 403):
            raise ApiError(401, "UNAUTHENTICATED", "A current active session is required.")
        if response.status_code != 200:
            raise unavailable("AUTH_UNAVAILABLE")
        try:
            return Principal.model_validate(response.json())
        except (ValueError, ValidationError):
            raise unavailable("AUTH_UNAVAILABLE") from None
