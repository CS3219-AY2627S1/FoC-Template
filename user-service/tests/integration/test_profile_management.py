# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21, 2026-09-22
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Added or extended tests for profile changes, deletion, and protected fields.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

import bcrypt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
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


@dataclass
class RecordingOtpSender:
    """Test-only sender that keeps the code out of logs and responses."""

    sent: list[tuple[str, str, datetime]] = field(default_factory=list)

    async def send_verification_code(
        self,
        *,
        recipient: str,
        otp: str,
        expires_at: datetime,
    ) -> None:
        self.sent.append((recipient, otp, expires_at))


def profile_settings() -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        jwt_access_token_ttl_seconds=120,
        jwt_refresh_token_ttl_seconds=1_209_600,
        jwt_session_idle_timeout_seconds=60,
        otp_hmac_secret=SecretStr("phase3-test-otp-hmac-secret"),
        otp_resend_cooldown_seconds=0,
        bcrypt_rounds=4,
    )


def profile_authentication_service(
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
    email: str,
    password: str,
    system_role: SystemRole = SystemRole.USER,
) -> UUID:
    user_id = uuid4()
    now = datetime.now(UTC)
    username = f"Phase3-{user_id.hex[:12]}"
    async for session in database.session():
        async with session.begin():
            user = User(
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


@pytest.mark.asyncio
@pytest.mark.integration
async def test_profile_management_rejects_protected_fields_and_tombstones_account(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    password = "Phase3SecurePass1!"
    test_id = uuid4().hex[:12]
    email = f"phase3-profile-{test_id}@u.nus.edu"
    user_id = await seed_active_user(
        database,
        email=email,
        password=password,
        system_role=SystemRole.ADMIN,
    )
    settings = profile_settings()
    sender = RecordingOtpSender()
    app = create_app(
        settings=settings,
        database=database,
        otp_sender=sender,
        authentication_service=profile_authentication_service(settings, jwt_key_pair),
    )

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post(
                "/v1/auth/sessions",
                json={"email": email, "password": password},
            )
            assert login.status_code == 200
            access_token = login.json()["accessToken"]
            authorization = {"Authorization": f"Bearer {access_token}"}

            updated = await client.patch(
                "/v1/users/me",
                headers=authorization,
                json={"displayName": "Phase3-Renamed"},
            )
            assert updated.status_code == 200
            assert updated.json()["userId"] == str(user_id)
            assert updated.json()["displayName"] == "Phase3-Renamed"
            assert "activeParticipationMode" not in updated.json()

            persisted = await client.get("/v1/users/me", headers=authorization)
            assert persisted.status_code == 200
            assert persisted.json()["userId"] == str(user_id)
            assert persisted.json()["displayName"] == "Phase3-Renamed"
            assert "activeParticipationMode" not in persisted.json()

            invalid_name = await client.patch(
                "/v1/users/me",
                headers=authorization,
                json={"displayName": "Invalid display name"},
            )
            assert invalid_name.status_code == 422
            invalid_name_error = invalid_name.json()["error"]
            assert invalid_name_error["code"] == "VALIDATION_ERROR"
            assert invalid_name_error["fieldErrors"][0]["field"] == "displayName"
            assert (
                "Display name may contain only"
                in invalid_name_error["fieldErrors"][0]["message"]
            )

            duplicate_email = f"phase3-duplicate-{test_id}@u.nus.edu"
            duplicate_user_id = await seed_active_user(
                database,
                email=duplicate_email,
                password=password,
            )
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as duplicate_client:
                duplicate_login = await duplicate_client.post(
                    "/v1/auth/sessions",
                    json={"email": duplicate_email, "password": password},
                )
                duplicate_authorization = {
                    "Authorization": f"Bearer {duplicate_login.json()['accessToken']}"
                }
                duplicate_name = await duplicate_client.patch(
                    "/v1/users/me",
                    headers=duplicate_authorization,
                    json={"displayName": "Phase3-Renamed"},
                )
                assert duplicate_name.status_code == 200
                assert duplicate_name.json()["userId"] == str(duplicate_user_id)
                assert duplicate_name.json()["userId"] != str(user_id)
                assert duplicate_name.json()["displayName"] == "Phase3-Renamed"

            protected_field_values = {
                "email": f"replacement-{test_id}@u.nus.edu",
                "username": "replacement",
                "activeParticipationMode": "COURIER",
                "systemRole": "ADMIN",
                "accountStatus": "DELETED",
                "id": str(uuid4()),
            }
            for field, value in protected_field_values.items():
                rejected = await client.patch(
                    "/v1/users/me",
                    headers=authorization,
                    json={field: value},
                )
                assert rejected.status_code == 422
                error = rejected.json()["error"]
                assert error["code"] == "VALIDATION_ERROR"
                assert error["fieldErrors"][0]["field"] == field
                assert "ADMIN" not in json.dumps(rejected.json())

                unchanged = await client.get("/v1/users/me", headers=authorization)
                assert unchanged.status_code == 200
                assert unchanged.json()["userId"] == str(user_id)
                assert unchanged.json()["displayName"] == "Phase3-Renamed"

            missing_acknowledgement = await client.request(
                "DELETE",
                "/v1/users/me",
                headers=authorization,
                json={"currentPassword": password, "acknowledgeDeletion": False},
            )
            assert missing_acknowledgement.status_code == 422

            wrong_password = await client.request(
                "DELETE",
                "/v1/users/me",
                headers=authorization,
                json={"currentPassword": "WrongPassword1!", "acknowledgeDeletion": True},
            )
            assert wrong_password.status_code == 403
            assert wrong_password.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"
            assert password not in json.dumps(wrong_password.json())

            deleted = await client.request(
                "DELETE",
                "/v1/users/me",
                headers=authorization,
                json={"currentPassword": password, "acknowledgeDeletion": True},
            )
            assert deleted.status_code == 204
            assert "Max-Age=0" in deleted.headers["set-cookie"]

            denied_profile = await client.get("/v1/users/me", headers=authorization)
            assert denied_profile.status_code == 401
            rejected_login = await client.post(
                "/v1/auth/sessions",
                json={"email": email, "password": password},
            )
            assert rejected_login.status_code == 401
            assert rejected_login.json()["error"]["code"] == "INVALID_CREDENTIALS"

            tombstone = await read_one(database, select(User).where(User.id == user_id))
            assert tombstone is not None
            assert tombstone.account_status == AccountStatus.DELETED
            assert tombstone.deleted_at is not None
            assert tombstone.username is None
            assert tombstone.normalized_username is None
            assert tombstone.email is None
            assert tombstone.normalized_email is None
            assert tombstone.email_verified_at is None
            assert tombstone.display_name == "Deleted User"
            assert tombstone.system_role == SystemRole.ADMIN
            assert tombstone.role_version == 2
            credential = await read_one(
                database,
                select(Credential).where(Credential.user_id == user_id),
            )
            session_record = await read_one(
                database,
                select(UserSession).where(UserSession.user_id == user_id),
            )
            assert credential is None
            assert session_record is None
            assert client.cookies.get(REFRESH_COOKIE_NAME) is None

            original_username = f"Phase3-{user_id.hex[:12]}"
            reregistered = await client.post(
                "/v1/auth/registrations",
                json={
                    "username": original_username,
                    "email": email,
                    "password": password,
                },
            )
            assert reregistered.status_code == 202
            assert len(sender.sent) == 1
            assert sender.sent[0][0] == email
            reactivated = await client.post(
                "/v1/auth/email-verifications",
                json={"email": email, "otp": sender.sent[0][1]},
            )
            assert reactivated.status_code == 201
            assert reactivated.json()["userId"] != str(user_id)
            assert reactivated.json()["username"] == original_username
            assert reactivated.json()["email"] == email
    finally:
        await database.dispose()
