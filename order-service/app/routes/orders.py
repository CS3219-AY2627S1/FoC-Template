"""HTTP routes for errand request operations."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.auth import get_current_identity
from app.clients import Identity
from app.db import get_db
from app.schemas import (
    DeliveryLocation,
    OrderCreate,
    OrderPage,
    OrderResponse,
    OrderStatus,
)
from app.services import orders as order_service


router = APIRouter()


@router.post(
    "/orders",
    response_model=OrderResponse,
    responses={
        status.HTTP_200_OK: {"model": OrderResponse},
        status.HTTP_201_CREATED: {"model": OrderResponse},
    },
)
def create_order_route(
    payload: OrderCreate,
    response: Response,
    request: Request,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
    x_correlation_id: Annotated[str | None, Header(alias="X-Correlation-ID")] = None,
):
    """Create a new errand request. Replay returns the original order."""

    result = order_service.create_order(
        payload=payload,
        requester=actor,
        idempotency_key=order_service.normalize_idempotency_key(idempotency_key),
        correlation_id=order_service.parse_correlation_id(x_correlation_id),
        db=db,
        supplier_directory=request.app.state.supplier_client,
    )
    response.status_code = (
        status.HTTP_201_CREATED if result.created else status.HTTP_200_OK
    )
    return result.order


@router.get("/orders/open", response_model=OrderPage)
def list_open_route(
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    items, total = order_service.list_open_orders(db, actor, limit=limit, offset=offset)
    return OrderPage(
        items=[OrderResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/orders", response_model=OrderPage)
def list_mine_route(
    role: Annotated[Literal["requester", "courier"], Query()],
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
    statuses: Annotated[list[OrderStatus] | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """The caller's orders in one role. Repeat ``status`` to match any of several."""

    items, total = order_service.list_my_orders(
        db, actor, role=role, statuses=statuses, limit=limit, offset=offset
    )
    return OrderPage(
        items=[OrderResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order_route(
    order_id: UUID,
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
):
    return order_service.get_order(db, order_id, actor)


@router.patch("/orders/{order_id}/delivery", response_model=OrderResponse)
def change_delivery_route(
    order_id: UUID,
    delivery: DeliveryLocation,
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
):
    return order_service.change_delivery(db, order_id, actor, delivery)


@router.post("/orders/{order_id}/accept", response_model=OrderResponse)
def accept_route(
    order_id: UUID,
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
):
    return order_service.accept_order(db, order_id, actor)


@router.post("/orders/{order_id}/pickup", response_model=OrderResponse)
def pickup_route(
    order_id: UUID,
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
):
    return order_service.pick_up_order(db, order_id, actor)


@router.post("/orders/{order_id}/complete", response_model=OrderResponse)
def complete_route(
    order_id: UUID,
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
):
    return order_service.complete_order(db, order_id, actor)


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
def cancel_route(
    order_id: UUID,
    db: Session = Depends(get_db),
    actor: Identity = Depends(get_current_identity),
):
    return order_service.cancel_order(db, order_id, actor)
