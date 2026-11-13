# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write the synchronous reusable HTTPX client, minimal immutable trusted identity, explicit session and availability exceptions, fixed endpoint resolution, response validation, and cleanup from the supplied User Service contract.
# Author review: Original implementation approved by Keith.
# Details: ../../ai/usage-log.md; ai-20260930-019

"""Resolve opaque sessions through the User Service's trusted profile endpoint."""

from typing import Literal
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, field_validator

from app.config import Settings
from foc_observability import context_headers


class InvalidSessionError(Exception):
    """User Service rejected the supplied session."""


class AuthenticationUnavailableError(Exception):
    """A trustworthy authentication result could not be obtained."""


class TrustedIdentity(BaseModel):
    """Only the verified fields needed for protected operations."""

    model_config = ConfigDict(extra="ignore", frozen=True)

    id: UUID
    role: Literal["user", "admin"]
    status: Literal["active"]

    @field_validator("id", mode="before")
    @classmethod
    def require_uuid_string(cls, value: object) -> UUID:
        if not isinstance(value, str):
            raise ValueError("Expected a UUID string")
        return UUID(value)


class UserServiceClient:
    """Own one synchronous HTTP client; callers must close it at shutdown."""

    def __init__(
        self, settings: Settings, *, transport: httpx.BaseTransport | None = None
    ) -> None:
        # Strip userinfo so HTTPX cannot replace the bearer header with Basic auth.
        # Resolve an absolute path once, discarding base query/fragment data.
        self._identity_url = httpx.URL(str(settings.user_service_url)).copy_with(
            userinfo=b"", path="/users/me", query=None, fragment=None
        )
        self._client = httpx.Client(
            timeout=httpx.Timeout(settings.auth_timeout_seconds),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
        )

    def resolve_identity(self, token: str) -> TrustedIdentity:
        """Forward the credential unchanged and validate a fresh profile response."""
        try:
            response = self._client.get(
                self._identity_url,
                headers={
                    **context_headers(),
                    "Authorization": f"Bearer {token}",
                },
            )
        except httpx.RequestError:
            raise AuthenticationUnavailableError(
                "Authentication temporarily unavailable"
            ) from None

        if response.status_code == 401:
            raise InvalidSessionError("Invalid authentication credentials")
        if response.status_code != 200:
            raise AuthenticationUnavailableError(
                "Authentication temporarily unavailable"
            )

        try:
            return TrustedIdentity.model_validate(response.json())
        except ValueError:
            # Never expose upstream payloads or validation details to callers/logs.
            raise AuthenticationUnavailableError(
                "Authentication temporarily unavailable"
            ) from None

    def close(self) -> None:
        """Release the underlying connection pool."""
        self._client.close()
