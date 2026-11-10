# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21, 2026-09-22
# Scope: Implemented verified registration and updated account creation and event persistence.
# Author review: I validated correctness and added boundary checks where needed.

"""Verified-account creation with bounded pending registrations."""

from __future__ import annotations

import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ApiError, FieldError
from app.api.schemas import EmailResendRequest, EmailVerificationRequest, RegistrationRequest
from app.core.config import Settings
from app.models import (
    AccountStatus,
    Credential,
    OutboxEvent,
    RegistrationChallenge,
    SystemRole,
    User,
)
from app.registration.mailer import OtpDeliveryError, OtpSender
from app.registration.validation import normalize_email, normalize_username


@dataclass(frozen=True)
class VerificationPending:
    """Safe information returned after an OTP has been committed for delivery."""

    email: str
    expires_at: datetime


class RegistrationService:
    """Persist pending registrations and atomically activate verified users."""

    def __init__(self, settings: Settings, otp_sender: OtpSender) -> None:
        self._settings = settings
        self._otp_sender = otp_sender

    async def initiate(
        self,
        session: AsyncSession,
        request: RegistrationRequest,
    ) -> VerificationPending:
        """Create or renew one bounded pending registration, then send its OTP."""

        now = datetime.now(UTC)
        otp = self._new_otp()
        password_hash = self._hash_password(request.password)
        expires_at = now + timedelta(seconds=self._settings.otp_ttl_seconds)
        next_resend_at = now + timedelta(seconds=self._settings.otp_resend_cooldown_seconds)
        normalized_email = normalize_email(request.email)
        normalized_username = normalize_username(request.username)

        try:
            async with session.begin():
                await self._reject_existing_user(session, normalized_email, normalized_username)
                challenges = (
                    (
                        await session.execute(
                            select(RegistrationChallenge)
                            .where(
                                or_(
                                    RegistrationChallenge.normalized_email == normalized_email,
                                    RegistrationChallenge.normalized_username
                                    == normalized_username,
                                )
                            )
                            .with_for_update()
                        )
                    )
                    .scalars()
                    .all()
                )
                challenge_by_email = next(
                    (
                        challenge
                        for challenge in challenges
                        if challenge.normalized_email == normalized_email
                    ),
                    None,
                )
                username_conflict = next(
                    (
                        challenge
                        for challenge in challenges
                        if challenge.normalized_username == normalized_username
                        and challenge.normalized_email != normalized_email
                    ),
                    None,
                )
                if username_conflict is not None:
                    raise ApiError(
                        409,
                        "USERNAME_PENDING_VERIFICATION",
                        "That username is awaiting email verification.",
                        [
                            FieldError(
                                "username",
                                "USERNAME_PENDING_VERIFICATION",
                                "Choose another username.",
                            )
                        ],
                    )

                if challenge_by_email is None:
                    challenge = RegistrationChallenge(
                        username=request.username,
                        normalized_username=normalized_username,
                        email=request.email,
                        normalized_email=normalized_email,
                        display_name=request.display_name,
                        password_hash=password_hash,
                        otp_digest=self._otp_digest(otp),
                        otp_expires_at=expires_at,
                        next_resend_at=next_resend_at,
                    )
                    session.add(challenge)
                else:
                    if challenge_by_email.otp_expires_at > now:
                        if challenge_by_email.resend_count >= self._settings.otp_max_resends:
                            raise self._resend_limit_error()
                        if now < challenge_by_email.next_resend_at:
                            raise self._resend_cooldown_error()
                        resend_count = challenge_by_email.resend_count + 1
                    else:
                        resend_count = 0
                    challenge_by_email.username = request.username
                    challenge_by_email.normalized_username = normalized_username
                    challenge_by_email.email = request.email
                    challenge_by_email.display_name = request.display_name
                    challenge_by_email.password_hash = password_hash
                    challenge_by_email.otp_digest = self._otp_digest(otp)
                    challenge_by_email.otp_expires_at = expires_at
                    challenge_by_email.verification_attempts = 0
                    challenge_by_email.resend_count = resend_count
                    challenge_by_email.next_resend_at = next_resend_at
        except IntegrityError as error:
            raise self._duplicate_conflict() from error

        await self._send_otp(request.email, otp, expires_at)
        return VerificationPending(email=request.email, expires_at=expires_at)

    async def resend(
        self,
        session: AsyncSession,
        request: EmailResendRequest,
    ) -> VerificationPending:
        """Issue a replacement OTP for one unexpired pending registration."""

        now = datetime.now(UTC)
        otp = self._new_otp()
        expires_at = now + timedelta(seconds=self._settings.otp_ttl_seconds)
        normalized_email = normalize_email(request.email)
        next_resend_at = now + timedelta(seconds=self._settings.otp_resend_cooldown_seconds)
        error: ApiError | None = None
        recipient: str | None = None

        async with session.begin():
            challenge = (
                await session.execute(
                    select(RegistrationChallenge)
                    .where(RegistrationChallenge.normalized_email == normalized_email)
                    .with_for_update()
                )
            ).scalar_one_or_none()
            if challenge is None:
                error = self._verification_not_pending_error()
            elif challenge.otp_expires_at <= now:
                await session.delete(challenge)
                error = ApiError(
                    400,
                    "OTP_EXPIRED",
                    "The verification code has expired. Register again to request a new code.",
                    [FieldError("email", "OTP_EXPIRED", "Register again to receive a new code.")],
                )
            elif challenge.resend_count >= self._settings.otp_max_resends:
                error = self._resend_limit_error()
            elif now < challenge.next_resend_at:
                error = self._resend_cooldown_error()
            else:
                challenge.otp_digest = self._otp_digest(otp)
                challenge.otp_expires_at = expires_at
                challenge.verification_attempts = 0
                challenge.resend_count += 1
                challenge.next_resend_at = next_resend_at
                recipient = challenge.email

        if error is not None:
            raise error
        assert recipient is not None
        await self._send_otp(recipient, otp, expires_at)
        return VerificationPending(email=recipient, expires_at=expires_at)

    async def verify(
        self,
        session: AsyncSession,
        request: EmailVerificationRequest,
    ) -> User:
        """Atomically turn one verified challenge into an active default User."""

        now = datetime.now(UTC)
        normalized_email = normalize_email(request.email)
        error: ApiError | None = None
        activated_user: User | None = None

        try:
            async with session.begin():
                challenge = (
                    await session.execute(
                        select(RegistrationChallenge)
                        .where(RegistrationChallenge.normalized_email == normalized_email)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if challenge is None:
                    error = self._verification_not_pending_error()
                elif challenge.otp_expires_at <= now:
                    await session.delete(challenge)
                    error = ApiError(
                        400,
                        "OTP_EXPIRED",
                        "The verification code has expired. Register again to request a new code.",
                        [FieldError("otp", "OTP_EXPIRED", "Register again to receive a new code.")],
                    )
                elif not hmac.compare_digest(challenge.otp_digest, self._otp_digest(request.otp)):
                    challenge.verification_attempts += 1
                    if challenge.verification_attempts >= self._settings.otp_max_attempts:
                        await session.delete(challenge)
                        error = ApiError(
                            429,
                            "OTP_ATTEMPTS_EXCEEDED",
                            (
                                "Too many invalid verification attempts. "
                                "Register again to request a new code."
                            ),
                            [
                                FieldError(
                                    "otp",
                                    "OTP_ATTEMPTS_EXCEEDED",
                                    "Register again to receive a new code.",
                                )
                            ],
                        )
                    else:
                        error = ApiError(
                            400,
                            "INVALID_OTP",
                            "The verification code is invalid.",
                            [
                                FieldError(
                                    "otp", "INVALID_OTP", "Enter the code sent to your email."
                                )
                            ],
                        )
                else:
                    activated_user = User(
                        username=challenge.username,
                        normalized_username=challenge.normalized_username,
                        email=challenge.email,
                        normalized_email=challenge.normalized_email,
                        display_name=challenge.display_name,
                        system_role=SystemRole.USER,
                        account_status=AccountStatus.ACTIVE,
                        email_verified_at=now,
                        role_version=1,
                    )
                    session.add(activated_user)
                    await session.flush()
                    session.add(
                        Credential(
                            user_id=activated_user.id,
                            password_hash=challenge.password_hash,
                            password_changed_at=now,
                        )
                    )
                    session.add(
                        OutboxEvent(
                            event_type="user.registered.v1",
                            aggregate_id=activated_user.id,
                            occurred_at=now,
                        )
                    )
                    await session.delete(challenge)
        except IntegrityError as integrity_error:
            raise self._duplicate_conflict() from integrity_error

        if error is not None:
            raise error
        assert activated_user is not None
        return activated_user

    async def _reject_existing_user(
        self,
        session: AsyncSession,
        normalized_email: str,
        normalized_username: str,
    ) -> None:
        existing_users = (
            (
                await session.execute(
                    select(User).where(
                        or_(
                            User.normalized_email == normalized_email,
                            User.normalized_username == normalized_username,
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
        for user in existing_users:
            if user.normalized_email == normalized_email:
                raise ApiError(
                    409,
                    "EMAIL_ALREADY_REGISTERED",
                    "An account already uses that email address.",
                    [FieldError("email", "EMAIL_ALREADY_REGISTERED", "Use another email address.")],
                )
            if user.normalized_username == normalized_username:
                raise ApiError(
                    409,
                    "USERNAME_ALREADY_REGISTERED",
                    "An account already uses that username.",
                    [
                        FieldError(
                            "username", "USERNAME_ALREADY_REGISTERED", "Choose another username."
                        )
                    ],
                )

    def _new_otp(self) -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    def _otp_digest(self, otp: str) -> str:
        secret = self._settings.otp_hmac_secret
        if secret is None:
            raise ApiError(
                503,
                "REGISTRATION_NOT_CONFIGURED",
                "Registration is temporarily unavailable.",
            )
        return hmac.new(
            secret.get_secret_value().encode("utf-8"),
            otp.encode("ascii"),
            "sha256",
        ).hexdigest()

    def _hash_password(self, password: str) -> str:
        return bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(rounds=self._settings.bcrypt_rounds),
        ).decode("ascii")

    async def _send_otp(self, email: str, otp: str, expires_at: datetime) -> None:
        try:
            await self._otp_sender.send_verification_code(
                recipient=email,
                otp=otp,
                expires_at=expires_at,
            )
        except OtpDeliveryError as error:
            raise ApiError(
                503,
                "OTP_DELIVERY_FAILED",
                "We could not deliver a verification code. Try again shortly.",
            ) from error

    @staticmethod
    def _duplicate_conflict() -> ApiError:
        return ApiError(
            409,
            "REGISTRATION_CONFLICT",
            "The registration details are already in use.",
        )

    @staticmethod
    def _verification_not_pending_error() -> ApiError:
        return ApiError(
            400,
            "VERIFICATION_NOT_PENDING",
            "No pending verification is available for that email address.",
        )

    @staticmethod
    def _resend_limit_error() -> ApiError:
        return ApiError(
            429,
            "OTP_RESEND_LIMIT_REACHED",
            "Too many verification codes have been requested. Register again later.",
        )

    @staticmethod
    def _resend_cooldown_error() -> ApiError:
        return ApiError(
            429,
            "OTP_RESEND_TOO_SOON",
            "Wait before requesting another verification code.",
        )
