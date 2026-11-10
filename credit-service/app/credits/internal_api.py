# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Implemented the Order-facing reservation, release and creation-abort endpoints.
# Author review: I validated correctness and supplied additional boundary checks.

"""Order-only reservation contract (order-service/API.md, accepted as-is)."""

import hmac
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response

from app.credits.errors import ApiError
from app.credits.schemas import ReservationRequest, ReservationView, reservation_view

router = APIRouter(prefix="/v1/internal", tags=["Internal"])


def authorize_order(
    request: Request,
    x_foc_service_secret: Annotated[str, Header()] = "",
) -> None:
    expected = request.app.state.settings.order_service_secret
    if expected is None:
        raise ApiError(503, "SERVICE_NOT_CONFIGURED", "Credit is not configured for Order.")
    if not hmac.compare_digest(
        x_foc_service_secret.encode(), expected.get_secret_value().encode()
    ):
        raise ApiError(401, "UNAUTHENTICATED_SERVICE", "A valid service credential is required.")


OrderOnly = [Depends(authorize_order)]


@router.put(
    "/order-reservations/{order_id}", response_model=ReservationView, dependencies=OrderOnly
)
async def reserve(order_id: UUID, body: ReservationRequest, request: Request, response: Response):
    row, created = await request.app.state.ledger.reserve(order_id, body)
    response.status_code = 201 if created else 200
    return reservation_view(row)


@router.get(
    "/order-reservations/{order_id}", response_model=ReservationView, dependencies=OrderOnly
)
async def reservation_status(order_id: UUID, request: Request):
    row = await request.app.state.ledger.status(order_id)
    if row is None:
        raise ApiError(404, "NOT_FOUND", "The requested resource was not found.")
    return reservation_view(row)


@router.put(
    "/order-reservations/{order_id}/creation-abort",
    response_model=ReservationView,
    dependencies=OrderOnly,
)
async def creation_abort(
    order_id: UUID, body: ReservationRequest, request: Request, response: Response
):
    row, created = await request.app.state.ledger.abort(order_id, body)
    response.status_code = 201 if created else 200
    return reservation_view(row)
