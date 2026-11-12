# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import deliver_errand
from main.app import app
from main.database import Base
from main.models import Errand, ErrandStatus
from test.outbox_support import assert_single_event, outbox_events
from test.test_accept_errand import seed


@pytest.fixture
def endpoint(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def clock(connection, record):
        connection.create_function(
            "clock_timestamp", 0,
            lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f"),
        )

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(deliver_errand, "SessionLocal", factory)
    claims = {"sub": str(uuid4()), "type": "Student"}
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[deliver_errand.verified_claims] = lambda: claims
    try:
        with TestClient(app) as client:
            yield client, claims, factory
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        engine.dispose()


def post(client, errand_id):
    return client.post(
        "/errand/deliver",
        json={"errand_id": str(errand_id)},
        headers={"Authorization": "Bearer test-token"},
    )


def accepted_errand(factory, courier_id):
    return seed(
        factory,
        status=ErrandStatus.ACCEPTED,
        courier_id=courier_id,
        accepted_at=datetime.now(timezone.utc),
    )


def test_delivery_updates_status_and_publishes_event(endpoint):
    client, claims, factory = endpoint
    errand = accepted_errand(factory, UUID(claims["sub"]))

    response = post(client, errand["id"])

    assert response.status_code == 204
    assert response.content == b""
    with factory() as db:
        stored = db.get(Errand, errand["id"])
        assert stored.status == ErrandStatus.DELIVERED
        assert stored.delivered_at is not None
        assert stored.courier_id == UUID(claims["sub"])
    event = assert_single_event(factory, "errand.delivered", errand["id"])
    assert event["errandId"] == str(errand["id"])
    assert event["requesterId"] == str(errand["requester_id"])
    assert event["courierId"] == str(errand["courier_id"])
    assert event["creditValue"] == errand["credit_value"]
    assert event["deliveredAt"] is not None


def test_only_assigned_courier_can_deliver(endpoint):
    client, claims, factory = endpoint
    errand = accepted_errand(factory, uuid4())

    response = post(client, errand["id"])

    assert response.status_code == 403
    assert outbox_events(factory) == []


@pytest.mark.parametrize("state", [state for state in ErrandStatus if state != ErrandStatus.ACCEPTED])
def test_only_accepted_errands_can_be_delivered(endpoint, state):
    client, claims, factory = endpoint
    errand = accepted_errand(factory, UUID(claims["sub"]))
    with factory.begin() as db:
        db.get(Errand, errand["id"]).status = state

    response = post(client, errand["id"])

    assert response.status_code == 409
    assert outbox_events(factory) == []


def test_expired_accepted_errand_is_not_delivered(endpoint):
    client, claims, factory = endpoint
    errand = accepted_errand(factory, UUID(claims["sub"]))
    with factory.begin() as db:
        db.get(Errand, errand["id"]).expires_at = (
            datetime.now(timezone.utc) - timedelta(seconds=1)
        )

    response = post(client, errand["id"])

    assert response.status_code == 409
    with factory() as db:
        stored = db.get(Errand, errand["id"])
        assert stored.status == ErrandStatus.ACCEPTED
        assert stored.delivered_at is None
    assert outbox_events(factory) == []


def test_unknown_errand(endpoint):
    client, _, factory = endpoint

    assert post(client, uuid4()).status_code == 404
    assert outbox_events(factory) == []


def test_invalid_request(endpoint):
    client, _, factory = endpoint

    response = client.post(
        "/errand/deliver",
        json={"errand_id": "invalid"},
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 422
    assert outbox_events(factory) == []


