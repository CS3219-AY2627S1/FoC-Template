from collections.abc import AsyncIterator

import httpx
from pydantic import AnyHttpUrl, ValidationError

from common.config_manager import settings
from common.logging_config import propagate_request_id


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


async def get_internal_gateway_client() -> AsyncIterator[httpx.AsyncClient]:
    base_url = get_internal_gateway_url()
    async with httpx.AsyncClient(
        base_url=base_url, timeout=5.0, event_hooks={"request": [propagate_request_id]},
    ) as client:
        yield client
