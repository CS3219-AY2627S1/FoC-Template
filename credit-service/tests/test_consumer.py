# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-15
# Scope: Added consumer tests for deduplication, retries and dead-lettering, including
# database outages.
# Author review: I validated correctness and supplied additional boundary checks.

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError

from app.core.config import Settings
from app.credits.consumer import (
    ATTEMPT_HEADER,
    EventProcessor,
    InvalidEvent,
    parse_event,
    queue_names,
)
from app.credits.errors import IdentityConflict, UnknownReservation, WalletNotReady
from app.credits.schemas import OrderTerminal, UserRegistered
from tests.credit_fakes import FakeChannel, FakeLedger, FakeMessage

SETTINGS = Settings(_env_file=None, initial_credit_allocation=20, consumer_max_attempts=3)


def registration() -> dict:
    return {
        "eventId": str(uuid4()),
        "eventType": "user.registered.v1",
        "userId": str(uuid4()),
        "occurredAt": datetime.now(UTC).isoformat(),
    }


def completion() -> dict:
    return {
        "eventId": str(uuid4()),
        "eventType": "order.completed.v1",
        "orderId": str(uuid4()),
        "reservationId": str(uuid4()),
        "occurredAt": datetime.now(UTC).isoformat(),
        "requesterId": str(uuid4()),
        "courierId": str(uuid4()),
        "amount": 5,
    }


def message(payload: dict, amqp_type: str | None = None, attempt: int | None = None):
    headers = {ATTEMPT_HEADER: attempt} if attempt else {}
    return FakeMessage(json.dumps(payload).encode(), amqp_type or payload["eventType"], headers)


def processor(ledger):
    channel = FakeChannel()
    return EventProcessor(ledger, SETTINGS, channel), channel.default_exchange


def test_queue_names_follow_configured_main_queue():
    assert queue_names(SETTINGS) == (
        "credit-service.events",
        "credit-service.events.retry",
        "credit-service.events.dlq",
    )


def test_parse_accepts_producer_payloads():
    assert isinstance(
        parse_event(json.dumps(registration()).encode(), "user.registered.v1"), UserRegistered
    )
    assert isinstance(
        parse_event(json.dumps(completion()).encode(), "order.completed.v1"), OrderTerminal
    )


@pytest.mark.parametrize(
    "body, amqp_type",
    [
        (json.dumps(registration()).encode(), "order.completed.v1"),
        (json.dumps({**registration(), "email": "x@example.com"}).encode(), "user.registered.v1"),
        (json.dumps({**completion(), "amount": None}).encode(), "order.completed.v1"),
        (json.dumps({**registration(), "eventType": "user.x.v1"}).encode(), "user.x.v1"),
        (b"not json", "user.registered.v1"),
        (b"[]", "user.registered.v1"),
    ],
)
def test_parse_rejects_invalid_events(body, amqp_type):
    with pytest.raises(InvalidEvent):
        parse_event(body, amqp_type)


async def test_registration_is_applied_then_acked():
    ledger = FakeLedger()
    handler, exchange = processor(ledger)
    msg = message(registration())
    await handler.handle(msg)
    assert msg.acked and exchange.published == []
    assert ledger.calls[0][0] == "allocate" and ledger.calls[0][2] == 1


async def test_terminal_event_is_settled_with_its_attempt():
    ledger = FakeLedger()
    handler, _ = processor(ledger)
    msg = message(completion(), attempt=2)
    await handler.handle(msg)
    assert msg.acked and ledger.calls[0][0] == "settle" and ledger.calls[0][2] == 2


async def test_duplicate_is_acked_without_side_effects():
    ledger = FakeLedger()
    ledger.outcome = "DUPLICATE"
    handler, exchange = processor(ledger)
    msg = message(registration())
    await handler.handle(msg)
    assert msg.acked and exchange.published == []
    assert ledger.failures == []


async def test_invalid_event_goes_straight_to_dlq():
    ledger = FakeLedger()
    handler, exchange = processor(ledger)
    msg = message(registration(), amqp_type="order.failed.v1")
    await handler.handle(msg)
    assert msg.acked
    republished, queue = exchange.published[0]
    assert queue == "credit-service.events.dlq"
    assert republished.headers["x-foc-error"] == "INVALID_EVENT"
    assert republished.body == msg.body and republished.type == msg.type
    assert ledger.failures[0]["dead_lettered"] is True
    assert ledger.failures[0]["event_id"] is None


@pytest.mark.parametrize("error", [UnknownReservation(), IdentityConflict()])
async def test_permanent_business_conflict_goes_to_dlq(error):
    ledger = FakeLedger()
    ledger.error = error
    handler, exchange = processor(ledger)
    await handler.handle(message(completion()))
    assert exchange.published[0][1] == "credit-service.events.dlq"
    assert ledger.failures[0]["error_code"] == error.code


@pytest.mark.parametrize(
    "error", [WalletNotReady(), OperationalError("select", {}, Exception("down"))]
)
async def test_temporary_failure_is_retried_with_incremented_attempt(error):
    ledger = FakeLedger()
    ledger.error = error
    handler, exchange = processor(ledger)
    payload = registration()
    msg = message(payload, attempt=1)
    await handler.handle(msg)
    republished, queue = exchange.published[0]
    assert msg.acked and queue == "credit-service.events.retry"
    assert republished.headers[ATTEMPT_HEADER] == 2
    assert ledger.failures[0]["dead_lettered"] is False
    assert str(ledger.failures[0]["event_id"]) == payload["eventId"]


async def test_temporary_failure_at_max_attempts_is_dead_lettered():
    ledger = FakeLedger()
    ledger.error = WalletNotReady()
    handler, exchange = processor(ledger)
    await handler.handle(message(registration(), attempt=3))
    republished, queue = exchange.published[0]
    assert queue == "credit-service.events.dlq"
    assert republished.headers[ATTEMPT_HEADER] == 3


async def test_message_is_not_acked_when_republish_fails():
    # M6NFR1.3: if the copy is not confirmed, the original stays unacked and is redelivered.
    ledger = FakeLedger()
    ledger.error = WalletNotReady()
    handler, exchange = processor(ledger)
    exchange.error = ConnectionError("broker down")
    msg = message(registration())
    with pytest.raises(ConnectionError):
        await handler.handle(msg)
    assert not msg.acked


async def test_failure_record_outage_does_not_block_acknowledgement():
    ledger = FakeLedger()
    ledger.error = UnknownReservation()

    async def unavailable(**values):
        raise OperationalError("insert", {}, Exception("down"))

    ledger.record_failure = unavailable
    handler, exchange = processor(ledger)
    msg = message(completion())
    await handler.handle(msg)
    assert msg.acked and exchange.published[0][1] == "credit-service.events.dlq"


@pytest.mark.parametrize(
    "error",
    [
        ConnectionRefusedError("database down"),
        DBAPIError("select", {}, Exception("connection lost"), connection_invalidated=True),
    ],
)
async def test_database_outage_keeps_retrying_past_max_attempts(error):
    # M6NFR1.3: an unreachable database is never dead-lettered, so no replay is needed.
    ledger = FakeLedger()
    ledger.error = error
    handler, exchange = processor(ledger)
    await handler.handle(message(completion(), attempt=SETTINGS.consumer_max_attempts + 2))
    republished, queue = exchange.published[0]
    assert queue == "credit-service.events.retry"
    assert republished.headers["x-foc-error"] == "STORAGE_UNAVAILABLE"
    assert ledger.failures[0]["dead_lettered"] is False


async def test_other_storage_errors_stay_bounded():
    # A bug or constraint violation must not loop forever: retried, then dead-lettered.
    error = IntegrityError("insert", {}, Exception("violates constraint"))
    ledger = FakeLedger()
    ledger.error = error
    handler, exchange = processor(ledger)
    await handler.handle(message(registration(), attempt=1))
    await handler.handle(message(registration(), attempt=SETTINGS.consumer_max_attempts))
    (first, first_queue), (last, last_queue) = exchange.published
    assert first_queue == "credit-service.events.retry"
    assert last_queue == "credit-service.events.dlq"
    assert first.headers["x-foc-error"] == last.headers["x-foc-error"] == "STORAGE_ERROR"
