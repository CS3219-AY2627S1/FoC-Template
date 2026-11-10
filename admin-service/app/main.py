# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29
# Scope: Implemented the application factory, health checks, error handling and route wiring.
# Author review: I validated correctness and supplied additional boundary checks.

"""Admin application factory and operational endpoints."""

import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
from asyncpg import PostgresError
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.admin.api import router as admin_router
from app.admin.errors import ApiError
from app.admin.identity import UserDirectory
from app.admin.orders import OrderDirectory
from app.admin.reports import router as reports_router
from app.admin.repository import DisputeRepository
from app.core.config import Settings, get_settings
from app.db import Database, DatabaseUnavailableError

_SAFE_REQUEST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


def _envelope(request: Request, status: int, code: str, message: str, field_errors=None):
    return JSONResponse(
        status_code=status,
        content={
            "error": {
                "code": code,
                "message": message,
                "correlationId": request.state.correlation_id,
                "fieldErrors": field_errors or [],
            }
        },
    )


def create_app(
    settings: Settings | None = None,
    database: Database | None = None,
    *,
    identity=None,
    disputes=None,
    orders=None,
) -> FastAPI:
    service_settings = settings if settings is not None else get_settings()
    database_url = service_settings.database_url
    service_database = (
        database
        if database is not None
        else Database(database_url.get_secret_value() if database_url else None)
    )
    http = httpx.AsyncClient(trust_env=False)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Defer database connections so an outage cannot prevent liveness from starting.
        try:
            yield
        finally:
            await http.aclose()
            await service_database.dispose()

    app = FastAPI(
        title="FoC Admin Service",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if service_settings.environment == "production" else "/docs",
        redoc_url=None,
    )
    app.state.settings = service_settings
    app.state.database = service_database
    app.state.identity = (
        identity if identity is not None else UserDirectory(service_settings, http)
    )
    app.state.disputes = (
        disputes if disputes is not None else DisputeRepository(service_database.session_context)
    )
    app.state.orders = orders if orders is not None else OrderDirectory(service_settings, http)

    @app.exception_handler(ApiError)
    async def domain_error(request: Request, error: ApiError):
        return _envelope(request, error.status, error.code, error.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        # Never serialize Pydantic input/context: they may contain confidential payloads.
        return _envelope(
            request,
            422,
            "VALIDATION_ERROR",
            "Check the request fields.",
            [
                {
                    "field": ".".join(str(part) for part in item["loc"]),
                    "message": "Invalid or unsupported field.",
                }
                for item in error.errors()
            ],
        )

    async def database_error(request: Request, error: Exception):
        return _envelope(
            request, 503, "DATABASE_UNAVAILABLE", "Admin storage is unavailable. Retry safely."
        )

    for error_type in (
        SQLAlchemyError,
        PostgresError,
        DatabaseUnavailableError,
        OSError,
        TimeoutError,
    ):
        app.add_exception_handler(error_type, database_error)
    app.include_router(admin_router)
    app.include_router(reports_router)

    @app.middleware("http")
    async def correlate_request(request: Request, call_next):
        supplied = request.headers.get("X-Correlation-ID", "")
        request.state.correlation_id = (
            supplied if _SAFE_REQUEST_ID.fullmatch(supplied) else uuid4().hex
        )
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = request.state.correlation_id
        return response

    @app.get("/health/live", tags=["Operations"])
    async def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready", tags=["Operations"], response_model=None)
    async def ready(request: Request) -> dict[str, str] | JSONResponse:
        if not await service_database.ping():
            return _envelope(
                request, 503, "SERVICE_NOT_READY", "The Admin database is not ready."
            )
        return {"status": "ready"}

    return app


app = create_app()
