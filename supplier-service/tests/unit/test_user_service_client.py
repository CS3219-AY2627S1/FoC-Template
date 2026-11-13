# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — write MockTransport unit tests for trusted profiles, exact credential forwarding, destination and timeout configuration, error mappings, redirect refusal, fresh requests, safe diagnostics, and client closure.
# Author review: Original implementation approved by Keith.
# Details: ../../ai/usage-log.md; ai-20260930-019

"""Contract and lifecycle checks without a running User Service."""

import json
import logging
import traceback
from uuid import UUID

import httpx
import pytest

from app.config import Settings
from app.clients.user_service import (
    AuthenticationUnavailableError,
    InvalidSessionError,
    UserServiceClient,
)


USER_ID = "1cb3b65a-1805-40ec-a3e2-6f6b735a3b17"
PROFILE = {"id": USER_ID, "role": "user", "status": "active"}
TOKEN = "Opaque_Credential-AbC123.xyz+/="


@pytest.fixture
def make_client(settings):
    clients = []

    def create(handler):
        client = UserServiceClient(settings, transport=httpx.MockTransport(handler))
        clients.append(client)
        return client

    yield create
    for client in clients:
        client.close()


@pytest.mark.parametrize("role", ["user", "admin"])
def test_verified_identity_destination_header_and_timeout(make_client, settings, role):
    requests = []

    def handle(request):
        requests.append(request)
        assert request.method == "GET"
        assert str(request.url) == "http://localhost:8000/users/me"
        assert request.headers["Authorization"] == f"Bearer {TOKEN}"
        assert request.extensions["timeout"] == {
            phase: settings.auth_timeout_seconds
            for phase in ("connect", "read", "write", "pool")
        }
        return httpx.Response(200, json={
            **PROFILE, "role": role, "email": "private@example.test",
            "display_name": {"unrelated": "ignored without validation"},
        })

    client = make_client(handle)
    assert requests == []  # Construction does not contact User Service.
    identity = client.resolve_identity(TOKEN)
    assert identity.id == UUID(USER_ID)
    assert identity.model_dump() == {
        "id": UUID(USER_ID), "role": role, "status": "active",
    }
    assert len(requests) == 1


@pytest.mark.parametrize("userinfo", ["service:password", "service", "service:p%40ssword"])
def test_url_credentials_do_not_override_bearer_header(settings, userinfo):
    configured = Settings(
        database_url=settings.database_url,
        user_service_url=f"https://{userinfo}@users.example.test:8443",
    )
    requests = []

    def handle(request):
        requests.append(request)
        assert request.url.userinfo == b""
        assert str(request.url) == "https://users.example.test:8443/users/me"
        assert request.headers["Authorization"] == f"Bearer {TOKEN}"
        return httpx.Response(200, json=PROFILE)

    client = UserServiceClient(configured, transport=httpx.MockTransport(handle))
    try:
        assert client.resolve_identity(TOKEN).id == UUID(USER_ID)
        assert len(requests) == 1
    finally:
        client.close()


def test_fixed_endpoint_ignores_base_path_query_and_token_destination(settings):
    settings = settings.model_copy(update={
        "user_service_url": "https://users.example.test:8443/base?query=1#fragment"
    })
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=PROFILE)

    client = UserServiceClient(settings, transport=httpx.MockTransport(handle))
    try:
        token = "https://other.example.test/stolen"
        client.resolve_identity(token)
        assert str(requests[0].url) == "https://users.example.test:8443/users/me"
        assert requests[0].headers["Authorization"] == f"Bearer {token}"
    finally:
        client.close()


@pytest.mark.parametrize("status", [
    201, 204, 301, 302, 303, 307, 308, 400, 401, 403, 404, 408, 429, 500, 502, 503,
])
def test_status_mapping_and_no_redirects(make_client, status):
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(
            status, content=b"private upstream error",
            headers={"Location": "https://other.example.test/stolen"},
        )

    client = make_client(handle)
    expected = InvalidSessionError if status == 401 else AuthenticationUnavailableError
    with pytest.raises(expected):
        client.resolve_identity(TOKEN)
    assert len(requests) == 1


@pytest.mark.parametrize("error", [
    httpx.ConnectError, httpx.ReadError, httpx.WriteError, httpx.CloseError,
    httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout,
    httpx.RemoteProtocolError, httpx.DecodingError,
])
def test_transport_failures_are_unavailable_without_retry(make_client, error):
    requests = []

    def handle(request):
        requests.append(request)
        raise error("private transport details", request=request)

    client = make_client(handle)
    with pytest.raises(AuthenticationUnavailableError):
        client.resolve_identity(TOKEN)
    assert len(requests) == 1


@pytest.mark.parametrize("payload", [
    None, [], [PROFILE], "profile", 42, True, {},
    *[{k: v for k, v in PROFILE.items() if k != field} for field in PROFILE],
    *[{**PROFILE, "id": value} for value in [None, 1, True, [], {}, "bad-uuid", ""]],
    *[{**PROFILE, "role": value} for value in [None, 1, True, [], {}, "owner", "ADMIN"]],
    *[{**PROFILE, "status": value} for value in [None, 1, True, [], {}, "inactive", "suspended", "ACTIVE"]],
])
def test_invalid_profiles_are_unavailable(make_client, payload):
    # Explicit encoding ensures JSON null, rather than an empty response body.
    client = make_client(lambda request: httpx.Response(200, content=json.dumps(payload)))
    with pytest.raises(AuthenticationUnavailableError):
        client.resolve_identity(TOKEN)


@pytest.mark.parametrize("content", [b"", b"not JSON", b'{"id":', b"\xff"])
def test_malformed_json_is_unavailable(make_client, content):
    client = make_client(lambda request: httpx.Response(200, content=content))
    with pytest.raises(AuthenticationUnavailableError):
        client.resolve_identity(TOKEN)


def test_repeated_resolutions_observe_role_changes_and_revocation(make_client):
    responses = iter([
        httpx.Response(200, json=PROFILE),
        httpx.Response(200, json={**PROFILE, "role": "admin"}),
        httpx.Response(401),
    ])
    requests = []

    def handle(request):
        requests.append(request)
        return next(responses)

    client = make_client(handle)
    underlying_client = client._client
    assert client.resolve_identity(TOKEN).role == "user"
    assert client.resolve_identity(TOKEN).role == "admin"
    with pytest.raises(InvalidSessionError):
        client.resolve_identity(TOKEN)
    assert len(requests) == 3
    assert client._client is underlying_client


def test_close_closes_underlying_client(make_client):
    client = make_client(lambda request: httpx.Response(200, json=PROFILE))
    assert not client._client.is_closed
    client.close()
    assert client._client.is_closed
    client.close()  # Safe during repeated cleanup.


@pytest.mark.parametrize("case", ["success", "status", "schema", "transport"])
def test_sensitive_data_is_not_logged_or_in_exception_output(make_client, caplog, case):
    secret = "sensitive-profile-or-error-body"

    def handle(request):
        if case == "transport":
            raise httpx.ConnectError(f"{TOKEN} {secret}", request=request)
        if case == "status":
            return httpx.Response(503, text=secret)
        return httpx.Response(200, json={
            **PROFILE, "email": secret,
            "role": secret if case == "schema" else "admin",
        })

    client = make_client(handle)
    with caplog.at_level(logging.DEBUG):
        if case == "success":
            client.resolve_identity(TOKEN)
        else:
            with pytest.raises(AuthenticationUnavailableError) as caught:
                client.resolve_identity(TOKEN)
            output = "".join(traceback.format_exception(caught.value))
            assert TOKEN not in output
            assert secret not in output
    assert TOKEN not in caplog.text
    assert secret not in caplog.text
