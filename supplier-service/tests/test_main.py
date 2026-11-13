from uuid import UUID

import httpx
import pytest
from fastapi import status

import main


SUPPLIER = {
    "name": "Test Cafe",
    "category": "Food",
    "building": "COM1",
    "floor": 1,
    "description": "Near the entrance",
    "lattitude": 1.2966,
    "longitude": 103.7764,
    "startingTime": "09:00:00",
    "closingTime": "17:00:00",
}


async def create_supplier(client, **changes):
    """Create a supplier and return the response JSON for tests that need one."""
    payload = SUPPLIER | changes
    response = await client.post("/suppliers", json=payload)
    assert response.status_code == status.HTTP_201_CREATED
    return response.json()


@pytest.mark.anyio
async def test_health(client):
    response = await client.get("/health")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "status": "healthy",
        "service": "supplier-service",
    }


@pytest.mark.anyio
async def test_create_supplier(client):
    supplier = await create_supplier(client)

    assert supplier["name"] == "Test Cafe"
    assert supplier["category"] == "Food"
    assert supplier["imageUrl"] is None
    assert "id" in supplier

    response = await client.get("/suppliers")

    assert response.status_code == status.HTTP_200_OK
    assert [item["id"] for item in response.json()] == [supplier["id"]]


@pytest.mark.anyio
async def test_patch_supplier_changes_only_sent_fields(client):
    supplier = await create_supplier(client)

    response = await client.patch(
        f"/suppliers/{supplier['id']}",
        json={"name": "Renamed Cafe", "floor": 2},
    )

    assert response.status_code == status.HTTP_200_OK
    updated = response.json()
    assert updated["id"] == supplier["id"]
    assert updated["name"] == "Renamed Cafe"
    assert updated["floor"] == 2
    assert updated["building"] == "COM1"


@pytest.mark.anyio
async def test_patch_unknown_supplier_returns_404(client):
    response = await client.patch(
        "/suppliers/00000000-0000-0000-0000-000000000000",
        json={"name": "Does not exist"},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Supplier not found"


@pytest.mark.anyio
async def test_delete_supplier_hides_it_from_list(client):
    supplier = await create_supplier(client)

    response = await client.delete(f"/suppliers/{supplier['id']}")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert response.content == b""

    list_response = await client.get("/suppliers")
    assert list_response.status_code == status.HTTP_200_OK
    assert list_response.json() == []


@pytest.mark.anyio
async def test_non_admin_cannot_create_supplier(client):
    main.app.dependency_overrides[main.get_user] = lambda: main.AuthenticatedUser(
        user_id=UUID("00000000-0000-0000-0000-000000000002"),
        role="user",
    )

    response = await client.post("/suppliers", json=SUPPLIER)

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "Admin access required"


@pytest.mark.anyio
async def test_admin_manager_can_create_supplier(client):
    main.app.dependency_overrides[main.get_user] = lambda: main.AuthenticatedUser(
        user_id=UUID("00000000-0000-0000-0000-000000000003"),
        role="admin_manager",
    )

    response = await client.post("/suppliers", json=SUPPLIER)

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("bearer_token", "cookie_token", "expected_token"),
    [
        (None, "cookie-token", "cookie-token"),
        ("bearer-token", None, "bearer-token"),
        ("bearer-token", "cookie-token", "bearer-token"),
    ],
)
async def test_authentication_forwards_token_as_bearer(
    client, bearer_token, cookie_token, expected_token
):
    main.app.dependency_overrides.pop(main.get_user)

    def authenticate(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "internal-gateway"
        assert request.url.path == "/user-api/authentication/sessions/current"
        assert request.headers["authorization"] == f"Bearer {expected_token}"
        assert "cookie" not in request.headers
        return httpx.Response(
            status.HTTP_200_OK,
            json={
                "user_id": "00000000-0000-0000-0000-000000000004",
                "role": "admin",
            },
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(authenticate),
        base_url="http://internal-gateway",
    ) as gateway_client:
        async def override_gateway_client():
            yield gateway_client

        main.app.dependency_overrides[main.get_internal_gateway_client] = (
            override_gateway_client
        )
        if cookie_token is not None:
            client.cookies.set("access_token", cookie_token)
        headers = (
            {"Authorization": f"Bearer {bearer_token}"}
            if bearer_token is not None
            else {}
        )
        response = await client.post("/suppliers", json=SUPPLIER, headers=headers)

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.anyio
async def test_missing_access_token_is_unauthorized(client):
    main.app.dependency_overrides.pop(main.get_user)

    response = await client.post("/suppliers", json=SUPPLIER)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "No authentication token found. Please sign in."


@pytest.mark.anyio
async def test_rejected_access_token_is_unauthorized(client):
    main.app.dependency_overrides.pop(main.get_user)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(status.HTTP_401_UNAUTHORIZED)
        ),
        base_url="http://internal-gateway",
    ) as gateway_client:
        async def override_gateway_client():
            yield gateway_client

        main.app.dependency_overrides[main.get_internal_gateway_client] = (
            override_gateway_client
        )
        client.cookies.set("access_token", "expired-token")
        response = await client.post("/suppliers", json=SUPPLIER)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Invalid or expired token. Please sign in."


@pytest.mark.anyio
async def test_unavailable_gateway_returns_503(client):
    main.app.dependency_overrides.pop(main.get_user)

    def unavailable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection failed", request=request)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(unavailable),
        base_url="http://internal-gateway",
    ) as gateway_client:
        async def override_gateway_client():
            yield gateway_client

        main.app.dependency_overrides[main.get_internal_gateway_client] = (
            override_gateway_client
        )
        client.cookies.set("access_token", "test-token")
        response = await client.post("/suppliers", json=SUPPLIER)

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert response.json()["detail"] == "Authentication is temporarily unavailable."


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("configured_url", "expected_url"),
    [
        ("http://internal-gateway", "http://internal-gateway"),
        ("http://custom-gateway:8081/", "http://custom-gateway:8081"),
    ],
)
async def test_internal_gateway_client_uses_shared_origin(
    monkeypatch, configured_url, expected_url
):
    # Legacy peer-specific configuration must not affect HTTP routing.
    monkeypatch.setenv("USER_SERVICE_URL", "http://old-user-service:5005")
    monkeypatch.setenv("INTERNAL_GATEWAY_URL", configured_url)

    async for gateway_client in main.get_internal_gateway_client():
        assert str(gateway_client.base_url) == expected_url
        assert gateway_client.timeout.connect == 5.0


@pytest.mark.anyio
@pytest.mark.parametrize("gateway_url", [None, "", "   "])
async def test_missing_gateway_configuration_fails_at_startup(monkeypatch, gateway_url):
    monkeypatch.delenv("INTERNAL_GATEWAY_URL", raising=False)
    if gateway_url is not None:
        monkeypatch.setenv("INTERNAL_GATEWAY_URL", gateway_url)
    monkeypatch.setattr(main, "get_engine", lambda: pytest.fail("Database accessed"))

    with pytest.raises(RuntimeError, match="INTERNAL_GATEWAY_URL must be set"):
        async with main.lifespan(main.app):
            pytest.fail("Service started without a gateway URL")


@pytest.mark.anyio
@pytest.mark.parametrize(
    "gateway_url",
    [
        "not-a-url",
        "ftp://gateway",
        "http://gateway/user-api",
        "http://user:password@gateway",
        "http://gateway?query=value",
        "http://gateway#fragment",
    ],
)
async def test_invalid_gateway_configuration_fails_at_startup(monkeypatch, gateway_url):
    monkeypatch.setenv("INTERNAL_GATEWAY_URL", gateway_url)
    monkeypatch.setattr(main, "get_engine", lambda: pytest.fail("Database accessed"))

    with pytest.raises(RuntimeError, match="INTERNAL_GATEWAY_URL must be an HTTP"):
        async with main.lifespan(main.app):
            pytest.fail("Service started with an invalid gateway URL")


@pytest.mark.anyio
async def test_missing_broker_configuration_fails_at_startup(monkeypatch):
    monkeypatch.setenv("INTERNAL_GATEWAY_URL", "http://internal-gateway")
    monkeypatch.delenv("RABBITMQ_URL", raising=False)
    monkeypatch.setattr(main, "get_engine", lambda: pytest.fail("Database accessed"))

    with pytest.raises(RuntimeError, match="RABBITMQ_URL must be set"):
        async with main.lifespan(main.app):
            pytest.fail("Service started without a broker URL")


@pytest.mark.anyio
@pytest.mark.parametrize("upstream_status", [500, 502, 503, 504])
async def test_gateway_upstream_error_returns_503(client, upstream_status):
    main.app.dependency_overrides.pop(main.get_user)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(upstream_status)
        ),
        base_url="http://internal-gateway",
    ) as gateway_client:
        async def override_gateway_client():
            yield gateway_client

        main.app.dependency_overrides[main.get_internal_gateway_client] = (
            override_gateway_client
        )
        response = await client.post(
            "/suppliers", json=SUPPLIER, headers={"Authorization": "Bearer test-token"}
        )

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert response.json()["detail"] == "Authentication is temporarily unavailable."
