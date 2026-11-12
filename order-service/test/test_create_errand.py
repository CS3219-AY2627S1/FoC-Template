# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
# Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from main.credit_client import Reservation

from main.app import app
from main import create_errand
from main.database import Base
from main.models import Errand
from test.outbox_support import assert_single_event, outbox_events


REQUESTER_ID = uuid4()
SUPPLIER_ID = uuid4()
BUILDING_ID = uuid4()
AUTH_HEADERS = {"Authorization": "Bearer test-token"}


@pytest.fixture
def payload():
    return {
        "supplier_id": str(SUPPLIER_ID),
        "required_item": "Two sandwiches and one coffee",
        "credit_value": 10,
        "delivery_building_id": str(BUILDING_ID),
        "delivery_floor": "3",
        "delivery_description": "Outside room 03-12",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }


@pytest.fixture
def endpoint(monkeypatch):
    claims = {"sub": str(REQUESTER_ID), "type": "Student"}
    events = []

    async def supplier(*args):
        events.append("supplier")
        return True

    async def credit(*args):
        events.append("credit")
        return True

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(create_errand, "SessionLocal", factory)
    original_insert = create_errand.insert_errand

    def reserve(requester_id, order_id, amount):
        events.append("reserve")
        return Reservation(reservationId=uuid4(), orderId=order_id, amount=amount, status="HELD")

    def save(*args):
        events.append("insert")
        return original_insert(*args)

    mocks = {
        "supplier": AsyncMock(side_effect=supplier),
        "credit": AsyncMock(side_effect=credit),
        "reserve": Mock(side_effect=reserve),
        "insert": Mock(side_effect=save),
    }
    monkeypatch.setattr(create_errand, "verify_supplier", mocks["supplier"])
    monkeypatch.setattr(create_errand, "verify_credit_value", mocks["credit"])
    monkeypatch.setattr(create_errand, "insert_errand", mocks["insert"])
    credit_client = Mock(reserve=mocks["reserve"])
    monkeypatch.setattr(create_errand, "CreditClient", lambda token: credit_client)

    previous = app.dependency_overrides.copy()
    app.dependency_overrides[create_errand.verified_claims] = lambda: claims
    try:
        with TestClient(app) as client:
            yield client, mocks, claims, events
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
        engine.dispose()


def test_create_errand_verifies_then_reserves_then_inserts(endpoint, payload):
    client, mocks, _, events = endpoint
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 201
    body = response.json()
    assert body["supplier_id"] == str(SUPPLIER_ID)
    assert body["required_item"] == payload["required_item"]
    assert body["requester_id"] == str(REQUESTER_ID)
    assert body["status"] == "OPEN"
    assert body["courier_id"] is None
    assert body["credit_value"] == 10
    assert events == ["supplier", "credit", "reserve", "insert"]
    mocks["supplier"].assert_awaited_once_with(str(SUPPLIER_ID), "test-token")
    mocks["credit"].assert_awaited_once_with(10, "test-token")
    mocks["reserve"].assert_called_once_with(REQUESTER_ID, create_errand.UUID(body["id"]), 10)
    request, requester_id = mocks["insert"].call_args.args[:2]
    assert request.supplier_id == SUPPLIER_ID
    assert requester_id == REQUESTER_ID


@pytest.mark.parametrize("check,code", [("supplier", 422), ("credit", 409), ("reserve", 409)])
def test_failed_check_prevents_insert(endpoint, payload, check, code):
    client, mocks, _, _ = endpoint
    mocks[check].side_effect = None
    mocks[check].return_value = False
    if check == "reserve":
        mocks[check].side_effect = HTTPException(409, "Insufficient credits")
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == code
    mocks["insert"].assert_not_called()
    if check == "supplier":
        mocks["credit"].assert_not_awaited()
    if check != "reserve":
        mocks["reserve"].assert_not_called()


def test_supplier_unavailable_prevents_reservation(endpoint, payload):
    client, mocks, _, _ = endpoint
    mocks["supplier"].side_effect = HTTPException(503, "Supplier Service is unavailable")
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 503
    mocks["credit"].assert_not_awaited()
    mocks["reserve"].assert_not_called()
    mocks["insert"].assert_not_called()


@pytest.mark.parametrize("field,value", [
    ("supplier_id", "invalid"),
    ("required_item", ""),
    ("required_item", "  \t\n  "),
    ("required_item", None),
    ("required_item", 123),
    ("delivery_building_id", "invalid"),
    ("credit_value", 0),
    ("credit_value", -1),
    ("credit_value", 1.5),
    ("credit_value", True),
    ("delivery_floor", "x" * 21),
    ("delivery_description", "x" * 501),
    ("expires_at", "2020-01-01T00:00:00Z"),
    ("expires_at", "2026-10-06T18:00:00"),
    ("requester_id", str(uuid4())),
    ("status", "COMPLETED"),
])
def test_invalid_input_prevents_side_effects(endpoint, payload, field, value):
    client, mocks, _, _ = endpoint
    payload[field] = value
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422
    mocks["supplier"].assert_not_awaited()
    mocks["credit"].assert_not_awaited()
    mocks["reserve"].assert_not_called()
    mocks["insert"].assert_not_called()


@pytest.mark.parametrize("field", ["supplier_id", "required_item", "credit_value", "delivery_building_id", "expires_at"])
def test_missing_required_input(endpoint, payload, field):
    client, mocks, _, _ = endpoint
    del payload[field]
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422
    mocks["reserve"].assert_not_called()
    mocks["insert"].assert_not_called()


def test_invalid_requester_prevents_reservation(endpoint, payload):
    client, mocks, claims, _ = endpoint
    claims["sub"] = "invalid"
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 401
    mocks["reserve"].assert_not_called()
    mocks["insert"].assert_not_called()


def test_authentication_required(endpoint, payload):
    client, mocks, _, _ = endpoint
    response = client.post("/errand/create", json=payload)
    assert response.status_code in (401, 403)
    mocks["reserve"].assert_not_called()
    mocks["insert"].assert_not_called()


def test_insert_errand_passes_supplier_and_lifecycle_fields_to_session(monkeypatch, payload):
    session = Mock()
    transaction = Mock()
    transaction.__enter__ = Mock(return_value=session)
    transaction.__exit__ = Mock(return_value=False)
    factory = Mock()
    factory.begin.return_value = transaction
    monkeypatch.setattr(create_errand, "SessionLocal", factory)

    request = create_errand.CreateErrandRequest(**payload)
    response = create_errand.insert_errand(request, REQUESTER_ID)

    errand, outbox_event = (call.args[0] for call in session.add.call_args_list)
    assert errand.supplier_id == SUPPLIER_ID
    assert errand.requester_id == REQUESTER_ID
    assert errand.courier_id is None
    assert errand.accepted_at is None
    assert errand.status == create_errand.ErrandStatus.OPEN
    assert errand.created_at.tzinfo is not None
    assert response.id == errand.id
    assert outbox_event.type == "errand.created"
    assert outbox_event.aggregateid == str(errand.id)
    session.flush.assert_called_once()
    transaction.__exit__.assert_called_once_with(None, None, None)


@pytest.fixture
def database_session_factory(monkeypatch):
    # Isolated local database for persistence/transaction behavior, not PG DDL.
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(create_errand, "SessionLocal", factory)
    try:
        yield factory
    finally:
        engine.dispose()


def test_insert_errand_persists_supplier_id(database_session_factory, payload):
    request = create_errand.CreateErrandRequest(**payload)
    response = create_errand.insert_errand(request, REQUESTER_ID)
    with database_session_factory() as session:
        stored = session.get(Errand, response.id)
        assert stored is not None
        assert stored.supplier_id == SUPPLIER_ID
        assert stored.required_item == payload["required_item"]
        assert stored.requester_id == REQUESTER_ID
        assert stored.delivery_building_id == BUILDING_ID
        assert stored.credit_value == 10
        assert stored.status == create_errand.ErrandStatus.OPEN
        assert stored.courier_id is None


def test_insert_errand_records_created_event(database_session_factory, payload):
    response = create_errand.insert_errand(create_errand.CreateErrandRequest(**payload), REQUESTER_ID)

    event = assert_single_event(database_session_factory, "errand.created", response.id)
    assert event["errandId"] == str(response.id)
    assert event["requesterId"] == str(REQUESTER_ID)
    assert event["supplierId"] == str(SUPPLIER_ID)
    assert event["creditValue"] == 10
    assert event["expiresAt"] and event["createdAt"]


def test_failed_commit_rolls_back_insert(database_session_factory, payload):
    def reject_commit(session):
        raise RuntimeError("Commit failed")

    event.listen(database_session_factory, "before_commit", reject_commit)
    try:
        with pytest.raises(RuntimeError, match="Commit failed"):
            create_errand.insert_errand(
                create_errand.CreateErrandRequest(**payload), REQUESTER_ID
            )
    finally:
        event.remove(database_session_factory, "before_commit", reject_commit)

    with database_session_factory() as session:
        assert session.scalars(select(Errand)).all() == []
    assert outbox_events(database_session_factory) == []


@pytest.fixture
def clock(monkeypatch):
    class Clock:
        value = datetime(2030, 1, 1, tzinfo=timezone.utc)

        @classmethod
        def now(cls, tz=None):
            return cls.value.astimezone(tz or timezone.utc)

    monkeypatch.setattr(create_errand, "datetime", Clock)
    return Clock


@pytest.mark.parametrize("offset,expected", [
    (timedelta(0), 422),
    (timedelta(microseconds=-1), 422),
    (timedelta(seconds=1), 201),
    (timedelta(days=7), 201),
    (timedelta(days=7, microseconds=1), 422),
    (timedelta(days=8), 422),
])
def test_expiry_window(endpoint, payload, clock, offset, expected):
    client, mocks, _, _ = endpoint
    payload["expires_at"] = (clock.value + offset).isoformat()
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == expected
    if expected == 422:
        assert response.json()["detail"][0]["loc"] == ["body", "expires_at"]
        mocks["supplier"].assert_not_awaited()
        mocks["credit"].assert_not_awaited()
        mocks["reserve"].assert_not_called()
        mocks["insert"].assert_not_called()


def test_expiry_window_respects_timezone_offset(endpoint, payload, clock):
    client, _, _, _ = endpoint
    expires = (clock.value + timedelta(days=7)).astimezone(
        timezone(timedelta(hours=8))
    )
    payload["expires_at"] = expires.isoformat()
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 201


def test_expired_during_checks_does_not_reserve(endpoint, payload, clock):
    client, mocks, _, _ = endpoint
    payload["expires_at"] = (clock.value + timedelta(seconds=1)).isoformat()

    async def slow_credit_check(*args):
        clock.value += timedelta(seconds=2)
        return True

    mocks["credit"].side_effect = slow_credit_check
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422
    mocks["reserve"].assert_not_called()
    mocks["insert"].assert_not_called()


def test_required_item_is_trimmed(endpoint, payload):
    client, mocks, _, _ = endpoint
    payload["required_item"] = "  Two sandwiches  "
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 201
    assert response.json()["required_item"] == "Two sandwiches"
    assert mocks["insert"].call_args.args[0].required_item == "Two sandwiches"


def test_insert_rejects_expiry_over_one_week(database_session_factory, payload, clock):
    payload["expires_at"] = (clock.value + timedelta(days=8)).isoformat()
    with pytest.raises(HTTPException) as error:
        create_errand.insert_errand(
            create_errand.CreateErrandRequest(**payload), REQUESTER_ID
        )
    assert error.value.status_code == 422
    with database_session_factory() as session:
        assert session.scalars(select(Errand)).all() == []


@pytest.mark.parametrize("item", [None, "", "   "])
def test_database_rejects_missing_or_blank_item(database_session_factory, payload, item):
    with pytest.raises(IntegrityError):
        with database_session_factory.begin() as session:
            session.add(Errand(
                id=uuid4(),
                requester_id=REQUESTER_ID,
                supplier_id=SUPPLIER_ID,
                required_item=item,
                credit_value=10,
                delivery_building_id=BUILDING_ID,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                created_at=datetime.now(timezone.utc),
            ))


