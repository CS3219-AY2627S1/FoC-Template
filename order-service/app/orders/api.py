# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented requester/courier creation, read and lifecycle endpoint handlers.
# Author review: I validated correctness and added boundary checks where needed.

"""Authenticated creation, retrieval and OPEN lifecycle endpoints."""

import hmac
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.orders.analytics import period_bounds, summarize, summarize_user
from app.orders.errors import ApiError, not_found
from app.orders.schemas import (
    AcceptDispute,
    AdminQuery,
    AnalyticsQuery,
    CreateOrder,
    CreationResponse,
    HistoryEntry,
    OpenDispute,
    OpenQuery,
    OrderAnalytics,
    OrderAssessment,
    OrderParticipant,
    OwnQuery,
    Page,
    PageQuery,
    RestoreDispute,
    UserOrderAnalytics,
)
from app.orders.service import CreationService, operation_view, project_order, visible_order

router = APIRouter(prefix="/v1", tags=["Orders"])


async def authenticate(request: Request, authorization: Annotated[str | None, Header()] = None):
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "UNAUTHENTICATED", "A bearer token is required.")
    principal = await request.app.state.clients.identity(token.strip())
    return principal, token.strip()


Auth = Annotated[tuple, Depends(authenticate)]


def page_result(items, total, query):
    return {"items": items, "total": total, "page": query.page, "pageSize": query.page_size}


def require_admin(principal):
    # The role is User's current decision for this request, never a cached token claim.
    if principal.system_role not in ("ADMIN", "SUPER_ADMIN"):
        raise ApiError(403, "FORBIDDEN", "Current administrator permission is required.")


def history_entry(row, *, admin=False):
    return {
        "sequence": row["sequence"],
        "previousState": row["previous_state"],
        "newState": row["new_state"],
        # Participants see that an administrator acted, never which administrator.
        "actorId": None if row["actor_type"] == "ADMIN" and not admin else row["actor_id"],
        "actorType": row["actor_type"],
        "occurredAt": row["occurred_at"],
        "failureReason": row.get("failure_reason"),
        "failureDetails": row.get("failure_details"),
        "disputeId": row.get("dispute_id"),
    }


def analytics_period(query):
    return {
        "from": query.start,
        "to": query.end,
        "timeZone": "Asia/Singapore",
        "generatedAt": datetime.now(UTC),
    }


@router.post(
    "/orders",
    status_code=201,
    response_model=OrderParticipant,
    responses={
        200: {"model": OrderParticipant, "description": "Successful idempotent replay"},
        202: {"model": CreationResponse, "description": "Creation operation, not an OPEN order"},
    },
)
async def create_order(
    request: Request,
    body: CreateOrder,
    auth: Auth,
    idempotency_key: Annotated[str | None, Header()] = None,
):
    principal, token = auth
    service = CreationService(request.app.state.repository, request.app.state.clients)
    status, result = await service.create(principal.user_id, token, idempotency_key, body)
    headers = {"Location": result["statusUrl"], "Retry-After": "5"} if status == 202 else {}
    model = CreationResponse if status == 202 else OrderParticipant
    response = model.model_validate(result)
    return JSONResponse(status_code=status, content=jsonable_encoder(response), headers=headers)


@router.get("/order-creations/{operation_id}", response_model=CreationResponse)
async def creation_status(operation_id: UUID, request: Request, auth: Auth):
    operation = await request.app.state.repository.operation(operation_id)
    if operation is None or operation["requester_id"] != auth[0].user_id:
        raise not_found()
    return operation_view(operation)


async def empty_action(request: Request):
    # Commands have no client-owned actor/state fields, even in query parameters.
    raw = await request.body()
    if request.query_params:
        raise ApiError(422, "VALIDATION_ERROR", "This action accepts no query fields.")
    if raw:
        try:
            body = await request.json()
        except ValueError:
            raise ApiError(422, "VALIDATION_ERROR", "Use an empty body or JSON object.") from None
        if body != {}:
            raise ApiError(422, "VALIDATION_ERROR", "This action accepts no body fields.")


@router.post("/orders/{order_id}/accept", response_model=OrderParticipant)
async def accept_order(order_id: UUID, request: Request, auth: Auth):
    await empty_action(request)
    row = await request.app.state.lifecycle.transition(order_id, auth[0].user_id, "accept")
    return project_order(row, participant=True)


@router.post("/orders/{order_id}/cancel", response_model=OrderParticipant)
async def cancel_order(order_id: UUID, request: Request, auth: Auth):
    await empty_action(request)
    row = await request.app.state.lifecycle.transition(order_id, auth[0].user_id, "cancel")
    return project_order(row, participant=True)


@router.get("/orders", response_model=Page[OrderAssessment])
async def open_orders(request: Request, auth: Auth, query: Annotated[OpenQuery, Query()]):
    rows, total = await request.app.state.repository.list_orders(query, available=True)
    return page_result([project_order(row) for row in rows], total, query)


@router.post("/orders/{order_id}/pickup", response_model=OrderParticipant)
async def pickup_order(order_id: UUID, request: Request, auth: Auth):
    await empty_action(request)
    row = await request.app.state.lifecycle.transition(order_id, auth[0].user_id, "pickup")
    return project_order(row, participant=True)


@router.post("/orders/{order_id}/deliver", response_model=OrderParticipant)
async def deliver_order(order_id: UUID, request: Request, auth: Auth):
    await empty_action(request)
    row = await request.app.state.lifecycle.transition(order_id, auth[0].user_id, "deliver")
    return project_order(row, participant=True)


@router.post("/orders/{order_id}/complete", response_model=OrderParticipant)
async def complete_order(order_id: UUID, request: Request, auth: Auth):
    await empty_action(request)
    row = await request.app.state.lifecycle.transition(order_id, auth[0].user_id, "complete")
    return project_order(row, participant=True)


@router.get("/orders/mine", response_model=Page[OrderParticipant])
async def own_orders(request: Request, auth: Auth, query: Annotated[OwnQuery, Query()]):
    rows, total = await request.app.state.repository.list_orders(
        query,
        **{query.relationship: auth[0].user_id},
    )
    return page_result([project_order(row, participant=True) for row in rows], total, query)


@router.get("/admin/orders", response_model=Page[OrderParticipant])
async def admin_orders(request: Request, auth: Auth, query: Annotated[AdminQuery, Query()]):
    require_admin(auth[0])
    rows, total = await request.app.state.repository.list_orders(
        query, requester=query.requester_id
    )
    items = [project_order(row, participant=True, admin=True) for row in rows]
    return page_result(items, total, query)


# Declared before /admin/orders/{order_id} so "analytics" is never parsed as an order ID.
@router.get("/admin/orders/analytics", response_model=OrderAnalytics)
async def admin_order_analytics(
    request: Request, auth: Auth, query: Annotated[AnalyticsQuery, Query()]
):
    require_admin(auth[0])
    rows = await request.app.state.repository.created_between(
        *period_bounds(query.start, query.end)
    )
    return {**analytics_period(query), **summarize(rows, query.start, query.end)}


@router.get("/admin/orders/analytics/users/{user_id}", response_model=UserOrderAnalytics)
async def admin_user_analytics(
    user_id: UUID, request: Request, auth: Auth, query: Annotated[AnalyticsQuery, Query()]
):
    require_admin(auth[0])
    rows = await request.app.state.repository.created_between(
        *period_bounds(query.start, query.end), participant=user_id
    )
    return {**analytics_period(query), "userId": user_id, **summarize_user(rows, user_id)}


@router.get("/admin/orders/{order_id}", response_model=OrderParticipant)
async def admin_order_detail(order_id: UUID, request: Request, auth: Auth):
    require_admin(auth[0])
    row = await request.app.state.repository.order(order_id)
    if row is None:
        raise not_found()
    return project_order(row, participant=True, admin=True)


@router.get("/admin/orders/{order_id}/history", response_model=Page[HistoryEntry])
async def admin_order_history(
    order_id: UUID,
    request: Request,
    auth: Auth,
    query: Annotated[PageQuery, Query()],
):
    require_admin(auth[0])
    if await request.app.state.repository.order(order_id) is None:
        raise not_found()
    rows, total = await request.app.state.repository.order_history(order_id, query)
    return page_result([history_entry(row, admin=True) for row in rows], total, query)


@router.get("/orders/{order_id}", response_model=OrderParticipant | OrderAssessment)
async def order_detail(order_id: UUID, request: Request, auth: Auth):
    row, participant = await visible_order(request.app.state.repository, order_id, auth[0].user_id)
    return project_order(row, participant=participant)


@router.get("/orders/{order_id}/history", response_model=Page[HistoryEntry])
async def order_history(
    order_id: UUID,
    request: Request,
    auth: Auth,
    query: Annotated[PageQuery, Query()],
):
    await visible_order(
        request.app.state.repository, order_id, auth[0].user_id, participant_only=True
    )
    rows, total = await request.app.state.repository.order_history(order_id, query)
    return page_result([history_entry(row) for row in rows], total, query)


def authorize_admin_service(
    request: Request, x_foc_service_secret: Annotated[str, Header()] = ""
) -> None:
    expected = request.app.state.settings.admin_service_secret
    if expected is None:
        raise ApiError(503, "SERVICE_NOT_CONFIGURED", "Order is not configured for Admin.")
    if not hmac.compare_digest(
        x_foc_service_secret.encode(), expected.get_secret_value().encode()
    ):
        raise ApiError(401, "UNAUTHENTICATED_SERVICE", "A valid service credential is required.")


# N2F3: Admin Service owns disputes and is the only caller allowed to hold an errand in, or
# release it from, DISPUTED. It forwards the acting user's session, which Order checks again.
internal_router = APIRouter(
    prefix="/v1/internal/orders",
    tags=["Internal"],
    dependencies=[Depends(authorize_admin_service)],
)


def dispute_actor(principal, actor_type: str):
    if actor_type == "ADMIN":
        require_admin(principal)


def no_query(request: Request):
    if request.query_params:
        raise ApiError(422, "VALIDATION_ERROR", "This action accepts no query fields.")


@internal_router.post("/{order_id}/disputes", response_model=OrderParticipant)
async def open_dispute(order_id: UUID, request: Request, body: OpenDispute, auth: Auth):
    no_query(request)
    dispute_actor(auth[0], body.actor_type)
    row = await request.app.state.lifecycle.open_dispute(
        order_id, auth[0].user_id, body.actor_type, dispute_id=body.dispute_id
    )
    return project_order(row, participant=True, admin=True)


@internal_router.post(
    "/{order_id}/disputes/{dispute_id}/restore", response_model=OrderParticipant
)
async def restore_errand(
    order_id: UUID, dispute_id: UUID, request: Request, body: RestoreDispute, auth: Auth
):
    no_query(request)
    dispute_actor(auth[0], body.actor_type)
    row = await request.app.state.lifecycle.restore(
        order_id, auth[0].user_id, body.actor_type, dispute_id=dispute_id
    )
    return project_order(row, participant=True, admin=True)


@internal_router.post("/{order_id}/disputes/{dispute_id}/accept", response_model=OrderParticipant)
async def accept_dispute(
    order_id: UUID, dispute_id: UUID, request: Request, body: AcceptDispute, auth: Auth
):
    no_query(request)
    require_admin(auth[0])
    row = await request.app.state.lifecycle.accept_dispute(
        order_id, auth[0].user_id, dispute_id=dispute_id, failure=body.model_dump()
    )
    return project_order(row, participant=True, admin=True)
