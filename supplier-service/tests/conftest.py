import pytest

from fastapi import FastAPI
from app.main import create_app
from app.config import Settings
from collections.abc import Iterator
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def test_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    # HTTP is explicitly permitted for test settings and subprocesses.
    monkeypatch.setenv("APP_ENV", "test")


@pytest.fixture
def settings() -> Settings:
    return Settings(
        app_env="test",
        database_url="postgresql+psycopg://test_user:test_password@localhost:5432/test_supplier",      # A valid dummy PostgreSQL URL
        user_service_url="http://localhost:8000",                                               # A valid dummy HTTP URL
        auth_timeout_seconds=5,                                                                # A positive, finite number
        log_level="INFO",                                                                      # One of the allowed log levels
    )

@pytest.fixture
def app(settings: Settings) -> FastAPI:
    # Call create_app with the supplied settings and return the result
    return create_app(settings)

@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    # Open TestClient(app) using a "with" statement
    with TestClient(app) as client:
        # Yield the client from inside that block.
        yield client
