# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

  
#   AI Assistance Disclosure
#   Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
#   Scope (AI-65): Added unit tests for the recommendation logic, errand scoring, and ranking based on various criteria.
#   Author review: Code changes were checked and validated

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main.app import app
from main.database import Base, get_db
from main.models import ErrandStatus
from main.recommendations import scoring
from main.recommendations.routes import verified_claims
from test.test_accept_errand import seed


@pytest.fixture
def endpoint():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    claims = {"sub": str(uuid4()), "type": "Student"}

    def test_db():
        with factory() as db:
            yield db

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[verified_claims] = lambda: claims
    try:
        with TestClient(app) as client:
            yield client, UUID(claims["sub"]), factory
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        engine.dispose()


def get(client, **params):
    return client.get(
        "/errands/recommended", params=params,
        headers={"Authorization": "Bearer test-token"},
    )


def items(response):
    assert response.status_code == 200
    return response.json()["items"]


def in_hours(hours):
    return datetime.now(timezone.utc) + timedelta(hours=hours)


def completed_delivery(factory, courier_id, **changes):
    now = datetime.now(timezone.utc)
    return seed(
        factory, status=ErrandStatus.COMPLETED, courier_id=courier_id,
        accepted_at=now - timedelta(days=1), completed_at=now - timedelta(days=1),
        expires_at=now - timedelta(days=1), **changes,
    )


def test_only_errands_the_user_can_accept_are_recommended(endpoint):
    client, user_id, factory = endpoint
    open_errand = seed(factory, expires_at=in_hours(5))
    seed(factory, requester_id=user_id, expires_at=in_hours(5))  # own errand
    seed(factory, expires_at=datetime.now(timezone.utc) + timedelta(minutes=5))  # too late
    seed(factory, status=ErrandStatus.ACCEPTED, courier_id=uuid4(), expires_at=in_hours(5))
    seed(factory, expires_at=in_hours(-1))  # expired

    assert [item["id"] for item in items(get(client))] == [str(open_errand["id"])]


def test_familiar_supplier_and_building_outrank_slightly_higher_credit(endpoint):
    client, user_id, factory = endpoint
    supplier, building = uuid4(), uuid4()
    completed_delivery(factory, user_id, supplier_id=supplier)
    seed(factory, requester_id=user_id, delivery_building_id=building,
         status=ErrandStatus.COMPLETED, expires_at=in_hours(-24))

    familiar_supplier = seed(factory, supplier_id=supplier, credit_value=5, expires_at=in_hours(5))
    familiar_building = seed(
        factory, delivery_building_id=building, credit_value=5, expires_at=in_hours(5)
    )
    higher_credit = seed(factory, credit_value=10, expires_at=in_hours(5))

    result = items(get(client))
    assert [item["id"] for item in result] == [
        str(familiar_supplier["id"]), str(familiar_building["id"]), str(higher_credit["id"]),
    ]
    assert result[0]["recommendation_reason"] == scoring.SUPPLIER_REASON
    assert result[1]["recommendation_reason"] == scoring.BUILDING_REASON
    assert result[2]["recommendation_reason"] == scoring.CREDIT_REASON


def test_new_user_is_ranked_by_credit_and_urgency(endpoint):
    client, _, factory = endpoint
    low_later = seed(factory, credit_value=4, expires_at=in_hours(6))
    low_soon = seed(factory, credit_value=4, expires_at=in_hours(1))
    high_later = seed(factory, credit_value=20, expires_at=in_hours(6))

    result = items(get(client))
    assert [item["id"] for item in result] == [
        str(high_later["id"]), str(low_soon["id"]), str(low_later["id"]),
    ]
    assert result[1]["recommendation_reason"] == scoring.URGENCY_REASON


def test_size_limits_the_number_of_recommendations(endpoint):
    client, _, factory = endpoint
    for _ in range(4):
        seed(factory, expires_at=in_hours(5))
    assert len(items(get(client, size=2))) == 2
    assert len(items(get(client))) == 4
    assert get(client, size=0).status_code == 422
    assert get(client, size=21).status_code == 422


def test_response_contains_errand_fields(endpoint):
    client, _, factory = endpoint
    errand = seed(factory, expires_at=in_hours(5), delivery_floor="L2")
    body = items(get(client))[0]
    assert body["required_item"] == errand["required_item"]
    assert body["delivery_floor"] == "L2"
    assert body["status"] == "OPEN"


def test_invalid_token_is_rejected(endpoint):
    client, _, _ = endpoint

    def reject():
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    app.dependency_overrides[verified_claims] = reject
    assert get(client).status_code == 401
    app.dependency_overrides[verified_claims] = lambda: {"sub": "not-a-uuid"}
    assert get(client).status_code == 401


def test_recommended_path_is_not_shadowed_by_errand_listing(endpoint):
    client, _, factory = endpoint
    seed(factory, expires_at=in_hours(5))
    body = get(client).json()
    assert "total" not in body
    assert "recommendation_reason" in body["items"][0]


