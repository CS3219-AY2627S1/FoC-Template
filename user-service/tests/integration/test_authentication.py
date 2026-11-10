# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-22
# Scope: Added or extended tests for login, refresh and logout, and session validity.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import json
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import bcrypt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api.authentication import REFRESH_COOKIE_NAME
from app.auth.jwt import JwtKeyStore
from app.auth.service import AuthenticationService
from app.core.config import Settings
from app.db import Database
from app.main import create_app
from app.models import (
    AccountStatus,
    Credential,
    SystemRole,
    User,
    UserSession,
)


async def seed_active_user(
    database: Database,
    *,
    email: str,
    password: str,
) -> UUID:
    user_id = uuid4()
    now = datetime.now(UTC)
    async for session in database.session():
        async with session.begin():
            user = User(
                id=user_id,
                username=f"Phase2-{user_id.hex[:12]}",
                normalized_username=f"phase2-{user_id.hex[:12]}",
                email=email,
                normalized_email=email.casefold(),
                display_name=f"Phase2-{user_id.hex[:12]}",
                system_role=SystemRole.USER,
                account_status=AccountStatus.ACTIVE,
                email_verified_at=now,
                role_version=1,
            )
            session.add(user)
            await session.flush()
            session.add(
                Credential(
                    user_id=user_id,
                    password_hash=bcrypt.hashpw(
                        password.encode("utf-8"),
                        bcrypt.gensalt(rounds=4),
                    ).decode("ascii"),
                    password_changed_at=now,
                )
            )
    return user_id


async def read_one(database: Database, statement):
    async for session in database.session():
        return await session.scalar(statement)
    raise AssertionError("The test database did not provide a session.")


async def update_role_version(database: Database, user_id: UUID) -> None:
    async for session in database.session():
        async with session.begin():
            user = await session.get(User, user_id)
            assert user is not None
            user.role_version += 1


async def age_active_session_beyond_idle_timeout(database: Database, user_id: UUID) -> None:
    async for session in database.session():
        async with session.begin():
            stored_session = (
                await session.execute(
                    select(UserSession)
                    .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
                    .order_by(UserSession.issued_at.desc())
                    .limit(1)
                )
            ).scalar_one()
            stored_session.last_active_at = datetime.now(UTC) - timedelta(seconds=61)


def authentication_settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        jwt_access_token_ttl_seconds=120,
        jwt_refresh_token_ttl_seconds=1_209_600,
        jwt_session_idle_timeout_seconds=60,
    )


def authentication_service(
    settings: Settings,
    key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> AuthenticationService:
    private_key, public_key = key_pair
    return AuthenticationService(
        settings,
        JwtKeyStore(settings, private_key=private_key, public_key=public_key),
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_login_rotation_reuse_detection_profile_and_logout(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    password = "Phase2SecurePass1!"
    test_id = uuid4().hex[:12]
    email = f"phase2-auth-{test_id}@u.nus.edu"
    user_id = await seed_active_user(database, email=email, password=password)
    settings = authentication_settings()
    app = create_app(
        settings=settings,
        database=database,
        authentication_service=authentication_service(settings, jwt_key_pair),
    )
    credentials = {"email": email, "password": password}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/v1/auth/sessions", json=credentials)
            assert login.status_code == 200
            first_access_token = login.json()["accessToken"]
            first_refresh_token = login.cookies.get(REFRESH_COOKIE_NAME)
            assert first_refresh_token is not None
            assert password not in json.dumps(login.json())
            assert first_refresh_token not in json.dumps(login.json())

            stored = await read_one(
                database,
                select(UserSession).where(UserSession.user_id == user_id),
            )
            assert stored is not None
            assert stored.refresh_token_hash != first_refresh_token
            assert len(stored.refresh_token_hash) == 64
            assert stored.expires_at - stored.issued_at == timedelta(hours=24)

            profile = await client.get(
                "/v1/users/me",
                headers={"Authorization": f"Bearer {first_access_token}"},
            )
            assert profile.status_code == 200
            assert profile.json()["userId"] == str(user_id)
            assert profile.json()["accountStatus"] == "ACTIVE"

            refreshed = await client.post("/v1/auth/sessions/refresh")
            assert refreshed.status_code == 200
            second_access_token = refreshed.json()["accessToken"]
            assert second_access_token != first_access_token

            old_access_after_rotation = await client.get(
                "/v1/users/me",
                headers={"Authorization": f"Bearer {first_access_token}"},
            )
            assert old_access_after_rotation.status_code == 401
            assert old_access_after_rotation.json()["error"]["code"] == "INVALID_ACCESS_TOKEN"

            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as replay_client:
                reused = await replay_client.post(
                    "/v1/auth/sessions/refresh",
                    headers={"Cookie": f"{REFRESH_COOKIE_NAME}={first_refresh_token}"},
                )
            assert reused.status_code == 401
            assert reused.json()["error"]["code"] == "REFRESH_TOKEN_REUSED"

            revoked_family = await client.get(
                "/v1/users/me",
                headers={"Authorization": f"Bearer {second_access_token}"},
            )
            assert revoked_family.status_code == 401

            relogin = await client.post("/v1/auth/sessions", json=credentials)
            assert relogin.status_code == 200
            third_access_token = relogin.json()["accessToken"]
            logout = await client.delete(
                "/v1/auth/sessions/current",
                headers={"Authorization": f"Bearer {third_access_token}"},
            )
            assert logout.status_code == 204
            assert "Max-Age=0" in logout.headers["set-cookie"]

            revoked_access = await client.get(
                "/v1/users/me",
                headers={"Authorization": f"Bearer {third_access_token}"},
            )
            assert revoked_access.status_code == 401
    finally:
        await database.dispose()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_authentication_rejects_invalid_credentials_and_stale_role_version(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    password = "Phase2SecurePass1!"
    test_id = uuid4().hex[:12]
    email = f"phase2-role-{test_id}@u.nus.edu"
    user_id = await seed_active_user(database, email=email, password=password)
    settings = authentication_settings()
    app = create_app(
        settings=settings,
        database=database,
        authentication_service=authentication_service(settings, jwt_key_pair),
    )

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unknown = await client.post(
                "/v1/auth/sessions",
                json={"email": f"unknown-{test_id}@u.nus.edu", "password": password},
            )
            wrong_password = await client.post(
                "/v1/auth/sessions",
                json={"email": email, "password": "WrongPassword1!"},
            )
            assert unknown.status_code == wrong_password.status_code == 401
            unknown_error = unknown.json()["error"]
            wrong_password_error = wrong_password.json()["error"]
            assert unknown_error["code"] == wrong_password_error["code"] == "INVALID_CREDENTIALS"
            assert unknown_error["message"] == wrong_password_error["message"]
            assert unknown_error["fieldErrors"] == wrong_password_error["fieldErrors"] == []

            login = await client.post(
                "/v1/auth/sessions",
                json={"email": email, "password": password},
            )
            access_token = login.json()["accessToken"]
            jwks = await client.get("/.well-known/jwks.json")
            assert jwks.status_code == 200
            assert jwks.json()["keys"][0]["alg"] == "RS256"
            assert "d" not in jwks.json()["keys"][0]

            await update_role_version(database, user_id)
            stale_role = await client.get(
                "/v1/users/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            assert stale_role.status_code == 401
            assert stale_role.json()["error"]["code"] == "INVALID_ACCESS_TOKEN"

            refreshed_login = await client.post(
                "/v1/auth/sessions",
                json={"email": email, "password": password},
            )
            fresh_access_token = refreshed_login.json()["accessToken"]
            await age_active_session_beyond_idle_timeout(database, user_id)
            idle_session = await client.get(
                "/v1/users/me",
                headers={"Authorization": f"Bearer {fresh_access_token}"},
            )
            assert idle_session.status_code == 401
            assert idle_session.json()["error"]["code"] == "INVALID_ACCESS_TOKEN"

            missing_bearer = await client.get("/v1/users/me")
            assert missing_bearer.status_code == 401
            assert missing_bearer.json()["error"]["code"] == "INVALID_ACCESS_TOKEN"
    finally:
        await database.dispose()
