# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AwareDatetime, BaseModel, ConfigDict
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from main.create_errand import verified_claims
from main.database import get_db
from main.models import Errand, ErrandStatus


router = APIRouter()


class ErrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: ErrandStatus
    requester_id: UUID
    courier_id: UUID | None
    supplier_id: UUID
    required_item: str
    credit_value: int
    delivery_building_id: UUID
    delivery_floor: str | None
    delivery_description: str | None
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None
    delivered_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    failed_at: datetime | None
    failure_reason: str | None


class GetErrandsResponse(BaseModel):
    total: int
    items: list[ErrandResponse]


def available_errands(now: datetime):
    """Exclude overdue or inconsistent records from marketplace visibility."""
    return and_(
        Errand.status == ErrandStatus.OPEN,
        Errand.expires_at > now,
        Errand.courier_id.is_(None),
        Errand.pending_credit_action.is_(None),
        Errand.credit_reservation_id.is_not(None),
        Errand.accepted_at.is_(None),
        Errand.delivered_at.is_(None),
        Errand.completed_at.is_(None),
        Errand.cancelled_at.is_(None),
        Errand.failed_at.is_(None),
        Errand.failure_reason.is_(None),
    )


@router.get("/errands", response_model=GetErrandsResponse)
def get_errands(
    errand_id: UUID | None = None,
    supplier_id: UUID | None = None,
    requester_id: UUID | None = None,
    courier_id: UUID | None = None,
    statuses: Annotated[list[ErrandStatus] | None, Query(alias="status")] = None,
    delivery_building_id: UUID | None = None,
    min_credit_value: Annotated[int | None, Query(ge=1)] = None,
    max_credit_value: Annotated[int | None, Query(ge=1)] = None,
    expires_after: AwareDatetime | None = None,
    expires_before: AwareDatetime | None = None,
    available_only: bool = False,
    sort: Literal[
        "created_at,asc", "created_at,desc",
        "credit_value,asc", "credit_value,desc",
        "expires_at,asc", "expires_at,desc",
    ] = "created_at,desc",
    page: Annotated[int, Query(ge=0)] = 0,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
    claims: dict = Depends(verified_claims),
    db: Session = Depends(get_db),
) -> GetErrandsResponse:
    try:
        user_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=401, detail="Access token contains an invalid user ID"
        ) from exc

    if (
        min_credit_value is not None
        and max_credit_value is not None
        and min_credit_value > max_credit_value
    ):
        raise HTTPException(
            status_code=422,
            detail="min_credit_value must not exceed max_credit_value",
        )
    if (
        expires_after is not None
        and expires_before is not None
        and expires_after > expires_before
    ):
        raise HTTPException(
            status_code=422,
            detail="expires_after must not exceed expires_before",
        )

    available = available_errands(datetime.now(timezone.utc))
    # The role comes exclusively from the verified JWT, not request parameters.
    is_admin = claims.get("type") == "Administrator"
    filters = []
    if not is_admin:
        filters.append(or_(
            available,
            Errand.requester_id == user_id,
            Errand.courier_id == user_id,
        ))

    # Every user-supplied filter only narrows the authorized result set.
    if available_only:
        filters.append(available)
    if statuses is not None:
        if not statuses:
            raise HTTPException(status_code=422, detail="At least one status is required")
        filters.append(Errand.status.in_(statuses))
    if errand_id is not None:
        filters.append(Errand.id == errand_id)
    if supplier_id is not None:
        filters.append(Errand.supplier_id == supplier_id)
    if requester_id is not None:
        filters.append(Errand.requester_id == requester_id)
    if courier_id is not None:
        filters.append(Errand.courier_id == courier_id)
    if delivery_building_id is not None:
        filters.append(Errand.delivery_building_id == delivery_building_id)
    if min_credit_value is not None:
        filters.append(Errand.credit_value >= min_credit_value)
    if max_credit_value is not None:
        filters.append(Errand.credit_value <= max_credit_value)
    if expires_after is not None:
        filters.append(Errand.expires_at >= expires_after)
    if expires_before is not None:
        filters.append(Errand.expires_at <= expires_before)

    total = db.execute(
        select(func.count()).select_from(Errand).where(*filters)
    ).scalar_one()

    column_name, direction = sort.split(",")
    sort_columns = {
        "created_at": Errand.created_at,
        "credit_value": Errand.credit_value,
        "expires_at": Errand.expires_at,
    }
    column = sort_columns[column_name]
    ordering = column.asc() if direction == "asc" else column.desc()
    errands = db.execute(
        select(Errand)
        .where(*filters)
        .order_by(ordering, Errand.id.asc())
        .limit(size)
        .offset(page * size)
    ).scalars().all()
    return GetErrandsResponse(
        total=total,
        items=[ErrandResponse.model_validate(errand) for errand in errands],
    )


