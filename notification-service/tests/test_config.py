# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Writing implementation code — write tests for valid, missing, empty, whitespace-only, and wrong-scheme DATABASE_URL values, LOG_LEVEL validation, API startup failure, and non-zero worker exit.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-04
# Scope: Writing implementation code — add tests for worker-only settings: the Kafka bootstrap servers, NOTIFICATIONS_START_AT validation, and the API not needing either (ai-20261104-003).
# Author review: Keith confirmed verification, with 551 tests passed on the Pytest suite (ai-20261104-003).
# Details: notification-service/ai/usage-log.md; ai-20261104-003
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-05
# Scope: Writing implementation code — add tests for NOTIFICATION_RETRY_BACKOFF_SECONDS parsing and startup failure (ai-20261105-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16 and Kafka 4.1.2, 645 passed; code manually read and verified; manual checks in an isolated Compose run (ai-20261105-001).
# Details: notification-service/ai/usage-log.md; ai-20261105-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — add tests for the API-only User Service settings (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — add tests for the SSE_HEARTBEAT_SECONDS and SSE_MAX_LIFETIME_SECONDS settings (ai-20261108-002).
# Author review: Keith confirmed on 2026-11-09: full pytest suite (.venv/bin/python -m pytest -rs), 918 passed and 5 skipped; manual SSE checks against the local Compose stack (ai-20261108-002).
# Details: notification-service/ai/usage-log.md; ai-20261108-002

import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import ApiSettings, ConfigError, Settings, WorkerSettings
from app.main import create_app

SERVICE_ROOT = Path(__file__).resolve().parents[1]
VALID_URL = "postgresql+psycopg://notification@notification-db:5432/foc_notifications"


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", VALID_URL)
    monkeypatch.delenv("LOG_LEVEL", raising=False)
    return monkeypatch


def test_valid_environment_loads(env) -> None:
    settings = Settings.from_env()

    assert settings.database_url == VALID_URL
    assert settings.log_level == "INFO"


def test_log_level_is_normalised(env) -> None:
    env.setenv("LOG_LEVEL", "debug")

    assert Settings.from_env().log_level == "DEBUG"


@pytest.mark.parametrize("value", [None, "", "   "])
def test_missing_or_empty_database_url_is_rejected(env, value) -> None:
    if value is None:
        env.delenv("DATABASE_URL")
    else:
        env.setenv("DATABASE_URL", value)

    with pytest.raises(ConfigError, match="DATABASE_URL must be set"):
        Settings.from_env()


@pytest.mark.parametrize(
    "value",
    ["postgresql://u@h/db", "sqlite:///x.db", "not-a-url"],
)
def test_database_url_with_wrong_scheme_is_rejected(env, value: str) -> None:
    env.setenv("DATABASE_URL", value)

    with pytest.raises(ConfigError, match="DATABASE_URL"):
        Settings.from_env()


def test_invalid_log_level_is_rejected(env) -> None:
    env.setenv("LOG_LEVEL", "LOUD")

    with pytest.raises(ConfigError, match="LOG_LEVEL"):
        Settings.from_env()


@pytest.fixture
def worker_env(env):
    env.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    env.setenv("NOTIFICATIONS_START_AT", "2026-11-04T08:30:00+08:00")
    env.delenv("NOTIFICATION_RETRY_BACKOFF_SECONDS", raising=False)
    return env


def test_valid_worker_environment_loads(worker_env) -> None:
    settings = WorkerSettings.from_env()

    assert settings.database_url == VALID_URL
    assert settings.kafka_bootstrap_servers == "kafka:9092"
    assert settings.notifications_start_at == datetime(
        2026, 11, 4, 8, 30, tzinfo=timezone(timedelta(hours=8))
    )


def test_start_at_accepts_utc_designator(worker_env) -> None:
    worker_env.setenv("NOTIFICATIONS_START_AT", "2026-11-04T00:30:00Z")

    assert WorkerSettings.from_env().notifications_start_at.utcoffset() == timedelta(0)


@pytest.mark.parametrize("name", ["KAFKA_BOOTSTRAP_SERVERS", "NOTIFICATIONS_START_AT"])
@pytest.mark.parametrize("value", [None, "", "   "])
def test_missing_worker_setting_is_rejected(worker_env, name, value) -> None:
    if value is None:
        worker_env.delenv(name)
    else:
        worker_env.setenv(name, value)

    with pytest.raises(ConfigError, match=f"{name} must be set"):
        WorkerSettings.from_env()


@pytest.mark.parametrize(
    "value",
    [
        "2026-11-04T08:30:00",
        "2026-11-04",
        "2026-11-04 08:30:00+08:00",
        "not-a-date",
        "2026-13-04T08:30:00+08:00",
        "2026-11-04T08:30:00+25:00",
    ],
)
def test_invalid_start_at_is_rejected_without_echoing_it(worker_env, value) -> None:
    worker_env.setenv("NOTIFICATIONS_START_AT", value)

    with pytest.raises(ConfigError, match="NOTIFICATIONS_START_AT") as raised:
        WorkerSettings.from_env()
    assert value not in str(raised.value)


def test_retry_backoff_defaults_when_unset(worker_env) -> None:
    assert WorkerSettings.from_env().retry_backoff_seconds == (0.5, 1.0, 2.0, 4.0)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0.25, 1 ,5", (0.25, 1.0, 5.0)),
        ("3", (3.0,)),
        ("", ()),
        ("   ", ()),
    ],
)
def test_retry_backoff_is_parsed(worker_env, value, expected) -> None:
    worker_env.setenv("NOTIFICATION_RETRY_BACKOFF_SECONDS", value)

    assert WorkerSettings.from_env().retry_backoff_seconds == expected


@pytest.mark.parametrize(
    "value",
    ["abc", "1,abc", "0", "-1", "1,0", "1,,2", "1,", ",", "nan", "inf", "-inf", "1e999", "1e-999"],
)
def test_invalid_retry_backoff_is_rejected(worker_env, value) -> None:
    worker_env.setenv("NOTIFICATION_RETRY_BACKOFF_SECONDS", value)

    with pytest.raises(ConfigError, match="NOTIFICATION_RETRY_BACKOFF_SECONDS"):
        WorkerSettings.from_env()


def test_worker_exits_non_zero_on_invalid_retry_backoff() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "app.worker"],
        cwd=SERVICE_ROOT,
        env={
            **os.environ,
            "DATABASE_URL": VALID_URL,
            "KAFKA_BOOTSTRAP_SERVERS": "kafka:9092",
            "NOTIFICATIONS_START_AT": "2026-11-04T08:30:00+08:00",
            "NOTIFICATION_RETRY_BACKOFF_SECONDS": "1,soon",
        },
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode != 0
    assert "NOTIFICATION_RETRY_BACKOFF_SECONDS must be" in result.stderr
    assert "notification_worker_started" not in result.stderr


def test_api_settings_do_not_need_worker_settings(env) -> None:
    env.delenv("KAFKA_BOOTSTRAP_SERVERS", raising=False)
    env.delenv("NOTIFICATIONS_START_AT", raising=False)

    assert Settings.from_env().database_url == VALID_URL


@pytest.fixture
def api_env(env):
    env.setenv("USER_SERVICE_URL", "https://user-service:8080")
    env.setenv("USER_SERVICE_CA_FILE", "/run/tls/ca.crt")
    return env


def test_api_settings_load_user_service_settings(api_env) -> None:
    settings = ApiSettings.from_env()

    assert settings.database_url == VALID_URL
    assert settings.user_service_url == "https://user-service:8080"
    assert settings.user_service_ca_file == "/run/tls/ca.crt"


def test_worker_settings_do_not_need_user_service_settings(env) -> None:
    env.delenv("USER_SERVICE_URL", raising=False)
    env.delenv("USER_SERVICE_CA_FILE", raising=False)
    env.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    env.setenv("NOTIFICATIONS_START_AT", "2026-11-04T08:30:00+08:00")

    assert WorkerSettings.from_env().database_url == VALID_URL


@pytest.mark.parametrize("name", ["USER_SERVICE_URL", "USER_SERVICE_CA_FILE"])
@pytest.mark.parametrize("value", [None, "", "   "])
def test_missing_or_empty_user_service_setting_is_rejected(api_env, name, value) -> None:
    if value is None:
        api_env.delenv(name)
    else:
        api_env.setenv(name, value)

    with pytest.raises(ConfigError, match=f"{name} must be set"):
        ApiSettings.from_env()


@pytest.mark.parametrize(
    "value", ["http://user-service:8080", "user-service:8080", "https://"]
)
def test_non_https_user_service_url_is_rejected(api_env, value) -> None:
    api_env.setenv("USER_SERVICE_URL", value)

    with pytest.raises(ConfigError, match="USER_SERVICE_URL must be an HTTPS URL"):
        ApiSettings.from_env()


def test_sse_settings_default_when_unset(api_env) -> None:
    api_env.delenv("SSE_HEARTBEAT_SECONDS", raising=False)
    api_env.delenv("SSE_MAX_LIFETIME_SECONDS", raising=False)

    settings = ApiSettings.from_env()

    assert settings.sse_heartbeat_seconds == 20
    assert settings.sse_max_lifetime_seconds == 600


@pytest.mark.parametrize("name", ["SSE_HEARTBEAT_SECONDS", "SSE_MAX_LIFETIME_SECONDS"])
@pytest.mark.parametrize("value", ["", "   "])
def test_empty_sse_setting_uses_the_default(api_env, name, value) -> None:
    api_env.setenv(name, value)

    settings = ApiSettings.from_env()

    assert settings.sse_heartbeat_seconds == 20
    assert settings.sse_max_lifetime_seconds == 600


def test_sse_settings_are_parsed(api_env) -> None:
    api_env.setenv("SSE_HEARTBEAT_SECONDS", " 5 ")
    api_env.setenv("SSE_MAX_LIFETIME_SECONDS", "30.5")

    settings = ApiSettings.from_env()

    assert settings.sse_heartbeat_seconds == 5
    assert settings.sse_max_lifetime_seconds == 30.5


@pytest.mark.parametrize("name", ["SSE_HEARTBEAT_SECONDS", "SSE_MAX_LIFETIME_SECONDS"])
@pytest.mark.parametrize("value", ["0", "-1", "abc", "nan", "inf", "1,2", "20s"])
def test_invalid_sse_setting_is_rejected(api_env, name, value) -> None:
    api_env.setenv(name, value)

    with pytest.raises(ConfigError, match=f"{name} must be a positive number of seconds"):
        ApiSettings.from_env()


def test_worker_settings_do_not_need_sse_settings(env) -> None:
    env.setenv("SSE_HEARTBEAT_SECONDS", "abc")
    env.setenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
    env.setenv("NOTIFICATIONS_START_AT", "2026-11-04T08:30:00+08:00")

    assert WorkerSettings.from_env().database_url == VALID_URL


def test_api_startup_fails_without_user_service_url(api_env) -> None:
    api_env.delenv("USER_SERVICE_URL")

    with pytest.raises(ConfigError, match="USER_SERVICE_URL must be set"):
        with TestClient(create_app()):
            pass


def test_api_startup_fails_without_database_url(env) -> None:
    env.delenv("DATABASE_URL")

    with pytest.raises(ConfigError, match="DATABASE_URL must be set"):
        with TestClient(create_app()):
            pass


def _run_module(module: str, database_url: str) -> subprocess.CompletedProcess:
    environment = {
        key: value for key, value in os.environ.items() if key != "DATABASE_URL"
    }
    environment["DATABASE_URL"] = database_url
    return subprocess.run(
        [sys.executable, "-m", module],
        cwd=SERVICE_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )


@pytest.mark.parametrize("database_url", ["", "mysql://u@h/db"])
def test_worker_exits_non_zero_on_invalid_configuration(database_url: str) -> None:
    result = _run_module("app.worker", database_url)

    assert result.returncode != 0
    assert "DATABASE_URL" in result.stderr


def test_worker_exits_non_zero_without_start_at() -> None:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key != "NOTIFICATIONS_START_AT"
    }
    environment["DATABASE_URL"] = VALID_URL
    environment["KAFKA_BOOTSTRAP_SERVERS"] = "kafka:9092"
    result = subprocess.run(
        [sys.executable, "-m", "app.worker"],
        cwd=SERVICE_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode != 0
    assert "NOTIFICATIONS_START_AT" in result.stderr
