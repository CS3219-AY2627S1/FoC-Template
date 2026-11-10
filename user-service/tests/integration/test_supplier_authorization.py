# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21, 2026-09-22
# Scope: Added or extended tests for Supplier authorization checks.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import bcrypt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient

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
)

_SUPPLIER_SECRET = "phase-4-supplier-service-test-secret"


def authorization_settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        jwt_access_token_ttl_seconds=120,
        SUPPLIER_SERVICE_SHARED_SECRET=_SUPPLIER_SECRET,
    )


def authorization_service(
    settings: Settings,
    key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> tuple[AuthenticationService, JwtKeyStore]:
    private_key, public_key = key_pair
    key_store = JwtKeyStore(settings, private_key=private_key, public_key=public_key)
    return AuthenticationService(settings, key_store), key_store


async def seed_active_user(
    database: Database,
    *,
    email: str,
    system_role: SystemRole,
    password: str,
) -> UUID:
    user_id = uuid4()
    now = datetime.now(UTC)
    async for session in database.session():
        async with session.begin():
            user = User(
                id=user_id,
                username=f"Phase4-{user_id.hex[:12]}",
                normalized_username=f"phase4-{user_id.hex[:12]}",
                email=email,
                normalized_email=email.casefold(),
                display_name=f"Phase4-{user_id.hex[:12]}",
                system_role=system_role,
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


async def access_token_for(
    client: AsyncClient,
    *,
    email: str,
    password: str,
) -> str:
    response = await client.post("/v1/auth/sessions", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["accessToken"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_supplier_authorization_uses_current_server_side_role_and_identity(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    password = "Phase4SecurePass1!"
    test_id = uuid4().hex[:12]
    users = {
        SystemRole.USER: (f"phase4-user-{test_id}@u.nus.edu", None),
        SystemRole.ADMIN: (f"phase4-admin-{test_id}@u.nus.edu", None),
        SystemRole.SUPER_ADMIN: (f"phase4-super-{test_id}@u.nus.edu", None),
    }
    for role, (email, _) in users.items():
        user_id = await seed_active_user(
            database,
            email=email,
            system_role=role,
            password=password,
        )
        users[role] = (email, user_id)

    settings = authorization_settings()
    service, key_store = authorization_service(settings, jwt_key_pair)
    app = create_app(
        settings=settings,
        database=database,
        authentication_service=service,
    )
    headers = {"X-FoC-Service-Secret": _SUPPLIER_SECRET}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for role, expected_allowed in (
                (SystemRole.USER, False),
                (SystemRole.ADMIN, True),
                (SystemRole.SUPER_ADMIN, True),
            ):
                email, user_id = users[role]
                assert user_id is not None
                access_token = await access_token_for(client, email=email, password=password)
                decision = await client.post(
                    "/v1/internal/authorization-decisions",
                    headers={**headers, "Authorization": f"Bearer {access_token}"},
                    json={"action": "SUPPLIER_CREATE"},
                )
                assert decision.status_code == 200
                assert decision.json() == {
                    "subjectId": str(user_id),
                    "accountStatus": "ACTIVE",
                    "systemRole": role.value,
                    "allowed": expected_allowed,
                }

            admin_email, admin_id = users[SystemRole.ADMIN]
            assert admin_id is not None
            admin_token = await access_token_for(client, email=admin_email, password=password)
            missing_identity = await client.post(
                "/v1/internal/authorization-decisions",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"action": "SUPPLIER_UPDATE"},
            )
            assert missing_identity.status_code == 401
            assert missing_identity.json()["error"]["code"] == "INVALID_SERVICE_IDENTITY"

            malformed_token = await client.post(
                "/v1/internal/authorization-decisions",
                headers={**headers, "Authorization": "Bearer not-a-jwt"},
                json={"action": "SUPPLIER_DEACTIVATE"},
            )
            assert malformed_token.status_code == 401
            assert malformed_token.json()["error"]["code"] == "INVALID_ACCESS_TOKEN"

            expired_token, _ = key_store.issue_access_token(
                subject_id=admin_id,
                session_id=uuid4(),
                role_version=1,
                now=datetime.now(UTC) - timedelta(seconds=121),
            )
            expired_response = await client.post(
                "/v1/internal/authorization-decisions",
                headers={**headers, "Authorization": f"Bearer {expired_token}"},
                json={"action": "SUPPLIER_UPDATE"},
            )
            assert expired_response.status_code == 401
            assert expired_response.json()["error"]["code"] == "INVALID_ACCESS_TOKEN"
    finally:
        await database.dispose()
