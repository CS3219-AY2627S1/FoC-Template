"""Viewer-scoped order responses."""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from orders.administration import available_actions, command_histories
from orders.orm_models import CreditStatus, ErrandRequest
from orders.policy import (
    fulfilment_blocked,
    is_active,
    participant_actions,
    review_category,
)
from orders.schemas import OrderResponse


async def present_orders(
    session: AsyncSession, orders: Sequence[ErrandRequest], viewer_id: UUID, *, admin: bool = False,
) -> list[OrderResponse]:
    now = await session.scalar(select(func.clock_timestamp()))
    assert now is not None
    histories = await command_histories(session, [order.id for order in orders
                                                if admin or order.credit_status == CreditStatus.REJECTED])
    responses = []
    for order in orders:
        response = OrderResponse.model_validate(order)
        response.available_actions = participant_actions(order, viewer_id, now)
        if fulfilment_blocked(order):
            response.progress_due_at = None
        response.is_active = is_active(order)
        response.review_category = review_category(order)
        history = histories.get(order.id, [])
        if admin:
            choices = available_actions(order, history)
            for case in response.disputes:
                case.available_actions = choices[case.id]
        if order.credit_status == CreditStatus.REJECTED and history and history[-1].result:
            response.credit_reason = history[-1].result.reason
        responses.append(response)
    return responses


async def present_order(
    session: AsyncSession, order: ErrandRequest, viewer_id: UUID, *, admin: bool = False,
) -> OrderResponse:
    return (await present_orders(session, [order], viewer_id, admin=admin))[0]
