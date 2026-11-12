# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, update

from main.create_errand import verified_claims
from main.database import SessionLocal
from main.models import Errand, ErrandStatus
from main.outbox import ErrandDeliveredEvent, append_errand_event


router = APIRouter()


class DeliverErrandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    errand_id: UUID


@router.post("/errand/deliver", status_code=204)
def deliver_errand_request(
    request: DeliverErrandRequest,
    claims: dict = Depends(verified_claims),
) -> None:
    try:
        courier_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=401,
            detail="Access token contains an invalid user ID",
        ) from exc

    with SessionLocal.begin() as db:
        statement = (
            update(Errand)
            .where(
                Errand.id == request.errand_id,
                Errand.status == ErrandStatus.ACCEPTED,
                Errand.courier_id == courier_id,
                Errand.expires_at > func.clock_timestamp(),
            )
            .values(
                status=ErrandStatus.DELIVERED,
                delivered_at=func.clock_timestamp(),
            )
            .returning(
                Errand.id,
                Errand.requester_id,
                Errand.credit_value,
                Errand.courier_id,
                Errand.delivered_at,
            )
        )
        delivered = db.execute(statement).mappings().one_or_none()

        if delivered is None:
            existing = db.get(Errand, request.errand_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Errand not found")
            if existing.courier_id != courier_id:
                raise HTTPException(
                    status_code=403,
                    detail="Only the assigned courier can deliver this errand",
                )
            raise HTTPException(
                status_code=409,
                detail="Errand must be ACCEPTED and have an unexpired delivery deadline",
            )

        append_errand_event(db, ErrandDeliveredEvent(
            errand_id=delivered["id"],
            requester_id=delivered["requester_id"],
            credit_value=delivered["credit_value"],
            courier_id=delivered["courier_id"],
            delivered_at=delivered["delivered_at"],
        ))


