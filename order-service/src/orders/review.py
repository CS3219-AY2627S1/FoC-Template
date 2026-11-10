"""Compose the administrator's review without moving financial policy into the client."""

from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from orders.administration import command_history
from orders.orm_models import ErrandRequest
from orders.presentation import present_order
from orders.repository import get_order_audit_logs
from orders.schemas import (
    CommandHistoryResponse,
    CreditDiagnostics,
    OrderAuditLogResponse,
    OrderReviewResponse,
    ParticipantProfile,
)


async def order_review(
    session: AsyncSession, order: ErrandRequest, viewer_id: UUID, client: httpx.AsyncClient, authorization: str,
) -> OrderReviewResponse:
    response = OrderReviewResponse(
        order=await present_order(session, order, viewer_id, admin=True),
        commands=[CommandHistoryResponse(
            request_id=entry.command.id,
            operation=entry.command.routing_key.removeprefix("credit.").upper(),
            command=entry.command.payload, result=entry.result,
            created_at=entry.command.created_at, published_at=entry.command.published_at,
            attempts=entry.command.attempts, last_error=entry.command.last_error,
        ) for entry in await command_history(session, order.id)],
        audit=[OrderAuditLogResponse.model_validate(entry)
               for entry in await get_order_audit_logs(session, order.id)],
        diagnostics=None, people=[], evidence_error=None,
    )
    headers = {"Authorization": authorization}
    try:
        financial = await client.get(f"/credit-api/credits/admin/orders/{order.id}", headers=headers)
        financial.raise_for_status()
        diagnostics = CreditDiagnostics.model_validate(financial.json())
        if diagnostics.order_id != order.id:
            raise ValueError("Financial evidence belongs to another order")
        ids = {order.requester_id, order.courier_id}
        ids.update(case.opened_by for case in order.disputes)
        ids.update(case.closed_by for case in order.disputes)
        ids.update(entry.actor_id for entry in response.audit)
        ids.update(account.get("user_id") for account in diagnostics.accounts)
        for entry in diagnostics.audit_logs:
            ids.update(entry.get(key) for key in ("actor_id", "user_id", "recipient_user_id"))
        ids = sorted({str(user_id) for user_id in ids if user_id is not None})
        people = []
        for start in range(0, len(ids), 100):
            lookup = await client.post("/user-api/authentication/users/lookup",
                                       json={"user_ids": ids[start:start + 100]}, headers=headers)
            lookup.raise_for_status()
            people.extend(ParticipantProfile.model_validate(person) for person in lookup.json())
        response.diagnostics, response.people = diagnostics, people
    except (httpx.HTTPError, TypeError, ValueError):
        response.evidence_error = "Supporting financial or participant records are unavailable. Refresh before taking action."
    return response
