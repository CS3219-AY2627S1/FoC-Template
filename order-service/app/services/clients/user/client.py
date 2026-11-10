# AI-influenced: Fetch a user's display name through the internal User Service API.
from urllib.parse import quote

from pydantic import BaseModel, ValidationError

from app.services.clients.errors import RemoteServiceContractError, RemoteServiceUnavailableError
from app.services.clients.transport import JsonHttpTransport


class UserName(BaseModel):
    id: str
    display_name: str


class UserClient:
    def __init__(self, *, base_url: str, transport: JsonHttpTransport):
        self._base_url = base_url.rstrip("/")
        self._transport = transport

    async def get_user_name(self, user_id: str) -> str | None:
        response = await self._transport.request(
            service_name="User Service",
            method="GET",
            url=f"{self._base_url}/users/internal/{quote(user_id, safe='')}/name",
        )
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise RemoteServiceUnavailableError(
                "User Service could not provide a display name",
                service_name="User Service",
                status_code=response.status_code,
            )
        try:
            user = UserName.model_validate(response.payload)
        except ValidationError as exc:
            raise RemoteServiceContractError(
                "User Service returned an invalid display name", service_name="User Service"
            ) from exc
        if user.id != user_id:
            raise RemoteServiceContractError(
                "User Service returned a different user", service_name="User Service"
            )
        return user.display_name
