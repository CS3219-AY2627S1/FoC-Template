# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11
# Scope: Implemented Chat API startup, health checks, route wiring, and live delivery
# lifecycle.
# Author review: I validated correctness and added boundary checks where needed.

import asyncio
import logging
import re
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import Settings
from app.correlation import correlation_id
from app.db import Database
from app.errors import ApiError, payload
from app.identity import IdentityClient
from app.live import Hub
from app.live import router as live_router
from app.routes import router
from app.service import ChatService

logger = logging.getLogger("chat")


def create_app(settings=None, database=None, identity=None):
    settings = settings or Settings()
    database = database or Database(
        settings.database_url.get_secret_value() if settings.database_url else None
    )
    identity = identity or IdentityClient(settings)
    chat = ChatService(database, identity)
    hub = Hub(chat, settings)
    for name in ("aio_pika", "aiormq"):
        logging.getLogger(name).setLevel(logging.CRITICAL)

    @asynccontextmanager
    async def lifespan(app):
        consumer = asyncio.create_task(hub.consume())
        try:
            yield
        finally:
            consumer.cancel()
            await asyncio.gather(consumer, return_exceptions=True)
            await database.close()
            await identity.close()

    app = FastAPI(title="FoC Chat Service", version="0.1.0", lifespan=lifespan)
    app.state.settings, app.state.database = settings, database
    app.state.identity = identity
    app.state.chat, app.state.hub = chat, hub
    app.include_router(router)
    app.include_router(live_router)

    @app.middleware("http")
    async def correlation(request: Request, call_next):
        supplied = request.headers.get("X-Correlation-ID", "")
        request.state.correlation_id = (
            supplied if re.fullmatch(r"[\w-]{1,64}", supplied) else str(uuid4())
        )
        started = time.monotonic()
        context_token = correlation_id.set(request.state.correlation_id)
        try:
            response = await call_next(request)
        finally:
            correlation_id.reset(context_token)
        response.headers["X-Correlation-ID"] = request.state.correlation_id
        response.headers["Cache-Control"] = "no-store"
        # Never log URLs, query parameters, headers, bodies or exception reprs.
        logger.info(
            "request completed correlation=%s status=%s duration_ms=%.2f",
            request.state.correlation_id,
            response.status_code,
            (time.monotonic() - started) * 1000,
        )
        return response

    @app.exception_handler(ApiError)
    async def intentional(request, error):
        return JSONResponse(payload(error, request.state.correlation_id), status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def validation(request, error):
        return await intentional(request, ApiError(422, "VALIDATION_ERROR", "Invalid input."))

    @app.exception_handler(Exception)
    async def unexpected(request, error):
        return await intentional(
            request, ApiError(500, "INTERNAL_SERVER_ERROR", "An unexpected service error occurred.")
        )

    @app.get("/health/live")
    async def live():
        return {"status": "live"}

    @app.get("/health/ready")
    async def ready():
        await database.ready()
        return {"status": "ready", "delivery": "ready" if hub.subscribed else "degraded"}

    return app


app = create_app()
