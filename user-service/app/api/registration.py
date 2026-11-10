# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Implemented registration, resend, and verification handlers.
# Author review: I validated correctness and added boundary checks where needed.

"""Public registration and email-verification routes."""

# ruff: noqa: B008

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    AccountActivatedResponse,
    EmailResendRequest,
    EmailVerificationRequest,
    RegistrationRequest,
    VerificationPendingResponse,
)
from app.db import get_db_session
from app.registration.service import RegistrationService

router = APIRouter(prefix="/v1/auth", tags=["registration"])


def get_registration_service(request: Request) -> RegistrationService:
    """Retrieve the configured service without exposing its secret configuration."""

    return request.app.state.registration_service


@router.post(
    "/registrations",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=VerificationPendingResponse,
)
async def create_registration(
    body: RegistrationRequest,
    session: AsyncSession = Depends(get_db_session),
    registration_service: RegistrationService = Depends(get_registration_service),
) -> VerificationPendingResponse:
    """Store an unverified registration and send a six-digit OTP."""

    pending = await registration_service.initiate(session, body)
    return VerificationPendingResponse(email=pending.email, expires_at=pending.expires_at)


@router.post(
    "/email-verifications",
    status_code=status.HTTP_201_CREATED,
    response_model=AccountActivatedResponse,
)
async def verify_email(
    body: EmailVerificationRequest,
    session: AsyncSession = Depends(get_db_session),
    registration_service: RegistrationService = Depends(get_registration_service),
) -> AccountActivatedResponse:
    """Verify a pending OTP and atomically activate the default User account."""

    user = await registration_service.verify(session, body)
    return AccountActivatedResponse(
        user_id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        email_verified_at=user.email_verified_at,
    )


@router.post(
    "/email-verifications/resend",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=VerificationPendingResponse,
)
async def resend_email_verification(
    body: EmailResendRequest,
    session: AsyncSession = Depends(get_db_session),
    registration_service: RegistrationService = Depends(get_registration_service),
) -> VerificationPendingResponse:
    """Replace an unexpired OTP subject to bounded resend rules."""

    pending = await registration_service.resend(session, body)
    return VerificationPendingResponse(email=pending.email, expires_at=pending.expires_at)
