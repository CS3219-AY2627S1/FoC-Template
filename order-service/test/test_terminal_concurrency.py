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
from datetime import datetime, timezone
from threading import Barrier
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from main import complete_errand, fail_errand, credit_operations
from main.models import Errand, ErrandStatus
from test.outbox_support import assert_single_event
from test.test_accept_errand import postgres_database, seed


@pytest.mark.parametrize("actions", [
    ("complete", "complete"), ("fail", "fail"), ("complete", "fail"),
])
def test_postgres_terminal_transition_has_one_winner(postgres_database, monkeypatch, actions):
    factory = postgres_database
    monkeypatch.setattr(complete_errand, "SessionLocal", factory)
    monkeypatch.setattr(fail_errand, "SessionLocal", factory)
    transfer, release = Mock(return_value=True), Mock(return_value=True)
    client = Mock(complete=transfer, release=release)
    monkeypatch.setattr(credit_operations, "CreditClient", lambda token: client)
    fields = seed(factory, status=ErrandStatus.ACCEPTED, courier_id=uuid4(),
                  accepted_at=datetime.now(timezone.utc))
    barrier = Barrier(2)

    def attempt(action):
        barrier.wait(timeout=10)
        claims = {"sub": str(fields["requester_id"])}
        try:
            if action == "complete":
                response = complete_errand.complete_errand_request(
                    complete_errand.CompleteErrandRequest(errand_id=fields["id"]), claims,
                    HTTPAuthorizationCredentials(scheme="Bearer", credentials="test-token")
                )
            else:
                response = fail_errand.fail_errand_request(
                    fail_errand.FailErrandRequest(errand_id=fields["id"], failure_reason="Missing items"),
                    claims, HTTPAuthorizationCredentials(scheme="Bearer", credentials="test-token"),
                )
            return 200, response.status
        except HTTPException as exc:
            return exc.status_code, None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, actions))
    assert sorted(code for code, _ in results) == [200, 409]
    winner = next(state for code, state in results if code == 200)
    assert transfer.call_count + release.call_count == 1
    assert transfer.call_count == (1 if winner == ErrandStatus.COMPLETED else 0)
    assert release.call_count == (1 if winner == ErrandStatus.FAILED else 0)
    expected_event = "errand.completed" if winner == ErrandStatus.COMPLETED else "errand.failed"
    assert_single_event(factory, expected_event, fields["id"])
    with factory() as db:
        stored = db.get(Errand, fields["id"])
        assert stored.status == winner
        assert stored.courier_id == fields["courier_id"]
        if winner == ErrandStatus.COMPLETED:
            assert stored.completed_at is not None
            assert stored.failed_at is None
            assert stored.failure_reason is None
        else:
            assert stored.failed_at is not None
            assert stored.completed_at is None
            assert stored.failure_reason == "Missing items"


