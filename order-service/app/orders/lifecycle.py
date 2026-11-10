# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented participant acceptance, cancellation, expiry, fulfilment and failure
# actions.
# Author review: I validated correctness and added boundary checks where needed.

"""Lifecycle rules evaluated against a locked row and database time."""

from collections.abc import Mapping
from datetime import datetime
from typing import Literal
from uuid import UUID

from app.orders.errors import ApiError, not_found

Action = Literal["accept", "cancel", "pickup", "deliver", "complete"]
DisputeActor = Literal["USER", "ADMIN"]

# N2F3: a reported problem holds an accepted errand in DISPUTED until the dispute ends. Admin
# Service owns the dispute; these rules only keep the errand's state consistent with it.
DISPUTABLE = {"ACCEPTED", "PICKED_UP", "DELIVERED"}
CLEARED_DISPUTE = {"dispute_id": None, "disputed_from_state": None, "disputed_at": None}

FULFILMENT = {
    "pickup": ("ACCEPTED", "PICKED_UP", "picked_up_at", "courier_id"),
    "deliver": ("PICKED_UP", "DELIVERED", "delivered_at", "courier_id"),
    "complete": ("DELIVERED", "COMPLETED", "completed_at", "requester_id"),
}


def overdue_values(order: Mapping, now: datetime) -> dict:
    if (
        order["state"] in {"ACCEPTED", "PICKED_UP"}
        and order.get("overdue_at") is None
        and now >= order["delivery_deadline"]
    ):
        return {"overdue_at": order["delivery_deadline"]}
    return {}


def check_dispute_actor(order: Mapping, actor: UUID, actor_type: DisputeActor) -> None:
    # Administrators were already checked by role; participants only act on their own errand.
    if actor_type == "USER" and actor not in (order["requester_id"], order["courier_id"]):
        raise not_found()


def open_dispute_values(
    order: Mapping, actor: UUID, actor_type: DisputeActor, dispute_id: UUID, now: datetime
) -> dict:
    """Hold the errand for a new dispute, or return {} when the same dispute is replayed."""
    check_dispute_actor(order, actor, actor_type)
    if order["state"] == "DISPUTED":
        if order["dispute_id"] == dispute_id:
            return {}
        raise ApiError(409, "DISPUTE_OPEN", "A problem with this errand is already being reviewed.")
    if order["state"] not in DISPUTABLE:
        raise ApiError(409, "INVALID_TRANSITION", "This errand can no longer be disputed.")
    return {
        "state": "DISPUTED",
        "dispute_id": dispute_id,
        "disputed_from_state": order["state"],
        "disputed_at": now,
        # The overdue marker is history: an errand already late when disputed keeps it.
        **overdue_values(order, now),
    }


def restore_values(
    order: Mapping, actor: UUID, actor_type: DisputeActor, dispute_id: UUID, *, restored: bool
) -> dict:
    """Return the errand to its pre-dispute state after a withdrawal or rejection.

    ``restored`` says whether this dispute already returned the errand, so a retry succeeds
    without recording anything again.
    """
    check_dispute_actor(order, actor, actor_type)
    if order["state"] == "DISPUTED" and order["dispute_id"] == dispute_id:
        return {"state": order["disputed_from_state"], **CLEARED_DISPUTE}
    if restored:
        return {}
    raise ApiError(409, "INVALID_TRANSITION", "This dispute no longer holds the errand.")


def accept_dispute_values(
    order: Mapping, admin: UUID, dispute_id: UUID, now: datetime, failure: Mapping
) -> dict:
    """Fail the disputed errand with the reporter's selected reason; replays return {}."""
    if order["state"] == "FAILED" and order.get("decision_dispute_id") == dispute_id:
        return {}
    if order["state"] != "DISPUTED" or order["dispute_id"] != dispute_id:
        raise ApiError(409, "INVALID_TRANSITION", "This dispute no longer holds the errand.")
    return {
        "state": "FAILED",
        "failed_at": now,
        "failed_by": admin,
        "failure_reason": failure["reason"],
        "failure_details": failure.get("details"),
        "decided_by": admin,
        "decision_dispute_id": dispute_id,
        **CLEARED_DISPUTE,
    }


def transition_values(order: Mapping, actor: UUID, action: Action, now: datetime) -> dict:
    """Return a change, or an empty mapping for an authorized successful replay."""
    if action in FULFILMENT:
        source, target, timestamp, actor_column = FULFILMENT[action]
        if actor not in (order["requester_id"], order["courier_id"]):
            raise not_found()
        if order[actor_column] != actor:
            raise ApiError(403, "FORBIDDEN", "Only the designated participant may do this action.")
        if order.get(timestamp) is not None:
            # A prior successful action stays successful; replay never reverses state.
            return {}
        if order["state"] == "DISPUTED":
            # Nothing moves the errand on until its dispute is withdrawn or decided.
            raise ApiError(
                409, "ERRAND_DISPUTED", "This errand is on hold while a problem is reviewed."
            )
        if order["state"] != source:
            raise ApiError(409, "INVALID_TRANSITION", f"This action requires {source} state.")
        return {"state": target, timestamp: now, **overdue_values(order, now)}
    if action == "cancel":
        if order["requester_id"] != actor:
            raise not_found()
        if order["state"] == "CANCELLED":
            return {}
    elif action == "accept":
        if order["requester_id"] == actor:
            raise ApiError(403, "SELF_ACCEPTANCE", "You cannot accept your own errand.")
        if order["courier_id"] == actor and order.get("accepted_at") is not None:
            # Acceptance remains a successful fact even if fulfilment later advances.
            return {}
    else:
        raise ValueError("Unsupported lifecycle action")
    if order["state"] != "OPEN":
        raise ApiError(409, "ORDER_NOT_OPEN", "This errand is no longer open.")
    if now >= order["acceptance_deadline"]:
        raise ApiError(409, "DEADLINE_PASSED", "The acceptance deadline has passed.")
    if action == "accept":
        return {"state": "ACCEPTED", "courier_id": actor, "accepted_at": now}
    return {"state": "CANCELLED", "cancelled_at": now}
