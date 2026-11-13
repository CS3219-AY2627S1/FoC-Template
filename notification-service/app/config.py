# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Writing implementation code — write environment-backed settings that treat empty variables as missing, validate the DATABASE_URL scheme and LOG_LEVEL, and raise errors naming the variable.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code — add worker-only settings for the Kafka bootstrap servers and a required timezone-aware NOTIFICATIONS_START_AT (ai-20261104-003).
# Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
# Details: notification-service/ai/usage-log.md; ai-20261104-003
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
# Scope: Writing implementation code — add and validate NOTIFICATION_RETRY_BACKOFF_SECONDS (ai-20261105-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
# Details: notification-service/ai/usage-log.md; ai-20261105-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — add API-only ApiSettings with a required HTTPS USER_SERVICE_URL and USER_SERVICE_CA_FILE (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — add API-only SSE_HEARTBEAT_SECONDS and SSE_MAX_LIFETIME_SECONDS settings, validated as positive numbers of seconds (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002

"""Environment-backed configuration for the Notification Service."""

import math
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import sys
from urllib.parse import urlsplit

try:
    from foc_observability import configure_logging as configure_structured_logging
except ModuleNotFoundError:
    # Keep ``python -m app.worker`` usable from a source checkout when the
    # shared package has not been installed into the active environment.
    repository_root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repository_root / "packages/foc-observability/src"))
    from foc_observability import configure_logging as configure_structured_logging

DATABASE_URL_SCHEME = "postgresql+psycopg://"
LOG_LEVELS = ("CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG")
DEFAULT_RETRY_BACKOFF_SECONDS = (0.5, 1.0, 2.0, 4.0)
DEFAULT_SSE_HEARTBEAT_SECONDS = 20.0
DEFAULT_SSE_MAX_LIFETIME_SECONDS = 600.0


class ConfigError(RuntimeError):
    """Raised when a required environment variable is missing or invalid."""


def required_env(name: str) -> str:
    """Return a non-empty environment variable without logging its value."""

    value = os.getenv(name, "").strip()
    if not value:
        raise ConfigError(f"{name} must be set")
    return value


def _log_level_env(name: str, default: str) -> str:
    value = os.getenv(name, "").strip().upper() or default
    if value not in LOG_LEVELS:
        raise ConfigError(f"{name} must be one of: {', '.join(LOG_LEVELS)}")
    return value


@dataclass(frozen=True)
class Settings:
    """Runtime settings shared by the API and the worker."""

    database_url: str
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = required_env("DATABASE_URL")
        if not database_url.startswith(DATABASE_URL_SCHEME):
            raise ConfigError("DATABASE_URL must use the postgresql+psycopg scheme")
        return cls(
            database_url=database_url,
            log_level=_log_level_env("LOG_LEVEL", "INFO"),
        )


def _positive_seconds_env(name: str, default: float) -> float:
    """Unset or empty means ``default``; otherwise a positive finite number."""

    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    message = f"{name} must be a positive number of seconds"
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(message) from None
    # float() also accepts "nan" and "inf", and nan compares false to everything.
    if not (math.isfinite(value) and value > 0):
        raise ConfigError(message)
    return value


@dataclass(frozen=True, kw_only=True)
class ApiSettings(Settings):
    """Settings only the API needs, so the worker does not have to supply them."""

    user_service_url: str
    user_service_ca_file: str
    sse_heartbeat_seconds: float = DEFAULT_SSE_HEARTBEAT_SECONDS
    sse_max_lifetime_seconds: float = DEFAULT_SSE_MAX_LIFETIME_SECONDS

    @classmethod
    def from_env(cls) -> "ApiSettings":
        shared = Settings.from_env()
        user_service_url = required_env("USER_SERVICE_URL")
        parsed = urlsplit(user_service_url)
        if parsed.scheme.lower() != "https" or not parsed.hostname:
            raise ConfigError("USER_SERVICE_URL must be an HTTPS URL")
        return cls(
            database_url=shared.database_url,
            log_level=shared.log_level,
            user_service_url=user_service_url,
            user_service_ca_file=required_env("USER_SERVICE_CA_FILE"),
            sse_heartbeat_seconds=_positive_seconds_env(
                "SSE_HEARTBEAT_SECONDS", DEFAULT_SSE_HEARTBEAT_SECONDS
            ),
            sse_max_lifetime_seconds=_positive_seconds_env(
                "SSE_MAX_LIFETIME_SECONDS", DEFAULT_SSE_MAX_LIFETIME_SECONDS
            ),
        )


def _aware_datetime_env(name: str) -> datetime:
    value = required_env(name)
    message = f"{name} must be an ISO-8601 date and time with a timezone"
    # fromisoformat accepts any character as the date/time separator.
    if "T" not in value:
        raise ConfigError(message)
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise ConfigError(message) from None
    if parsed.utcoffset() is None:
        raise ConfigError(message)
    return parsed


def _retry_backoff_env(name: str, default: tuple[float, ...]) -> tuple[float, ...]:
    """Unset means ``default``; set but empty means no retries."""

    raw = os.getenv(name)
    if raw is None:
        return default
    if not raw.strip():
        return ()
    message = f"{name} must be a comma-separated list of positive numbers, or empty"
    try:
        delays = tuple(float(item) for item in raw.split(","))
    except ValueError:
        raise ConfigError(message) from None
    # float() also accepts "nan" and "inf", and nan compares false to everything.
    if not all(math.isfinite(delay) and delay > 0 for delay in delays):
        raise ConfigError(message)
    return delays


@dataclass(frozen=True, kw_only=True)
class WorkerSettings(Settings):
    """Settings only the worker needs, so the API does not have to supply them."""

    kafka_bootstrap_servers: str
    notifications_start_at: datetime
    retry_backoff_seconds: tuple[float, ...] = DEFAULT_RETRY_BACKOFF_SECONDS

    @classmethod
    def from_env(cls) -> "WorkerSettings":
        shared = Settings.from_env()
        return cls(
            database_url=shared.database_url,
            log_level=shared.log_level,
            kafka_bootstrap_servers=required_env("KAFKA_BOOTSTRAP_SERVERS"),
            notifications_start_at=_aware_datetime_env("NOTIFICATIONS_START_AT"),
            retry_backoff_seconds=_retry_backoff_env(
                "NOTIFICATION_RETRY_BACKOFF_SECONDS", DEFAULT_RETRY_BACKOFF_SECONDS
            ),
        )


def configure_logging(level: str, *, component: str) -> None:
    """Configure the shared structured logger for one Notification process."""

    configure_structured_logging(
        "notification-service",
        component=component,
        level=level,
    )
