# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Added shared integration fixtures for authenticated Chat identity requests.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID, uuid4

import bcrypt
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.auth.jwt import JwtKeyStore
from app.auth.service import AuthenticationService
from app.core.config import Settings
from app.db import Database
from app.main import create_app
from app.models import AccountStatus, Credential, SystemRole, User

CHAT_SECRET = "isolated-chat-test-secret"
TEST_PASSWORD = "ChatTestSecurePass1!"


@dataclass
class ChatOtpSender:
    sent: list[tuple[str, str]] = field(default_factory=list)

    async def send_verification_code(self, *, recipient: str, otp: str, expires_at: datetime):
        self.sent.append((recipient, otp))


@dataclass
class ChatHarness:
    database: Database
    app: FastAPI
    client: AsyncClient
    key_store: JwtKeyStore
    sender: ChatOtpSender

    async def seed_user(
        self,
        username: str,
        *,
        display_name: str = "SameName",
        role: SystemRole = SystemRole.USER,
        deleted: bool = False,
        email: str | None = None,
    ) -> UUID:
        user_id = uuid4()
        now = datetime.now(UTC)
        email = email or f"chat-{user_id.hex}@u.nus.edu"
        async for session in self.database.session():
            async with session.begin():
                session.add(
                    User(
                        id=user_id,
                        username=None if deleted else username,
                        normalized_username=None if deleted else username.casefold(),
                        email=None if deleted else email,
                        normalized_email=None if deleted else email.casefold(),
                        display_name="Deleted User" if deleted else display_name,
                        system_role=role,
                        account_status=AccountStatus.DELETED if deleted else AccountStatus.ACTIVE,
                        email_verified_at=None if deleted else now,
                        deleted_at=now if deleted else None,
                        role_version=1,
                    )
                )
                await session.flush()
                if not deleted:
                    session.add(
                        Credential(
                            user_id=user_id,
                            password_hash=bcrypt.hashpw(
                                TEST_PASSWORD.encode(), bcrypt.gensalt(4)
                            ).decode(),
                            password_changed_at=now,
                        )
                    )
        return user_id

    async def login(self, user_id: UUID) -> dict[str, str]:
        async for session in self.database.session():
            user = await session.get(User, user_id)
            assert user is not None
            email = user.email
        response = await self.client.post(
            "/v1/auth/sessions",
            json={"email": email, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200, response.text
        return {
            "X-FoC-Service-Secret": CHAT_SECRET,
            "Authorization": f"Bearer {response.json()['accessToken']}",
        }


@pytest.fixture
async def chat_harness(jwt_key_pair):
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL to an isolated migrated test database.")
    database = Database(database_url)
    settings = Settings(
        _env_file=None,
        environment="test",
        bcrypt_rounds=4,
        chat_service_shared_secret=CHAT_SECRET,
        SUPPLIER_SERVICE_SHARED_SECRET="separate-supplier-test-secret",
        otp_hmac_secret="chat-test-otp-secret",
        otp_resend_cooldown_seconds=0,
        jwt_access_token_ttl_seconds=120,
        jwt_session_idle_timeout_seconds=60,
    )
    private_key, public_key = jwt_key_pair
    key_store = JwtKeyStore(settings, private_key=private_key, public_key=public_key)
    sender = ChatOtpSender()
    app = create_app(
        settings=settings,
        database=database,
        otp_sender=sender,
        authentication_service=AuthenticationService(settings, key_store),
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield ChatHarness(database, app, client, key_store, sender)
    finally:
        await database.dispose()
