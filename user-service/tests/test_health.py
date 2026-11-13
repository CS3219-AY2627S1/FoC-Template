"""Tests for the User Service health endpoint."""

import logging

from sqlalchemy.exc import OperationalError
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app


client = TestClient(app)


def test_health_check():
    """The health endpoint reports that the service is healthy."""

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


class FakeDatabase:
    """Database double for readiness checks."""

    def __init__(self, error=None):
        self.error = error
        self.queries = []

    def execute(self, query):
        """Record the readiness query or raise the configured database error."""

        self.queries.append(str(query))
        if self.error:
            raise self.error


def override_database(database):
    """Provide a database double through FastAPI dependency injection."""

    def dependency():
        yield database

    return dependency


def test_readiness_check_requires_a_working_database():
    """Readiness returns 200 after the database accepts SELECT 1."""

    database = FakeDatabase()
    app.dependency_overrides[get_db] = override_database(database)

    try:
        response = client.get("/ready")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert database.queries == ["SELECT 1"]


def test_readiness_check_returns_503_when_database_is_unavailable(caplog):
    """Readiness returns 503 and emits an operational failure event."""

    database = FakeDatabase(
        error=OperationalError("SELECT 1", {}, Exception("database unavailable"))
    )
    app.dependency_overrides[get_db] = override_database(database)

    with caplog.at_level(logging.WARNING, logger="app.main"):
        try:
            response = client.get("/ready")
        finally:
            app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable"}
    assert any(
        getattr(record, "event", None) == "readiness_check_failed"
        for record in caplog.records
    )
