"""ASGI middleware for request-scoped logging context."""

from __future__ import annotations

import logging
import time
from typing import Any
from uuid import uuid4

from .context import (
    CORRELATION_ID_HEADER,
    REQUEST_ID_HEADER,
    log_context,
    normalize_identifier,
)
from .logging import log_event


logger = logging.getLogger(__name__)


class RequestContextMiddleware:
    """Attach request context, response headers, and completion logs."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        request_id = _header_value(scope, REQUEST_ID_HEADER)
        request_id = normalize_identifier(request_id) or str(uuid4())
        correlation_id = (
            normalize_identifier(_header_value(scope, CORRELATION_ID_HEADER))
            or request_id
        )
        scope = dict(scope)
        scope["headers"] = _inject_context_headers(
            scope.get("headers", []), request_id, correlation_id
        )
        started_at = time.perf_counter()
        status_code: int | None = None

        async def send_with_context(message: dict[str, Any]) -> None:
            nonlocal status_code
            if message.get("type") == "http.response.start":
                status_code = int(message.get("status", 500))
                response = dict(message)
                response["headers"] = _apply_context_headers(
                    message.get("headers", []), request_id, correlation_id
                )
                message = response
            await send(message)

        with log_context(
            request_id=request_id,
            correlation_id=correlation_id,
        ):
            exception_type: str | None = None
            try:
                await self.app(scope, receive, send_with_context)
            except Exception as error:
                exception_type = type(error).__name__
                raise
            finally:
                completed_status = status_code or 500
                outcome = _request_outcome(completed_status, exception_type)
                level = _request_log_level(completed_status, exception_type)
                fields: dict[str, Any] = {
                    "method": str(scope.get("method", "UNKNOWN")).upper(),
                    "route": _route_template(scope),
                    "status_code": completed_status,
                    "duration_ms": round(
                        (time.perf_counter() - started_at) * 1000, 3
                    ),
                    "outcome": outcome,
                }
                if exception_type is not None:
                    fields["exception_type"] = exception_type
                log_event(
                    logger,
                    level,
                    "http_request_completed",
                    **fields,
                )


def _route_template(scope: dict[str, Any]) -> str:
    """Return the router template, falling back to the unmatched path."""

    route = scope.get("route")
    template = getattr(route, "path", None)
    if isinstance(template, str) and template:
        return template
    return str(scope.get("path") or "<unknown>")


def _apply_context_headers(
    headers: list[tuple[bytes, bytes]],
    request_id: str,
    correlation_id: str,
) -> list[tuple[bytes, bytes]]:
    context_header_names = {
        REQUEST_ID_HEADER.lower().encode("ascii"),
        CORRELATION_ID_HEADER.lower().encode("ascii"),
    }
    filtered = [
        (name, value)
        for name, value in headers
        if name.lower() not in context_header_names
    ]
    filtered.extend(
        [
            (REQUEST_ID_HEADER.lower().encode("ascii"), request_id.encode("ascii")),
            (
                CORRELATION_ID_HEADER.lower().encode("ascii"),
                correlation_id.encode("ascii"),
            ),
        ]
    )
    return filtered


def _inject_context_headers(
    headers: list[tuple[bytes, bytes]],
    request_id: str,
    correlation_id: str,
) -> list[tuple[bytes, bytes]]:
    """Add generated IDs only when the caller did not supply those headers."""

    present = {name.lower() for name, _ in headers}
    injected = list(headers)
    if REQUEST_ID_HEADER.lower().encode("ascii") not in present:
        injected.append(
            (REQUEST_ID_HEADER.lower().encode("ascii"), request_id.encode("ascii"))
        )
    if CORRELATION_ID_HEADER.lower().encode("ascii") not in present:
        injected.append(
            (
                CORRELATION_ID_HEADER.lower().encode("ascii"),
                correlation_id.encode("ascii"),
            )
        )
    return injected


def _request_outcome(status_code: int, exception_type: str | None) -> str:
    if exception_type is not None:
        return "exception"
    if status_code >= 500:
        return "server_error"
    if status_code >= 400:
        return "client_error"
    return "success"


def _request_log_level(status_code: int, exception_type: str | None) -> int:
    if exception_type is not None or status_code >= 500:
        return logging.ERROR
    if status_code >= 400:
        return logging.WARNING
    return logging.INFO


def _header_value(scope: dict[str, Any], name: str) -> str | None:
    wanted = name.lower().encode("ascii")
    values = []
    for header_name, header_value in scope.get("headers", []):
        if header_name.lower() == wanted:
            try:
                values.append(header_value.decode("ascii"))
            except UnicodeDecodeError:
                return None
    return values[0] if len(values) == 1 else None
