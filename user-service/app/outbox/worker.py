# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Implemented the registration outbox worker entry point.
# Author review: I validated correctness and added boundary checks where needed.

"""Lease-based outbox worker with observable, idempotency-safe retry behavior."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.logging import logger
from app.db import Database
from app.models import OutboxEvent, OutboxEventState
from app.outbox.events import SafeOutboxEvent
from app.outbox.publisher import EventPublisher, RabbitMqEventPublisher


@dataclass(frozen=True)
class ClaimedOutboxEvent:
    """One time-bounded claim that prevents simultaneous worker publication."""

    event: SafeOutboxEvent
    lease_token: UUID
    publish_attempts: int


class OutboxWorker:
    """Publish durable events after the identity transaction has committed."""

    def __init__(self, database: Database, publisher: EventPublisher, settings: Settings) -> None:
        self._database = database
        self._publisher = publisher
        self._settings = settings

    async def publish_available_once(self) -> bool:
        """Claim and process at most one event; return whether work was found."""

        async for session in self._database.session():
            return await self._publish_available_once(session)
        return False

    async def _publish_available_once(self, session: AsyncSession) -> bool:
        claimed = await self._claim_next(session)
        if claimed is None:
            return False
        try:
            await self._publisher.publish(claimed.event)
        except Exception as error:
            await self._schedule_retry(session, claimed, error)
        else:
            await self._mark_published(session, claimed)
        return True

    async def run_forever(self) -> None:
        """Publish continuously, retaining durable events when infrastructure fails."""

        try:
            while True:
                try:
                    processed = await self.publish_available_once()
                except Exception as error:
                    logger.exception(
                        "outbox worker iteration failed",
                        extra={
                            "event": "outbox_worker_iteration_failed",
                            "context": {"failureCode": type(error).__name__},
                        },
                    )
                    processed = False
                if not processed:
                    await asyncio.sleep(self._settings.outbox_poll_interval_seconds)
        finally:
            await self._publisher.close()

    async def _claim_next(self, session: AsyncSession) -> ClaimedOutboxEvent | None:
        now = datetime.now(UTC)
        lease_token = uuid4()
        async with session.begin():
            event = (
                await session.execute(
                    select(OutboxEvent)
                    .where(
                        OutboxEvent.state == OutboxEventState.PENDING,
                        OutboxEvent.next_attempt_at <= now,
                        or_(
                            OutboxEvent.lease_expires_at.is_(None),
                            OutboxEvent.lease_expires_at <= now,
                        ),
                    )
                    .order_by(OutboxEvent.occurred_at, OutboxEvent.event_id)
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
            ).scalar_one_or_none()
            if event is None:
                return None
            event.lease_token = lease_token
            event.lease_expires_at = now + timedelta(seconds=self._settings.outbox_lease_seconds)
            event.publish_attempts += 1
            event.last_error_code = None
            return ClaimedOutboxEvent(
                event=SafeOutboxEvent(
                    event_id=event.event_id,
                    event_type=event.event_type,
                    user_id=event.aggregate_id,
                    occurred_at=event.occurred_at,
                ),
                lease_token=lease_token,
                publish_attempts=event.publish_attempts,
            )

    async def _mark_published(self, session: AsyncSession, claimed: ClaimedOutboxEvent) -> None:
        now = datetime.now(UTC)
        async with session.begin():
            result = await session.execute(
                update(OutboxEvent)
                .where(
                    OutboxEvent.event_id == claimed.event.event_id,
                    OutboxEvent.lease_token == claimed.lease_token,
                    OutboxEvent.state == OutboxEventState.PENDING,
                )
                .values(
                    state=OutboxEventState.PUBLISHED,
                    published_at=now,
                    lease_token=None,
                    lease_expires_at=None,
                    last_error_code=None,
                )
            )
        if result.rowcount != 1:
            logger.warning(
                "outbox event lease expired before acknowledgement",
                extra={
                    "event": "outbox_event_acknowledgement_lost",
                    "context": {"eventId": str(claimed.event.event_id)},
                },
            )
            return
        logger.info(
            "outbox event published",
            extra={
                "event": "outbox_event_published",
                "context": {
                    "eventId": str(claimed.event.event_id),
                    "eventType": claimed.event.event_type,
                    "userId": str(claimed.event.user_id),
                    "publishAttempts": claimed.publish_attempts,
                },
            },
        )

    async def _schedule_retry(
        self,
        session: AsyncSession,
        claimed: ClaimedOutboxEvent,
        error: Exception,
    ) -> None:
        delay_seconds = self._retry_delay_seconds(claimed.publish_attempts)
        next_attempt_at = datetime.now(UTC) + timedelta(seconds=delay_seconds)
        failure_code = type(error).__name__[:128]
        async with session.begin():
            result = await session.execute(
                update(OutboxEvent)
                .where(
                    OutboxEvent.event_id == claimed.event.event_id,
                    OutboxEvent.lease_token == claimed.lease_token,
                    OutboxEvent.state == OutboxEventState.PENDING,
                )
                .values(
                    next_attempt_at=next_attempt_at,
                    lease_token=None,
                    lease_expires_at=None,
                    last_error_code=failure_code,
                )
            )
        if result.rowcount == 1:
            logger.warning(
                "outbox event publication will be retried",
                extra={
                    "event": "outbox_event_retry_scheduled",
                    "context": {
                        "eventId": str(claimed.event.event_id),
                        "eventType": claimed.event.event_type,
                        "userId": str(claimed.event.user_id),
                        "publishAttempts": claimed.publish_attempts,
                        "failureCode": failure_code,
                        "retryDelaySeconds": delay_seconds,
                    },
                },
            )

    def _retry_delay_seconds(self, attempts: int) -> int:
        multiplier = 2 ** max(attempts - 1, 0)
        return min(
            self._settings.outbox_retry_initial_delay_seconds * multiplier,
            self._settings.outbox_retry_max_delay_seconds,
        )


async def _run_worker() -> None:
    settings = get_settings()
    database = Database(settings.database_url)
    worker = OutboxWorker(database, RabbitMqEventPublisher(settings), settings)
    try:
        await worker.run_forever()
    finally:
        await database.dispose()


def main() -> None:
    """Run the outbox publisher as its own independently restartable process."""

    asyncio.run(_run_worker())
