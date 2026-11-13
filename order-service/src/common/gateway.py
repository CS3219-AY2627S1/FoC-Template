from typing import cast

import httpx
from fastapi import Request
from pydantic import AnyHttpUrl, ValidationError

from common.config_manager import settings


def get_internal_gateway_url() -> str:
    value = settings.internal_gateway_url
    if not value:
        raise RuntimeError("INTERNAL_GATEWAY_URL is not configured")

    message = (
        "INTERNAL_GATEWAY_URL must be an HTTP(S) origin without credentials, "
        "a path, query, or fragment"
    )
    try:
        url = AnyHttpUrl(value)
    except ValidationError:
        raise RuntimeError(message) from None
    if url.path not in {None, "", "/"} or any(
        part is not None for part in (url.username, url.password, url.query, url.fragment)
    ):
        raise RuntimeError(message)
    return str(url).rstrip("/")


async def get_internal_gateway_client(request: Request) -> httpx.AsyncClient:
    return cast(httpx.AsyncClient, request.app.state.internal_gateway_client)
