# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Implemented request correlation ID propagation.
# Author review: I validated correctness and added boundary checks where needed.

"""Request correlation identifiers used by API responses and service logs."""

from __future__ import annotations

import re
from contextvars import ContextVar
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

CORRELATION_ID_HEADER = "X-Correlation-ID"
_VALID_CORRELATION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
current_correlation_id: ContextVar[str] = ContextVar("current_correlation_id", default="system")


def get_correlation_id(request: Request) -> str:
    """Return a request ID even when an earlier middleware failed."""

    return getattr(request.state, "correlation_id", "unknown")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Accept safe caller IDs and generate one when absent or malformed."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        supplied = request.headers.get(CORRELATION_ID_HEADER, "")
        correlation_id = supplied if _VALID_CORRELATION_ID.fullmatch(supplied) else uuid4().hex
        request.state.correlation_id = correlation_id
        context_token = current_correlation_id.set(correlation_id)
        try:
            response = await call_next(request)
            response.headers[CORRELATION_ID_HEADER] = correlation_id
            return response
        finally:
            current_correlation_id.reset(context_token)
