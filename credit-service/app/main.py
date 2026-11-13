"""FastAPI application factory for the Credit Service."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.clients import UserServiceClient
from app.config import Settings
from app.db import make_engine, make_session_factory
from foc_observability import RequestContextMiddleware, configure_logging, log_event
from app.routes.credits import router as credits_router
from app.services.credits import (
    CreditAccountNotFound,
    InvalidCreditAdjustment,
)

logger = logging.getLogger(__name__)
configure_logging(
    "credit-service",
    component="api",
    environment=os.getenv("APP_ENV", "production"),
)
ALEMBIC_CONFIG_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        active_settings = settings or Settings.from_env()
        configure_logging(
            "credit-service",
            component="api",
            environment=os.getenv("APP_ENV", "production"),
            level=active_settings.log_level,
        )
        app.state.settings = active_settings
        app.state.engine = make_engine(active_settings.database_url)
        app.state.session_factory = make_session_factory(app.state.engine)
        app.state.user_client = UserServiceClient(
            active_settings.user_service_url,
            active_settings.user_service_ca_file,
        )
        try:
            yield
        finally:
            app.state.user_client.close()
            app.state.engine.dispose()

    app = FastAPI(title="FoC Credit Service", version="0.1.0", lifespan=lifespan)
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(CreditAccountNotFound)
    async def credit_account_not_found_handler(
        _request: Request, error: CreditAccountNotFound
    ) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={"detail": str(error), "code": "CREDIT_ACCOUNT_NOT_FOUND"},
        )

    @app.exception_handler(InvalidCreditAdjustment)
    async def invalid_credit_adjustment_handler(
        _request: Request, error: InvalidCreditAdjustment
    ) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"detail": str(error), "code": "INVALID_CREDIT_ADJUSTMENT"},
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "healthy"}

    @app.get("/ready", response_model=None)
    def ready(request: Request) -> JSONResponse | dict[str, str]:
        try:
            config = Config(str(ALEMBIC_CONFIG_PATH))
            packaged_heads = set(ScriptDirectory.from_config(config).get_heads())
            with request.app.state.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
                installed_heads = set(
                    MigrationContext.configure(connection).get_current_heads()
                )
            if packaged_heads and installed_heads == packaged_heads:
                return {"status": "ready"}
        except Exception:
            # Never expose database URLs, credentials, or driver diagnostics.
            pass
        log_event(logger, logging.WARNING, "readiness_check_failed")
        return JSONResponse(status_code=503, content={"status": "not_ready"})

    app.include_router(credits_router)
    return app


app = create_app()
