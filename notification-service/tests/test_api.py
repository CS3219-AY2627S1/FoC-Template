# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
# Scope: Writing implementation code; Debugging assistance — write tests for /health without database access, /ready success, 503 after the database becomes unreachable, fast 503 for refused PostgreSQL connections, and bounded 503 for a hanging database.
# Author review: Keith confirmed review of all affected changes.
# Details: notification-service/ai/usage-log.md; ai-20261103-001
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — build ApiSettings for create_app (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001

import threading
import time
import logging
from pathlib import Path

import certifi
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app import main as main_module
from app.config import ApiSettings
from app.main import create_app


def api_settings(database_url: str) -> ApiSettings:
    return ApiSettings(
        database_url=database_url,
        user_service_url="https://user-service.test",
        user_service_ca_file=certifi.where(),
    )


def sqlite_settings(tmp_path: Path) -> ApiSettings:
    return api_settings(f"sqlite+pysqlite:///{tmp_path / 'notify.db'}")


def test_health_returns_200(tmp_path: Path) -> None:
    with TestClient(create_app(sqlite_settings(tmp_path))) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_http_requests_emit_structured_completion_fields(tmp_path: Path, caplog) -> None:
    with caplog.at_level(logging.INFO):
        with TestClient(create_app(sqlite_settings(tmp_path))) as client:
            response = client.get(
                "/health",
                headers={
                    "X-Request-ID": "11111111-1111-4111-8111-111111111111",
                    "X-Correlation-ID": "22222222-2222-4222-8222-222222222222",
                },
            )

    record = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "http_request_completed"
        and record.fields.get("route") == "/health"
    )
    assert response.status_code == 200
    assert record.fields["method"] == "GET"
    assert record.fields["status_code"] == 200
    assert record.fields["outcome"] == "success"
    assert record.fields["duration_ms"] >= 0


def test_health_does_not_touch_the_database(tmp_path: Path) -> None:
    app = create_app(sqlite_settings(tmp_path))
    with TestClient(app) as client:
        app.state.engine.connect = _raise_operational_error
        response = client.get("/health")

    assert response.status_code == 200


def test_ready_returns_200_when_database_is_reachable(tmp_path: Path) -> None:
    with TestClient(create_app(sqlite_settings(tmp_path))) as client:
        response = client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_ready_returns_503_when_database_becomes_unreachable(tmp_path: Path) -> None:
    app = create_app(sqlite_settings(tmp_path))
    with TestClient(app) as client:
        assert client.get("/ready").status_code == 200

        app.state.engine.connect = _raise_operational_error
        response = client.get("/ready")

        assert response.status_code == 503
        assert response.json() == {"status": "not_ready"}
        # The process keeps serving after a failed readiness check.
        assert client.get("/health").status_code == 200


def test_ready_returns_503_quickly_for_unreachable_postgres() -> None:
    # Port 1 on loopback refuses connections; the check must not hang.
    settings = api_settings(
        "postgresql+psycopg://nobody@127.0.0.1:1/foc_notifications"
    )
    with TestClient(create_app(settings)) as client:
        started = time.monotonic()
        response = client.get("/ready")
        elapsed = time.monotonic() - started

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}
    assert elapsed < 5


def test_ready_returns_503_within_deadline_when_database_hangs(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(main_module, "READY_TIMEOUT_SECONDS", 0.3)
    release = threading.Event()
    app = create_app(sqlite_settings(tmp_path))
    with TestClient(app) as client:
        app.state.engine.connect = lambda *a, **k: release.wait(10)

        started = time.monotonic()
        first = client.get("/ready")
        first_elapsed = time.monotonic() - started

        # A second probe while the first is still blocked fails immediately.
        started = time.monotonic()
        second = client.get("/ready")
        second_elapsed = time.monotonic() - started

        release.set()

    assert first.status_code == 503
    assert first_elapsed < 2
    assert second.status_code == 503
    assert second_elapsed < 0.3


def _raise_operational_error(*_args, **_kwargs):
    raise OperationalError("SELECT 1", {}, Exception("database unavailable"))
