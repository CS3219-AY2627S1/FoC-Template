# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
# Scope: Added identity client tests.
# Author review: I validated correctness and supplied additional boundary checks.

from uuid import uuid4

import httpx
import pytest

from app.core.config import Settings
from app.credits.errors import ApiError
from app.credits.identity import UserDirectory

USER_ID = uuid4()


def directory(handler, base="http://user-service:8000"):
    settings = Settings(_env_file=None, user_service_base_url=base)
    return UserDirectory(settings, httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_forwards_token_to_current_session_endpoint():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        return httpx.Response(
            200,
            json={
                "userId": str(USER_ID),
                "systemRole": "ADMIN",
                "accountStatus": "ACTIVE",
                "email": "ignored@example.com",
            },
        )

    principal = await directory(handler).identity("abc")
    assert seen == {"url": "http://user-service:8000/v1/users/me", "auth": "Bearer abc"}
    assert principal.user_id == USER_ID and principal.system_role == "ADMIN"


@pytest.mark.parametrize("status", [401, 403])
async def test_rejected_session_is_unauthenticated(status):
    with pytest.raises(ApiError) as error:
        await directory(lambda request: httpx.Response(status)).identity("abc")
    assert error.value.status == 401


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(500),
        httpx.Response(302, headers={"Location": "http://elsewhere/"}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"userId": str(USER_ID), "systemRole": "ROOT"}),
        httpx.Response(
            200,
            json={"userId": str(USER_ID), "systemRole": "USER", "accountStatus": "DELETED"},
        ),
    ],
)
async def test_unusable_responses_fail_closed(response):
    with pytest.raises(ApiError) as error:
        await directory(lambda request: response).identity("abc")
    assert (error.value.status, error.value.code) == (503, "AUTH_UNAVAILABLE")


async def test_unreachable_or_unconfigured_user_service_fails_closed():
    def handler(request):
        raise httpx.ConnectError("down")

    for client in (directory(handler), directory(handler, base=None)):
        with pytest.raises(ApiError) as error:
            await client.identity("abc")
        assert error.value.status == 503
