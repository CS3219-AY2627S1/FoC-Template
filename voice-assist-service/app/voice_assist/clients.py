# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated Voice Assist startup, configuration, validation and upstream client code.
# Author review: I validated correctness, and added boundary checks.

"""User and Supplier HTTP clients. Voice Assist owns no data and reads no database."""

import asyncio
import time
from uuid import UUID

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.voice_assist.errors import ApiError, SupplierLookupError, unavailable
from app.voice_assist.schemas import Principal, SupplierCandidate, SupplierDetail, SupplierPage

SUPPLIER_PAGE_SIZE = 100
MAX_SUPPLIER_PAGES = 20
SUPPLIER_CACHE_SECONDS = 60


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


class SupplierDirectory:
    """Active suppliers for matching. The list is the same for every authenticated caller, so
    it is cached briefly; the chosen supplier is always re-read before it is suggested."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient, clock=time.monotonic):
        self.settings = settings
        self.http = http
        self.clock = clock
        self._cached: tuple[float, list[SupplierCandidate]] | None = None

    async def _get(self, path: str, token: str, params=None) -> httpx.Response:
        base = self.settings.supplier_service_base_url
        if not base:
            raise SupplierLookupError
        try:
            async with asyncio.timeout(self.settings.dependency_timeout_seconds):
                return await self.http.get(
                    base + path,
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                    follow_redirects=False,
                    timeout=self.settings.dependency_timeout_seconds,
                )
        except (httpx.HTTPError, TimeoutError):
            raise SupplierLookupError from None

    async def active(self, token: str) -> list[SupplierCandidate]:
        now = self.clock()
        if self._cached and now - self._cached[0] < SUPPLIER_CACHE_SECONDS:
            return self._cached[1]
        suppliers: list[SupplierCandidate] = []
        for page in range(1, MAX_SUPPLIER_PAGES + 1):
            response = await self._get(
                "/api/v1/suppliers", token, {"page": page, "page_size": SUPPLIER_PAGE_SIZE}
            )
            if response.status_code != 200:
                raise SupplierLookupError
            try:
                data = SupplierPage.model_validate(response.json())
            except (ValueError, ValidationError):
                raise SupplierLookupError from None
            suppliers.extend(data.items)
            if not data.items or len(suppliers) >= data.total:
                break
        self._cached = (now, suppliers)
        return suppliers

    async def detail(self, supplier_id: UUID, token: str) -> SupplierDetail | None:
        """The supplier when it is still ACTIVE; None when it is gone or inactive."""
        response = await self._get(f"/api/v1/suppliers/{supplier_id}", token)
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise SupplierLookupError
        try:
            supplier = SupplierDetail.model_validate(response.json())
        except (ValueError, ValidationError):
            raise SupplierLookupError from None
        return supplier if supplier.id == supplier_id and supplier.status == "ACTIVE" else None
