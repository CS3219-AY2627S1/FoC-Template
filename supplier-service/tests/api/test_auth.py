# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write test-only protected routes and controlled-client/MockTransport tests for credential rejection, trusted roles, spoof resistance, dependency composition, request-local reuse, revocation, safe errors, blocked data access, opt-in protection, OpenAPI security, and worker-thread HTTP execution.
# Author review: Keith confirmed review of authentication-dependency changes.
# Details: ../../ai/usage-log.md; ai-20260930-021

"""Protected test-only routes exercise authentication without live services."""

from threading import get_ident
from typing import Annotated
from unittest.mock import Mock

import httpx
import pytest
from fastapi import Depends, HTTPException
from fastapi.testclient import TestClient

from app.auth import get_current_user, require_admin
from app.clients.user_service import (
    AuthenticationUnavailableError, InvalidSessionError, TrustedIdentity, UserServiceClient,
)

TOKEN = "Opaque.Session_123-abc+/="
PROFILE = {"id": "1cb3b65a-1805-40ec-a3e2-6f6b735a3b17", "role": "admin", "status": "active"}
ERRORS = {
    401: {"error": {"code": "AUTHENTICATION_REQUIRED", "message": "Invalid authentication credentials"}},
    403: {"error": {"code": "FORBIDDEN", "message": "Administrator access required"}},
    503: {"error": {"code": "AUTHENTICATION_UNAVAILABLE", "message": "Authentication temporarily unavailable"}},
}


@pytest.fixture
def protected_app(app):
    data = Mock()
    loop_threads = []

    @app.middleware("http")
    async def record_loop_thread(request, call_next):
        loop_threads.append(get_ident())
        return await call_next(request)

    @app.get("/test/admin")
    def admin(
        user: Annotated[TrustedIdentity, Depends(get_current_user)],
        administrator: Annotated[TrustedIdentity, Depends(require_admin)],
    ):
        assert user is administrator
        data()
        return administrator

    @app.get("/test/me")
    def current_user(user: Annotated[TrustedIdentity, Depends(get_current_user)]):
        return user

    @app.get("/test/public")
    def public():
        return {"public": True}

    @app.get("/test/unrelated-error")
    def unrelated():
        raise HTTPException(418, "Unrelated error")

    return app, data, loop_threads


@pytest.fixture
def auth_client(protected_app, monkeypatch):
    app, data, _ = protected_app
    upstream = Mock(spec=UserServiceClient)
    upstream.resolve_identity.return_value = TrustedIdentity.model_validate(PROFILE)
    monkeypatch.setattr("app.main.UserServiceClient", Mock(return_value=upstream))
    with TestClient(app) as client:
        yield client, upstream, data


def assert_error(response, status):
    assert response.status_code == status
    assert response.json() == ERRORS[status]
    assert response.headers.get("WWW-Authenticate") == ("Bearer" if status == 401 else None)


@pytest.mark.parametrize("authorization", [
    None, "", "Bearer", "Bearer ", "Bearer   ", "Basic abc", "Token abc",
    "Bearer two tokens", "Bearer\tabc", "Bearer abc\t", "Bearer abc,def",
    "Bearer abc:123", "Bearer =abc", "Bearer abc=def",
])
def test_missing_or_malformed_credentials_do_not_resolve_or_access_data(auth_client, authorization):
    client, upstream, data = auth_client
    headers = {} if authorization is None else {"Authorization": authorization}
    assert_error(client.get("/test/admin", headers=headers), 401)
    upstream.resolve_identity.assert_not_called()
    data.assert_not_called()


def test_duplicate_authorization_headers_rejected(auth_client):
    client, upstream, data = auth_client
    response = client.get("/test/admin", headers=[
        ("Authorization", f"Bearer {TOKEN}"), ("Authorization", "Bearer other"),
    ])
    assert_error(response, 401)
    upstream.resolve_identity.assert_not_called()
    data.assert_not_called()


@pytest.mark.parametrize("scheme", ["Bearer", "bearer", "bEaReR"])
def test_admin_composition_resolves_once_and_preserves_credential(auth_client, scheme):
    client, upstream, data = auth_client
    response = client.get("/test/admin", headers={"Authorization": f"{scheme} {TOKEN}"})
    assert response.status_code == 200
    assert response.json() == PROFILE
    upstream.resolve_identity.assert_called_once_with(TOKEN)
    data.assert_called_once_with()


@pytest.mark.parametrize("spoof", [False, True])
def test_regular_user_is_authenticated_but_cannot_become_admin(auth_client, spoof):
    client, upstream, data = auth_client
    profile = {**PROFILE, "role": "user"}
    upstream.resolve_identity.return_value = TrustedIdentity.model_validate(profile)
    headers = {"Authorization": f"Bearer {TOKEN}"}
    params = {}
    if spoof:
        headers.update({"X-Role": "admin", "X-User-Id": "attacker", "X-Admin-Mode": "true"})
        params = {"role": "admin", "user_id": "attacker", "admin_mode": "true"}
    response = client.get("/test/me", headers=headers, params=params)
    assert response.status_code == 200
    assert response.json() == profile
    assert_error(client.get("/test/admin", headers=headers, params=params), 403)
    assert upstream.resolve_identity.call_count == 2
    data.assert_not_called()


@pytest.mark.parametrize("error,status", [
    (InvalidSessionError("private session details"), 401),
    (AuthenticationUnavailableError("private upstream details"), 503),
])
def test_client_exceptions_have_safe_envelopes_and_block_data(auth_client, error, status):
    client, upstream, data = auth_client
    upstream.resolve_identity.side_effect = error
    assert_error(client.get("/test/admin", headers={"Authorization": f"Bearer {TOKEN}"}), status)
    upstream.resolve_identity.assert_called_once_with(TOKEN)
    data.assert_not_called()


def test_unrelated_http_errors_preserve_default_handler(auth_client):
    client, upstream, _ = auth_client
    response = client.get("/test/unrelated-error")
    assert response.status_code == 418
    assert response.json() == {"detail": "Unrelated error"}
    upstream.resolve_identity.assert_not_called()


def test_unexpected_programming_errors_are_not_authentication_failures(auth_client):
    client, upstream, data = auth_client
    upstream.resolve_identity.side_effect = RuntimeError("programming defect")
    with pytest.raises(RuntimeError, match="programming defect"):
        client.get("/test/admin", headers={"Authorization": f"Bearer {TOKEN}"})
    data.assert_not_called()


def test_protection_is_opt_in_and_openapi_declares_bearer(auth_client):
    client, upstream, _ = auth_client
    upstream.resolve_identity.side_effect = AuthenticationUnavailableError()
    for path in ("/test/public", "/health"):
        assert client.get(path).status_code == 200
        assert client.get(path, headers={"Authorization": "Bearer invalid"}).status_code == 200
    upstream.resolve_identity.assert_not_called()
    paths = client.get("/openapi.json").json()["paths"]
    assert paths["/test/admin"]["get"]["security"] == [{"HTTPBearer": []}]
    assert "security" not in paths["/test/public"]["get"]
    assert "security" not in paths["/health"]["get"]


def test_real_client_rechecks_session_on_each_request(protected_app, monkeypatch):
    app, data, loop_threads = protected_app
    requests = []
    worker_threads = []

    def handle(request):
        requests.append(request)
        worker_threads.append(get_ident())
        assert str(request.url) == "http://localhost:8000/users/me"
        assert request.headers["Authorization"] == f"Bearer {TOKEN}"
        if len(requests) == 1:
            return httpx.Response(200, json=PROFILE)
        return httpx.Response(401, text="private revoked session details")

    monkeypatch.setattr("app.main.UserServiceClient", lambda settings: UserServiceClient(
        settings, transport=httpx.MockTransport(handle),
    ))
    with TestClient(app) as client:
        assert requests == []
        headers = {"Authorization": f"Bearer {TOKEN}"}
        assert client.get("/test/admin", headers=headers).status_code == 200
        assert_error(client.get("/test/admin", headers=headers), 401)
    assert len(requests) == 2
    data.assert_called_once_with()
    assert all(thread not in loop_threads for thread in worker_threads)


@pytest.mark.parametrize("failure", ["timeout", "unavailable", "malformed"])
def test_real_client_upstream_failures_map_to_503(protected_app, monkeypatch, failure):
    app, data, _ = protected_app

    def handle(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("private upstream details", request=request)
        if failure == "unavailable":
            return httpx.Response(503, text="private upstream details")
        return httpx.Response(200, json={**PROFILE, "role": "unknown"})

    monkeypatch.setattr("app.main.UserServiceClient", lambda settings: UserServiceClient(
        settings, transport=httpx.MockTransport(handle),
    ))
    with TestClient(app) as client:
        assert_error(client.get("/test/admin", headers={"Authorization": f"Bearer {TOKEN}"}), 503)
    data.assert_not_called()
