# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Added or extended tests for registration and bootstrap outbox publication.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import select, update

from app.core.config import Settings
from app.db import Database
from app.main import create_app
from app.models import OutboxEvent, OutboxEventState
from app.outbox.events import SafeOutboxEvent
from app.outbox.worker import OutboxWorker


@dataclass
class RecordingOtpSender:
    sent: list[tuple[str, str, datetime]] = field(default_factory=list)

    async def send_verification_code(
        self,
        *,
        recipient: str,
        otp: str,
        expires_at: datetime,
    ) -> None:
        self.sent.append((recipient, otp, expires_at))


@dataclass
class RecordingPublisher:
    failures_remaining: int = 0
    failure_event_id: UUID | None = None
    events: list[SafeOutboxEvent] = field(default_factory=list)

    async def publish(self, event: SafeOutboxEvent) -> None:
        if self.failures_remaining and (
            self.failure_event_id is None or event.event_id == self.failure_event_id
        ):
            self.failures_remaining -= 1
            raise RuntimeError("simulated publish outage")
        self.events.append(event)

    async def close(self) -> None:
        return None


async def read_one(database: Database, statement):
    async for session in database.session():
        return await session.scalar(statement)
    raise AssertionError("The test database did not provide a session.")


async def publish_until_attempted(
    database: Database,
    worker: OutboxWorker,
    event_id: UUID,
    *,
    attempts: int = 1,
) -> OutboxEvent:
    """Allow bootstrap and other registrations to precede the test event."""
    while True:
        assert await worker.publish_available_once()
        event = await read_one(
            database, select(OutboxEvent).where(OutboxEvent.event_id == event_id),
        )
        assert event is not None
        if event.publish_attempts >= attempts:
            return event


async def register_and_verify(database: Database, sender: RecordingOtpSender) -> tuple[str, str]:
    test_id = uuid4().hex[:12]
    registration = {
        "username": f"Phase6User-{test_id}",
        "email": f"phase6-user-{test_id}@u.nus.edu",
        "password": "SecurePass1!",
    }
    app = create_app(
        settings=Settings(
            _env_file=None,
            environment="test",
            otp_hmac_secret=SecretStr("test-only-otp-hmac-secret"),
            bcrypt_rounds=4,
        ),
        database=database,
        otp_sender=sender,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.post("/v1/auth/registrations", json=registration)).status_code == 202
        verified = await client.post(
            "/v1/auth/email-verifications",
            json={"email": registration["email"], "otp": sender.sent[0][1]},
        )
    assert verified.status_code == 201
    return registration["email"], verified.json()["userId"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_outbox_publishes_only_safe_registration_fields_after_verification() -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    sender = RecordingOtpSender()
    publisher = RecordingPublisher()
    try:
        email, user_id = await register_and_verify(database, sender)
        event = await read_one(
            database,
            select(OutboxEvent).where(OutboxEvent.aggregate_id == user_id),
        )
        assert event is not None
        assert event.state == OutboxEventState.PENDING
        assert event.publish_attempts == 0

        worker = OutboxWorker(database, publisher, Settings(_env_file=None))
        published = await publish_until_attempted(database, worker, event.event_id)
        assert published is not None
        assert published.state == OutboxEventState.PUBLISHED
        assert published.publish_attempts == 1
        assert published.published_at is not None
        matching_events = [item for item in publisher.events if item.event_id == event.event_id]
        assert len(matching_events) == 1
        payload = matching_events[0].payload()
        assert set(payload) == {"eventId", "eventType", "userId", "occurredAt"}
        assert payload["eventId"] == str(event.event_id)
        assert payload["userId"] == user_id
        assert email not in json.dumps(payload)
        assert sender.sent[0][1] not in json.dumps(payload)
    finally:
        await database.dispose()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_outbox_retry_retains_event_and_reuses_its_event_id() -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    sender = RecordingOtpSender()
    publisher = RecordingPublisher(failures_remaining=1)
    settings = Settings(
        _env_file=None,
        outbox_retry_initial_delay_seconds=1,
        outbox_retry_max_delay_seconds=1,
    )
    try:
        _, user_id = await register_and_verify(database, sender)
        event = await read_one(
            database,
            select(OutboxEvent).where(OutboxEvent.aggregate_id == user_id),
        )
        assert event is not None
        publisher.failure_event_id = event.event_id
        worker = OutboxWorker(database, publisher, settings)

        retried = await publish_until_attempted(database, worker, event.event_id)
        assert retried is not None
        assert retried.state == OutboxEventState.PENDING
        assert retried.publish_attempts == 1
        assert retried.last_error_code == "RuntimeError"
        assert retried.lease_token is None
        assert retried.lease_expires_at is None

        async for session in database.session():
            async with session.begin():
                await session.execute(
                    update(OutboxEvent)
                    .where(OutboxEvent.event_id == event.event_id)
                    .values(next_attempt_at=datetime.now(UTC))
                )
            break
        published = await publish_until_attempted(
            database, worker, event.event_id, attempts=2,
        )
        assert published is not None
        assert published.state == OutboxEventState.PUBLISHED
        assert published.publish_attempts == 2
        matching_events = [item for item in publisher.events if item.event_id == event.event_id]
        assert len(matching_events) == 1
    finally:
        await database.dispose()
