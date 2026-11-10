# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-03
# Scope: Implemented optional SES OTP delivery and bounded email-provider error handling.
# Author review: I validated correctness and added boundary checks where needed.

# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Implemented SMTP delivery for verification codes.
# Author review: I validated correctness and added boundary checks where needed.

"""Selectable SMTP/Mailpit or AWS SES delivery for email-verification codes."""

from __future__ import annotations

import asyncio
import smtplib
from collections.abc import Callable
from contextlib import closing
from datetime import datetime
from email.message import EmailMessage
from typing import Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import Settings
from app.core.logging import logger


class OtpDeliveryError(RuntimeError):
    """Raised when the verification code could not be sent after storage."""


class OtpSender(Protocol):
    """The minimal delivery boundary used by registration services and tests."""

    async def send_verification_code(
        self,
        *,
        recipient: str,
        otp: str,
        expires_at: datetime,
    ) -> None:
        """Deliver a one-time email-verification code."""


class SmtpOtpSender:
    """Send codes through Mailpit locally and SMTP infrastructure in production."""

    def __init__(self, settings: Settings) -> None:
        self._host = settings.smtp_host
        self._port = settings.smtp_port
        self._sender = settings.smtp_from

    async def send_verification_code(
        self,
        *,
        recipient: str,
        otp: str,
        expires_at: datetime,
    ) -> None:
        try:
            await asyncio.to_thread(
                self._send,
                recipient=recipient,
                otp=otp,
                expires_at=expires_at,
            )
        except (OSError, smtplib.SMTPException) as error:
            logger.warning(
                "registration OTP delivery failed",
                extra={
                    "event": "registration_otp_delivery_failed",
                    "context": {"errorType": type(error).__name__},
                },
            )
            raise OtpDeliveryError("OTP delivery failed.") from error

    def _send(self, *, recipient: str, otp: str, expires_at: datetime) -> None:
        message = EmailMessage()
        message["From"] = self._sender
        message["To"] = recipient
        message["Subject"] = "Verify your FoC email address"
        message.set_content(
            f"Your FoC verification code is {otp}. "
            f"It expires at {expires_at.isoformat()}. Do not share this code."
        )
        with smtplib.SMTP(self._host, self._port, timeout=10) as client:
            client.send_message(message)


class SesOtpSender:
    """Send through SES HTTPS with the standard AWS credential provider chain.

    Client/credential discovery is lazy and off the event loop. SMTP development
    never creates an AWS client. No application AWS access keys are configured.
    """

    def __init__(self, settings: Settings, client_factory: Callable | None = None) -> None:
        self._region = settings.ses_region
        self._sender = settings.ses_from_address
        self._client_factory = client_factory or self._new_client

    def _new_client(self):
        # Each short-lived client is confined to the delivery thread. Avoid
        # sharing the mutable boto3 default Session across concurrent threads.
        return boto3.session.Session().client(
            "sesv2",
            region_name=self._region,
            config=Config(
                connect_timeout=3,
                read_timeout=8,
                # SendEmail has no idempotency token. Let the existing explicit
                # resend flow handle uncertainty rather than retrying delivery.
                retries={"mode": "standard", "total_max_attempts": 1},
            ),
        )

    async def send_verification_code(
        self,
        *,
        recipient: str,
        otp: str,
        expires_at: datetime,
    ) -> None:
        try:
            await asyncio.to_thread(self._send, recipient=recipient, otp=otp, expires_at=expires_at)
        except (BotoCoreError, ClientError, OSError, OtpDeliveryError) as error:
            # Provider exceptions may contain recipient addresses or submitted
            # content. Record only the exception class, never its message/body.
            logger.warning(
                "registration OTP delivery failed",
                extra={
                    "event": "registration_otp_delivery_failed",
                    "context": {"provider": "ses", "errorType": type(error).__name__},
                },
            )
            raise OtpDeliveryError("OTP delivery failed.") from None

    def _send(self, *, recipient: str, otp: str, expires_at: datetime) -> None:
        with closing(self._client_factory()) as client:
            response = client.send_email(
                FromEmailAddress=self._sender,
                Destination={"ToAddresses": [recipient]},
                Content={
                    "Simple": {
                        "Subject": {"Data": "Verify your FoC email address", "Charset": "UTF-8"},
                        "Body": {
                            "Text": {
                                "Data": (
                                    f"Your FoC verification code is {otp}. "
                                    f"It expires at {expires_at.isoformat()}. "
                                    "Do not share this code."
                                ),
                                "Charset": "UTF-8",
                            }
                        },
                    }
                },
            )
        if not response.get("MessageId"):
            raise OtpDeliveryError("SES did not confirm message acceptance.")


def create_otp_sender(settings: Settings) -> OtpSender:
    """Select explicitly; an SES failure must never fall back to a test inbox."""
    if settings.otp_email_provider == "ses":
        return SesOtpSender(settings)
    return SmtpOtpSender(settings)
