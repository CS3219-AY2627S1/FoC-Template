# AI Assistance Disclosure (hwangjihun):
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-21
# Scope: Generated and refined Supplier regression tests and test fixtures.
# Author review: I validated correctness, and added boundary checks.

"""Health endpoints stay independent of authentication and fail safely on database faults."""

import asyncio
import os
from unittest.mock import AsyncMock
from urllib.parse import urlparse

import psycopg
import pytest
from fastapi.testclient import TestClient

from app import health
from app.config import Settings, get_settings
from app.main import app

NOT_READY = {
    "error": {
        "code": "SERVICE_NOT_READY",
        "message": "The Supplier database is not ready.",
    }
}


def settings(database_url: str) -> Settings:
    return Settings(
        database_url=database_url,
        user_service_base_url="",
        supplier_service_shared_secret="",
        jwt_issuer="foc-user-service",
        jwt_audience="foc-services",
    )


@pytest.fixture
def client():
    app.dependency_overrides[get_settings] = lambda: settings("unused-in-http-test")
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def database(monkeypatch):
    connect = AsyncMock()
    monkeypatch.setattr(health.psycopg.AsyncConnection, "connect", connect)
    return connect, connect.return_value.__aenter__.return_value


def test_startup_and_liveness_do_not_need_database_or_authentication(monkeypatch):
    def unexpected_call(*_args, **_kwargs):
        raise AssertionError("Liveness must not access settings, PostgreSQL, or User Service")

    monkeypatch.setattr(health.psycopg.AsyncConnection, "connect", unexpected_call)
    app.dependency_overrides[get_settings] = unexpected_call
    try:
        with TestClient(app) as client:
            response = client.get("/health/live")
        assert response.status_code == 200
        assert response.json() == {"status": "live"}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("database_url", ["", " \t "])
def test_missing_database_configuration_is_not_ready(client, database, database_url):
    connect, _connection = database
    app.dependency_overrides[get_settings] = lambda: settings(database_url)
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == NOT_READY
    connect.assert_not_called()


@pytest.mark.parametrize("error_type", [psycopg.OperationalError, psycopg.ProgrammingError])
def test_unavailable_or_invalid_database_returns_sanitized_error(client, database, error_type):
    connect, _connection = database
    connect.side_effect = error_type("postgresql://private-user:private-password@private-host/db")
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == NOT_READY


@pytest.mark.parametrize(
    "error_type",
    [
        psycopg.errors.UndefinedTable,
        psycopg.errors.InsufficientPrivilege,
        psycopg.errors.QueryCanceled,
    ],
)
def test_missing_schema_permissions_or_query_timeout_is_not_ready(client, database, error_type):
    _connect, connection = database
    connection.execute.side_effect = error_type("Private database diagnostic")
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == NOT_READY


def test_readiness_succeeds_without_user_service_or_bearer_token(client, database):
    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readiness_recovers_on_a_later_request_without_restart(client, database):
    connect, connection = database
    connect.side_effect = psycopg.OperationalError("Database unavailable")
    assert client.get("/health/ready").status_code == 503
    assert client.get("/health/live").status_code == 200
    connect.side_effect = None
    connection.execute.side_effect = None
    assert client.get("/health/ready").json() == {"status": "ready"}


def test_total_probe_timeout_handles_a_stalled_database(client, database, monkeypatch):
    _connect, connection = database

    async def slow_query(_query):
        await asyncio.sleep(0.1)

    connection.execute.side_effect = slow_query
    monkeypatch.setattr(health, "PROBE_TIMEOUT_SECONDS", 0.01)
    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json() == NOT_READY


def test_readiness_checks_local_supplier_database(client):
    url = os.getenv("SUPPLIER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set SUPPLIER_TEST_DATABASE_URL to the local Supplier Supabase database")
    parsed = urlparse(url)
    if parsed.hostname not in ("localhost", "127.0.0.1") or parsed.port != 55322:
        pytest.fail("Readiness tests may run only against local Supplier PostgreSQL on port 55322")
    app.dependency_overrides[get_settings] = lambda: settings(url)
    response = client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
