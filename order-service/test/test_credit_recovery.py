# AI Assistance Disclosure (contributor use):
# Tool: OpenAI Codex (model not recorded), dates: 2026-10-02–2026-10-22
# Scope: Implementation, debugging, refactoring, and test assistance for Order Service modules.
# Author review: I reviewed, adapted, and tested the code. Architecture and decision-rationale assistance is not attributed.

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import event, select

from main import cancel_errand, create_errand, credit_operations
from main.models import CreditOperation, Errand, ErrandStatus
from test.test_create_errand import endpoint, payload, AUTH_HEADERS
from test.test_cancel_errand import endpoint as cancel_endpoint, database, own_errand, post
from test.outbox_support import outbox_events


def test_creation_retry_reuses_errand_and_reservation(endpoint, payload):
    client, mocks, _, _ = endpoint
    headers = {**AUTH_HEADERS, "Idempotency-Key": "same-operation"}
    first = client.post("/errand/create", json=payload, headers=headers)
    second = client.post("/errand/create", json=payload, headers=headers)
    assert first.status_code == second.status_code == 201
    # PostgreSQL retains tzinfo; the SQLite test database does not.
    first_body, second_body = first.json(), second.json()
    for field in ("created_at", "expires_at"):
        assert datetime.fromisoformat(first_body.pop(field)).replace(tzinfo=timezone.utc) == datetime.fromisoformat(second_body.pop(field)).replace(tzinfo=timezone.utc)
    assert first_body == second_body
    mocks["reserve"].assert_called_once()
    mocks["insert"].assert_called_once()
    with create_errand.SessionLocal() as db:
        stored = db.get(Errand, UUID(first.json()["id"]))
        assert stored.credit_reservation_id is not None
        operation = db.scalar(select(CreditOperation))
        assert operation.state == "SUCCEEDED"
        assert operation.reservation_id == stored.credit_reservation_id


def test_idempotency_key_cannot_change_payload(endpoint, payload):
    client, mocks, _, _ = endpoint
    headers = {**AUTH_HEADERS, "Idempotency-Key": "same-operation"}
    assert client.post("/errand/create", json=payload, headers=headers).status_code == 201
    assert client.post("/errand/create", json={**payload, "credit_value": 11}, headers=headers).status_code == 409
    mocks["reserve"].assert_called_once()


def test_creation_timeout_retains_intent_and_retries_same_order_id(endpoint, payload):
    client, mocks, _, _ = endpoint
    headers = {**AUTH_HEADERS, "Idempotency-Key": "lost-reserve-response"}
    original = mocks["reserve"].side_effect
    mocks["reserve"].side_effect = HTTPException(503, "Response lost after reserve")
    assert client.post("/errand/create", json=payload, headers=headers).status_code == 503
    first_args = mocks["reserve"].call_args
    mocks["reserve"].side_effect = original
    assert client.post("/errand/create", json=payload, headers=headers).status_code == 201
    assert mocks["reserve"].call_args == first_args


def test_failed_creation_compensates_and_records_aborted_intent(endpoint, payload, monkeypatch):
    client, mocks, _, _ = endpoint
    release = Mock()
    reserve = mocks["reserve"]
    monkeypatch.setattr(create_errand, "CreditClient", lambda token: Mock(reserve=reserve, release=release))
    mocks["insert"].side_effect = RuntimeError("DB insert failed")
    response = client.post("/errand/create", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 409
    release.assert_called_once()
    with create_errand.SessionLocal() as db:
        operation = db.scalar(select(CreditOperation))
        assert operation.state == "ABORTED"
        assert db.get(Errand, operation.errand_id) is None
    assert outbox_events(create_errand.SessionLocal) == []


def test_failed_compensation_is_durable_and_retryable(endpoint, payload, monkeypatch):
    client, mocks, _, _ = endpoint
    release = Mock(side_effect=HTTPException(503, "Release unavailable"))
    monkeypatch.setattr(create_errand, "CreditClient", lambda token: Mock(reserve=mocks["reserve"], release=release))
    mocks["insert"].side_effect = RuntimeError("Insert failed")
    headers = {**AUTH_HEADERS, "Idempotency-Key": "retry-cleanup"}
    assert client.post("/errand/create", json=payload, headers=headers).status_code == 503
    with create_errand.SessionLocal() as db:
        assert db.scalar(select(CreditOperation)).state == "COMPENSATING"
    release.side_effect = None
    assert client.post("/errand/create", json=payload, headers=headers).status_code == 409
    mocks["reserve"].assert_called_once()
    with create_errand.SessionLocal() as db:
        assert db.scalar(select(CreditOperation)).state == "ABORTED"


def test_pending_cancellation_blocks_acceptance_and_conflicting_actions(cancel_endpoint):
    client, claims, factory, release = cancel_endpoint
    target = own_errand(claims, factory)
    release.side_effect = HTTPException(503, "Response lost")
    assert post(client, target["id"]).status_code == 503
    with factory() as db:
        assert db.get(Errand, target["id"]).pending_credit_action == "CANCEL"
    with pytest.raises(HTTPException) as error:
        credit_operations.prepare_terminal(factory, target["id"], UUID(claims["sub"]), "COMPLETE")
    assert error.value.status_code == 409
    # The original operation remains recoverable even after its deadline.
    with factory.begin() as db:
        db.get(Errand, target["id"]).expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    release.side_effect = None
    assert post(client, target["id"]).status_code == 200
    assert release.call_args_list[0] == release.call_args_list[1]


def test_legacy_errand_without_reservation_is_rejected(cancel_endpoint):
    client, claims, factory, release = cancel_endpoint
    target = own_errand(claims, factory, credit_reservation_id=None)
    assert post(client, target["id"]).status_code == 409
    release.assert_not_called()


def test_final_commit_failure_preserves_intent_and_can_retry(cancel_endpoint):
    client, claims, factory, release = cancel_endpoint
    target = own_errand(claims, factory)

    def fail_final_commit(db):
        if any(isinstance(row, Errand) and row.status == ErrandStatus.CANCELLED for row in db.dirty):
            raise RuntimeError("Final commit failed")

    event.listen(factory, "before_commit", fail_final_commit)
    try:
        with pytest.raises(RuntimeError, match="Final commit failed"):
            post(client, target["id"])
    finally:
        event.remove(factory, "before_commit", fail_final_commit)
    with factory() as db:
        assert db.get(Errand, target["id"]).pending_credit_action == "CANCEL"
        assert db.scalar(select(CreditOperation)).state == "PENDING"
    assert outbox_events(factory) == []
    assert post(client, target["id"]).status_code == 200
    assert release.call_args_list[0] == release.call_args_list[1]


