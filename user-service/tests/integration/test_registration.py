# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21
# Scope: Added or extended tests for registration, OTP verification, and outbox persistence.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import select

from app.core.config import Settings
from app.db import Database
from app.main import create_app
from app.models import Credential, OutboxEvent, OutboxEventState, RegistrationChallenge, User


@dataclass
class RecordingOtpSender:
    """Test-only sender that holds a code in process instead of logging it."""

    sent: list[tuple[str, str, datetime]] = field(default_factory=list)

    async def send_verification_code(
        self,
        *,
        recipient: str,
        otp: str,
        expires_at: datetime,
    ) -> None:
        self.sent.append((recipient, otp, expires_at))


async def read_one(database: Database, statement):
    async for session in database.session():
        return await session.scalar(statement)
    raise AssertionError("The test database did not provide a session.")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_registration_verification_persists_only_hashes_and_activates_atomically() -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    sender = RecordingOtpSender()
    password = "SecurePass1!"
    test_id = uuid4().hex[:12]
    app = create_app(
        settings=Settings(
            _env_file=None,
            environment="test",
            otp_hmac_secret=SecretStr("test-only-otp-hmac-secret"),
            otp_resend_cooldown_seconds=0,
            bcrypt_rounds=4,
        ),
        database=database,
        otp_sender=sender,
    )
    registration = {
        "username": f"Phase1Alice-{test_id}",
        "email": f"phase1-alice-{test_id}@u.nus.edu",
        "password": password,
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post("/v1/auth/registrations", json=registration)

            assert created.status_code == 202
            assert created.json()["status"] == "verification_pending"
            assert created.json()["email"] == registration["email"]
            assert password not in json.dumps(created.json())
            assert len(sender.sent) == 1
            assert sender.sent[0][0] == registration["email"]

            pending_user = await read_one(
                database,
                select(User).where(User.normalized_email == registration["email"]),
            )
            challenge = await read_one(
                database,
                select(RegistrationChallenge).where(
                    RegistrationChallenge.normalized_email == registration["email"]
                ),
            )
            assert pending_user is None
            assert challenge is not None
            assert challenge.display_name == registration["username"]
            assert challenge.password_hash.startswith("$2")
            assert challenge.password_hash != password
            assert bcrypt.checkpw(password.encode(), challenge.password_hash.encode())
            assert challenge.otp_digest != sender.sent[0][1]
            assert len(challenge.otp_digest) == 64

            verified = await client.post(
                "/v1/auth/email-verifications",
                json={"email": registration["email"], "otp": sender.sent[0][1]},
            )

            assert verified.status_code == 201
            assert verified.json()["status"] == "active"
            assert verified.json()["systemRole"] == "USER"
            assert verified.json()["displayName"] == registration["username"]
            assert password not in json.dumps(verified.json())
            assert sender.sent[0][1] not in json.dumps(verified.json())

            user = await read_one(
                database,
                select(User).where(User.normalized_email == registration["email"]),
            )
            credential = await read_one(
                database,
                select(Credential).where(Credential.user_id == user.id),
            )
            outbox_event = await read_one(
                database,
                select(OutboxEvent).where(OutboxEvent.aggregate_id == user.id),
            )
            remaining_challenge = await read_one(
                database,
                select(RegistrationChallenge).where(
                    RegistrationChallenge.normalized_email == registration["email"]
                ),
            )
            assert user is not None
            assert credential is not None
            assert bcrypt.checkpw(password.encode(), credential.password_hash.encode())
            assert remaining_challenge is None
            assert outbox_event is not None
            assert outbox_event.event_type == "user.registered.v1"
            assert outbox_event.aggregate_id == user.id
            assert outbox_event.state == OutboxEventState.PENDING
            assert outbox_event.publish_attempts == 0

            duplicate = await client.post("/v1/auth/registrations", json=registration)
            assert duplicate.status_code == 409
            assert duplicate.json()["error"]["code"] == "EMAIL_ALREADY_REGISTERED"
    finally:
        await database.dispose()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_registration_rejects_protected_fields_and_bounds_invalid_otp_attempts() -> None:
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL or use the local Supabase test helper.")

    database = Database(database_url)
    sender = RecordingOtpSender()
    test_id = uuid4().hex[:12]
    app = create_app(
        settings=Settings(
            _env_file=None,
            environment="test",
            otp_hmac_secret=SecretStr("test-only-otp-hmac-secret"),
            otp_max_attempts=2,
            otp_resend_cooldown_seconds=0,
            bcrypt_rounds=4,
        ),
        database=database,
        otp_sender=sender,
    )
    registration = {
        "username": f"Phase1Bob-{test_id}",
        "email": f"phase1-bob-{test_id}@u.nus.edu",
        "password": "SecurePass1!",
    }

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            protected_field = await client.post(
                "/v1/auth/registrations",
                json={**registration, "systemRole": "ADMIN"},
            )
            assert protected_field.status_code == 422
            assert protected_field.json()["error"]["code"] == "VALIDATION_ERROR"
            assert protected_field.json()["error"]["fieldErrors"][0]["field"] == "systemRole"
            assert "ADMIN" not in json.dumps(protected_field.json())

            created = await client.post("/v1/auth/registrations", json=registration)
            assert created.status_code == 202

            first_invalid = await client.post(
                "/v1/auth/email-verifications",
                json={"email": registration["email"], "otp": "000000"},
            )
            assert first_invalid.status_code == 400
            assert first_invalid.json()["error"]["code"] == "INVALID_OTP"

            final_invalid = await client.post(
                "/v1/auth/email-verifications",
                json={"email": registration["email"], "otp": "000000"},
            )
            assert final_invalid.status_code == 429
            assert final_invalid.json()["error"]["code"] == "OTP_ATTEMPTS_EXCEEDED"

            deleted_challenge = await read_one(
                database,
                select(RegistrationChallenge).where(
                    RegistrationChallenge.normalized_email == registration["email"]
                ),
            )
            assert deleted_challenge is None
            no_user = await read_one(
                database,
                select(User).where(User.normalized_email == registration["email"]),
            )
            assert no_user is None
    finally:
        await database.dispose()
