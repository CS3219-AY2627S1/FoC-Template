# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
# Scope (AI-65): Added rule-based scoring of open errands for one user, including scoring based on supplier familiarity, building familiarity, credit value, and urgency. Implemented ranking of errands based on scores and additional criteria.
# Author review: Code changes were checked and validated
"""Rule-based ranking of open errands for one user.

Kept free of database and HTTP code so the rules are easy to read and test.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from uuid import UUID

from main.models import Errand


MAX_CREDIT_VALUE = 25
SUPPLIER_WEIGHT = 3.0
BUILDING_WEIGHT = 2.0
CREDIT_WEIGHT = 2.0
URGENCY_WEIGHT = 1.0
URGENT_WITHIN = timedelta(hours=2)

SUPPLIER_REASON = "You've delivered from this supplier before"
BUILDING_REASON = "Goes to a building you often visit"
URGENCY_REASON = "Needed soon"
CREDIT_REASON = "High credit reward"


@dataclass(frozen=True)
class UserProfile:
    """Where the user has been, taken from their own errand history."""

    delivered_suppliers: frozenset[UUID] = field(default_factory=frozenset)
    familiar_buildings: frozenset[UUID] = field(default_factory=frozenset)


@dataclass(frozen=True)
class ScoredErrand:
    errand: Errand
    score: float
    reason: str


def score_errand(errand: Errand, profile: UserProfile, now: datetime) -> ScoredErrand:
    contributions: list[tuple[float, str]] = []
    if errand.supplier_id in profile.delivered_suppliers:
        contributions.append((SUPPLIER_WEIGHT, SUPPLIER_REASON))
    if errand.delivery_building_id in profile.familiar_buildings:
        contributions.append((BUILDING_WEIGHT, BUILDING_REASON))
    credit = CREDIT_WEIGHT * min(errand.credit_value, MAX_CREDIT_VALUE) / MAX_CREDIT_VALUE
    contributions.append((credit, CREDIT_REASON))
    if _as_aware(errand.expires_at, now) - now <= URGENT_WITHIN:
        contributions.append((URGENCY_WEIGHT, URGENCY_REASON))

    score = sum(weight for weight, _ in contributions)
    # The largest signal explains the pick; ties go to the earlier (more
    # personal) signal in the list above.
    reason = max(contributions, key=lambda item: item[0])[1]
    return ScoredErrand(errand=errand, score=score, reason=reason)


def rank_errands(
    errands: list[Errand], profile: UserProfile, now: datetime, size: int
) -> list[ScoredErrand]:
    scored = [score_errand(errand, profile, now) for errand in errands]
    scored.sort(
        key=lambda item: (
            -item.score,
            -item.errand.credit_value,
            _as_aware(item.errand.expires_at, now),
            str(item.errand.id),
        )
    )
    return scored[:size]


def _as_aware(value: datetime, now: datetime) -> datetime:
    # SQLite (used in tests) drops the timezone from stored datetimes.
    return value if value.tzinfo is not None else value.replace(tzinfo=now.tzinfo)


