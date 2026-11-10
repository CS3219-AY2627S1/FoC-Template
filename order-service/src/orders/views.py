import logging
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import AuthenticatedUser, get_authenticated_user
from auth.models import UserRoleResponse
from common.db import get_session
from common.gateway import get_internal_gateway_client
from orders.administration import (
    ResolutionConflict,
    disputed_orders,
    repair_settlement,
    resolve_dispute,
)
from orders.creation import CreationConflict, create_order_idempotently, lookup_creation
from orders.presentation import present_order, present_orders
from orders.repository import (
    accept_order,
    cancel_order,
    deliver_order,
    dispute_order,
    get_assigned_orders,
    get_open_orders,
    get_order_audit_logs,
    get_order_by_id,
    get_requested_orders,
    pickup_order,
    receive_order,
)
from orders.review import order_review
from orders.schemas import (
    CreateOrderRequest,
    DisputeOrderRequest,
    OrderAuditLogResponse,
    OrderResponse,
    OrderReviewResponse,
    RepairSettlementRequest,
    ResolveOrderRequest,
    ServerClockResponse,
    SupplierSnapshot,
)

logger = logging.getLogger(__name__)
router = APIRouter (
    prefix="/orders",
    tags=["Orders"],
    dependencies=[Depends(get_authenticated_user)]
)

Session = Annotated[AsyncSession, Depends(get_session)]


async def require_admin(user: AuthenticatedUser):
    if user.role not in {"admin", "admin_manager"}:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


AdminUser = Annotated[UserRoleResponse, Depends(require_admin)]


@router.get("/admin/disputed", response_model=list[OrderResponse])
async def list_disputed_orders(user: AdminUser, session: Session):
    return await present_orders(session, await disputed_orders(session), user.user_id, admin=True)


@router.patch("/admin/disputed/{dispute_id}/resolve", response_model=OrderResponse)
async def resolve_dispute_endpoint(
    dispute_id: UUID, payload: ResolveOrderRequest, user: AdminUser, session: Session,
):
    try:
        order = await resolve_dispute(session, dispute_id, user.user_id, payload.action, payload.reason)
    except ResolutionConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return await present_order(session, order, user.user_id, admin=True)


@router.get("/admin/disputed/{order_id}/review", response_model=OrderReviewResponse)
async def review_disputed_order(
    order_id: UUID, request: Request, user: AdminUser, session: Session,
    client: Annotated[httpx.AsyncClient, Depends(get_internal_gateway_client)],
):
    order = await get_order_by_id(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    authorization = request.headers.get("Authorization") or f"Bearer {request.cookies.get('access_token', '')}"
    return await order_review(session, order, user.user_id, client, authorization)


@router.post('/admin/disputed/{dispute_id}/repair', response_model=OrderResponse, status_code=202)
async def repair_settlement_endpoint(
    dispute_id: UUID, payload: RepairSettlementRequest, user: AdminUser, session: Session,
):
    try:
        order = await repair_settlement(session, dispute_id, user.user_id, payload)
    except ResolutionConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    if order is None:
        raise HTTPException(status_code=404, detail='Dispute not found')
    return await present_order(session, order, user.user_id, admin=True)


@router.get("/clock", response_model=ServerClockResponse)
async def get_server_clock(user: AuthenticatedUser, session: Session):
    """Clock sample for local countdowns; deadlines are always enforced server-side."""
    now = (await session.execute(select(func.clock_timestamp()))).scalar_one()
    return ServerClockResponse(server_time=now)


@router.get("/open", response_model=list[OrderResponse])
async def list_open_orders(user: AuthenticatedUser, session: Session):
    return await present_orders(session, await get_open_orders(session), user.user_id)


@router.get("/me/requested", response_model=list[OrderResponse])
async def list_requested_orders(user: AuthenticatedUser, session: Session):
    return await present_orders(session, await get_requested_orders(session, user.user_id), user.user_id)


@router.get("/me/assigned", response_model=list[OrderResponse])
async def list_assigned_orders(user: AuthenticatedUser, session: Session):
    return await present_orders(session, await get_assigned_orders(session, user.user_id), user.user_id)

# list specific order, either requested/assigned
@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: UUID, user: AuthenticatedUser, session: Session):
    order = await get_order_by_id(session, order_id)

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found",
        )
    if user.user_id not in (order.requester_id, order.courier_id,):
        raise HTTPException(
            status_code=403,
            detail="Not allowed to view this order",
        )

    return await present_order(session, order, user.user_id)

# accept an open order
@router.patch("/{order_id}/accept", response_model=OrderResponse)
async def accept_order_endpoint(order_id: UUID, user: AuthenticatedUser, session: Session):
    order = await accept_order(session, order_id, user.user_id)

    if order is None:
        existing_order = await get_order_by_id(session, order_id)
        if existing_order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if existing_order.requester_id == user.user_id:
            raise HTTPException(status_code=403, detail="Cannot accept your own order")
        raise HTTPException(status_code=409, detail="Order cannot be accepted in its current state")

    return await present_order(session, order, user.user_id)

# mark accepted order as picked up
@router.patch("/{order_id}/pickup", response_model=OrderResponse,)
async def pickup_order_endpoint(order_id: UUID, user: AuthenticatedUser, session: Session,):
    order = await pickup_order(session, order_id, user.user_id,)

    if order is None:
        existing_order = await get_order_by_id(session, order_id)
        if existing_order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if existing_order.courier_id != user.user_id:
            raise HTTPException(status_code=403, detail="Only the assigned courier can update this order")
        raise HTTPException(status_code=409, detail="Order cannot be picked up in its current state")

    return await present_order(session, order, user.user_id)

# mark picked up order as delivered
@router.patch("/{order_id}/deliver", response_model=OrderResponse,)
async def deliver_order_endpoint(order_id: UUID, user: AuthenticatedUser, session: Session,):
    order = await deliver_order(session, order_id, user.user_id,)

    if order is None:
        existing_order = await get_order_by_id(session, order_id)
        if existing_order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if existing_order.courier_id != user.user_id:
            raise HTTPException(status_code=403, detail="Only the assigned courier can update this order")
        raise HTTPException(status_code=409, detail="Order cannot be delivered in its current state")

    return await present_order(session, order, user.user_id)

# order creation
@router.post("", response_model=OrderResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_order_endpoint(
        payload: CreateOrderRequest,
        user: AuthenticatedUser,
        session: Session,
        client: Annotated[httpx.AsyncClient, Depends(get_internal_gateway_client)],
        idempotency_key: Annotated[str, Header(min_length=1, max_length=128)],
):
    if not idempotency_key.strip():
        raise HTTPException(status_code=422, detail="Idempotency-Key must not be blank")
    items = [item.model_dump(mode="json") for item in payload.items]

    try:
        existing = await lookup_creation(
            session, user.user_id, idempotency_key, payload.supplier_id,
            items, payload.pickup_notes, payload.credits,
        )
    except CreationConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from None

    if existing is not None:
        logger.info("order.creation_replayed", extra={"order_id": existing.id})
        return await present_order(session, existing, user.user_id)

    try:
        response = await client.get(f"/supplier-api/suppliers/{payload.supplier_id}")
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supplier service is temporarily unavailable.",
        ) from None

    if response.status_code == status.HTTP_404_NOT_FOUND:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active supplier not found.",
        )
    elif not response.is_success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supplier service is temporarily unavailable.",
        )

    try:
        active_supplier = response.json()
        if not isinstance(active_supplier, dict) or "id" not in active_supplier:
            raise ValueError("Malformed supplier response")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supplier service returned an invalid response.",
        ) from None

    try:
        supplier_snapshot = SupplierSnapshot.model_validate(active_supplier)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supplier service returned an invalid supplier.",
        ) from None

    try:
        order = await create_order_idempotently(
            session=session,
            requester_id=user.user_id,
            idempotency_key=idempotency_key,
            supplier_id=payload.supplier_id,
            supplier_snapshot=supplier_snapshot.model_dump(mode="json"),
            items=items,
            pickup_notes=payload.pickup_notes,
            credits=payload.credits,
        )
    except CreationConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    logger.info("order.created", extra={"order_id": order.id})
    return await present_order(session, order, user.user_id)


@router.patch("/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order_endpoint(order_id: UUID, user: AuthenticatedUser, session: Session,):
    order = await cancel_order(session, order_id, user.user_id)

    if order is None:
        existing_order = await get_order_by_id(session, order_id)
        if existing_order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if existing_order.requester_id != user.user_id:
            raise HTTPException(status_code=403, detail="Only the requester can update this order")
        raise HTTPException(status_code=409, detail="Order cannot be cancelled in its current state")
    logger.info("order.cancelled", extra={"order_id": order.id, "user_id": user.user_id})
    return await present_order(session, order, user.user_id)


@router.patch("/{order_id}/dispute", response_model=OrderResponse)
async def dispute_order_endpoint(
    order_id: UUID, payload: DisputeOrderRequest, user: AuthenticatedUser, session: Session,
):
    order = await dispute_order(session, order_id, user.user_id, payload.reason)
    if order is None:
        existing_order = await get_order_by_id(session, order_id)
        if existing_order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if user.user_id not in (existing_order.requester_id, existing_order.courier_id):
            raise HTTPException(status_code=403, detail="Only order participants can dispute this order")
        raise HTTPException(status_code=409, detail="Order cannot be disputed in its current state")
    return await present_order(session, order, user.user_id)


@router.patch("/{order_id}/receive", response_model=OrderResponse)
async def receive_order_endpoint(order_id: UUID, user: AuthenticatedUser, session: Session,):
    order = await receive_order(session, order_id, user.user_id)
    
    if order is None:
        existing_order = await get_order_by_id(session, order_id)
        if existing_order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if existing_order.requester_id != user.user_id:
            raise HTTPException(status_code=403, detail="Only the requester can update this order")
        raise HTTPException(status_code=409, detail="Order cannot be marked as received in its current state")
    return await present_order(session, order, user.user_id)


@router.get("/{order_id}/audit-logs", response_model=list[OrderAuditLogResponse])
async def get_order_audit_logs_endpoint(
        order_id: UUID, user: AuthenticatedUser, session: Session,
):
    order = await get_order_by_id(session, order_id)

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if user.role not in {"admin", "admin_manager"} and user.user_id not in (order.requester_id, order.courier_id):
        raise HTTPException(
            status_code=403,
            detail="Not allowed to view this order's audit logs"
        )

    return await get_order_audit_logs(session, order_id)
