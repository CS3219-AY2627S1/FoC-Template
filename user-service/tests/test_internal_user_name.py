# AI-influenced: Verify the internal display-name lookup returns minimal user data.
import pytest
from httpx import ASGITransport, AsyncClient

from app.db import get_session
from app.main import app
from app.models.user import User
from app.repositories.user import UserRepository


@pytest.mark.asyncio
async def test_internal_user_name_returns_only_id_and_display_name():
    # Use the existing test database override supplied by conftest.
    sessions = app.dependency_overrides[get_session]()
    session = await anext(sessions)
    try:
        user = User(
            email="name@u.nus.edu",
            password_hash="test-hash",
            display_name="Alice Tan",
            role="client",
            email_verified=True,
            is_suspended=False,
        )
        await UserRepository(session).add(user)
        await session.commit()
        user_id = user.id
    finally:
        await sessions.aclose()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/users/internal/{user_id}/name")
        assert response.status_code == 200
        assert response.json() == {"id": user_id, "display_name": "Alice Tan"}
        assert (await client.get("/users/internal/missing/name")).status_code == 404
