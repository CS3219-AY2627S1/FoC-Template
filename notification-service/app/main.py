from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from app.api.routes import health, notifications
from app.db import get_session, init_db
from app.errors import register_exception_handlers
from app.observability import OBS
from app.services.consumer import NotificationEventConsumer


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    consumer_task = asyncio.create_task(NotificationEventConsumer().run())
    yield
    consumer_task.cancel()
    with suppress(asyncio.CancelledError):
        await consumer_task


app = FastAPI(title="FoC Notification Service", version="0.1.0", lifespan=lifespan)
# Shared observability: /metrics + /health/ready + HTTP metrics. The consumer
# does not publish broker state yet, so readiness is DB-only.
OBS.install(app, readiness_session_dep=get_session, check_broker=False)
register_exception_handlers(app)
app.include_router(health.router)
app.include_router(notifications.router)
