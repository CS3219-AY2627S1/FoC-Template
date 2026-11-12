# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import accept_errand, cancel_errand, credit_operations
from main.app import app
from main.database import Base
from main.models import Errand, ErrandStatus
from test.outbox_support import assert_single_event, outbox_events
from test.test_accept_errand import postgres_database, seed


@pytest.fixture
def database(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def clock(connection, record):
        connection.create_function(
            "clock_timestamp", 0,
            lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f"),
        )

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(cancel_errand, "SessionLocal", factory)
    try:
        yield factory
    finally:
        engine.dispose()


@pytest.fixture
def endpoint(database, monkeypatch):
    claims = {"sub": str(uuid4()), "type": "Student"}
    release = Mock(return_value=True)
    credit_client = Mock(release=release)
    monkeypatch.setattr(credit_operations, "CreditClient", lambda token: credit_client)
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[cancel_errand.verified_claims] = lambda: claims
    try:
        with TestClient(app) as client:
            yield client, claims, database, release
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def own_errand(claims, factory, **changes):
    from uuid import UUID
    return seed(factory, requester_id=UUID(claims["sub"]), **changes)


def post(client, errand_id):
    return client.post(
        "/errand/cancel", json={"errand_id": str(errand_id)},
        headers={"Authorization": "Bearer test-token"},
    )


def assert_open(factory, errand_id):
    with factory() as db:
        stored = db.get(Errand, errand_id)
        assert stored.status == ErrandStatus.OPEN
        assert stored.cancelled_at is None
    assert outbox_events(factory) == []


def test_cancel_records_timestamp_and_releases_credits(endpoint):
    client, claims, factory, release = endpoint
    errand = own_errand(claims, factory)
    response = post(client, errand["id"])
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(errand["id"])
    assert body["status"] == "CANCELLED"
    assert body["cancelled_at"] is not None
    release.assert_called_once_with(errand["credit_reservation_id"], errand["id"], errand["credit_value"])
    with factory() as db:
        stored = db.get(Errand, errand["id"])
        assert stored.status == ErrandStatus.CANCELLED
        assert stored.cancelled_at is not None
        assert stored.courier_id is None
    event = assert_single_event(factory, "errand.cancelled", errand["id"])
    assert event["requesterId"] == claims["sub"]
    assert event["creditValue"] == errand["credit_value"]
    assert event["cancelledAt"] is not None


def test_non_requester_cannot_cancel(endpoint):
    client, _, factory, release = endpoint
    errand = seed(factory)
    assert post(client, errand["id"]).status_code == 403
    release.assert_not_called()
    assert_open(factory, errand["id"])


@pytest.mark.parametrize("state", [state for state in ErrandStatus if state != ErrandStatus.OPEN])
def test_non_open_errand_cannot_be_cancelled(endpoint, state):
    client, claims, factory, release = endpoint
    errand = own_errand(claims, factory, status=state)
    assert post(client, errand["id"]).status_code == 409
    release.assert_not_called()
    with factory() as db:
        assert db.get(Errand, errand["id"]).status == state


def test_expired_errand_does_not_release_credits(endpoint):
    client, claims, factory, release = endpoint
    errand = own_errand(claims, factory, expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    assert post(client, errand["id"]).status_code == 409
    release.assert_not_called()
    assert_open(factory, errand["id"])


def test_already_assigned_open_errand_is_rejected(endpoint):
    client, claims, factory, release = endpoint
    errand = own_errand(claims, factory, courier_id=uuid4())
    assert post(client, errand["id"]).status_code == 409
    release.assert_not_called()


def test_unknown_errand(endpoint):
    client, _, _, release = endpoint
    assert post(client, uuid4()).status_code == 404
    release.assert_not_called()


def test_repeated_cancellation_does_not_release_twice(endpoint):
    client, claims, factory, release = endpoint
    errand = own_errand(claims, factory)
    assert post(client, errand["id"]).status_code == 200
    assert post(client, errand["id"]).status_code == 409
    release.assert_called_once()


def test_failed_release_rolls_back_and_allows_retry(endpoint):
    client, claims, factory, release = endpoint
    errand = own_errand(claims, factory)
    release.side_effect = HTTPException(503, "Credit unavailable")
    response = post(client, errand["id"])
    assert response.status_code == 503
    assert_open(factory, errand["id"])
    release.side_effect = None
    assert post(client, errand["id"]).status_code == 200


def test_release_exception_rolls_back(endpoint):
    client, claims, factory, release = endpoint
    errand = own_errand(claims, factory)
    release.side_effect = RuntimeError("Release unavailable")
    with pytest.raises(RuntimeError, match="Release unavailable"):
        post(client, errand["id"])
    assert_open(factory, errand["id"])


def test_commit_failure_rolls_back_cancellation(endpoint):
    client, claims, factory, release = endpoint
    errand = own_errand(claims, factory)

    def reject_commit(session):
        if any(isinstance(row, Errand) and row.status == ErrandStatus.CANCELLED for row in session.dirty):
            raise RuntimeError("Commit failed")

    event.listen(factory, "before_commit", reject_commit)
    try:
        with pytest.raises(RuntimeError, match="Commit failed"):
            post(client, errand["id"])
    finally:
        event.remove(factory, "before_commit", reject_commit)
    release.assert_called_once()
    assert_open(factory, errand["id"])


@pytest.mark.parametrize("body", [{}, {"errand_id": "invalid"}, {"errand_id": None},
    {"errand_id": str(uuid4()), "requester_id": str(uuid4())}])
def test_invalid_request_does_not_release(endpoint, body):
    client, _, _, release = endpoint
    response = client.post("/errand/cancel", json=body, headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 422
    release.assert_not_called()


def test_invalid_subject(endpoint):
    client, claims, _, release = endpoint
    claims["sub"] = "invalid"
    assert post(client, uuid4()).status_code == 401
    release.assert_not_called()


def test_authentication_required(endpoint):
    client, _, _, release = endpoint
    app.dependency_overrides.pop(cancel_errand.verified_claims)
    response = client.post("/errand/cancel", json={"errand_id": str(uuid4())})
    assert response.status_code in (401, 403)
    release.assert_not_called()


@pytest.mark.parametrize("other_action", ["cancel", "accept"])
def test_concurrent_postgres_transition_has_one_winner(postgres_database, monkeypatch, other_action):
    factory = postgres_database
    monkeypatch.setattr(cancel_errand, "SessionLocal", factory)
    release = Mock(return_value=True)
    credit_client = Mock(release=release)
    monkeypatch.setattr(credit_operations, "CreditClient", lambda token: credit_client)
    errand = seed(factory)
    barrier = Barrier(2)

    def attempt(action):
        barrier.wait(timeout=10)
        try:
            if action == "cancel":
                response = cancel_errand.cancel_errand_request(
                    cancel_errand.CancelErrandRequest(errand_id=errand["id"]),
                    {"sub": str(errand["requester_id"])},
                    HTTPAuthorizationCredentials(scheme="Bearer", credentials="test-token"),
                )
            else:
                response = accept_errand.accept_errand_request(
                    accept_errand.AcceptErrandRequest(errand_id=errand["id"]),
                    {"sub": str(uuid4())},
                )
            return 200, response.status
        except HTTPException as exc:
            return exc.status_code, None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, ["cancel", other_action]))
    assert sorted(code for code, _ in results) == [200, 409]
    winner_status = next(state for code, state in results if code == 200)
    assert release.call_count == (1 if winner_status == ErrandStatus.CANCELLED else 0)
    expected_event = "errand.cancelled" if winner_status == ErrandStatus.CANCELLED else "errand.accepted"
    assert_single_event(factory, expected_event, errand["id"])
    with factory() as db:
        stored = db.get(Errand, errand["id"])
        assert stored.status == winner_status
        if winner_status == ErrandStatus.CANCELLED:
            assert stored.cancelled_at is not None
            assert stored.courier_id is None
        else:
            assert stored.courier_id is not None
            assert stored.cancelled_at is None


