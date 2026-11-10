# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Implemented authentication, refresh rotation, reuse detection, and session expiry.
# Author review: I validated correctness and added boundary checks where needed.

"""Credential checks, refresh-token rotation, and current-session validation."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import bcrypt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ApiError
from app.auth.jwt import AccessTokenClaims, JwtConfigurationError, JwtKeyStore, JwtValidationError
from app.core.config import Settings
from app.models import AccountStatus, Credential, User, UserSession
from app.registration.validation import normalize_email

_MAX_SESSION_LIFETIME_SECONDS = 86_400


@dataclass(frozen=True)
class IssuedSession:
    """Tokens returned internally so routes can place the refresh token in a cookie."""

    access_token: str
    refresh_token: str
    access_token_expires_at: datetime


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    """Current server-validated identity for a self-owned request."""

    user: User
    session_id: UUID
    access_token_expires_at: datetime


class AuthenticationService:
    """Authenticate active accounts without persisting any raw refresh token."""

    def __init__(self, settings: Settings, key_store: JwtKeyStore | None = None) -> None:
        self._settings = settings
        self._key_store = key_store or JwtKeyStore(settings)

    async def login(
        self,
        session: AsyncSession,
        *,
        email: str,
        password: str,
    ) -> IssuedSession:
        """Validate credentials and create one independently revocable session."""

        issued: IssuedSession | None = None
        error: ApiError | None = None
        now = datetime.now(UTC)
        try:
            async with session.begin():
                row = (
                    await session.execute(
                        select(User, Credential)
                        .join(Credential, Credential.user_id == User.id)
                        .where(User.normalized_email == normalize_email(email))
                    )
                ).one_or_none()
                if row is None:
                    error = self._invalid_credentials_error()
                else:
                    user, credential = row
                    if user.account_status != AccountStatus.ACTIVE or not self._password_matches(
                        password,
                        credential.password_hash,
                    ):
                        error = self._invalid_credentials_error()
                    else:
                        issued = await self._issue_session(session, user=user, now=now)
        except JwtConfigurationError as configuration_error:
            raise self._not_configured_error() from configuration_error
        if error is not None:
            raise error
        assert issued is not None
        return issued

    async def refresh(
        self,
        session: AsyncSession,
        *,
        refresh_token: str | None,
    ) -> IssuedSession:
        """Rotate a refresh token and revoke its full family on token reuse."""

        if not refresh_token:
            raise self._invalid_refresh_error()
        now = datetime.now(UTC)
        issued: IssuedSession | None = None
        error: ApiError | None = None
        try:
            refresh_hash = self._refresh_token_hash(refresh_token)
        except UnicodeEncodeError as encoding_error:
            raise self._invalid_refresh_error() from encoding_error
        try:
            async with session.begin():
                stored_session = (
                    await session.execute(
                        select(UserSession)
                        .where(UserSession.refresh_token_hash == refresh_hash)
                        .with_for_update()
                    )
                ).scalar_one_or_none()
                if stored_session is None:
                    error = self._invalid_refresh_error()
                elif stored_session.revoked_at is not None:
                    await session.execute(
                        update(UserSession)
                        .where(
                            UserSession.token_family == stored_session.token_family,
                            UserSession.revoked_at.is_(None),
                        )
                        .values(revoked_at=now)
                    )
                    error = ApiError(
                        401,
                        "REFRESH_TOKEN_REUSED",
                        "The refresh session is no longer valid.",
                    )
                elif stored_session.expires_at <= now or self._session_is_idle(
                    stored_session, now=now
                ):
                    stored_session.revoked_at = now
                    error = self._invalid_refresh_error()
                else:
                    user = (
                        await session.execute(
                            select(User).where(User.id == stored_session.user_id).with_for_update()
                        )
                    ).scalar_one_or_none()
                    if user is None or user.account_status != AccountStatus.ACTIVE:
                        stored_session.revoked_at = now
                        error = self._invalid_refresh_error()
                    else:
                        stored_session.revoked_at = now
                        issued = await self._issue_session(
                            session,
                            user=user,
                            now=now,
                            token_family=stored_session.token_family,
                        )
        except JwtConfigurationError as configuration_error:
            raise self._not_configured_error() from configuration_error
        if error is not None:
            raise error
        assert issued is not None
        return issued

    async def authenticate_access_token(
        self,
        session: AsyncSession,
        *,
        access_token: str,
    ) -> AuthenticatedPrincipal:
        """Verify JWT cryptography plus current server-side session state."""

        now = datetime.now(UTC)
        try:
            claims = self._key_store.validate_access_token(access_token, now=now)
        except JwtConfigurationError as configuration_error:
            raise self._not_configured_error() from configuration_error
        except JwtValidationError as validation_error:
            raise self._invalid_access_error() from validation_error

        principal: AuthenticatedPrincipal | None = None
        async with session.begin():
            principal = await self._principal_from_claims(session, claims=claims, now=now)
        assert principal is not None
        return principal

    async def logout(self, session: AsyncSession, *, session_id: UUID) -> None:
        """Revoke the session matched by the already validated bearer token."""

        now = datetime.now(UTC)
        async with session.begin():
            stored_session = (
                await session.execute(
                    select(UserSession).where(UserSession.id == session_id).with_for_update()
                )
            ).scalar_one_or_none()
            if stored_session is not None and stored_session.revoked_at is None:
                stored_session.revoked_at = now

    def public_jwk(self) -> dict[str, str]:
        """Publish the configured signing key without private material."""

        try:
            return self._key_store.public_jwk()
        except JwtConfigurationError as configuration_error:
            raise self._not_configured_error() from configuration_error

    async def _principal_from_claims(
        self,
        session: AsyncSession,
        *,
        claims: AccessTokenClaims,
        now: datetime,
    ) -> AuthenticatedPrincipal:
        row = (
            await session.execute(
                select(UserSession, User)
                .join(User, User.id == UserSession.user_id)
                .where(UserSession.id == claims.session_id)
            )
        ).one_or_none()
        if row is None:
            raise self._invalid_access_error()
        stored_session, user = row
        if (
            stored_session.user_id != claims.subject_id
            or stored_session.revoked_at is not None
            or stored_session.expires_at <= now
            or self._session_is_idle(stored_session, now=now)
            or user.account_status != AccountStatus.ACTIVE
            or user.role_version != claims.role_version
        ):
            raise self._invalid_access_error()
        stored_session.last_active_at = now
        return AuthenticatedPrincipal(
            user=user,
            session_id=stored_session.id,
            access_token_expires_at=claims.expires_at,
        )

    async def _issue_session(
        self,
        session: AsyncSession,
        *,
        user: User,
        now: datetime,
        token_family: UUID | None = None,
    ) -> IssuedSession:
        refresh_token = secrets.token_urlsafe(48)
        stored_session = UserSession(
            user_id=user.id,
            refresh_token_hash=self._refresh_token_hash(refresh_token),
            token_family=token_family or uuid4(),
            issued_at=now,
            last_active_at=now,
            expires_at=now + timedelta(seconds=self._refresh_session_ttl_seconds()),
        )
        session.add(stored_session)
        await session.flush()
        access_token, expires_at = self._key_store.issue_access_token(
            subject_id=user.id,
            session_id=stored_session.id,
            role_version=user.role_version,
            now=now,
        )
        return IssuedSession(
            access_token=access_token,
            refresh_token=refresh_token,
            access_token_expires_at=expires_at,
        )

    @staticmethod
    def _password_matches(password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
        except ValueError:
            return False

    @staticmethod
    def _refresh_token_hash(refresh_token: str) -> str:
        return hashlib.sha256(refresh_token.encode("ascii")).hexdigest()

    def _refresh_session_ttl_seconds(self) -> int:
        """Enforce the security requirement even if a legacy config is longer."""

        return min(self._settings.jwt_refresh_token_ttl_seconds, _MAX_SESSION_LIFETIME_SECONDS)

    def _session_is_idle(self, stored_session: UserSession, *, now: datetime) -> bool:
        return (
            stored_session.last_active_at
            + timedelta(seconds=self._settings.jwt_session_idle_timeout_seconds)
            <= now
        )

    @staticmethod
    def _invalid_credentials_error() -> ApiError:
        return ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.")

    @staticmethod
    def _invalid_refresh_error() -> ApiError:
        return ApiError(401, "INVALID_REFRESH_TOKEN", "The refresh session is not valid.")

    @staticmethod
    def _invalid_access_error() -> ApiError:
        return ApiError(401, "INVALID_ACCESS_TOKEN", "Authentication is required.")

    @staticmethod
    def _not_configured_error() -> ApiError:
        return ApiError(
            503,
            "AUTH_NOT_CONFIGURED",
            "Authentication is temporarily unavailable.",
        )
