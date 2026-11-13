# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-29 to 2026-09-30
# Scope: Writing implementation code — add a test proving liveness does not connect to an unavailable database.
# Scope: Writing implementation code — run liveness tests against an unavailable authentication transport and verify anonymous and credential-bearing probes never resolve sessions or contact User Service. (ai-20260930-022)
# Author review: Keith confirmed review of all affected readiness changes. Keith confirmed review of public-read registration changes (ai-20260930-022).
# Details: ../../ai/usage-log.md; ai-20260929-002; ai-20260930-022

from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients.user_service import UserServiceClient

def test_health_returns_healthy(client: TestClient):
    # Send a GET request to "/health" and store the response
    res = client.get("/health")

    # Assert that the response status code is 200
    assert res.status_code == 200

    # Assert that the response JSON equals {"status": "healthy"}
    assert res.json() == {"status": "healthy"}


def test_health_does_not_connect_to_database(client: TestClient, monkeypatch):
    from unittest.mock import MagicMock

    connect = MagicMock(side_effect=RuntimeError("Database unavailable"))
    monkeypatch.setattr(client.app.state.engine, "connect", connect)

    res = client.get("/health")

    assert res.status_code == 200
    assert res.json() == {"status": "healthy"}
    connect.assert_not_called()


@pytest.fixture(autouse=True)
def unavailable_user_service(settings, monkeypatch):
    """Every probe test runs with an unreachable authentication transport."""
    transport = MagicMock(side_effect=httpx.ConnectError("User Service unavailable"))
    upstream = UserServiceClient(settings, transport=httpx.MockTransport(transport))
    resolve = MagicMock(wraps=upstream.resolve_identity)
    monkeypatch.setattr(upstream, "resolve_identity", resolve)
    monkeypatch.setattr("app.main.UserServiceClient", lambda settings: upstream)
    try:
        yield
    finally:
        upstream.close()
        resolve.assert_not_called()
        transport.assert_not_called()


@pytest.mark.parametrize("authorization", [None, "Bearer valid-admin", "Bearer revoked", "Basic malformed"])
def test_health_ignores_credentials_during_auth_outage(client, authorization):
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.get("/health", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
