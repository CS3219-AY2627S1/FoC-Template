# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Writing implementation code; Debugging assistance — write the FastAPI factory with startup configuration validation, a database-independent /health, and a /ready probe; after a frozen-database hang was observed, add a single-flight readiness probe with a hard deadline.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — create the User Service client at startup, allow a test double to replace it, close it on shutdown, and include the notifications router (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — start the notification hub and the process's LISTEN connection at startup, stop it on shutdown, and include the stream router (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002

"""FastAPI application factory for the Notification Service."""

import logging
import threading
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.clients import UserServiceClient
from app.config import ApiSettings, configure_logging
from app.db import make_engine, make_session_factory
from app.listener import NotificationHub, NotificationListener
from app.routes.notifications import router as notifications_router
from app.routes.stream import router as stream_router
from foc_observability import RequestContextMiddleware, log_event

logger = logging.getLogger(__name__)

# Upper bound on how long GET /ready may take. Connect timeouts do not cover a
# pooled connection waiting on a server that stopped responding, so the probe
# itself runs under this deadline.
READY_TIMEOUT_SECONDS = 3.0


class ReadinessProbe:
    """Run database probes on one background thread with a hard deadline.

    At most one probe is in flight. If a previous probe is still blocked, the
    service is reported not ready without starting another one.
    """

    def __init__(self, engine: Engine, timeout_seconds: float) -> None:
        self._engine = engine
        self._timeout_seconds = timeout_seconds
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="readiness"
        )
        self._lock = threading.Lock()
        self._in_flight: Future | None = None

    def _ping(self) -> None:
        with self._engine.connect() as connection:
            connection.execute(text("SELECT 1"))

    def check(self) -> bool:
        with self._lock:
            if self._in_flight is not None and not self._in_flight.done():
                return False
            self._in_flight = self._executor.submit(self._ping)
            future = self._in_flight
        try:
            # Raises TimeoutError on deadline, or the probe's own error.
            future.result(timeout=self._timeout_seconds)
        except Exception:
            return False
        return True

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


def create_app(
    settings: ApiSettings | None = None,
    *,
    user_client: UserServiceClient | None = None,
) -> FastAPI:
    """Build the API. ``user_client`` replaces the User Service client in tests."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        active_settings = settings or ApiSettings.from_env()
        configure_logging(active_settings.log_level, component="api")
        app.state.settings = active_settings
        app.state.engine = make_engine(active_settings.database_url)
        app.state.session_factory = make_session_factory(app.state.engine)
        app.state.readiness = ReadinessProbe(
            app.state.engine, READY_TIMEOUT_SECONDS
        )
        app.state.user_client = user_client or UserServiceClient(
            active_settings.user_service_url,
            active_settings.user_service_ca_file,
        )
        app.state.hub = NotificationHub()
        app.state.listener = None
        # Only PostgreSQL has LISTEN; the SQLite engine some tests use does not.
        if active_settings.database_url.startswith("postgresql"):
            app.state.listener = NotificationListener(
                app.state.hub, active_settings.database_url
            )
            app.state.listener.start()
        try:
            log_event(logger, logging.INFO, "api_started")
            yield
        finally:
            log_event(logger, logging.INFO, "api_shutdown")
            if app.state.listener is not None:
                await app.state.listener.stop()
            app.state.user_client.close()
            app.state.readiness.close()
            app.state.engine.dispose()

    app = FastAPI(
        title="FoC Notification Service", version="0.1.0", lifespan=lifespan
    )
    app.add_middleware(RequestContextMiddleware)

    app.include_router(stream_router)
    app.include_router(notifications_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "healthy"}

    @app.get("/ready", response_model=None)
    def ready(request: Request) -> JSONResponse | dict[str, str]:
        if request.app.state.readiness.check():
            return {"status": "ready"}
        # Never expose database URLs, credentials, or driver diagnostics.
        log_event(logger, logging.WARNING, "readiness_check_failed")
        return JSONResponse(status_code=503, content={"status": "not_ready"})

    return app


app = create_app()
