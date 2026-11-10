# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented Order creation/recovery, read handling and participant checks.
# Author review: I validated correctness and added boundary checks where needed.

"""Creation orchestration: external calls never run inside database transactions."""

import hashlib
import json
import logging
import random
import re
from datetime import UTC, datetime

from app.orders.errors import ApiError, not_found, unavailable
from app.orders.schemas import CreateOrder

logger = logging.getLogger("foc.order.creation")
KEY_PATTERN = re.compile(r"[A-Za-z0-9._:-]{1,128}")


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def request_digest(body: CreateOrder) -> str:
    return digest(json.dumps(body.model_dump(mode="json", by_alias=True), sort_keys=True))


def is_participant(order, actor):
    return actor in (order["requester_id"], order["courier_id"])


def project_order(order, *, participant=False, admin=False):
    result = {
        "orderId": order["id"],
        "supplierId": order["supplier_id"],
        "pickup": order["supplier_snapshot"],
        "itemDescription": order["item_description"],
        "deliveryLocation": order["delivery_location"],
        "reward": order["reward"],
        "state": order["state"],
        "acceptanceDeadline": order["acceptance_deadline"],
        "deliveryDeadline": order["delivery_deadline"],
        "createdAt": order["created_at"],
    }
    if participant:
        result.update(
            requesterId=order["requester_id"],
            courierId=order["courier_id"],
            updatedAt=order["updated_at"],
            acceptedAt=order.get("accepted_at"),
            cancelledAt=order.get("cancelled_at"),
            expiredAt=order.get("expired_at"),
            pickedUpAt=order.get("picked_up_at"),
            deliveredAt=order.get("delivered_at"),
            completedAt=order.get("completed_at"),
            overdueAt=order.get("overdue_at"),
            failedAt=order.get("failed_at"),
            failedBy=order.get("failed_by"),
            failureReason=order.get("failure_reason"),
            failureDetails=order.get("failure_details"),
            disputeId=order.get("dispute_id"),
            disputedFromState=order.get("disputed_from_state"),
            disputedAt=order.get("disputed_at"),
        )
        if order.get("decided_by") is not None:
            # N2F3.7: participants see that an administrator decided the dispute, not who did.
            result.update(
                decidedByAdministrator=True,
                decisionDisputeId=order["decision_dispute_id"],
                failedBy=order.get("failed_by") if admin else None,
                decidedBy=order["decided_by"] if admin else None,
            )
    return result


def operation_view(operation):
    result = {
        "operationId": operation["id"],
        "stage": operation["stage"],
        "statusUrl": f"/v1/order-creations/{operation['id']}",
        "retryCreation": operation["stage"] == "READY_TO_FINALIZE",
        "errorCode": operation["error_code"],
    }
    if operation["stage"] == "SUCCEEDED":
        result["orderId"] = operation["order_id"]
    return result


class CreationService:
    def __init__(self, repository, clients, clock=None):
        self.repo = repository
        self.clients = clients
        self.clock = clock or (lambda: datetime.now(UTC))

    async def create(self, actor, token, key, body):
        if not key or not KEY_PATTERN.fullmatch(key):
            raise ApiError(422, "INVALID_IDEMPOTENCY_KEY", "Supply a 1–128 character retry key.")
        key_hash, payload_hash = digest(key), request_digest(body)
        operation = await self.repo.lookup_key(actor, key_hash)
        snapshot = None
        if operation is None:
            if body.acceptance_deadline <= self.clock():
                raise ApiError(422, "DEADLINE_PASSED", "Acceptance deadline must be in the future.")
            self.clients.ensure_credit_configured()
            snapshot = await self.clients.supplier(body.supplier_id, token)
            operation = await self.repo.begin(actor, key_hash, payload_hash, body, snapshot)
        if operation["request_hash"] != payload_hash:
            raise ApiError(409, "IDEMPOTENCY_CONFLICT", "This key belongs to a different request.")
        if operation["stage"] == "SUCCEEDED":
            return 200, project_order(
                await self.repo.order(operation["order_id"]), participant=True
            )
        if operation["stage"] == "ABORTED":
            raise ApiError(
                409,
                operation["error_code"] or "CREATION_ABORTED",
                "This creation attempt was closed. Use a new key for a new request.",
            )
        claimed = await self.repo.claim(operation["id"])
        if claimed is None:
            return await self.result(operation["id"])
        operation = claimed
        if operation["stage"] == "ABORTING" or body.acceptance_deadline <= self.clock():
            await self.abort(operation, operation["error_code"] or "DEADLINE_PASSED")
            return await self.result(operation["id"])
        try:
            # Fresh requester retry revalidates Supplier. Authentication was checked by the route.
            if snapshot is None:
                snapshot = await self.clients.supplier(body.supplier_id, token)
        except ApiError as error:
            if error.code == "SUPPLIER_UNAVAILABLE" and error.status == 409:
                await self.abort(operation, error.code)
            else:
                await self.repo.change(operation, release=True)
            raise
        operation = await self.repo.change(operation, stage="RESERVATION_UNKNOWN")
        if operation is None:
            return await self.result(claimed["id"])
        try:
            reservation = await self.clients.credit("reserve", operation)
        except ApiError as error:
            if error.status == 409:
                await self.abort(operation, error.code)
            else:
                await self.defer(operation, error.code)
            return await self.result(operation["id"])
        # Contract client validates identifiers, amount and RESERVED status.
        if await self.repo.finalize(operation, reservation.reservation_id, snapshot):
            return 201, project_order(
                await self.repo.order(operation["order_id"]), participant=True
            )
        current = await self.repo.operation(operation["id"])
        if current["lease_token"] == operation["lease_token"]:
            if current["stage"] == "ABORTING":
                await self.abort(current, current["error_code"])
            else:
                await self.repo.change(current, release=True)
        return await self.result(operation["id"])

    async def result(self, operation_id):
        operation = await self.repo.operation(operation_id)
        if operation["stage"] == "SUCCEEDED":
            return 200, project_order(
                await self.repo.order(operation["order_id"]), participant=True
            )
        if operation["stage"] == "ABORTED":
            raise ApiError(
                409,
                operation["error_code"] or "CREATION_ABORTED",
                "This creation attempt was closed. Use a new key for a new request.",
            )
        return 202, operation_view(operation)

    async def defer(self, operation, error_code):
        delay = min(60, 2 ** min(operation["attempts"], 6)) * random.uniform(0.5, 1)
        await self.repo.change(operation, release=True, delay=delay, error_code=error_code)
        # Identifiers only: no payload, bearer token or dependency exception text.
        logger.warning(
            "Creation deferred operation=%s order=%s code=%s",
            operation["id"],
            operation["order_id"],
            error_code,
        )

    async def abort(self, operation, reason):
        operation = await self.repo.change(operation, stage="ABORTING", error_code=reason)
        if operation is None:
            return
        try:
            await self.clients.credit("abort", operation)
        except ApiError as error:
            # Keep the original domain failure while exposing safe recovery diagnostics in logs.
            await self.defer(operation, reason or error.code)
            return
        await self.repo.change(operation, stage="ABORTED", release=True)

    async def recover(self, operation_id):
        operation = await self.repo.claim(operation_id)
        if operation is None:
            return
        if operation["stage"] == "ABORTING" or operation["acceptance_deadline"] <= self.clock():
            await self.abort(operation, operation["error_code"] or "DEADLINE_PASSED")
            return
        try:
            result = await self.clients.credit("status", operation)
            if result is not None and result.state not in ("RESERVED", "CLOSED"):
                raise unavailable("CREDIT_CONTRACT_ERROR")
        except ApiError as error:
            await self.defer(operation, error.code)
            return
        if result is not None and result.state == "CLOSED":
            await self.repo.change(
                operation, stage="ABORTED", release=True, error_code="CREATION_ABORTED"
            )
        else:
            await self.repo.change(
                operation,
                stage="READY_TO_FINALIZE",
                release=True,
                delay=5,
                reservation_id=result.reservation_id if result else None,
                error_code=None,
            )


async def visible_order(repository, order_id, actor, *, participant_only=False):
    order = await repository.order(order_id)
    if order is None:
        raise not_found()
    participant = is_participant(order, actor)
    available = order["state"] == "OPEN" and order["acceptance_deadline"] > datetime.now(UTC)
    if not participant and (participant_only or not available):
        raise not_found()
    return order, participant
