# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — tests for the User Service client with an httpx transport double (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001

"""UserServiceClient tests with an httpx transport double."""

from uuid import uuid4

import certifi
import httpx
import pytest

from app.clients import (
    AuthenticationUnavailableError,
    InvalidSessionError,
    UserServiceClient,
)
from foc_observability import log_context


def _client(handler) -> UserServiceClient:
    return UserServiceClient(
        "https://user-service:8080",
        certifi.where(),
        transport=httpx.MockTransport(handler),
    )


def _resolve(handler, token: str = "opaque-token"):
    client = _client(handler)
    try:
        return client.resolve_identity(token)
    finally:
        client.close()


def test_user_service_client_requires_https() -> None:
    with pytest.raises(ValueError, match="requires HTTPS"):
        UserServiceClient("http://user-service:8080", certifi.where())


def test_resolves_identity_over_https() -> None:
    user_id = uuid4()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://user-service:8080/users/me"
        assert request.headers["Authorization"] == "Bearer opaque-token"
        return httpx.Response(
            200, json={"id": str(user_id), "role": "user", "status": "active"}
        )

    with log_context(
        request_id="11111111-1111-4111-8111-111111111111",
        correlation_id="22222222-2222-4222-8222-222222222222",
    ):
        identity = _resolve(handler)

    assert identity.id == user_id
    assert identity.role == "user"
    assert identity.status == "active"


def test_request_context_is_forwarded_without_exposing_credentials() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-Request-ID"] == (
            "11111111-1111-4111-8111-111111111111"
        )
        assert request.headers["X-Correlation-ID"] == (
            "22222222-2222-4222-8222-222222222222"
        )
        assert request.headers["Authorization"] == "Bearer opaque-token"
        return httpx.Response(
            200,
            json={
                "id": str(uuid4()),
                "role": "user",
                "status": "active",
            },
        )

    with log_context(
        request_id="11111111-1111-4111-8111-111111111111",
        correlation_id="22222222-2222-4222-8222-222222222222",
    ):
        _resolve(handler)


def test_base_url_path_and_credentials_are_ignored() -> None:
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(401)

    client = UserServiceClient(
        "https://someone:secret@user-service:8080/prefix?x=1",
        certifi.where(),
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(InvalidSessionError):
        client.resolve_identity("t")
    client.close()

    assert seen == ["https://user-service:8080/users/me"]


def test_401_is_an_invalid_session() -> None:
    with pytest.raises(InvalidSessionError):
        _resolve(lambda request: httpx.Response(401))


def test_inactive_user_is_an_invalid_session() -> None:
    body = {"id": str(uuid4()), "role": "user", "status": "suspended"}
    with pytest.raises(InvalidSessionError):
        _resolve(lambda request: httpx.Response(200, json=body))


@pytest.mark.parametrize("status_code", [403, 404, 500, 502, 503])
def test_other_status_is_unavailable(status_code) -> None:
    with pytest.raises(AuthenticationUnavailableError):
        _resolve(lambda request: httpx.Response(status_code))


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"id": "not-a-uuid", "role": "user", "status": "active"}),
        httpx.Response(200, json={"role": "user", "status": "active"}),
        httpx.Response(200, json={"id": str(uuid4()), "role": "robot", "status": "active"}),
    ],
)
def test_unusable_profile_is_unavailable(response) -> None:
    with pytest.raises(AuthenticationUnavailableError):
        _resolve(lambda request: response)


@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectError("refused"),
        httpx.ConnectTimeout("timed out"),
        httpx.ReadTimeout("timed out"),
    ],
)
def test_transport_errors_are_unavailable(error) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    with pytest.raises(AuthenticationUnavailableError):
        _resolve(handler)


def test_redirect_is_not_followed() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"Location": "https://elsewhere.test/"})

    with pytest.raises(AuthenticationUnavailableError):
        _resolve(handler)
