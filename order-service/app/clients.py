"""HTTP clients for the User Service and the Supplier Service."""

import ssl
from dataclasses import dataclass
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from app.messaging import HTTP_TIMEOUT_SECONDS
from foc_observability import context_headers


class InvalidSessionError(Exception):
    """The caller did not present a usable session."""


class AuthenticationUnavailableError(Exception):
    """A trustworthy authentication result could not be obtained."""


class SupplierUnavailableError(Exception):
    """The Supplier Service could not confirm whether a pickup location exists."""


@dataclass(frozen=True)
class Identity:
    """The verified caller. Status is always active."""

    id: UUID
    role: str
    status: str


class _Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    role: str
    status: str


class UserServiceClient:
    """Forward opaque bearer tokens to the User Service. Do not decode them."""

    def __init__(
        self,
        base_url: str,
        ca_file: str,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._identity_url = httpx.URL(base_url).copy_with(
            userinfo=b"", path="/users/me", query=None, fragment=None
        )
        # User Service presents a certificate from the internal CA.
        self._client = httpx.Client(
            timeout=httpx.Timeout(HTTP_TIMEOUT_SECONDS),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
            verify=ssl.create_default_context(cafile=ca_file),
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


class SupplierServiceClient:
    """Confirm a pickup location against the Supplier Service's active-only read."""

    def __init__(self, base_url: str, *, transport: httpx.BaseTransport | None = None) -> None:
        self._base = httpx.URL(base_url).copy_with(
            userinfo=b"", path="", query=None, fragment=None
        )
        self._client = httpx.Client(
            timeout=httpx.Timeout(HTTP_TIMEOUT_SECONDS),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
        )

    def is_active(self, supplier_id: UUID) -> bool:
        """Return whether the supplier is an active pickup location.

        A 404 that names SUPPLIER_NOT_FOUND means missing or removed. Any other
        response, including a 404 from an unmounted route, means the check
        could not be completed.
        """

        url = self._base.copy_with(path=f"/suppliers/{supplier_id}")
        try:
            response = self._client.get(url, headers=context_headers())
        except httpx.RequestError:
            raise SupplierUnavailableError from None
        if response.status_code == 200:
            return True
        if response.status_code == 404 and _is_supplier_not_found(response):
            return False
        raise SupplierUnavailableError

    def close(self) -> None:
        self._client.close()


def _is_supplier_not_found(response: httpx.Response) -> bool:
    try:
        body = response.json()
    except ValueError:
        return False
    if not isinstance(body, dict):
        return False
    error = body.get("error")
    return isinstance(error, dict) and error.get("code") == "SUPPLIER_NOT_FOUND"
