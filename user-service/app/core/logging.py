# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-03
# Scope: Added redaction for email-provider diagnostic output.
# Author review: I validated correctness and added boundary checks where needed.

# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21
# Tool: GitHub Copilot, date: 2026-09-20
# Scope: Implemented structured logs, secret redaction, and logging updates for event
# publishing.
# Author review: I validated correctness and added boundary checks where needed.

"""JSON logging that prevents structured context from exposing credentials."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from app.core.correlation import current_correlation_id

_SENSITIVE_KEY_PARTS = (
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "databaseurl",
    "otp",
    "password",
    "privatekey",
    "refresh",
    "secret",
    "token",
)
_REDACTED = "[REDACTED]"
_SENSITIVE_MESSAGE_VALUE = re.compile(
    r"""(?ix)
    \b
    (?:
        authorization|cookie|credential|database[\s_-]*url|otp|password|
        api[\s_-]*key|private[\s_-]*key|refresh(?:[\s_-]*token)?|secret|token
    )
    \b
    \s*(?::|=)\s*
    (?:[^,;\]\}\r\n]+)
    """
)


def is_sensitive_key(key: object) -> bool:
    """Identify data keys that must never reach a log sink."""

    normalized = re.sub(r"[^a-z0-9]", "", str(key).casefold())
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def redact_message(message: object) -> str:
    """Redact labelled secret values embedded in otherwise static messages."""

    return _SENSITIVE_MESSAGE_VALUE.sub(_REDACTED, str(message))


def redact_context(value: Any, key: object | None = None) -> Any:
    """Recursively remove secrets from structured logging context."""

    if key is not None and is_sensitive_key(key):
        return _REDACTED
    if isinstance(value, Mapping):
        return {
            str(item_key): redact_context(item_value, item_key)
            for item_key, item_value in value.items()
        }
    if isinstance(value, list | tuple | set):
        return [redact_context(item) for item in value]
    return value


class RedactingFilter(logging.Filter):
    """Ensure explicitly supplied logging context is redacted before formatting."""

    def filter(self, record: logging.LogRecord) -> bool:
        # Positional arguments have no reliable sensitivity metadata. Do not interpolate
        # them: service logs must put dynamic, redacted fields in ``context`` instead.
        record.msg = redact_message(record.msg)
        record.args = ()
        if hasattr(record, "context"):
            record.context = redact_context(record.context)
        for key in tuple(record.__dict__):
            if is_sensitive_key(key):
                record.__dict__[key] = _REDACTED
        return True


class JsonFormatter(logging.Formatter):
    """Write a compact structured log entry with correlation context."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            # Do not call ``getMessage``: a handler misconfiguration must not make
            # positional interpolation an accidental secret-exfiltration path.
            "message": redact_message(record.msg),
            "correlationId": getattr(record, "correlation_id", current_correlation_id.get()),
        }
        if hasattr(record, "event"):
            payload["event"] = record.event
        if hasattr(record, "context"):
            payload["context"] = redact_context(record.context)
        if record.exc_info:
            payload["exceptionType"] = record.exc_info[0].__name__
        return json.dumps(payload, default=str, separators=(",", ":"))


def configure_logging(level: str) -> None:
    """Configure only this service's logger to avoid changing host application logs."""

    # AMQP client log messages can include connection URLs. Outbox failures are
    # already recorded through this service's redacted structured logger.
    # SDK debug output can contain request bodies/Authorization headers, including
    # verification codes. Record provider failures only through our safe logger.
    for dependency_logger_name in ("aio_pika", "aiormq", "boto3", "botocore"):
        logging.getLogger(dependency_logger_name).setLevel(logging.CRITICAL)
    logger = logging.getLogger("user_service")
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.addFilter(RedactingFilter())
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(level.upper())
    logger.propagate = False


logger = logging.getLogger("user_service")
