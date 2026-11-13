from uuid import uuid4

import certifi
import httpx
import pytest

from app.clients import UserServiceClient


def test_user_service_client_requires_https() -> None:
    with pytest.raises(ValueError, match="requires HTTPS"):
        UserServiceClient("http://user-service:8080", certifi.where())


def test_user_service_client_resolves_identity_over_https() -> None:
    user_id = uuid4()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://user-service:8080/users/me"
        assert request.headers["Authorization"] == "Bearer opaque-token"
        return httpx.Response(
            200,
            json={"id": str(user_id), "role": "user", "status": "active"},
        )

    client = UserServiceClient(
        "https://user-service:8080",
        certifi.where(),
        transport=httpx.MockTransport(handler),
    )
    try:
        identity = client.resolve_identity("opaque-token")
    finally:
        client.close()

    assert identity.id == user_id
    assert identity.role == "user"
    assert identity.status == "active"
