# AI Assistance Disclosure:
# Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
# Scope: Added administrator authentication and authorization tests.
# Author review: I validated correctness and supplied additional boundary checks.

"""N2F1.1, N2F1.1.1 and N2NFR1.1-1.3: every administrative request re-checks User."""

import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient

from app.admin.auth import Admin
from app.admin.errors import ApiError, unavailable
from app.core.config import Settings
from app.main import create_app
from tests.admin_fakes import FakeIdentity, NoDatabase


def client_for(identity):
    app = create_app(Settings(_env_file=None), NoDatabase(), identity=identity)
    probe = APIRouter()

    @probe.get("/v1/admin/probe")
    async def guarded(admin: Admin):
        return {"role": admin.system_role}

    app.include_router(probe)
    return AsyncClient(transport=ASGITransport(app), base_url="http://test")


@pytest.mark.parametrize("header", [None, "", "Basic abc", "Bearer ", "Bearer    "])
async def test_missing_or_malformed_bearer_never_reaches_user(header):
    identity = FakeIdentity()
    headers = {} if header is None else {"Authorization": header}
    async with client_for(identity) as client:
        response = await client.get("/v1/admin/probe", headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert identity.tokens == []


async def test_ordinary_user_is_forbidden():
    async with client_for(FakeIdentity("USER")) as client:
        response = await client.get("/v1/admin/probe", headers={"Authorization": "Bearer t"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN"])
async def test_current_administrators_are_allowed(role):
    identity = FakeIdentity(role)
    async with client_for(identity) as client:
        response = await client.get("/v1/admin/probe", headers={"Authorization": "Bearer t"})
    assert response.json() == {"role": role}
    assert identity.tokens == ["t"]


async def test_revoked_session_is_denied_on_the_next_request():
    revoked = ApiError(401, "UNAUTHENTICATED", "A current active session is required.")
    async with client_for(FakeIdentity(error=revoked)) as client:
        response = await client.get("/v1/admin/probe", headers={"Authorization": "Bearer t"})
    assert response.status_code == 401


async def test_unavailable_user_service_fails_closed_with_correlation_id():
    async with client_for(FakeIdentity(error=unavailable("AUTH_UNAVAILABLE"))) as client:
        response = await client.get(
            "/v1/admin/probe",
            headers={"Authorization": "Bearer t", "X-Correlation-ID": "req-7"},
        )
    assert response.status_code == 503
    error = response.json()["error"]
    assert (error["code"], error["correlationId"]) == ("AUTH_UNAVAILABLE", "req-7")
