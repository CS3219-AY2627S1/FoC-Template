# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Added or extended tests for filtering the D2 demo’s captured event.
# Author review: I validated correctness and added boundary checks where needed.

"""The demo must identify its registration even when bootstrap publishes first."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager, nullcontext
from types import SimpleNamespace

import pytest

from app.outbox.events import USER_REGISTERED_EVENT_TYPE
from scripts.run_d2_demo import EventCapture


class RecordingQueue:
    def __init__(self, payloads: list[dict[str, str]]) -> None:
        self.payloads = payloads
        self.consumed = 0
        self.closed = False

    @asynccontextmanager
    async def iterator(self):
        async def messages():
            for payload in self.payloads:
                self.consumed += 1
                yield SimpleNamespace(body=json.dumps(payload).encode(), process=nullcontext)

        try:
            yield messages()
        finally:
            self.closed = True


def registration_event(user_id: str) -> dict[str, str]:
    return {
        "eventId": f"event-{user_id}",
        "eventType": USER_REGISTERED_EVENT_TYPE,
        "userId": user_id,
        "occurredAt": "2026-10-07T00:00:00Z",
    }


async def test_capture_skips_bootstrap_and_returns_the_requested_registration() -> None:
    expected = registration_event("demo-user")
    queue = RecordingQueue([
        registration_event("bootstrap-user"), expected, registration_event("another-user"),
    ])
    capture = EventCapture(connection=None, queue=queue)

    assert await capture.receive_payload(expected_user_id="demo-user") == expected
    assert queue.consumed == 2
    assert queue.closed


async def test_capture_does_not_accept_bootstrap_when_demo_registration_is_missing() -> None:
    queue = RecordingQueue([registration_event("bootstrap-user")])
    capture = EventCapture(connection=None, queue=queue)

    with pytest.raises(RuntimeError, match="did not deliver the registration event"):
        await capture.receive_payload(expected_user_id="demo-user")
    assert queue.closed
