# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

"""Credit Service HTTP contract. No retries with newly generated identifiers."""

import os
from typing import Literal
from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class Reservation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    reservation_id: UUID = Field(alias="reservationId")
    order_id: UUID = Field(alias="orderId")
    amount: int = Field(gt=0, strict=True)
    status: Literal["HELD", "RELEASED", "TRANSFERRED"]


class CreditClient:
    def __init__(self, token: str):
        self.token = token

    def request(self, method: str, path: str, body=None):
        headers = {"Authorization": f"Bearer {self.token}"}
        if method != "GET":
            key = os.getenv("ORDER_CREDIT_SERVICE_KEY", "")
            if not key:
                raise HTTPException(503, "Order-to-credit service credentials are not configured")
            headers["X-Order-Service-Key"] = key
        try:
            with httpx.Client(
                base_url=os.getenv("CREDIT_SERVICE_URL", "http://localhost:8001"),
                timeout=float(os.getenv("CREDIT_SERVICE_TIMEOUT", "5")),
                headers=headers,
            ) as client:
                response = client.request(method, path, json=body)
        except httpx.RequestError as exc:
            raise HTTPException(503, "Credit Service unavailable; retry the same operation") from exc
        if response.status_code in (401, 403):
            raise HTTPException(response.status_code, "Credit Service rejected access")
        if response.status_code in (400, 404, 409):
            try:
                detail = response.json().get("detail")
            except (ValueError, AttributeError):
                detail = None
            # A missing wallet/reservation is not a missing errand.
            raise HTTPException(409, detail if isinstance(detail, str) else "Credit operation conflict")
        if response.status_code not in (200, 201):
            raise HTTPException(503, "Credit Service could not process the operation")
        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(502, "Invalid Credit Service response") from exc

    def available_balance(self) -> int:
        result = self.request("GET", "/api/wallets/availableBalance")
        amount = result.get("availableBalance") if isinstance(result, dict) else None
        if type(amount) is not int or amount < 0:
            raise HTTPException(502, "Invalid Credit Service balance response")
        return amount

    def _reservation(self, method, path, body, order_id, amount, status, reservation_id=None):
        result = self.request(method, path, body)
        try:
            reservation = Reservation.model_validate(result)
        except ValidationError as exc:
            raise HTTPException(502, "Invalid Credit Service reservation response") from exc
        if (
            reservation.order_id != order_id or reservation.amount != amount
            or reservation.status != status
            or (reservation_id is not None and reservation.reservation_id != reservation_id)
        ):
            raise HTTPException(502, "Credit Service returned a mismatched reservation")
        return reservation

    def reserve(self, requester_id: UUID, order_id: UUID, amount: int) -> Reservation:
        return self._reservation(
            "POST", "/api/reservations",
            {"userId": str(requester_id), "orderId": str(order_id), "amount": amount},
            order_id, amount, "HELD",
        )

    def release(self, reservation_id: UUID, order_id: UUID, amount: int) -> Reservation:
        return self._reservation(
            "POST", f"/api/reservations/{reservation_id}/release", None,
            order_id, amount, "RELEASED", reservation_id,
        )

    def complete(self, reservation_id: UUID, order_id: UUID, amount: int, courier_id: UUID) -> Reservation:
        return self._reservation(
            "POST", f"/api/reservations/{reservation_id}/complete",
            {"courierUserId": str(courier_id), "orderId": str(order_id)},
            order_id, amount, "TRANSFERRED", reservation_id,
        )


