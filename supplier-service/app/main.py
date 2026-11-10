# AI-INFLUENCED: Run the durable Supplier Service event worker with Codex.
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from app.api.routes import health, suppliers
from app.db import engine, get_session, init_db
from app.errors import register_exception_handlers
from app.observability import OBS
from app.services.event_worker import run_event_worker
from app.services.seeder import SEED_CSV_PATH, seed_suppliers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    if SEED_CSV_PATH.exists():
        inserted = await seed_suppliers()
        logger.info("Supplier seeder inserted %d new row(s).", inserted)
    else:
        logger.warning("Seed CSV not found at %s; skipping startup seed.", SEED_CSV_PATH)
    event_worker = asyncio.create_task(run_event_worker())
    try:
        yield
    finally:
        event_worker.cancel()
        with suppress(asyncio.CancelledError):
            await event_worker
        await engine.dispose()


app = FastAPI(title="FoC Supplier Service", version="0.1.0", lifespan=lifespan)
# Shared observability: /metrics + /health/ready + HTTP metrics. The event
# worker publishes to the broker but does not maintain broker state, so the
# readiness check stays DB-only.
OBS.install(app, readiness_session_dep=get_session, check_broker=False)
register_exception_handlers(app)
app.include_router(health.router)
app.include_router(suppliers.router)
