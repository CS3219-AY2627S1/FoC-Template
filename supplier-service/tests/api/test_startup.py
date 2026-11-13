# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write controlled-double lifecycle tests for deferred creation, injected and environment settings, request reuse, separate lifespans, partial initialization failures, cleanup exceptions, and no upstream startup or liveness requests.
# Author review: Keith confirmed review of lifecycle changes.
# Details: ../../ai/usage-log.md; ai-20260930-020

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from pydantic import ValidationError
from unittest.mock import MagicMock
from app.config import Settings
from app.main import create_app


def test_startup_rejects_invalid_configuration(monkeypatch: pytest.MonkeyPatch, resources):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test_user:test_password@localhost:5432/test_supplier")
    monkeypatch.setenv("USER_SERVICE_URL", "https://localhost:8000")
    monkeypatch.setenv("AUTH_TIMEOUT_SECONDS", "0")    
    monkeypatch.setenv("LOG_LEVEL", "INFO")

    # Called without injected settings, startup loads them from the environment
    app = create_app()

    with pytest.raises(ValidationError) as exc_info:
        # Enter a TestClient context using app
        with TestClient(app):
            pass

    errors = exc_info.value.errors()

    # Assert that an error identifies auth_timeout_seconds
    assert any(
        error["loc"] == ("auth_timeout_seconds",)
        for error in errors
    )
    _, _, build_engine, build_client, build_sessions = resources
    build_engine.assert_not_called()
    build_client.assert_not_called()
    build_sessions.assert_not_called()

def test_startup_initializes_database_and_shutdown_disposes_engine(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
):
    engine = MagicMock()
    session_factory = MagicMock()
    build_engine = MagicMock(return_value=engine)
    build_session_factory = MagicMock(return_value=session_factory)

    monkeypatch.setattr("app.main.create_db_engine", build_engine)
    monkeypatch.setattr(
        "app.main.create_session_factory",
        build_session_factory,
    )

    app = create_app(settings)

    with TestClient(app):
        # Assert app.state.settings is settings
        assert app.state.settings is settings

        # Verify build_engine was called once with settings
        build_engine.assert_called_once_with(settings)

        # Verify build_session_factory was called once with engine
        build_session_factory.assert_called_once_with(engine)

        # Assert app.state.engine is engine
        assert app.state.engine is engine

        # Assert app.state.session_factory is session_factory
        assert app.state.session_factory is session_factory

        # Verify engine.dispose has not been called yet
        engine.dispose.assert_not_called()

    # Verify engine.dispose was called once without arguments
    engine.dispose.assert_called_once_with()


@pytest.fixture
def resources(monkeypatch):
    engine = MagicMock()
    user_client = MagicMock()
    build_engine = MagicMock(return_value=engine)
    build_client = MagicMock(return_value=user_client)
    build_sessions = MagicMock()
    monkeypatch.setattr("app.main.create_db_engine", build_engine)
    monkeypatch.setattr("app.main.UserServiceClient", build_client)
    monkeypatch.setattr("app.main.create_session_factory", build_sessions)
    return engine, user_client, build_engine, build_client, build_sessions


@pytest.mark.parametrize("app_env", [None, "production"])
def test_production_http_rejected_before_resources_are_created(
    monkeypatch, resources, app_env,
):
    if app_env is None:
        monkeypatch.delenv("APP_ENV", raising=False)
    else:
        monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://test_user:test_password@localhost:5432/test_supplier",
    )
    monkeypatch.setenv("USER_SERVICE_URL", "http://users.example.test")
    monkeypatch.setenv("AUTH_TIMEOUT_SECONDS", "3")
    monkeypatch.setenv("LOG_LEVEL", "INFO")

    with pytest.raises(ValidationError, match="USER_SERVICE_URL must use HTTPS"):
        with TestClient(create_app()):
            pytest.fail("Production HTTP configuration must prevent startup")

    _, _, build_engine, build_client, build_sessions = resources
    build_engine.assert_not_called()
    build_client.assert_not_called()
    build_sessions.assert_not_called()


@pytest.mark.parametrize("use_environment", [False, True])
def test_client_created_at_startup_reused_and_closed(
    settings, monkeypatch, resources, use_environment,
):
    engine, user_client, build_engine, build_client, build_sessions = resources
    if use_environment:
        monkeypatch.setenv("DATABASE_URL", str(settings.database_url))
        monkeypatch.setenv("USER_SERVICE_URL", "https://users.example.test:8443")
        monkeypatch.setenv("AUTH_TIMEOUT_SECONDS", "1.25")
        monkeypatch.setenv("LOG_LEVEL", "INFO")
    app = create_app(None if use_environment else settings)
    build_engine.assert_not_called()
    build_client.assert_not_called()

    # A test-only consumer observes the same application-scoped object each time.
    observed = []

    @app.get("/test-client")
    def observe_client(request: Request):
        observed.append(request.app.state.user_service_client)
        return {"ok": True}

    with TestClient(app) as client:
        configured = app.state.settings
        if use_environment:
            assert str(configured.user_service_url) == "https://users.example.test:8443/"
            assert configured.auth_timeout_seconds == 1.25
        else:
            assert configured is settings
        build_client.assert_called_once_with(configured)
        build_engine.assert_called_once_with(configured)
        build_sessions.assert_called_once_with(engine)
        assert app.state.user_service_client is user_client
        for _ in range(2):
            assert client.get("/test-client").json() == {"ok": True}
        assert observed == [user_client, user_client]
        assert client.get("/health").status_code == 200
        user_client.resolve_identity.assert_not_called()
        user_client.close.assert_not_called()
        engine.dispose.assert_not_called()
        build_client.assert_called_once()

    user_client.close.assert_called_once_with()
    engine.dispose.assert_called_once_with()


@pytest.mark.parametrize("failure_stage", ["engine", "client", "sessions"])
def test_partial_startup_failure_cleans_created_resources(settings, resources, failure_stage):
    engine, user_client, build_engine, build_client, build_sessions = resources
    failure = RuntimeError("startup failed")
    builders = {"engine": build_engine, "client": build_client, "sessions": build_sessions}
    builders[failure_stage].side_effect = failure
    app = create_app(settings)

    with pytest.raises(RuntimeError) as caught:
        with TestClient(app):
            pytest.fail("Startup should not complete")
    assert caught.value is failure
    user_client.resolve_identity.assert_not_called()
    if failure_stage == "engine":
        build_client.assert_not_called()
        engine.dispose.assert_not_called()
    else:
        engine.dispose.assert_called_once_with()
    if failure_stage == "sessions":
        user_client.close.assert_called_once_with()
    else:
        user_client.close.assert_not_called()
        build_sessions.assert_not_called()


def test_engine_disposed_even_if_client_close_fails(settings, resources):
    engine, user_client, _, _, _ = resources
    failure = RuntimeError("close failed")
    user_client.close.side_effect = failure
    with pytest.raises(RuntimeError) as caught:
        with TestClient(create_app(settings)):
            pass
    assert caught.value is failure
    user_client.close.assert_called_once_with()
    engine.dispose.assert_called_once_with()


def test_each_lifespan_gets_a_new_client(settings, resources):
    engine, first_client, _, build_client, _ = resources
    second_client = MagicMock()
    build_client.side_effect = [first_client, second_client]
    app = create_app(settings)
    for expected in (first_client, second_client):
        with TestClient(app):
            assert app.state.user_service_client is expected
            expected.close.assert_not_called()
        expected.close.assert_called_once_with()
    assert build_client.call_count == 2
    assert engine.dispose.call_count == 2


def test_lifespan_with_real_wrapper_makes_no_upstream_requests(settings, monkeypatch):
    import httpx
    from app.clients.user_service import UserServiceClient

    requests = []
    clients = []

    def reject_request(request):
        requests.append(request)
        raise AssertionError("Startup and liveness must not contact User Service")

    def build_client(configured):
        client = UserServiceClient(configured, transport=httpx.MockTransport(reject_request))
        clients.append(client)
        return client

    monkeypatch.setattr("app.main.UserServiceClient", build_client)
    app = create_app(settings)
    assert clients == []
    with TestClient(app) as client:
        assert len(clients) == 1
        assert not clients[0]._client.is_closed
        assert client.get("/health").status_code == 200
    assert requests == []
    assert clients[0]._client.is_closed
