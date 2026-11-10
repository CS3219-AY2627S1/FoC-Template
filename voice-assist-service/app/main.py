# AI Assistance Disclosure (hwangjihun):
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
# Scope: Generated Voice Assist startup, configuration, validation and upstream client code.
# Author review: I validated correctness, and added boundary checks.

"""Voice Assist application factory and operational endpoints."""

import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
import openai
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.voice_assist.api import router, utc_now
from app.voice_assist.clients import SupplierDirectory, UserDirectory
from app.voice_assist.errors import ApiError
from app.voice_assist.limits import RateLimiter
from app.voice_assist.providers import (
    FakeDrafter,
    FakeTranscriber,
    OpenAIDrafter,
    OpenAITranscriber,
)

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


def _providers(settings: Settings):
    if settings.voice_assist_provider == "fake":
        return FakeTranscriber(), FakeDrafter()
    if settings.openai_api_key is None:
        return None, None
    # Retries would exceed the requester's 30-second wait; a failure asks for a new recording.
    client = openai.AsyncOpenAI(
        api_key=settings.openai_api_key.get_secret_value(),
        max_retries=0,
        timeout=settings.voice_assist_total_timeout_seconds,
    )
    return (
        OpenAITranscriber(
            client,
            settings.voice_assist_transcribe_model,
            settings.voice_assist_transcribe_timeout_seconds,
        ),
        OpenAIDrafter(
            client, settings.voice_assist_draft_model, settings.voice_assist_draft_timeout_seconds
        ),
    )


def create_app(
    settings: Settings | None = None,
    *,
    identity=None,
    suppliers=None,
    transcriber=None,
    drafter=None,
    limiter=None,
    clock=utc_now,
) -> FastAPI:
    service_settings = settings if settings is not None else get_settings()
    http = httpx.AsyncClient(trust_env=False)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            await http.aclose()

    app = FastAPI(
        title="FoC Voice Assist Service",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if service_settings.environment == "production" else "/docs",
        redoc_url=None,
    )
    default_transcriber, default_drafter = (
        (None, None) if transcriber and drafter else _providers(service_settings)
    )
    app.state.settings = service_settings
    app.state.clock = clock
    app.state.identity = identity or UserDirectory(service_settings, http)
    app.state.suppliers = suppliers or SupplierDirectory(service_settings, http)
    app.state.transcriber = transcriber or default_transcriber
    app.state.drafter = drafter or default_drafter
    app.state.limiter = limiter or RateLimiter(
        service_settings.voice_assist_user_limit,
        service_settings.voice_assist_user_window_seconds,
        service_settings.voice_assist_daily_limit,
    )

    @app.exception_handler(ApiError)
    async def domain_error(request: Request, error: ApiError):
        response = _envelope(request, error.status, error.code, error.message)
        response.headers.update(error.headers)
        return response

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

    app.include_router(router)

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

    @app.get("/health/ready", tags=["Operations"])
    async def ready() -> dict[str, str]:
        # No database to check. A missing provider key is reported by /v1/voice-assist/status,
        # so the manual errand form is never blocked by this service (N3NFR2.2).
        return {"status": "ready"}

    return app


app = create_app()
