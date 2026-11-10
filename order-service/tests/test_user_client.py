# AI-influenced: Verify the internal User Service display-name response contract.
import httpx
import pytest

from app.services.clients.errors import RemoteServiceContractError
from app.services.clients.transport import JsonHttpTransport
from app.services.clients.user.client import UserClient


@pytest.mark.asyncio
async def test_user_client_fetches_display_name_and_handles_missing_user():
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path.startswith("/users/internal/")
        if request.url.path.endswith("/missing/name"):
            return httpx.Response(404, json={"detail": "user not found"})
        return httpx.Response(200, json={"id": "user-1", "display_name": "Alice"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http_client:
        client = UserClient(
            base_url="http://user-service:8000", transport=JsonHttpTransport(http_client)
        )
        assert await client.get_user_name("user-1") == "Alice"
        assert await client.get_user_name("missing") is None


@pytest.mark.asyncio
async def test_user_client_rejects_mismatched_identity():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(200, json={"id": "other", "display_name": "Bob"})
        )
    ) as http_client:
        client = UserClient(
            base_url="http://user-service:8000", transport=JsonHttpTransport(http_client)
        )
        with pytest.raises(RemoteServiceContractError):
            await client.get_user_name("user-1")
