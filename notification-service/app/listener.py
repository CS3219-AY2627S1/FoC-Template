# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — one LISTEN connection per API process that wakes the open streams for each notified recipient, and reconnects then wakes every stream after a drop (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002

"""Wake open notification streams from PostgreSQL ``LISTEN notifications``.

The worker runs ``NOTIFY notifications, '<recipient_id>'`` in the transaction
that stores the rows, so a notification arrives only after they are committed.
Each API process holds one dedicated connection for this, shared by every
stream. A wake-up carries no data: the stream queries for rows above the last
id it sent, so a missed or repeated wake-up never loses or repeats a row.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from uuid import UUID

import psycopg
from sqlalchemy.engine import make_url

from app.db import CONNECT_TIMEOUT_SECONDS, SESSION_OPTIONS
from foc_observability import log_event

logger = logging.getLogger(__name__)

# The channel app.worker notifies on. Not imported, so the API does not load the
# Kafka client; a test checks the two match.
NOTIFY_CHANNEL = "notifications"
LISTENER_APPLICATION_NAME = "notification-service-listener"
RECONNECT_DELAY_SECONDS = 1.0

# Notice a database that disappears without closing the connection, so the
# listener reconnects instead of waiting forever for notifications.
LISTENER_NETWORK_ARGS = {
    "keepalives": 1,
    "keepalives_idle": 5,
    "keepalives_interval": 2,
    "keepalives_count": 3,
}


@dataclass(eq=False)
class Subscription:
    """One open stream. ``wake`` is set when its rows may have changed."""

    recipient_id: UUID
    wake: asyncio.Event = field(default_factory=asyncio.Event)


class NotificationHub:
    """Track open streams by recipient and wake them.

    Every method runs on the event loop thread, so no lock is needed.
    """

    def __init__(self) -> None:
        self._streams: dict[UUID, set[Subscription]] = {}

    def subscribe(self, recipient_id: UUID) -> Subscription:
        subscription = Subscription(recipient_id)
        self._streams.setdefault(recipient_id, set()).add(subscription)
        return subscription

    def unsubscribe(self, subscription: Subscription) -> None:
        streams = self._streams.get(subscription.recipient_id)
        if streams is None:
            return
        streams.discard(subscription)
        if not streams:
            del self._streams[subscription.recipient_id]

    def wake(self, recipient_id: UUID) -> None:
        for subscription in self._streams.get(recipient_id, ()):
            subscription.wake.set()

    def wake_all(self) -> None:
        for streams in self._streams.values():
            for subscription in streams:
                subscription.wake.set()

    def stream_count(self, recipient_id: UUID | None = None) -> int:
        if recipient_id is not None:
            return len(self._streams.get(recipient_id, ()))
        return sum(len(streams) for streams in self._streams.values())


def listener_conninfo(database_url: str) -> str:
    """libpq connection string for a SQLAlchemy ``postgresql+psycopg`` URL."""

    url = make_url(database_url).set(drivername="postgresql")
    return url.render_as_string(hide_password=False)


class NotificationListener:
    """Hold the process's LISTEN connection and feed notifications to the hub."""

    def __init__(
        self,
        hub: NotificationHub,
        database_url: str,
        *,
        reconnect_delay_seconds: float = RECONNECT_DELAY_SECONDS,
    ) -> None:
        self._hub = hub
        self._conninfo = listener_conninfo(database_url)
        self._reconnect_delay_seconds = reconnect_delay_seconds
        self._task: asyncio.Task[None] | None = None
        self.connected = asyncio.Event()

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="notification-listener")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        while True:
            try:
                await self._listen_once()
            except asyncio.CancelledError:
                raise
            except Exception as error:
                # Never log the connection string; it may hold credentials.
                log_event(
                    logger,
                    logging.WARNING,
                    "notification_listener_disconnected",
                    exception_type=type(error).__name__,
                    reconnect_delay_seconds=self._reconnect_delay_seconds,
                )
            self.connected.clear()
            await asyncio.sleep(self._reconnect_delay_seconds)

    async def _listen_once(self) -> None:
        connection = await psycopg.AsyncConnection.connect(
            self._conninfo,
            autocommit=True,
            connect_timeout=CONNECT_TIMEOUT_SECONDS,
            options=SESSION_OPTIONS,
            application_name=LISTENER_APPLICATION_NAME,
            **LISTENER_NETWORK_ARGS,
        )
        async with connection:
            await connection.execute(f"LISTEN {NOTIFY_CHANNEL}")
            self.connected.set()
            log_event(logger, logging.INFO, "notification_listener_connected")
            # Anything committed while there was no listener produced no
            # wake-up, so every open stream runs its catch-up query now.
            self._hub.wake_all()
            async for notify in connection.notifies():
                self._dispatch(notify.payload)
        # notifies() only ends when the connection is closed.
        raise psycopg.OperationalError("listener connection closed")

    def _dispatch(self, payload: str) -> None:
        try:
            recipient_id = UUID(payload)
        except ValueError:
            log_event(
                logger,
                logging.WARNING,
                "notification_wakeup_invalid",
                reason="payload_not_uuid",
            )
            return
        self._hub.wake(recipient_id)
