# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

"""Recoverable intents around synchronous credit calls.

Each intent commits BEFORE the HTTP call. An unknown result or failed final DB
commit leaves the same intent retryable, and prevents a conflicting action.
No background worker, credentials-at-rest, or distributed transaction is implied.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from main.credit_client import CreditClient
from main.models import CreditOperation, Errand, ErrandStatus
from main.outbox import (
    ErrandCancelledEvent, ErrandCompletedEvent, ErrandFailedEvent, append_errand_event,
)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def creation_operation(factory, requester_id, key, payload):
    def find(db):
        return db.scalar(select(CreditOperation).where(
            CreditOperation.requester_id == requester_id,
            CreditOperation.request_key == key,
        ))

    try:
        with factory.begin() as db:
            operation = find(db)
            if operation is None:
                errand_id = uuid4()
                operation = CreditOperation(
                    id=errand_id, errand_id=errand_id, requester_id=requester_id,
                    request_key=key, action="CREATE", state="PENDING", payload=payload,
                )
                db.add(operation)
                db.flush()
            if operation.action != "CREATE" or operation.payload != payload:
                raise HTTPException(409, "Idempotency-Key was already used for a different request")
            return operation.id
    except IntegrityError:
        # Concurrent requests for the same caller/key converge on one operation.
        with factory() as db:
            operation = find(db)
            if operation is None:
                raise
            if operation.action != "CREATE" or operation.payload != payload:
                raise HTTPException(409, "Idempotency-Key was already used for a different request")
            return operation.id


def prepare_terminal(factory, errand_id, requester_id, action, reason=None):
    with factory.begin() as db:
        errand = db.scalar(select(Errand).where(Errand.id == errand_id).with_for_update())
        if errand is None:
            raise HTTPException(404, "Errand not found")
        if errand.requester_id != requester_id:
            raise HTTPException(403, "Only the requester can perform this operation")
        key = f"{action}:{errand_id}"
        existing = db.scalar(select(CreditOperation).where(
            CreditOperation.requester_id == requester_id, CreditOperation.request_key == key,
        ))
        if existing is not None and existing.state == "PENDING":
            if existing.payload.get("failure_reason") != reason:
                raise HTTPException(409, "Retry must use the original failure reason")
            return existing.id
        if errand.pending_credit_action is not None:
            raise HTTPException(409, "A different credit operation is pending; retry that operation")
        expected = ErrandStatus.OPEN if action == "CANCEL" else ErrandStatus.DELIVERED
        now = db.scalar(select(func.clock_timestamp()))
        if isinstance(now, str):  # SQLite unit tests.
            now = datetime.fromisoformat(now)
        if (
            errand.status != expected or utc(errand.expires_at) <= utc(now)
            or (action == "CANCEL" and errand.courier_id is not None)
            or (action != "CANCEL" and errand.courier_id is None)
        ):
            raise HTTPException(409, "Errand state, assignment or expiry prevents this operation")
        if errand.credit_reservation_id is None:
            raise HTTPException(409, "Errand has no credit reservation; legacy data requires reconciliation")
        operation = CreditOperation(
            id=uuid4(), errand_id=errand_id, requester_id=requester_id,
            request_key=key, action=action, state="PENDING",
            reservation_id=errand.credit_reservation_id,
            payload={"failure_reason": reason, "transition_at": utc(now).isoformat()},
        )
        db.add(operation)
        errand.pending_credit_action = action
        db.flush()
        return operation.id


def finish_terminal(factory, operation_id, token):
    with factory.begin() as db:
        operation = db.scalar(select(CreditOperation).where(
            CreditOperation.id == operation_id,
        ).with_for_update())
        if operation.state != "PENDING":
            raise HTTPException(409, "Errand operation has already completed")
        errand = db.scalar(select(Errand).where(Errand.id == operation.errand_id).with_for_update())
        if errand.pending_credit_action != operation.action:
            raise HTTPException(409, "Pending credit operation does not match the errand")
        client = CreditClient(token)
        if operation.action == "COMPLETE":
            client.complete(operation.reservation_id, errand.id, errand.credit_value, errand.courier_id)
        else:
            client.release(operation.reservation_id, errand.id, errand.credit_value)
        # On a retry after an unknown HTTP result, Credit Service returns the
        # same terminal reservation without repeating the balance mutation.
        at = datetime.fromisoformat(operation.payload["transition_at"])
        common = dict(errand_id=errand.id, requester_id=errand.requester_id, credit_value=errand.credit_value)
        if operation.action == "CANCEL":
            errand.status, errand.cancelled_at = ErrandStatus.CANCELLED, at
            event = ErrandCancelledEvent(**common, cancelled_at=at)
            response = {"id": errand.id, "status": errand.status, "cancelled_at": at}
        elif operation.action == "COMPLETE":
            errand.status, errand.completed_at = ErrandStatus.COMPLETED, at
            event = ErrandCompletedEvent(**common, courier_id=errand.courier_id, completed_at=at)
            response = {"id": errand.id, "status": errand.status, "completed_at": at}
        else:
            errand.status, errand.failed_at = ErrandStatus.FAILED, at
            errand.failure_reason = operation.payload["failure_reason"]
            event = ErrandFailedEvent(**common, courier_id=errand.courier_id, failed_at=at, failure_reason=errand.failure_reason)
            response = {"id": errand.id, "status": errand.status, "failed_at": at, "failure_reason": errand.failure_reason}
        append_errand_event(db, event)
        errand.pending_credit_action = None
        operation.state = "SUCCEEDED"
    return response


