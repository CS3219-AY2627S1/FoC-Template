# AI-influenced: implemented with AI assistance; see ai/usage-log.md.
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from app.api.routes import credits, health
from app.config import settings
from app.db import get_session, init_db
from app.errors import register_exception_handlers
from app.observability import metrics
from app.observability.refresh import refresh_scrape_gauges
from app.services.consumer import CreditEventConsumer


@asynccontextmanager
async def lifespan(_: FastAPI):
    metrics.configure_logging()
    await init_db()
    consumer_task = asyncio.create_task(CreditEventConsumer().run())
    yield
    consumer_task.cancel()
    with suppress(asyncio.CancelledError):
        await consumer_task


app = FastAPI(title="FoC Credit Service", version="0.1.0", lifespan=lifespan)
# Shared layer: /metrics, /health/ready, HTTP metrics, request-id propagation.
# refresh_scrape_gauges keeps the pool/balance gauges fresh at scrape time.
metrics.OBS.install(
    app,
    readiness_session_dep=get_session,
    metrics_refresh=refresh_scrape_gauges,
    metrics_refresh_timeout=settings.metrics_refresh_timeout_seconds,
)
register_exception_handlers(app)
app.include_router(health.router)
app.include_router(credits.router)
