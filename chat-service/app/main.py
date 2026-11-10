# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from aio_pika.exceptions import AMQPConnectionError
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes import attachments, conversations, health, internal, tickets
from app.config import Settings, get_settings
from app.db import create_schema, make_engine, make_sessionmaker
from app.errors import ChatError
from app.integrations.order_events import OrderEventConsumer, prune_processed_events
from app.observability import OBS
from app.realtime import ws
from app.realtime.broker import AmqpBroker, Broker, LocalBroker
from app.realtime.hub import Hub
from app.repositories import outbox as outbox_repo
from app.services import photos
from app.services import tickets as ticket_store
from app.services.outbox import (
    AmqpEventPublisher,
    EventPublisher,
    LogEventPublisher,
    OutboxRelay,
)
from app.state import AppState

log = logging.getLogger("chat")


async def start_with_retry(
    name: str, start: Callable[[], Awaitable[None]], timeout_s: float
) -> None:
    """Run ``start`` until RabbitMQ accepts the connection or ``timeout_s`` passes.

    Compose starts this service once RabbitMQ's healthcheck passes, which can be a few
    seconds before the broker listens on its AMQP port. Without a retry the first
    "connection refused" would stop start-up for good.
    """
    loop = asyncio.get_running_loop()
    give_up = loop.time() + timeout_s
    delay = 0.5
    while True:
        try:
            await start()
            return
        except (OSError, AMQPConnectionError) as exc:
            if loop.time() + delay > give_up:
                raise
            log.warning("%s: RabbitMQ not reachable (%s); retrying in %.1fs", name, exc, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 5.0)


async def _purge_loop(state: AppState) -> None:
    """Delete conversations past `purge_after`, expired tickets, old inbox ids, published
    outbox events, and photos whose conversation or message is gone (or never sent)."""
    while True:
        await asyncio.sleep(state.settings.purge_interval_s)
        try:
            await state.run(lambda s: s.purge_expired())
            async with state.sessionmaker() as session, session.begin():
                await ticket_store.delete_expired(session)
                await prune_processed_events(session)
                await outbox_repo.prune_published(session, state.settings.outbox_keep_hours)
            if state.photos is not None:
                await state.run(lambda s, store=state.photos: photos.sweep(s, store))
        except Exception:
            log.exception("purge failed")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = make_engine(settings.database_url)
        await create_schema(engine)
        sessionmaker = make_sessionmaker(engine)
        hub = Hub()
        amqp = settings.rabbitmq_url
        broker: Broker = (
            AmqpBroker(hub, amqp, settings.chat_fanout_exchange) if amqp else LocalBroker(hub)
        )
        publisher: EventPublisher = (
            AmqpEventPublisher(amqp, settings.chat_events_exchange) if amqp else LogEventPublisher()
        )
        timeout = settings.rabbitmq_connect_timeout_s
        await start_with_retry("socket fan-out", broker.start, timeout)
        await start_with_retry("event publisher", publisher.start, timeout)
        state = AppState(
            settings=settings,
            sessionmaker=sessionmaker,
            hub=hub,
            broker=broker,
            photos=photos.make_store(settings),
        )
        app.state.chat = state
        tasks = [
            asyncio.create_task(OutboxRelay(sessionmaker, settings, publisher).run_forever()),
            asyncio.create_task(_purge_loop(state)),
        ]
        if settings.chat_order_events_enabled and amqp:
            tasks.append(asyncio.create_task(OrderEventConsumer(state).run()))
        elif settings.chat_order_events_enabled:
            log.warning("CHAT_ORDER_EVENTS_ENABLED is set but RABBITMQ_URL is not; ignoring")
        try:
            yield
        finally:
            hub.close_all()  # 1001: clients reconnect (with jitter) to another replica
            for t in tasks:
                t.cancel()
            for t in tasks:
                with contextlib.suppress(asyncio.CancelledError):
                    await t
            await broker.stop()
            await publisher.stop()
            await engine.dispose()

    app = FastAPI(title="FoC Chat Service", version="0.1.0", lifespan=lifespan)

    @app.exception_handler(ChatError)
    async def chat_error_handler(request: Request, exc: ChatError) -> JSONResponse:
        OBS.record_error_code(OBS.route_template(request.scope), exc.code)
        return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.http_status)

    OBS.install(app, check_broker=False, readiness_route=False)

    app.include_router(health.router)
    app.include_router(tickets.router)
    app.include_router(conversations.router)
    app.include_router(attachments.router)
    app.include_router(internal.router)
    app.include_router(ws.router)
    return app


app = create_app()
