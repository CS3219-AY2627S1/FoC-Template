# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-03
# Scope: Implemented registration checks with a fake SES provider.
# Author review: I validated correctness and added boundary checks where needed.

"""Real registration transactions with the AWS SDK's isolated response stub."""

from __future__ import annotations

import os
from uuid import uuid4

import boto3
import pytest
from botocore.stub import ANY, Stubber
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.config import Settings
from app.db import Database
from app.main import create_app
from app.models import OutboxEvent, RegistrationChallenge, User
from app.registration.service import RegistrationService


@pytest.mark.asyncio
@pytest.mark.integration
async def test_ses_failure_resend_and_verification_preserve_registration_rules(monkeypatch, capsys):
    database_url = os.getenv("USER_SERVICE_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set USER_SERVICE_TEST_DATABASE_URL to an isolated migrated database.")
    database = Database(database_url)
    tag = uuid4().hex[:12]
    email = f"ses-test-{tag}@u.nus.edu"
    codes = iter(("987654", "736291"))
    monkeypatch.setattr(RegistrationService, "_new_otp", staticmethod(lambda: next(codes)))
    api = boto3.client(
        "sesv2",
        region_name="ap-southeast-1",
        aws_access_key_id="test-only",
        aws_secret_access_key="test-only",
    )
    monkeypatch.setattr("app.registration.mailer.SesOtpSender._new_client", lambda self: api)
    settings = Settings(
        _env_file=None,
        environment="test",
        otp_email_provider="ses",
        ses_region="ap-southeast-1",
        ses_from_address="test-sender@example.com",
        otp_hmac_secret="test-only-hmac-secret",
        bcrypt_rounds=4,
        otp_resend_cooldown_seconds=0,
    )
    expected = {
        "FromEmailAddress": "test-sender@example.com",
        "Destination": {"ToAddresses": [email]},
        "Content": ANY,
    }
    try:
        with Stubber(api) as stub:
            stub.add_client_error(
                "send_email",
                service_error_code="TooManyRequestsException",
                service_message=f"private SES failure: {email} 987654",
                expected_params=expected,
            )
            stub.add_response("send_email", {"MessageId": "test-resend-message"}, expected)
            app = create_app(settings=settings, database=database)
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as http:
                response = await http.post(
                    "/v1/auth/registrations",
                    json={"username": f"SES-{tag}", "email": email, "password": "SecurePass1!"},
                )
                assert response.status_code == 503
                assert response.json()["error"]["code"] == "OTP_DELIVERY_FAILED"
                assert "987654" not in response.text
                assert "TooManyRequestsException" not in response.text
                async for session in database.session():
                    assert (
                        await session.scalar(
                            select(RegistrationChallenge).where(
                                RegistrationChallenge.normalized_email == email
                            )
                        )
                        is not None
                    )
                    assert (
                        await session.scalar(select(User).where(User.normalized_email == email))
                        is None
                    )
                resent = await http.post(
                    "/v1/auth/email-verifications/resend", json={"email": email}
                )
                assert resent.status_code == 202, resent.text
                invalid = await http.post(
                    "/v1/auth/email-verifications", json={"email": email, "otp": "987654"}
                )
                assert invalid.status_code == 400
                verified = await http.post(
                    "/v1/auth/email-verifications", json={"email": email, "otp": "736291"}
                )
                assert verified.status_code == 201, verified.text
                async for session in database.session():
                    user = await session.scalar(select(User).where(User.normalized_email == email))
                    assert user is not None
                    assert (
                        await session.scalar(
                            select(RegistrationChallenge).where(
                                RegistrationChallenge.normalized_email == email
                            )
                        )
                        is None
                    )
                    assert (
                        await session.scalar(
                            select(OutboxEvent).where(OutboxEvent.aggregate_id == user.id)
                        )
                        is not None
                    )
            stub.assert_no_pending_responses()
        output = capsys.readouterr()
        for secret in (email, "987654", "736291", "test-only-hmac-secret"):
            assert secret not in output.err
    finally:
        await database.dispose()
