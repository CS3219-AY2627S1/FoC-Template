# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Added or extended tests for password changes, account lookup, and administrator
# listing.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import bcrypt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import select

from app.auth.jwt import JwtKeyStore
from app.auth.service import AuthenticationService
from app.core.config import Settings
from app.db import Database
from app.main import create_app
from app.models import AccountStatus, Credential, SystemRole, User, UserSession


def phase7_settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        jwt_access_token_ttl_seconds=120,
        jwt_refresh_token_ttl_seconds=86_400,
        jwt_session_idle_timeout_seconds=60,
        otp_hmac_secret=SecretStr("phase7-test-otp-hmac-secret"),
        otp_resend_cooldown_seconds=0,
        bcrypt_rounds=4,
    )


def phase7_authentication_service(
    settings: Settings,
    key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> AuthenticationService:
    private_key, public_key = key_pair
    return AuthenticationService(
        settings,
        JwtKeyStore(settings, private_key=private_key, public_key=public_key),
    )


async def seed_active_user(
    database: Database,
    *,
    username: str,
    email: str,
    password: str,
    system_role: SystemRole = SystemRole.USER,
) -> UUID:
    user_id = uuid4()
    now = datetime.now(UTC)
    async for session in database.session():
        async with session.begin():
            session.add(
                User(
                    id=user_id,
                    username=username,
                    normalized_username=username.casefold(),
                    email=email,
                    normalized_email=email.casefold(),
                    display_name=username,
                    system_role=system_role,
                    account_status=AccountStatus.ACTIVE,
                    email_verified_at=now,
                    role_version=1,
                )
            )
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


@pytest.mark.asyncio
@pytest.mark.integration
async def test_password_change_replaces_bcrypt_credential_and_revokes_all_sessions(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    test_id = uuid4().hex[:12]
    old_password = "Phase7OriginalPass1!"
    new_password = "Phase7ReplacementPass1!"
    email = f"phase7-password-{test_id}@u.nus.edu"
    user_id = await seed_active_user(
        database,
        username=f"Phase7Password{test_id}",
        email=email,
        password=old_password,
    )
    settings = phase7_settings()
    app = create_app(
        settings=settings,
        database=database,
        authentication_service=phase7_authentication_service(settings, jwt_key_pair),
    )

    try:
        async with (
            AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as first_client,
            AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as second_client,
        ):
            first_login = await first_client.post(
                "/v1/auth/sessions",
                json={"email": email, "password": old_password},
            )
            second_login = await second_client.post(
                "/v1/auth/sessions",
                json={"email": email, "password": old_password},
            )
            assert first_login.status_code == second_login.status_code == 200
            first_headers = {"Authorization": f"Bearer {first_login.json()['accessToken']}"}
            second_headers = {"Authorization": f"Bearer {second_login.json()['accessToken']}"}

            wrong_current = await first_client.patch(
                "/v1/users/me/password",
                headers=first_headers,
                json={"currentPassword": "WrongPassword1!", "newPassword": new_password},
            )
            assert wrong_current.status_code == 403
            assert wrong_current.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"
            first_profile = await first_client.get("/v1/users/me", headers=first_headers)
            assert first_profile.status_code == 200

            unchanged = await first_client.patch(
                "/v1/users/me/password",
                headers=first_headers,
                json={"currentPassword": old_password, "newPassword": old_password},
            )
            assert unchanged.status_code == 409
            assert unchanged.json()["error"]["code"] == "PASSWORD_UNCHANGED"

            changed = await first_client.patch(
                "/v1/users/me/password",
                headers=first_headers,
                json={"currentPassword": old_password, "newPassword": new_password},
            )
            assert changed.status_code == 204
            assert "Max-Age=0" in changed.headers["set-cookie"]
            assert first_client.cookies.get("foc_refresh_token") is None

            first_profile_after_change = await first_client.get(
                "/v1/users/me",
                headers=first_headers,
            )
            second_profile_after_change = await second_client.get(
                "/v1/users/me",
                headers=second_headers,
            )
            assert first_profile_after_change.status_code == 401
            assert second_profile_after_change.status_code == 401
            assert (
                await first_client.post(
                    "/v1/auth/sessions",
                    json={"email": email, "password": old_password},
                )
            ).status_code == 401
            assert (
                await first_client.post(
                    "/v1/auth/sessions",
                    json={"email": email, "password": new_password},
                )
            ).status_code == 200

        credential = await read_one(
            database,
            select(Credential).where(Credential.user_id == user_id),
        )
        assert credential is not None
        assert bcrypt.checkpw(
            new_password.encode("utf-8"),
            credential.password_hash.encode("ascii"),
        )
        assert not bcrypt.checkpw(
            old_password.encode("utf-8"),
            credential.password_hash.encode("ascii"),
        )
        async for session in database.session():
            sessions = list(
                (
                    await session.scalars(select(UserSession).where(UserSession.user_id == user_id))
                ).all()
            )
        assert len(sessions) == 3
        assert sum(stored_session.revoked_at is not None for stored_session in sessions) == 2
    finally:
        await database.dispose()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_current_admin_list_permissions_ordering_tombstones_and_role_updates(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    test_id = uuid4().hex[:12]
    password = "AdminListTestPass1!"
    identities = [
        (f"AlphaSuper{test_id}", SystemRole.SUPER_ADMIN),
        (f"zULuSuper{test_id}", SystemRole.SUPER_ADMIN),
        (f"aLpHaAdmin{test_id}", SystemRole.ADMIN),
        (f"ZuluAdmin{test_id}", SystemRole.ADMIN),
        (f"OrdinaryUser{test_id}", SystemRole.USER),
    ]
    user_ids = []
    for username, role in identities:
        user_ids.append(
            await seed_active_user(
                database,
                username=username,
                email=f"{username.lower()}@u.nus.edu",
                password=password,
                system_role=role,
            )
        )

    tombstone_ids = [uuid4(), uuid4()]
    async for session in database.session():
        async with session.begin():
            for user_id, role in zip(
                tombstone_ids, (SystemRole.SUPER_ADMIN, SystemRole.ADMIN), strict=True
            ):
                session.add(
                    User(
                        id=user_id,
                        display_name="Deleted User",
                        system_role=role,
                        account_status=AccountStatus.DELETED,
                        deleted_at=datetime.now(UTC),
                        role_version=2,
                    )
                )

    settings = phase7_settings()
    app = create_app(
        settings=settings,
        database=database,
        authentication_service=phase7_authentication_service(settings, jwt_key_pair),
    )

    async def login_headers(client: AsyncClient, index: int) -> dict[str, str]:
        response = await client.post(
            "/v1/auth/sessions",
            json={"email": f"{identities[index][0].lower()}@u.nus.edu", "password": password},
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['accessToken']}"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/v1/admin/admins")).status_code == 401
            for index in (2, 4):
                rejected = await client.get(
                    "/v1/admin/admins", headers=await login_headers(client, index)
                )
                assert rejected.status_code == 403
                assert rejected.json()["error"]["code"] == "INSUFFICIENT_ROLE"

            super_headers = await login_headers(client, 0)
            response = await client.get("/v1/admin/admins", headers=super_headers)
            assert response.status_code == 200
            accounts = response.json()
            assert all(
                set(account) == {"userId", "username", "email", "systemRole"}
                for account in accounts
            )
            seeded_ids = {str(user_id) for user_id in user_ids}
            seeded = [account for account in accounts if account["userId"] in seeded_ids]
            assert [account["username"] for account in seeded] == [
                username for username, _ in identities[:4]
            ]
            assert not {str(user_id) for user_id in tombstone_ids}.intersection(
                account["userId"] for account in accounts
            )

            target_id = str(user_ids[4])
            for requested_role in ("ADMIN", "SUPER_ADMIN", "USER"):
                changed = await client.patch(
                    f"/v1/admin/users/{target_id}/system-role",
                    headers=super_headers,
                    json={"systemRole": requested_role},
                )
                assert changed.status_code == 200
                current = (await client.get("/v1/admin/admins", headers=super_headers)).json()
                target = [account for account in current if account["userId"] == target_id]
                if requested_role == "USER":
                    assert target == []
                else:
                    assert target[0]["systemRole"] == requested_role
                assert current == sorted(
                    current,
                    key=lambda account: (
                        account["systemRole"] != "SUPER_ADMIN",
                        account["username"].casefold(),
                    ),
                )
    finally:
        await database.dispose()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_only_super_admins_can_look_up_one_safe_account_by_normalized_identifier(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    test_id = uuid4().hex[:12]
    password = "Phase7LookupPass1!"
    target_username = f"Phase7Lookup{test_id}"
    target_email = f"phase7-lookup-{test_id}@u.nus.edu"
    target_id = await seed_active_user(
        database,
        username=target_username,
        email=target_email,
        password=password,
    )
    admin_email = f"phase7-admin-{test_id}@u.nus.edu"
    super_admin_email = f"phase7-super-admin-{test_id}@u.nus.edu"
    ordinary_email = f"phase7-user-{test_id}@u.nus.edu"
    await seed_active_user(
        database,
        username=f"Phase7Admin{test_id}",
        email=admin_email,
        password=password,
        system_role=SystemRole.ADMIN,
    )
    await seed_active_user(
        database,
        username=f"Phase7SuperAdmin{test_id}",
        email=super_admin_email,
        password=password,
        system_role=SystemRole.SUPER_ADMIN,
    )
    await seed_active_user(
        database,
        username=f"Phase7User{test_id}",
        email=ordinary_email,
        password=password,
    )
    settings = phase7_settings()
    app = create_app(
        settings=settings,
        database=database,
        authentication_service=phase7_authentication_service(settings, jwt_key_pair),
    )

    async def login_headers(client: AsyncClient, login_email: str) -> dict[str, str]:
        response = await client.post(
            "/v1/auth/sessions",
            json={"email": login_email, "password": password},
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['accessToken']}"}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unauthenticated = await client.get(f"/v1/admin/users?username={target_username}")
            assert unauthenticated.status_code == 401

            ordinary_headers = await login_headers(client, ordinary_email)
            rejected = await client.get(
                f"/v1/admin/users?username={target_username}",
                headers=ordinary_headers,
            )
            assert rejected.status_code == 403
            assert rejected.json()["error"]["code"] == "INSUFFICIENT_ROLE"

            admin_headers = await login_headers(client, admin_email)
            rejected_admin = await client.get(
                f"/v1/admin/users?username={target_username}",
                headers=admin_headers,
            )
            assert rejected_admin.status_code == 403
            assert rejected_admin.json()["error"]["code"] == "INSUFFICIENT_ROLE"

            super_admin_headers = await login_headers(client, super_admin_email)
            by_username = await client.get(
                f"/v1/admin/users?username={target_username.swapcase()}",
                headers=super_admin_headers,
            )
            assert by_username.status_code == 200
            body = by_username.json()
            assert body["userId"] == str(target_id)
            assert body["username"] == target_username
            assert body["displayName"] == target_username
            assert body["email"] == target_email
            assert body["emailVerified"] is True
            assert body["accountStatus"] == "ACTIVE"
            assert body["systemRole"] == "USER"
            assert body["createdAt"]
            assert set(body) == {
                "userId",
                "username",
                "displayName",
                "email",
                "emailVerified",
                "accountStatus",
                "systemRole",
                "createdAt",
            }

            by_email = await client.get(
                f"/v1/admin/users?email={target_email.upper()}",
                headers=super_admin_headers,
            )
            assert by_email.status_code == 200
            assert by_email.json()["userId"] == str(target_id)

            no_criterion = await client.get("/v1/admin/users", headers=super_admin_headers)
            both_criteria = await client.get(
                f"/v1/admin/users?username={target_username}&email={target_email}",
                headers=super_admin_headers,
            )
            invalid_criterion = await client.get(
                "/v1/admin/users?username=invalid%20username",
                headers=super_admin_headers,
            )
            missing = await client.get(
                f"/v1/admin/users?email=missing-{test_id}@u.nus.edu",
                headers=super_admin_headers,
            )
            assert no_criterion.status_code == 422
            assert both_criteria.status_code == 422
            assert invalid_criterion.status_code == 422
            assert missing.status_code == 404
            assert missing.json()["error"]["code"] == "USER_NOT_FOUND"
    finally:
        await database.dispose()
