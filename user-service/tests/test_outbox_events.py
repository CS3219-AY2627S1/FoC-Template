# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Added or extended tests for registration event payloads.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from pydantic import SecretStr

from app.core.config import Settings
from app.db import Database
from app.outbox.events import USER_REGISTERED_EVENT_TYPE, SafeOutboxEvent
from app.outbox.worker import OutboxWorker


class NoopPublisher:
    async def publish(self, event: SafeOutboxEvent) -> None:
        return None

    async def close(self) -> None:
        return None


def test_registration_event_payload_has_only_the_four_safe_contract_fields() -> None:
    event = SafeOutboxEvent(
        event_id=UUID("11111111-1111-1111-1111-111111111111"),
        event_type=USER_REGISTERED_EVENT_TYPE,
        user_id=UUID("22222222-2222-2222-2222-222222222222"),
        occurred_at=datetime(2026, 9, 21, 8, 30, tzinfo=UTC),
    )

    assert event.payload() == {
        "eventId": "11111111-1111-1111-1111-111111111111",
        "eventType": "user.registered.v1",
        "userId": "22222222-2222-2222-2222-222222222222",
        "occurredAt": "2026-09-21T08:30:00Z",
    }


def test_outbox_retry_delay_is_exponential_and_bounded() -> None:
    settings = Settings(
        _env_file=None,
        rabbitmq_url=SecretStr("amqp://local-only"),
        outbox_retry_initial_delay_seconds=2,
        outbox_retry_max_delay_seconds=10,
    )
    worker = OutboxWorker(Database(None), NoopPublisher(), settings)

    assert [worker._retry_delay_seconds(attempt) for attempt in range(1, 5)] == [2, 4, 8, 10]
