# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — User Service client that resolves opaque bearer tokens over HTTPS with a pinned CA file, following credit-service/app/clients.py (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001

"""User Service client used to resolve bearer tokens.

Follows credit-service/app/clients.py: the token is forwarded opaquely to
User Service over HTTPS with a pinned CA file, and never decoded here.
"""

import ssl
from dataclasses import dataclass
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError
from foc_observability import context_headers

HTTP_TIMEOUT_SECONDS = 3.0


class InvalidSessionError(Exception):
    """The caller did not present a usable User Service session."""


class AuthenticationUnavailableError(Exception):
    """The User Service could not provide a trustworthy identity result."""


@dataclass(frozen=True)
class Identity:
    id: UUID
    role: str
    status: str


class _Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    role: str
    status: str


class UserServiceClient:
    """Forward opaque bearer tokens; the Notification Service never decodes them."""

    def __init__(
        self,
        base_url: str,
        ca_file: str,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._base_url = httpx.URL(base_url).copy_with(
            userinfo=b"", path="", query=None, fragment=None
        )
        if self._base_url.scheme != "https":
            raise ValueError("User Service communication requires HTTPS")
        self._identity_url = self._base_url.copy_with(
            userinfo=b"", path="/users/me", query=None, fragment=None
        )
        tls_context = ssl.create_default_context(cafile=ca_file)
        self._client = httpx.Client(
            timeout=httpx.Timeout(HTTP_TIMEOUT_SECONDS),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
            verify=tls_context,
        )

    def resolve_identity(self, token: str) -> Identity:
        try:
            response = self._client.get(
                self._identity_url,
                headers={
                    "Authorization": f"Bearer {token}",
                    **context_headers(),
                },
            )
        except httpx.RequestError:
            raise AuthenticationUnavailableError from None
        if response.status_code == 401:
            raise InvalidSessionError
        if response.status_code != 200:
            raise AuthenticationUnavailableError
        try:
            profile = _Profile.model_validate(response.json())
        except (ValidationError, ValueError):
            raise AuthenticationUnavailableError from None
        if profile.status != "active":
            raise InvalidSessionError
        if profile.role not in {"user", "admin"}:
            raise AuthenticationUnavailableError
        return Identity(id=profile.id, role=profile.role, status=profile.status)

    def close(self) -> None:
        self._client.close()
