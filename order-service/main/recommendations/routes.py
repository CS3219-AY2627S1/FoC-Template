# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.


# AI Assistance Disclosure
# Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
# Scope (AI-65): Added endpoint for retrieving recommended errands based on user profile and scoring logic
# Author review: Code changes were checked and validated

from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from main.create_errand import verified_claims
from main.database import get_db
from main.get_errands import ErrandResponse, available_errands
from main.models import Errand, ErrandStatus
from main.recommendations.scoring import UserProfile, rank_errands


router = APIRouter()

CANDIDATE_LIMIT = 200
# Errands closer than this to expiry are not realistic to pick up.
MIN_TIME_LEFT = timedelta(minutes=10)


class RecommendedErrand(ErrandResponse):
    recommendation_reason: str


class RecommendedErrandsResponse(BaseModel):
    items: list[RecommendedErrand]


def _user_profile(db: Session, user_id: UUID) -> UserProfile:
    delivered = db.execute(
        select(Errand.supplier_id, Errand.delivery_building_id).where(
            Errand.courier_id == user_id,
            Errand.status == ErrandStatus.COMPLETED,
        )
    ).all()
    requested_buildings = db.execute(
        select(Errand.delivery_building_id)
        .where(Errand.requester_id == user_id)
        .distinct()
    ).scalars().all()
    return UserProfile(
        delivered_suppliers=frozenset(row.supplier_id for row in delivered),
        familiar_buildings=frozenset(
            [row.delivery_building_id for row in delivered] + list(requested_buildings)
        ),
    )


@router.get("/errands/recommended", response_model=RecommendedErrandsResponse)
def get_recommended_errands(
    size: Annotated[int, Query(ge=1, le=20)] = 5,
    claims: dict = Depends(verified_claims),
    db: Session = Depends(get_db),
) -> RecommendedErrandsResponse:
    try:
        user_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=401, detail="Access token contains an invalid user ID"
        ) from exc

    now = datetime.now(timezone.utc)
    candidates = db.execute(
        select(Errand)
        .where(
            available_errands(now),
            # Users cannot accept their own errands.
            Errand.requester_id != user_id,
            Errand.expires_at > now + MIN_TIME_LEFT,
        )
        .order_by(Errand.expires_at.asc(), Errand.id.asc())
        .limit(CANDIDATE_LIMIT)
    ).scalars().all()

    ranked = rank_errands(list(candidates), _user_profile(db, user_id), now, size)
    return RecommendedErrandsResponse(
        items=[
            RecommendedErrand(
                **ErrandResponse.model_validate(item.errand).model_dump(),
                recommendation_reason=item.reason,
            )
            for item in ranked
        ]
    )


