"""Structured stdout logging for FoC application processes."""

from __future__ import annotations

import json
import logging
import math
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any

from .context import get_context


_DEFAULT_LEVEL = "INFO"
_DEFAULT_ENVIRONMENT = "development"
_DEFAULT_COMPONENT = "application"
_DEFAULT_SERVICE_VERSION = "unknown"
LOG_SCHEMA_VERSION = 1
_REDACTED = "[REDACTED]"
_EVENT_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")
_RESERVED_LOG_FIELDS = frozenset(
    {
        "timestamp",
        "schema_version",
        "level",
        "service",
        "component",
        "service_version",
        "environment",
        "logger",
        "event",
        "exception",
    }
)
_SENSITIVE_KEY_MARKERS = frozenset(
    {
        "access_token",
        "api_key",
        "apikey",
        "authorization",
        "bearer",
        "body",
        "connection_string",
        "connection_url",
        "cookie",
        "credential",
        "credentials",
        "database_url",
        "db_url",
        "dsn",
        "header",
        "headers",
        "password",
        "passwd",
        "pwd",
        "raw_body",
        "refresh_token",
        "request_body",
        "response_body",
        "secret",
        "session_token",
        "set_cookie",
        "token",
    }
)
_BEARER_PATTERN = re.compile(r"(\bbearer\s+)[^\s,;]+", re.IGNORECASE)
_CREDENTIAL_URL_PATTERN = re.compile(
    r"(\b[a-z][a-z0-9+.-]*://)[^/\s:@]+(?::[^/\s@]*)?@",
    re.IGNORECASE,
)
_KEY_VALUE_SECRET_PATTERN = re.compile(
    r"""(?P<key>["']?\b(password|passwd|pwd|token|access[_-]?token|"""
    r"""refresh[_-]?token|session[_-]?token|secret|api[_-]?key|authorization|"""
    r"""credential|credentials|cookie|set[_-]?cookie|body|raw[_-]?body|"""
    r"""request[_-]?body|response[_-]?body|header|headers|database[_-]?url|"""
    r"""dsn|connection[_-]?string)["']?)"""
    r"""\s*(?P<separator>[:=])\s*(?P<value>"""
    r""""(?:\\.|[^"\\])*"|"""
    r"""\'(?:\\.|[^\'\\])*\'|"""
    r"""[^\s,;&]+)""",
    re.IGNORECASE,
)


class _JsonStreamHandler(logging.StreamHandler):
    """Marker type used to replace only handlers owned by this package."""

    foc_observability_handler = True

    def __init__(self) -> None:
        super().__init__(sys.stdout)


class JsonFormatter(logging.Formatter):
    """Render one log record as one JSON object.

    Application fields should be supplied under ``extra={"fields": {...}}``.
    Keeping application data in a dedicated mapping avoids collisions with
    Python's reserved ``LogRecord`` attributes.
    """

    def __init__(
        self,
        *,
        service: str,
        environment: str,
        component: str = _DEFAULT_COMPONENT,
        service_version: str = _DEFAULT_SERVICE_VERSION,
    ) -> None:
        super().__init__()
        self.service = _validate_metadata(service, "service")
        self.environment = _validate_metadata(environment, "environment")
        self.component = _validate_metadata(component, "component")
        self.service_version = _validate_metadata(service_version, "service_version")

    def format(self, record: logging.LogRecord) -> str:
        event = getattr(record, "event", record.getMessage())
        if not isinstance(event, str):
            event = record.getMessage()
        payload: dict[str, Any] = {
            "schema_version": LOG_SCHEMA_VERSION,
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "service": self.service,
            "component": self.component,
            "service_version": self.service_version,
            "environment": self.environment,
            "logger": record.name,
            "event": _redact_string(event),
        }

        context = get_context()
        fields = getattr(record, "fields", {})
        if fields:
            if not isinstance(fields, dict):
                raise TypeError("logging extra['fields'] must be a dictionary")
            payload.update(_application_fields(fields))
        payload.update(_application_fields(context))

        if record.exc_info:
            payload["exception"] = _redact_string(self.formatException(record.exc_info))

        return json.dumps(payload, default=str, ensure_ascii=True)


def _is_sensitive_key(key: object) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", "_", str(key).lower()).strip("_")
    return any(
        marker == normalized or marker in normalized
        for marker in _SENSITIVE_KEY_MARKERS
    )


def _validate_metadata(value: object, field_name: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or any(character.isspace() for character in value)
    ):
        raise ValueError(f"{field_name} must be a non-empty string without whitespace")
    return value


def _redact_string(value: str) -> str:
    value = _BEARER_PATTERN.sub(r"\1" + _REDACTED, value)
    value = _CREDENTIAL_URL_PATTERN.sub(r"\1" + _REDACTED + "@", value)
    return _KEY_VALUE_SECRET_PATTERN.sub(
        lambda match: (f"{match.group('key')}{match.group('separator')}{_REDACTED}"),
        value,
    )


def _sanitize_value(key: object, value: Any) -> Any:
    if _is_sensitive_key(key):
        return _REDACTED
    if isinstance(value, dict):
        return _sanitize_mapping(value)
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_sanitize_value(key, item) for item in value]
    if isinstance(value, str):
        return _redact_string(value)
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return _redact_string(str(value))


def _sanitize_mapping(fields: dict[Any, Any]) -> dict[str, Any]:
    return {str(key): _sanitize_value(key, value) for key, value in fields.items()}


def _application_fields(fields: dict[Any, Any]) -> dict[str, Any]:
    """Return sanitized fields without allowing envelope metadata collisions."""

    return {
        key: value
        for key, value in _sanitize_mapping(fields).items()
        if key not in _RESERVED_LOG_FIELDS
    }


def _level_name(level: str | int | None) -> str:
    if level is None:
        level = os.getenv("LOG_LEVEL", _DEFAULT_LEVEL)
    if isinstance(level, int):
        return logging.getLevelName(level)
    normalized = level.upper()
    if normalized not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        raise ValueError(f"Unsupported log level: {level!r}")
    return normalized


def configure_logging(
    service: str,
    *,
    component: str = _DEFAULT_COMPONENT,
    environment: str | None = None,
    service_version: str | None = None,
    level: str | int | None = None,
) -> None:
    """Configure the root logger and Uvicorn loggers for one process.

    Logs go to stdout so the container runtime can collect them. Calling this
    more than once is safe. Existing non-FoC root handlers are preserved so
    test capture handlers and embedding applications continue to work.
    """

    active_service = _validate_metadata(service, "service")

    active_environment = environment or os.getenv("APP_ENV") or _DEFAULT_ENVIRONMENT
    active_service_version = (
        service_version or os.getenv("APP_VERSION") or _DEFAULT_SERVICE_VERSION
    )
    formatter = JsonFormatter(
        service=active_service,
        environment=active_environment,
        component=component,
        service_version=active_service_version,
    )
    active_level = _level_name(level)

    root_logger = logging.getLogger()
    root_logger.setLevel(active_level)
    _replace_owned_handlers(root_logger, formatter)

    # Uvicorn otherwise keeps its own text handlers and can emit duplicate
    # records after application startup configuration. RequestContextMiddleware
    # emits the canonical structured access event, so suppress Uvicorn's
    # opaque duplicate access line.
    for logger_name in ("uvicorn", "uvicorn.error"):
        server_logger = logging.getLogger(logger_name)
        _remove_owned_handlers(server_logger)
        for handler in list(server_logger.handlers):
            server_logger.removeHandler(handler)
            handler.close()
        server_logger.addHandler(_new_handler(formatter))
        server_logger.setLevel(active_level)
        server_logger.propagate = False

    access_logger = logging.getLogger("uvicorn.access")
    _remove_owned_handlers(access_logger)
    for handler in list(access_logger.handlers):
        access_logger.removeHandler(handler)
        handler.close()
    access_logger.propagate = False
    access_logger.disabled = True

    # SQL statements and connection details should stay out of normal
    # production logs unless explicitly enabled locally.
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def _new_handler(formatter: JsonFormatter) -> _JsonStreamHandler:
    handler = _JsonStreamHandler()
    handler.setLevel(logging.NOTSET)
    handler.setFormatter(formatter)
    return handler


def _remove_owned_handlers(logger: logging.Logger) -> None:
    for handler in list(logger.handlers):
        if getattr(handler, "foc_observability_handler", False):
            logger.removeHandler(handler)
            handler.close()


def _replace_owned_handlers(logger: logging.Logger, formatter: JsonFormatter) -> None:
    _remove_owned_handlers(logger)
    logger.addHandler(_new_handler(formatter))


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    *,
    exc_info: Any = None,
    **fields: Any,
) -> None:
    """Write a named event with collision-safe structured fields."""

    if not isinstance(event, str) or not _EVENT_NAME_PATTERN.fullmatch(event):
        raise ValueError("event must be a non-empty lower_snake_case name")
    safe_event = _redact_string(event)
    logger.log(
        level,
        safe_event,
        extra={"event": safe_event, "fields": _sanitize_mapping(fields)},
        exc_info=exc_info,
    )
