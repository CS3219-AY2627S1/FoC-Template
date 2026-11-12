# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, update

from main.create_errand import verified_claims
from main.database import SessionLocal
from main.models import Errand, ErrandStatus
from main.outbox import ErrandAcceptedEvent, append_errand_event


router = APIRouter()


class AcceptErrandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    errand_id: UUID


class AcceptErrandResponse(BaseModel):
    id: UUID
    status: ErrandStatus
    courier_id: UUID
    accepted_at: datetime


@router.post("/errand/accept", response_model=AcceptErrandResponse)
def accept_errand_request(
    request: AcceptErrandRequest,
    claims: dict = Depends(verified_claims),
) -> AcceptErrandResponse:
    try:
        courier_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=401, detail="Access token contains an invalid user ID"
        ) from exc

    with SessionLocal.begin() as db:
        # The predicates and state transition execute together under the row lock.
        # clock_timestamp() uses real database time even after waiting for a lock.
        statement = (
            update(Errand)
            .where(
                Errand.id == request.errand_id,
                Errand.status == ErrandStatus.OPEN,
                Errand.courier_id.is_(None),
                Errand.pending_credit_action.is_(None),
                Errand.credit_reservation_id.is_not(None),
                Errand.requester_id != courier_id,
                Errand.expires_at > func.clock_timestamp(),
            )
            .values(
                status=ErrandStatus.ACCEPTED,
                courier_id=courier_id,
                accepted_at=func.clock_timestamp(),
            )
            .returning(
                Errand.id, Errand.status, Errand.courier_id, Errand.accepted_at,
                Errand.requester_id, Errand.credit_value,
            )
        )
        accepted = db.execute(statement).mappings().one_or_none()

        if accepted is None:
            # This read only explains failure; it does not authorize acceptance.
            existing = db.get(Errand, request.errand_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Errand not found")
            if existing.requester_id == courier_id:
                raise HTTPException(status_code=403, detail="You cannot accept your own errand")
            raise HTTPException(
                status_code=409,
                detail="Errand is not available: it is no longer OPEN, has expired, or already has a courier",
            )

        append_errand_event(db, ErrandAcceptedEvent(
            errand_id=accepted["id"],
            requester_id=accepted["requester_id"],
            credit_value=accepted["credit_value"],
            courier_id=accepted["courier_id"],
            accepted_at=accepted["accepted_at"],
        ))
        response = AcceptErrandResponse.model_validate(dict(accepted))

    # Successful context exit commits before the HTTP response is returned.
    return response


