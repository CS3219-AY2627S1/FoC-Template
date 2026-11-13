"""Administrator-only order reads: every order, and hourly activity."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_admin
from app.clients import Identity
from app.db import get_db
from app.schemas import OrderActivity, OrderPage, OrderResponse, OrderStatus
from app.services import orders as order_service


router = APIRouter(prefix="/admin/orders")

@router.get("", response_model=OrderPage)
def list_all_route(
    _admin: Annotated[Identity, Depends(get_current_admin)],
    db: Session = Depends(get_db),
    status: Annotated[list[OrderStatus] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Every order, newest first. Repeat ``status`` to match any of several."""

    items, total = order_service.list_all_orders(
        db, statuses=status, limit=limit, offset=offset
    )
    return OrderPage(
        items=[OrderResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/activity", response_model=OrderActivity)
def activity_route(
    _admin: Annotated[Identity, Depends(get_current_admin)],
    db: Session = Depends(get_db),
    hours: Annotated[int, Query(ge=1, le=168)] = 24,
):
    """Creations, acceptances and completions per rolling hour, ending now."""

    return order_service.order_activity(db, hours=hours)
