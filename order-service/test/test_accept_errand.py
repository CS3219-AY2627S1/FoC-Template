# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import accept_errand
from main.app import app
from main.database import Base
from main.models import Errand, ErrandStatus
from test.outbox_support import assert_single_event, outbox_events


@pytest.fixture
def database(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def clock(connection, record):
        # SQLite tests exercise endpoint behavior; PG locking is tested separately.
        connection.create_function(
            "clock_timestamp", 0,
            lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f"),
        )

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(accept_errand, "SessionLocal", factory)
    try:
        yield factory
    finally:
        engine.dispose()


def seed(factory, **changes):
    fields = dict(
        id=uuid4(), status=ErrandStatus.OPEN, credit_reservation_id=uuid4(),
        requester_id=uuid4(), supplier_id=uuid4(),
        required_item="One coffee", credit_value=5,
        delivery_building_id=uuid4(),
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    fields.update(changes)
    with factory.begin() as db:
        db.add(Errand(**fields))
    return fields


@pytest.fixture
def endpoint(database):
    claims = {"sub": str(uuid4()), "type": "Student"}
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[accept_errand.verified_claims] = lambda: claims
    try:
        with TestClient(app) as client:
            yield client, claims, database
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def post(client, errand_id):
    return client.post(
        "/errand/accept", json={"errand_id": str(errand_id)},
        headers={"Authorization": "Bearer test-token"},
    )


def test_accept_updates_status_courier_and_timestamp(endpoint):
    client, claims, factory = endpoint
    errand = seed(factory)
    response = post(client, errand["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(errand["id"])
    assert body["status"] == "ACCEPTED"
    assert body["courier_id"] == claims["sub"]
    assert body["accepted_at"] is not None
    with factory() as db:
        stored = db.get(Errand, errand["id"])
        assert str(stored.courier_id) == claims["sub"]
        assert stored.status == ErrandStatus.ACCEPTED
        assert stored.accepted_at is not None
        assert stored.requester_id == errand["requester_id"]
    event = assert_single_event(factory, "errand.accepted", errand["id"])
    assert event["courierId"] == claims["sub"]
    assert event["requesterId"] == str(errand["requester_id"])
    assert event["creditValue"] == errand["credit_value"]
    assert event["acceptedAt"] is not None


@pytest.mark.parametrize("state", [state for state in ErrandStatus if state != ErrandStatus.OPEN])
def test_non_open_errand_is_unchanged(endpoint, state):
    client, _, factory = endpoint
    original_courier = uuid4()
    errand = seed(factory, status=state, courier_id=original_courier)
    response = post(client, errand["id"])
    assert response.status_code == 409
    assert response.json()["detail"]
    with factory() as db:
        stored = db.get(Errand, errand["id"])
        assert stored.status == state
        assert stored.courier_id == original_courier
    assert outbox_events(factory) == []


def test_requester_cannot_accept_own_errand(endpoint):
    client, claims, factory = endpoint
    errand = seed(factory)
    claims["sub"] = str(errand["requester_id"])
    assert post(client, errand["id"]).status_code == 403
    with factory() as db:
        stored = db.get(Errand, errand["id"])
        assert stored.status == ErrandStatus.OPEN
        assert stored.courier_id is None


def test_expired_open_errand_cannot_be_accepted(endpoint):
    client, _, factory = endpoint
    errand = seed(factory, expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    assert post(client, errand["id"]).status_code == 409
    with factory() as db:
        assert db.get(Errand, errand["id"]).courier_id is None


def test_second_user_cannot_replace_courier(endpoint):
    client, claims, factory = endpoint
    errand = seed(factory)
    first_user = claims["sub"]
    assert post(client, errand["id"]).status_code == 200
    claims["sub"] = str(uuid4())
    assert post(client, errand["id"]).status_code == 409
    with factory() as db:
        assert str(db.get(Errand, errand["id"]).courier_id) == first_user


def test_unknown_errand(endpoint):
    client, _, _ = endpoint
    assert post(client, uuid4()).status_code == 404


@pytest.mark.parametrize("body", [{}, {"errand_id": "invalid"}, {"errand_id": None},
    {"errand_id": str(uuid4()), "courier_id": str(uuid4())}])
def test_invalid_request(endpoint, body):
    client, _, _ = endpoint
    response = client.post("/errand/accept", json=body, headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 422


def test_invalid_subject(endpoint):
    client, claims, factory = endpoint
    errand = seed(factory)
    claims["sub"] = "invalid"
    assert post(client, errand["id"]).status_code == 401


def test_authentication_required(endpoint):
    client, _, factory = endpoint
    errand = seed(factory)
    app.dependency_overrides.pop(accept_errand.verified_claims)
    response = client.post("/errand/accept", json={"errand_id": str(errand["id"])})
    assert response.status_code in (401, 403)


@pytest.fixture
def postgres_database(monkeypatch):
    url = os.getenv("TEST_ORDER_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_ORDER_DATABASE_URL to run the PostgreSQL concurrency test")
    admin = create_engine(url)
    if admin.dialect.name != "postgresql":
        admin.dispose()
        pytest.fail("TEST_ORDER_DATABASE_URL must point to PostgreSQL")
    schema = "accept_test_" + uuid4().hex
    with admin.begin() as db:
        db.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        Base.metadata.create_all(engine)
        factory = sessionmaker(bind=engine)
        monkeypatch.setattr(accept_errand, "SessionLocal", factory)
        yield factory
    finally:
        engine.dispose()
        with admin.begin() as db:
            # Only the randomly generated schema created by this fixture is removed.
            db.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def test_concurrent_postgres_acceptance_has_one_winner(postgres_database):
    factory = postgres_database
    errand = seed(factory)
    couriers = [uuid4(), uuid4()]
    barrier = Barrier(2)

    def attempt(courier_id):
        barrier.wait(timeout=10)
        try:
            result = accept_errand.accept_errand_request(
                accept_errand.AcceptErrandRequest(errand_id=errand["id"]),
                {"sub": str(courier_id)},
            )
            return 200, result.courier_id
        except HTTPException as exc:
            return exc.status_code, None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, couriers))
    assert sorted(code for code, _ in results) == [200, 409]
    winner = next(courier for code, courier in results if code == 200)
    with factory() as db:
        stored = db.get(Errand, errand["id"])
        assert stored.status == ErrandStatus.ACCEPTED
        assert stored.courier_id == winner
        assert stored.accepted_at is not None
    event = assert_single_event(factory, "errand.accepted", errand["id"])
    assert event["courierId"] == str(winner)


