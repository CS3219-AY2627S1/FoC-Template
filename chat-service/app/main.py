# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes import attachments, conversations, health, internal, tickets
from app.config import Settings, get_settings
from app.db import create_schema, make_engine, make_sessionmaker
from app.errors import ChatError
from app.integrations.order_events import OrderEventConsumer, prune_processed_events
from app.realtime import ws
from app.realtime.broker import AmqpBroker, Broker, LocalBroker
from app.realtime.hub import Hub
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


async def _purge_loop(state: AppState) -> None:
    """Delete conversations past `purge_after`, expired tickets, old inbox ids, and
    photos whose conversation or message is gone (or that were never sent)."""
    while True:
        await asyncio.sleep(state.settings.purge_interval_s)
        try:
            await state.run(lambda s: s.purge_expired())
            async with state.sessionmaker() as session, session.begin():
                await ticket_store.delete_expired(session)
                await prune_processed_events(session)
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
        await broker.start()
        await publisher.start()
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
    async def chat_error_handler(_: Request, exc: ChatError) -> JSONResponse:
        return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.http_status)

    app.include_router(health.router)
    app.include_router(tickets.router)
    app.include_router(conversations.router)
    app.include_router(attachments.router)
    app.include_router(internal.router)
    app.include_router(ws.router)
    return app


app = create_app()
