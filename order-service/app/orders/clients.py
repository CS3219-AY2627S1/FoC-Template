# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
# Scope: Implemented User, Supplier and Credit HTTP calls and response/error handling.
# Author review: I validated correctness and added boundary checks where needed.

"""Fixed-origin HTTP contracts. Credit's interface is proposed, not integrated."""

import asyncio
from uuid import UUID

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.orders.errors import ApiError, unavailable
from app.orders.schemas import Principal, Reservation, SupplierSnapshot


class ServiceClients:
    def __init__(self, settings: Settings, http: httpx.AsyncClient):
        self.settings = settings
        self.http = http

    async def request(self, method: str, base: str | None, path: str, **kwargs):
        if not base:
            raise unavailable()
        try:
            # Wall-clock bound as well as per-socket limits; redirects cannot leak credentials.
            async with asyncio.timeout(self.settings.dependency_timeout_seconds):
                return await self.http.request(
                    method,
                    base.rstrip("/") + path,
                    follow_redirects=False,
                    timeout=self.settings.dependency_timeout_seconds,
                    **kwargs,
                )
        except (httpx.HTTPError, TimeoutError):
            raise unavailable() from None

    async def identity(self, token: str) -> Principal:
        response = await self.request(
            "GET",
            self.settings.user_service_base_url,
            "/v1/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        if response.status_code in (401, 403):
            raise ApiError(401, "UNAUTHENTICATED", "A current active session is required.")
        if response.status_code != 200:
            raise unavailable("AUTH_UNAVAILABLE")
        try:
            return Principal.model_validate(response.json())
        except (ValueError, ValidationError):
            raise unavailable("AUTH_UNAVAILABLE") from None

    async def supplier(self, supplier_id: UUID, token: str) -> dict:
        response = await self.request(
            "GET",
            self.settings.supplier_service_base_url,
            f"/api/v1/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if response.status_code == 404:
            raise ApiError(409, "SUPPLIER_UNAVAILABLE", "Select an active supplier.")
        if response.status_code == 401:
            raise ApiError(401, "UNAUTHENTICATED", "A current active session is required.")
        if response.status_code != 200:
            raise unavailable("SUPPLIER_UNAVAILABLE")
        try:
            supplier = SupplierSnapshot.model_validate(response.json())
            if supplier.id != supplier_id:
                raise ValueError
            return supplier.snapshot()
        except (ValueError, ValidationError):
            raise unavailable("SUPPLIER_CONTRACT_ERROR") from None

    def ensure_credit_configured(self):
        if not self.settings.credit_service_base_url or not self.settings.credit_service_secret:
            raise unavailable("CREDIT_UNAVAILABLE")

    async def credit(self, action: str, operation: dict) -> Reservation | None:
        self.ensure_credit_configured()
        path = f"/v1/internal/order-reservations/{operation['order_id']}"
        method = "GET" if action == "status" else "PUT"
        if action == "abort":
            path += "/creation-abort"
        body = {
            "operationId": str(operation["id"]),
            "requesterId": str(operation["requester_id"]),
            "amount": operation["payload"]["reward"],
        }
        response = await self.request(
            method,
            self.settings.credit_service_base_url,
            path,
            headers={
                "X-FoC-Service-Secret": self.settings.credit_service_secret.get_secret_value(),
                "X-Correlation-ID": str(operation["id"]),
            },
            **({"json": body} if method == "PUT" else {}),
        )
        if action == "status" and response.status_code == 404:
            return None
        if action == "reserve" and response.status_code == 409:
            try:
                code = response.json()["error"]["code"]
            except (ValueError, KeyError, TypeError):
                code = None
            if code in ("INSUFFICIENT_CREDIT", "WALLET_NOT_READY"):
                raise ApiError(409, code, "The reward could not be reserved.")
        if response.status_code not in (200, 201):
            raise unavailable("CREDIT_UNAVAILABLE")
        try:
            result = Reservation.model_validate(response.json())
            if (
                result.order_id != operation["order_id"]
                or result.operation_id != operation["id"]
                or result.requester_id != operation["requester_id"]
                or result.amount != operation["payload"]["reward"]
            ):
                raise ValueError
            if action == "abort" and result.state != "CLOSED":
                raise ValueError
            if action == "reserve" and result.state != "RESERVED":
                raise ValueError
            return result
        except (ValueError, ValidationError):
            raise unavailable("CREDIT_CONTRACT_ERROR") from None
