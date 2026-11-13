"""Request and message context carried by structured log records."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from collections.abc import Iterator
from typing import Any
from uuid import UUID


_context: ContextVar[dict[str, Any]] = ContextVar(
    "foc_observability_context", default={}
)

REQUEST_ID_HEADER = "X-Request-ID"
CORRELATION_ID_HEADER = "X-Correlation-ID"


def normalize_identifier(value: object) -> str | None:
    """Return a canonical UUID string, or ``None`` for untrusted input."""

    if not isinstance(value, str) or not value or len(value) > 128:
        return None

    try:
        return str(UUID(value))
    except (ValueError, AttributeError):
        return None


def context_headers() -> dict[str, str]:
    """Return only safe request context fields for an outbound HTTP request."""

    current = get_context()
    headers: dict[str, str] = {}
    request_id = normalize_identifier(current.get("request_id"))
    correlation_id = normalize_identifier(current.get("correlation_id"))
    if request_id is not None:
        headers[REQUEST_ID_HEADER] = request_id
    if correlation_id is not None:
        headers[CORRELATION_ID_HEADER] = correlation_id
    return headers


def get_context() -> dict[str, Any]:
    """Return a copy of the context active in the current execution flow."""

    return dict(_context.get())


def clear_context() -> None:
    """Clear context in the current execution flow."""

    _context.set({})


@contextmanager
def log_context(**fields: Any) -> Iterator[None]:
    """Temporarily add fields to all logs in the current execution flow.

    Context is restored when the block exits, which prevents one request or
    Kafka message from leaking identifiers into the next one.
    """

    current = get_context()
    current.update({key: value for key, value in fields.items() if value is not None})
    token = _context.set(current)
    try:
        yield
    finally:
        _context.reset(token)
