# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — GET /notifications/stream: authenticate before the stream opens, resume from Last-Event-ID, send id/data events from the history DTO, heartbeats, and a maximum lifetime (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
# Scope: Refactoring and documentation improvements — say in the docstring that the worker's per-recipient advisory lock keeps commit order, so several workers are safe (ai-20261110-001).
# Author review: Keith confirmed on 2026-11-10: verification and testing with the full pytest suite (.venv/bin/python -m pytest -rs), 940 passed (ai-20261110-001).
# Details: notification-service/ai/usage-log.md; ai-20261110-001

"""Live notification stream (Server-Sent Events).

Each stream subscribes to the process's hub, then finds its starting point,
before the response headers are sent, so a notification committed at any
point after that wakes it. When woken, it sends
the caller's rows with ``id > last_sent_id`` in id order and advances
``last_sent_id``, so each row is sent once however many wake-ups arrive.

Ids are assigned when rows are inserted, so this relies on each recipient's
rows with lower ids committing first. The worker takes a per-recipient advisory
lock before inserting a recipient's rows and holds it until commit, so each
recipient's rows commit in id order and several workers are safe.
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.types import Receive, Scope, Send

from app.listener import NotificationHub, Subscription
from app.models import Notification
from app.routes.notifications import _AUTH_RESPONSES, CurrentIdentity, _to_dto
from app.schemas import notification_dto_adapter
from foc_observability import log_event

logger = logging.getLogger(__name__)

# Rows sent per query; a long catch-up is sent in several batches.
BATCH_SIZE = 100

STREAM_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
}
PING = b": ping\n\n"

router = APIRouter(prefix="/notifications", tags=["notifications"])

SessionFactory = Callable[[], Session]


def parse_last_event_id(value: str | None) -> int | None:
    """A non-negative integer, or None when the header is absent or invalid."""

    if value is None:
        return None
    value = value.strip()
    # isdigit() would accept non-ASCII digits that int() also parses.
    if not value or not value.isascii() or not value.isdigit():
        return None
    return int(value)


def newest_id(session_factory: SessionFactory, recipient_id: UUID) -> int:
    with session_factory() as db:
        newest = db.scalar(
            select(func.max(Notification.id)).where(
                Notification.recipient_id == recipient_id
            )
        )
    return newest or 0


def rows_after(
    session_factory: SessionFactory, recipient_id: UUID, after_id: int, limit: int
) -> list[Notification]:
    with session_factory() as db:
        return list(
            db.scalars(
                select(Notification)
                .where(
                    Notification.recipient_id == recipient_id,
                    Notification.id > after_id,
                )
                .order_by(Notification.id)
                .limit(limit)
            )
        )


def format_event(row: Notification) -> bytes:
    data = notification_dto_adapter.dump_json(_to_dto(row))
    return b"id: %d\ndata: %s\n\n" % (row.id, data)


async def open_subscription(
    hub: NotificationHub,
    session_factory: SessionFactory,
    recipient_id: UUID,
    last_event_id: int | None,
) -> tuple[Subscription, int]:
    """Subscribe, then choose the id to send after.

    Subscribing first means a row committed during the query still wakes the
    stream; last_sent_id then stops it being sent twice.
    """

    subscription = hub.subscribe(recipient_id)
    try:
        newest = await run_in_threadpool(newest_id, session_factory, recipient_id)
    except BaseException:
        hub.unsubscribe(subscription)
        raise
    # A resume point above the caller's newest row is treated as the newest
    # row, so later notifications are not skipped.
    last_sent_id = newest if last_event_id is None else min(last_event_id, newest)
    # The first pass of the loop runs the catch-up query.
    subscription.wake.set()
    return subscription, last_sent_id


async def notification_events(
    subscription: Subscription,
    session_factory: SessionFactory,
    last_sent_id: int,
    *,
    heartbeat_seconds: float,
    lifetime_seconds: float,
) -> AsyncIterator[bytes]:
    loop = asyncio.get_running_loop()
    started = loop.time()
    deadline = started + lifetime_seconds
    next_ping = started + heartbeat_seconds
    recipient_id = subscription.recipient_id
    notifications_sent = 0
    close_reason = "lifetime"
    try:
        while True:
            now = loop.time()
            if now >= deadline:
                return
            if subscription.wake.is_set():
                # Cleared before the query: a notification arriving during it
                # sets the event again and causes one more query.
                subscription.wake.clear()
                rows = await run_in_threadpool(
                    rows_after, session_factory, recipient_id, last_sent_id, BATCH_SIZE
                )
                for row in rows:
                    yield format_event(row)
                    last_sent_id = row.id
                    notifications_sent += 1
                if len(rows) == BATCH_SIZE:
                    subscription.wake.set()
            elif now >= next_ping:
                yield PING
                next_ping += heartbeat_seconds
                if next_ping <= now:
                    # Fell behind (for example a slow query); do not burst pings.
                    next_ping = now + heartbeat_seconds
            else:
                try:
                    await asyncio.wait_for(
                        subscription.wake.wait(), min(deadline, next_ping) - now
                    )
                except TimeoutError:
                    pass
    except asyncio.CancelledError:
        close_reason = "cancelled"
        raise
    except Exception as error:
        # Headers are already sent, so the only way to report it is to end
        # the stream; the client reconnects with Last-Event-ID.
        close_reason = "error"
        log_event(
            logger,
            logging.ERROR,
            "notification_stream_failed",
            recipient_id=recipient_id,
            exception_type=type(error).__name__,
        )
    finally:
        log_event(
            logger,
            logging.INFO,
            "notification_stream_closed",
            recipient_id=recipient_id,
            notifications_sent=notifications_sent,
            duration_ms=round((loop.time() - started) * 1000, 3),
            reason=close_reason,
        )


class NotificationStreamResponse(StreamingResponse):
    """Subscribe and choose the starting point before the headers are sent.

    So every notification committed after the client sees the response
    starts is sent. The subscription is released however the response ends,
    including a client that disconnects before the body starts.
    """

    def __init__(
        self,
        hub: NotificationHub,
        session_factory: SessionFactory,
        recipient_id: UUID,
        last_event_id: int | None,
        *,
        heartbeat_seconds: float,
        lifetime_seconds: float,
    ) -> None:
        # The body is created in __call__, once the starting point is known.
        super().__init__(content=iter(()), headers=STREAM_HEADERS)
        self._hub = hub
        self._session_factory = session_factory
        self._recipient_id = recipient_id
        self._last_event_id = last_event_id
        self._heartbeat_seconds = heartbeat_seconds
        self._lifetime_seconds = lifetime_seconds

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            subscription, last_sent_id = await open_subscription(
                self._hub,
                self._session_factory,
                self._recipient_id,
                self._last_event_id,
            )
        except BaseException as error:
            if not isinstance(error, asyncio.CancelledError):
                log_event(
                    logger,
                    logging.ERROR,
                    "notification_stream_open_failed",
                    recipient_id=self._recipient_id,
                    exception_type=type(error).__name__,
                )
            raise
        try:
            log_event(
                logger,
                logging.INFO,
                "notification_stream_opened",
                recipient_id=self._recipient_id,
                resumed=self._last_event_id is not None,
            )
            self.body_iterator = notification_events(
                subscription,
                self._session_factory,
                last_sent_id,
                heartbeat_seconds=self._heartbeat_seconds,
                lifetime_seconds=self._lifetime_seconds,
            )
            await super().__call__(scope, receive, send)
        finally:
            self._hub.unsubscribe(subscription)


@router.get(
    "/stream",
    response_class=StreamingResponse,
    responses={
        **_AUTH_RESPONSES,
        200: {
            "description": (
                "Server-Sent Events. Each notification is an event whose id is "
                "the notification id and whose data is the same JSON object as "
                "one item of GET /notifications."
            ),
            "content": {"text/event-stream": {}},
        },
    },
)
async def stream_notifications(
    request: Request,
    identity: CurrentIdentity,
    last_event_id: Annotated[
        str | None,
        Header(
            alias="Last-Event-ID",
            description=(
                "Resume after this notification id: every later notification is "
                "sent first. Absent, or not a non-negative integer: only "
                "notifications created after the stream opens. A value above the "
                "caller's newest notification id counts as that id."
            ),
        ),
    ] = None,
) -> NotificationStreamResponse:
    """The caller's new notifications, live, until the maximum lifetime."""

    state = request.app.state
    return NotificationStreamResponse(
        state.hub,
        state.session_factory,
        identity.id,
        parse_last_event_id(last_event_id),
        heartbeat_seconds=state.settings.sse_heartbeat_seconds,
        lifetime_seconds=state.settings.sse_max_lifetime_seconds,
    )

