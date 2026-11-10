# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented Order startup, health endpoints, error handling and API registration.
# Author review: I validated correctness and added boundary checks where needed.

"""Order application factory, operational endpoints and versioned business API."""

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

from app.core.config import Settings, get_settings
from app.db import Database, DatabaseUnavailableError
from app.orders.api import internal_router, router
from app.orders.clients import ServiceClients
from app.orders.errors import ApiError
from app.orders.lifecycle_repository import LifecycleRepository
from app.orders.repository import OrderRepository

_SAFE_REQUEST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


def create_app(
    settings: Settings | None = None,
    database: Database | None = None,
    *,
    clients=None,
    repository=None,
    lifecycle_repository=None,
) -> FastAPI:
    service_settings = settings if settings is not None else get_settings()
    database_url = service_settings.database_url
    service_database = (
        database
        if database is not None
        else Database(database_url.get_secret_value() if database_url else None)
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Defer database connections so an outage cannot prevent liveness from starting.
        try:
            yield
        finally:
            await http.aclose()
            await service_database.dispose()

    app = FastAPI(
        title="FoC Order Service",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if service_settings.environment == "production" else "/docs",
        redoc_url=None,
    )
    app.state.settings = service_settings
    app.state.database = service_database
    app.state.lifecycle = (
        lifecycle_repository if lifecycle_repository is not None
        else LifecycleRepository(service_database.session_context)
    )
    http = httpx.AsyncClient(trust_env=False)
    app.state.clients = clients if clients is not None else ServiceClients(service_settings, http)
    app.state.repository = (
        repository
        if repository is not None
        else OrderRepository(
            lambda: service_database.session_context(),
        )
    )

    @app.exception_handler(ApiError)
    async def domain_error(request: Request, error: ApiError):
        return JSONResponse(
            status_code=error.status,
            content={
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "correlationId": request.state.correlation_id,
                    "fieldErrors": [],
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        # Never serialize Pydantic input/context: they may contain confidential payloads.
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Check the request fields.",
                    "correlationId": request.state.correlation_id,
                    "fieldErrors": [
                        {
                            "field": ".".join(str(part) for part in item["loc"]),
                            "message": "Invalid or unsupported field.",
                        }
                        for item in error.errors()
                    ],
                }
            },
        )

    async def database_error(request: Request, error: Exception):
        return await domain_error(
            request,
            ApiError(
                503,
                "DATABASE_UNAVAILABLE",
                "Order storage is unavailable. Retry with the same key.",
            ),
        )

    for error_type in (
        SQLAlchemyError,
        PostgresError,
        DatabaseUnavailableError,
        OSError,
        TimeoutError,
    ):
        app.add_exception_handler(error_type, database_error)
    app.include_router(router)
    app.include_router(internal_router)

    @app.middleware("http")
    async def correlate_request(request: Request, call_next):
        supplied = request.headers.get("X-Correlation-ID", "")
        request.state.correlation_id = (
            supplied if _SAFE_REQUEST_ID.fullmatch(supplied) else uuid4().hex
        )
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = request.state.correlation_id
        return response

    def unavailable(request: Request) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "SERVICE_NOT_READY",
                    "message": "The Order database is not ready.",
                    "correlationId": request.state.correlation_id,
                    "fieldErrors": [],
                }
            },
        )

    @app.get("/health/live", tags=["Operations"])
    async def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready", tags=["Operations"], response_model=None)
    async def ready(request: Request) -> dict[str, str] | JSONResponse:
        if not await service_database.ping():
            return unavailable(request)
        return {"status": "ready"}

    return app


app = create_app()
