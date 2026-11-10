# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
# Scope: Added tests for the dead-letter replay command.
# Author review: I validated correctness and supplied additional boundary checks.

from app.credits.consumer import ATTEMPT_HEADER
from app.credits.replay import ERROR_HEADER, describe, replay_copy
from tests.credit_fakes import FakeMessage


def dead_lettered() -> FakeMessage:
    body = b'{"eventId": "e-1", "eventType": "order.completed.v1"}'
    return FakeMessage(
        body, "order.completed.v1", {ATTEMPT_HEADER: 5, ERROR_HEADER: "STORAGE_ERROR", "x-o": 1}
    )


def test_replay_copy_is_a_fresh_first_attempt_of_the_same_event():
    original = dead_lettered()
    copy = replay_copy(original)
    assert copy.body == original.body and copy.type == original.type
    assert copy.message_id == original.message_id
    assert copy.headers == {"x-o": 1, ATTEMPT_HEADER: 1}
    assert copy.delivery_mode.value == 2  # persistent


def test_describe_shows_what_an_operator_needs():
    assert describe(dead_lettered()) == (
        "event_id=e-1 type=order.completed.v1 attempts=5 error=STORAGE_ERROR"
    )
    assert "event_id=message-1" in describe(FakeMessage(b"not json", None))
