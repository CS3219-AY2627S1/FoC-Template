"""HTTP client adapters used by the Credit Service."""

import ssl
from dataclasses import dataclass
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from app.messaging import HTTP_TIMEOUT_SECONDS
from foc_observability import context_headers


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
    """Forward opaque bearer tokens; the Credit Service never decodes them."""

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
                    **context_headers(),
                    "Authorization": f"Bearer {token}",
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
