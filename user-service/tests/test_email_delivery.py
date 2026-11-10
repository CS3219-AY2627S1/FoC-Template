# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-03
# Scope: Implemented fake-provider tests for SMTP/SES delivery and error handling.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import logging
import threading
from datetime import UTC, datetime
from email.message import EmailMessage
from unittest.mock import Mock

import boto3
import pytest
from botocore.exceptions import ConnectTimeoutError, NoCredentialsError
from botocore.stub import Stubber
from pydantic import ValidationError

from app.core.config import Settings
from app.core.logging import configure_logging
from app.registration.mailer import (
    OtpDeliveryError,
    SesOtpSender,
    SmtpOtpSender,
    create_otp_sender,
)

EXPIRES = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)
RECIPIENT = "test-recipient@u.nus.edu"
SENDER = "test-sender@example.com"
OTP = "736291"


def settings(**values) -> Settings:
    return Settings(
        _env_file=None,
        otp_email_provider="ses",
        ses_region="ap-southeast-1",
        ses_from_address=SENDER,
        **values,
    )


def client():
    # Explicit dummy credentials plus Stubber: no AWS discovery or network call.
    return boto3.client(
        "sesv2",
        region_name="ap-southeast-1",
        aws_access_key_id="test-only",
        aws_secret_access_key="test-only",
    )


def request():
    return {
        "FromEmailAddress": SENDER,
        "Destination": {"ToAddresses": [RECIPIENT]},
        "Content": {
            "Simple": {
                "Subject": {"Data": "Verify your FoC email address", "Charset": "UTF-8"},
                "Body": {
                    "Text": {
                        "Data": (
                            f"Your FoC verification code is {OTP}. "
                            f"It expires at {EXPIRES.isoformat()}. Do not share this code."
                        ),
                        "Charset": "UTF-8",
                    }
                },
            }
        },
    }


def test_default_smtp_never_creates_aws_session(monkeypatch):
    factory = Mock(side_effect=AssertionError("SMTP must not resolve AWS credentials"))
    monkeypatch.setattr("app.registration.mailer.boto3.session.Session", factory)
    sender = create_otp_sender(Settings(_env_file=None))
    assert isinstance(sender, SmtpOtpSender)
    factory.assert_not_called()


@pytest.mark.asyncio
async def test_mailpit_uses_existing_smtp_protocol_and_message(monkeypatch):
    smtp = Mock()
    smtp.return_value.__enter__ = Mock(return_value=smtp.return_value)
    smtp.return_value.__exit__ = Mock(return_value=False)
    monkeypatch.setattr("app.registration.mailer.smtplib.SMTP", smtp)
    sender = create_otp_sender(Settings(_env_file=None, smtp_host="mailpit", smtp_port=1025))
    await sender.send_verification_code(recipient=RECIPIENT, otp=OTP, expires_at=EXPIRES)
    smtp.assert_called_once_with("mailpit", 1025, timeout=10)
    message = smtp.return_value.send_message.call_args.args[0]
    assert isinstance(message, EmailMessage)
    assert message["To"] == RECIPIENT
    assert OTP in message.get_content()


@pytest.mark.parametrize(
    "values",
    [
        {"otp_email_provider": "unknown"},
        {"otp_email_provider": "ses"},
        {"otp_email_provider": "ses", "ses_region": "ap-southeast-1"},
        {
            "otp_email_provider": "ses",
            "ses_region": "ap-southeast-1",
            "ses_from_address": "invalid",
        },
    ],
)
def test_bad_provider_configuration_fails_without_echoing_secrets(values):
    with pytest.raises(ValidationError) as caught:
        Settings(
            _env_file=None,
            database_url="postgresql://user:private-password@localhost/db",
            otp_hmac_secret="private-otp-secret",
            **values,
        )
    assert "private-password" not in str(caught.value)
    assert "private-otp-secret" not in str(caught.value)


@pytest.mark.asyncio
async def test_ses_sends_only_verification_content_and_runs_off_event_loop():
    api = client()
    with Stubber(api) as stub:
        stub.add_response("send_email", {"MessageId": "test-message-id"}, request())
        thread_ids = []

        def factory():
            thread_ids.append(threading.get_ident())
            return api

        sender = SesOtpSender(settings(), client_factory=factory)
        await sender.send_verification_code(recipient=RECIPIENT, otp=OTP, expires_at=EXPIRES)
        stub.assert_no_pending_responses()
    assert thread_ids and thread_ids[0] != threading.get_ident()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "code", ["MessageRejected", "TooManyRequestsException", "AccessDeniedException"]
)
async def test_ses_failure_is_safe_and_does_not_fall_back_to_mailpit(monkeypatch, code):
    api = client()
    smtp = Mock(side_effect=AssertionError("No silent test-inbox fallback"))
    monkeypatch.setattr("app.registration.mailer.smtplib.SMTP", smtp)
    with Stubber(api) as stub:
        stub.add_client_error(
            "send_email",
            service_error_code=code,
            service_message=f"private failure {OTP} {RECIPIENT}",
            expected_params=request(),
        )
        sender = SesOtpSender(settings(), client_factory=lambda: api)
        with pytest.raises(OtpDeliveryError) as caught:
            await sender.send_verification_code(recipient=RECIPIENT, otp=OTP, expires_at=EXPIRES)
        assert OTP not in str(caught.value)
        assert RECIPIENT not in str(caught.value)
        assert caught.value.__cause__ is None
    smtp.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure", [NoCredentialsError(), ConnectTimeoutError(endpoint_url="https://example.test")]
)
async def test_ses_missing_role_or_connection_failure_is_a_delivery_error(failure):
    sender = SesOtpSender(settings(), client_factory=Mock(side_effect=failure))
    with pytest.raises(OtpDeliveryError, match="OTP delivery failed"):
        await sender.send_verification_code(recipient=RECIPIENT, otp=OTP, expires_at=EXPIRES)


@pytest.mark.asyncio
async def test_ses_requires_message_acceptance_confirmation():
    api = client()
    with Stubber(api) as stub:
        stub.add_response("send_email", {}, request())
        with pytest.raises(OtpDeliveryError):
            await SesOtpSender(settings(), client_factory=lambda: api).send_verification_code(
                recipient=RECIPIENT, otp=OTP, expires_at=EXPIRES
            )


def test_ses_factory_is_lazy_and_uses_bounded_sdk_delivery_without_explicit_keys(monkeypatch):
    session_factory = Mock()
    monkeypatch.setattr("app.registration.mailer.boto3.session.Session", session_factory)
    sender = create_otp_sender(settings())
    assert isinstance(sender, SesOtpSender)
    session_factory.assert_not_called()
    sender._new_client()
    args, kwargs = session_factory.return_value.client.call_args
    assert args == ("sesv2",)
    assert kwargs["region_name"] == "ap-southeast-1"
    assert kwargs["config"].connect_timeout == 3
    assert kwargs["config"].read_timeout == 8
    assert kwargs["config"].retries["total_max_attempts"] == 1
    assert "aws_access_key_id" not in kwargs
    assert "aws_secret_access_key" not in kwargs


def test_dependency_debug_logs_cannot_expose_email_request_bodies():
    configure_logging("DEBUG")
    for name in ("boto3", "botocore", "botocore.endpoint"):
        assert not logging.getLogger(name).isEnabledFor(logging.DEBUG)
