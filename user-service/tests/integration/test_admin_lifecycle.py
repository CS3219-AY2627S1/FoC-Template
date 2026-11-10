# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21, 2026-09-22, 2026-09-30
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Added or extended tests for administrator bootstrap, role changes, audit, and
# bootstrap events.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

import bcrypt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError

from app.admin.lifecycle import (
    BootstrapAlreadyCompletedError,
    BootstrapCredentials,
    BootstrapSuperAdminService,
)
from app.api.authentication import REFRESH_COOKIE_NAME
from app.auth.jwt import JwtKeyStore
from app.auth.service import AuthenticationService
from app.core.config import Settings
from app.db import Database
from app.main import create_app
from app.models import (
    AccountStatus,
    AdminAuditEntry,
    Credential,
    OutboxEvent,
    OutboxEventState,
    SystemRole,
    User,
)
from app.outbox.events import USER_REGISTERED_EVENT_TYPE


def admin_settings(test_id: str) -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        jwt_access_token_ttl_seconds=120,
        jwt_refresh_token_ttl_seconds=86_400,
        jwt_session_idle_timeout_seconds=60,
        bcrypt_rounds=4,
        bootstrap_super_admin_username=f"Bootstrap{test_id}",
        bootstrap_super_admin_email=f"bootstrap-{test_id}@u.nus.edu",
        bootstrap_super_admin_password=SecretStr("BootstrapAdminPass1!"),
        bootstrap_super_admin_display_name=f"Bootstrap{test_id}",
    )


def admin_authentication_service(
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
) -> UUID:
    user_id = uuid4()
    now = datetime.now(UTC)
    username = f"AdminPhase{user_id.hex[:12]}"
    async for session in database.session():
        async with session.begin():
            user = User(
                id=user_id,
                username=username,
                normalized_username=username.casefold(),
                email=email,
                normalized_email=email.casefold(),
                display_name=username,
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


async def bootstrap_super_admin(database: Database, settings: Settings) -> UUID:
    credentials = BootstrapCredentials.from_settings(settings)
    async for session in database.session():
        user = await BootstrapSuperAdminService(settings).bootstrap(
            session,
            credentials=credentials,
            correlation_id="phase5-bootstrap-test",
        )
        return user.id
    raise AssertionError("The test database did not provide a session.")


async def read_one(database: Database, statement):
    async for session in database.session():
        return await session.scalar(statement)
    raise AssertionError("The test database did not provide a session.")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_super_admin_bootstrap_role_lifecycle_and_last_admin_protection(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    test_id = uuid4().hex[:12]
    settings = admin_settings(test_id)
    bootstrap_password = settings.bootstrap_super_admin_password
    assert bootstrap_password is not None
    ordinary_password = "OrdinaryAdminPass1!"
    app = create_app(
        settings=settings,
        database=database,
        authentication_service=admin_authentication_service(settings, jwt_key_pair),
    )

    try:
        bootstrap_user_id = await bootstrap_super_admin(database, settings)
        bootstrap_user = await read_one(database, select(User).where(User.id == bootstrap_user_id))
        bootstrap_credential = await read_one(
            database,
            select(Credential).where(Credential.user_id == bootstrap_user_id),
        )
        bootstrap_audit = await read_one(
            database,
            select(AdminAuditEntry).where(AdminAuditEntry.target_user_id == bootstrap_user_id),
        )
        bootstrap_event = await read_one(
            database,
            select(OutboxEvent).where(OutboxEvent.aggregate_id == bootstrap_user_id),
        )
        assert bootstrap_user is not None
        assert bootstrap_user.system_role == SystemRole.SUPER_ADMIN
        assert bootstrap_user.email_verified_at is not None
        assert bootstrap_credential is not None
        assert bcrypt.checkpw(
            bootstrap_password.get_secret_value().encode("utf-8"),
            bootstrap_credential.password_hash.encode("ascii"),
        )
        assert bootstrap_audit is not None
        assert bootstrap_audit.action == "SUPER_ADMIN_BOOTSTRAPPED"
        assert bootstrap_audit.role_before is None
        assert bootstrap_audit.role_after == SystemRole.SUPER_ADMIN
        assert bootstrap_event is not None
        assert bootstrap_event.event_type == USER_REGISTERED_EVENT_TYPE
        assert bootstrap_event.state == OutboxEventState.PENDING
        assert bootstrap_event.aggregate_id == bootstrap_user_id
        assert bootstrap_event.occurred_at == bootstrap_user.email_verified_at

        async for session in database.session():
            with pytest.raises(BootstrapAlreadyCompletedError):
                await BootstrapSuperAdminService(settings).bootstrap(
                    session,
                    credentials=BootstrapCredentials.from_settings(settings),
                    correlation_id="second-bootstrap-test",
                )

        assert await read_one(
            database,
            select(func.count())
            .select_from(OutboxEvent)
            .where(OutboxEvent.aggregate_id == bootstrap_user_id),
        ) == 1

        first_target_email = f"first-target-{test_id}@u.nus.edu"
        second_target_email = f"second-target-{test_id}@u.nus.edu"
        first_target_id = await seed_active_user(
            database,
            email=first_target_email,
            password=ordinary_password,
        )
        second_target_id = await seed_active_user(
            database,
            email=second_target_email,
            password=ordinary_password,
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            bootstrap_login = await client.post(
                "/v1/auth/sessions",
                json={
                    "email": settings.bootstrap_super_admin_email,
                    "password": bootstrap_password.get_secret_value(),
                },
            )
            assert bootstrap_login.status_code == 200
            bootstrap_token = bootstrap_login.json()["accessToken"]
            bootstrap_headers = {"Authorization": f"Bearer {bootstrap_token}"}

            target_login = await client.post(
                "/v1/auth/sessions",
                json={"email": first_target_email, "password": ordinary_password},
            )
            assert target_login.status_code == 200
            target_token = target_login.json()["accessToken"]

            promoted = await client.patch(
                f"/v1/admin/users/{first_target_id}/system-role",
                headers=bootstrap_headers,
                json={"systemRole": "ADMIN"},
            )
            assert promoted.status_code == 200
            assert promoted.json() == {
                "userId": str(first_target_id),
                "systemRole": "ADMIN",
                "roleVersion": 2,
            }
            stale_target = await client.get(
                "/v1/users/me",
                headers={"Authorization": f"Bearer {target_token}"},
            )
            assert stale_target.status_code == 401

            promoted_audit = await read_one(
                database,
                select(AdminAuditEntry)
                .where(AdminAuditEntry.target_user_id == first_target_id)
                .order_by(AdminAuditEntry.created_at.desc()),
            )
            assert promoted_audit is not None
            assert promoted_audit.action == "SYSTEM_ROLE_CHANGED"
            assert promoted_audit.actor_id == bootstrap_user_id
            assert promoted_audit.role_before == SystemRole.USER
            assert promoted_audit.role_after == SystemRole.ADMIN
            assert promoted_audit.correlation_id

            promoted_login = await client.post(
                "/v1/auth/sessions",
                json={"email": first_target_email, "password": ordinary_password},
            )
            assert promoted_login.status_code == 200
            admin_headers = {"Authorization": f"Bearer {promoted_login.json()['accessToken']}"}
            admin_rejected = await client.patch(
                f"/v1/admin/users/{second_target_id}/system-role",
                headers=admin_headers,
                json={"systemRole": "ADMIN"},
            )
            assert admin_rejected.status_code == 403
            assert admin_rejected.json()["error"]["code"] == "INSUFFICIENT_ROLE"

            self_demotion = await client.patch(
                f"/v1/admin/users/{bootstrap_user_id}/system-role",
                headers=bootstrap_headers,
                json={"systemRole": "ADMIN"},
            )
            assert self_demotion.status_code == 400
            assert self_demotion.json()["error"]["code"] == "SELF_ROLE_CHANGE_FORBIDDEN"

        delete_payload = {
            "currentPassword": bootstrap_password.get_secret_value(),
            "acknowledgeDeletion": True,
        }
        async with (
            AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as first_client,
            AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as second_client,
        ):
            concurrent_deletes = await asyncio.gather(
                first_client.request(
                    "DELETE",
                    "/v1/users/me",
                    headers=bootstrap_headers,
                    json=delete_payload,
                ),
                second_client.request(
                    "DELETE",
                    "/v1/users/me",
                    headers=bootstrap_headers,
                    json=delete_payload,
                ),
            )
        assert all(response.status_code == 409 for response in concurrent_deletes)
        assert all(
            response.json()["error"]["code"] == "LAST_SUPER_ADMIN_REQUIRED"
            for response in concurrent_deletes
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            second_promoted = await client.patch(
                f"/v1/admin/users/{second_target_id}/system-role",
                headers=bootstrap_headers,
                json={"systemRole": "SUPER_ADMIN"},
            )
            assert second_promoted.status_code == 200
            assert second_promoted.json()["systemRole"] == "SUPER_ADMIN"

            deleted = await client.request(
                "DELETE",
                "/v1/users/me",
                headers=bootstrap_headers,
                json=delete_payload,
            )
            assert deleted.status_code == 204
            assert client.cookies.get(REFRESH_COOKIE_NAME) is None

        tombstone = await read_one(database, select(User).where(User.id == bootstrap_user_id))
        assert tombstone is not None
        assert tombstone.account_status == AccountStatus.DELETED

        async for session in database.session():
            with pytest.raises(DBAPIError):
                async with session.begin():
                    audit_entry = await session.scalar(select(AdminAuditEntry).limit(1))
                    assert audit_entry is not None
                    audit_entry.outcome = "ALTERED"
    finally:
        await database.dispose()
