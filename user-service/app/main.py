from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import health, users
from app.bootstrap import seed_bootstrap_admin
from app.db import engine, get_session, init_db
from app.observability import OBS
from app.services.events import outbox_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_bootstrap_admin()
    worker = asyncio.create_task(outbox_worker())
    try:
        yield
    finally:
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)
        await engine.dispose()


app = FastAPI(title="FoC User Service", version="0.1.0", lifespan=lifespan)
# Shared observability: /metrics + /health/ready + HTTP metrics. The outbox
# publisher does not maintain broker state, so readiness is DB-only.
OBS.install(app, readiness_session_dep=get_session, check_broker=False)
app.include_router(health.router)
app.include_router(users.router)
