"""Participant actions and list classification, shared by reads and mutations."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from orders.orm_models import CreditStatus, ErrandRequest, Status

type ParticipantAction = Literal["accept", "cancel", "pickup", "deliver", "receive", "dispute"]
type ReviewCategory = Literal["fulfilment", "financial", "history"]


def fulfilment_decided(order: ErrandRequest) -> bool:
    return any(case.kind == "fulfilment" and case.closed_at is not None
               and case.resolution in ("refund", "pay") for case in order.disputes)


def can_report_problem(order: ErrandRequest, actor_id: UUID) -> bool:
    return (actor_id in (order.requester_id, order.courier_id)
            and order.status in (Status.ACCEPTED, Status.PICKED_UP, Status.DELIVERED)
            and order.credit_operation == "RESERVE"
            and order.credit_status == CreditStatus.SUCCEEDED
            and not fulfilment_decided(order))


def fulfilment_blocked(order: ErrandRequest) -> bool:
    return fulfilment_decided(order) or any(
        case.kind == "fulfilment" and case.closed_at is None for case in order.disputes
    )


def participant_actions(order: ErrandRequest, actor_id: UUID, now: datetime) -> list[ParticipantAction]:
    if fulfilment_blocked(order):
        return []
    if order.status == Status.OPEN and order.expires_at > now:
        if actor_id == order.requester_id:
            return ["cancel"]
        return ["accept"] if order.courier_id is None else []
    if not can_report_problem(order, actor_id):
        return []
    actions: list[ParticipantAction] = []
    if order.courier_id is not None and order.progress_due_at is not None and order.progress_due_at > now:
        if actor_id == order.courier_id:
            if order.status == Status.ACCEPTED:
                actions.append("pickup")
            elif order.status == Status.PICKED_UP:
                actions.append("deliver")
        if actor_id == order.requester_id and order.status == Status.DELIVERED:
            actions.append("receive")
    actions.append("dispute")
    return actions


def unsettled_credits(order: ErrandRequest) -> bool:
    return order.credit_operation != "RESERVE" and order.credit_status != CreditStatus.SUCCEEDED


def is_active(order: ErrandRequest) -> bool:
    progressing = order.status in (Status.INIT, Status.OPEN, Status.ACCEPTED, Status.PICKED_UP,
                                    Status.DELIVERED, Status.RECEIVED) and not fulfilment_decided(order)
    return progressing or any(case.closed_at is None for case in order.disputes) or unsettled_credits(order)


def review_category(order: ErrandRequest) -> ReviewCategory:
    if any(case.kind == "fulfilment" and case.closed_at is None for case in order.disputes):
        return "fulfilment"
    if any(case.closed_at is None for case in order.disputes) or unsettled_credits(order):
        return "financial"
    return "history"
