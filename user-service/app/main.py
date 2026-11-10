# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-03
# Scope: Connected the configured OTP email sender to User application startup.
# Author review: I validated correctness and added boundary checks where needed.

# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21
# Tool: GitHub Copilot, date: 2026-09-20
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Implemented startup, health checks, error handling, and API registration for account
# and Chat operations.
# Author review: I validated correctness and added boundary checks where needed.

"""FastAPI application factory and operations endpoints."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.admin import router as admin_router
from app.api.authentication import jwks_router
from app.api.authentication import router as authentication_router
from app.api.authorization import router as authorization_router
from app.api.chat import CHAT_INTERFACE_PATHS
from app.api.chat import router as chat_router
from app.api.errors import ApiError, FieldError
from app.api.registration import router as registration_router
from app.api.users import router as users_router
from app.auth.service import AuthenticationService
from app.core.config import Settings, get_settings
from app.core.correlation import (
    CORRELATION_ID_HEADER,
    CorrelationIdMiddleware,
    get_correlation_id,
)
from app.core.logging import configure_logging, logger
from app.core.timing import RequestTimingMiddleware
from app.db import Database, DatabaseUnavailableError
from app.registration.mailer import OtpSender, create_otp_sender
from app.registration.service import RegistrationService


class ServiceNotReadyError(RuntimeError):
    """Raised when an operational dependency has not become available."""


def error_payload(
    code: str,
    message: str,
    correlation_id: str,
    field_errors: list[FieldError] | None = None,
) -> dict[str, object]:
    """Use the contract's safe, consistent error envelope."""

    return {
        "error": {
            "code": code,
            "message": message,
            "correlationId": correlation_id,
            "fieldErrors": [error.as_dict() for error in field_errors or []],
        }
    }


def create_app(
    settings: Settings | None = None,
    database: Database | None = None,
    otp_sender: OtpSender | None = None,
    authentication_service: AuthenticationService | None = None,
) -> FastAPI:
    """Build an independently testable application without running migrations."""

    service_settings = settings or get_settings()
    configure_logging(service_settings.log_level)
    service_database = database or Database(service_settings.database_url)
    registration_service = RegistrationService(
        service_settings,
        otp_sender if otp_sender is not None else create_otp_sender(service_settings),
    )
    service_authentication = authentication_service or AuthenticationService(service_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "startup completed; database availability is reported by readiness",
            extra={"event": "startup_check", "context": {"databaseProbeDeferred": True}},
        )
        try:
            yield
        finally:
            await app.state.database.dispose()

    app = FastAPI(
        title="FoC User Service",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if service_settings.environment == "production" else "/docs",
        redoc_url=None,
    )
    app.state.database = service_database
    app.state.settings = service_settings
    app.state.registration_service = registration_service
    app.state.authentication_service = service_authentication
    app.add_middleware(RequestTimingMiddleware)
    app.add_middleware(CorrelationIdMiddleware)

    @app.exception_handler(ServiceNotReadyError)
    async def service_not_ready_handler(request: Request, _: ServiceNotReadyError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_payload(
                "SERVICE_NOT_READY",
                "A required service dependency is not ready.",
                get_correlation_id(request),
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, error: Exception) -> JSONResponse:
        """Keep error responses traceable without exposing implementation details."""

        correlation_id = get_correlation_id(request)
        logger.exception(
            "unhandled request error",
            extra={
                "correlation_id": correlation_id,
                "event": "unhandled_request_error",
                "context": {"errorType": type(error).__name__},
            },
        )
        response = JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(
                "INTERNAL_SERVER_ERROR",
                "An unexpected service error occurred.",
                correlation_id,
            ),
        )
        response.headers[CORRELATION_ID_HEADER] = correlation_id
        return response

    @app.exception_handler(DatabaseUnavailableError)
    async def database_unavailable_handler(
        request: Request,
        _: DatabaseUnavailableError,
    ) -> JSONResponse:
        return await service_not_ready_handler(request, ServiceNotReadyError())

    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, error: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content=error_payload(
                error.code,
                error.message,
                get_correlation_id(request),
                error.field_errors,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        request: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        field_errors = [
            FieldError(
                field=".".join(str(part) for part in item["loc"] if part != "body"),
                code="INVALID_VALUE",
                message=item["msg"],
            )
            for item in error.errors()
        ]
        if request.url.path in CHAT_INTERFACE_PATHS:
            # Unexpected field names and parser/validator messages are untrusted too.
            allowed_fields = {"username", "limit", "cursor", "userIds"}
            field_errors = [
                FieldError(
                    field=".".join(
                        str(part)
                        for part in item["loc"]
                        if part in allowed_fields or isinstance(part, int)
                    )
                    or "request",
                    code="INVALID_VALUE",
                    message="Invalid value.",
                )
                for item in error.errors()
            ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=error_payload(
                "VALIDATION_ERROR",
                "Input validation failed.",
                get_correlation_id(request),
                field_errors,
            ),
        )

    @app.get("/health/live", include_in_schema=False)
    async def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready", include_in_schema=False)
    async def ready(request: Request) -> dict[str, str]:
        if not await request.app.state.database.ping():
            raise ServiceNotReadyError()
        return {"status": "ready"}

    app.include_router(registration_router)
    app.include_router(authentication_router)
    app.include_router(jwks_router)
    app.include_router(users_router)
    app.include_router(authorization_router)
    app.include_router(chat_router)
    app.include_router(admin_router)

    return app


app = create_app()
