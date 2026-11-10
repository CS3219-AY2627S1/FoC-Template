# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21, 2026-09-30
# Scope: Implemented administrator bootstrap and role changes, audit records, and bootstrap
# event creation.
# Author review: I validated correctness and added boundary checks where needed.

"""Transactional Super Admin bootstrap and role-lifecycle rules."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import bcrypt
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ApiError
from app.core.config import Settings
from app.models import (
    AccountStatus,
    AdminAuditEntry,
    Credential,
    OutboxEvent,
    RegistrationChallenge,
    SystemRole,
    User,
    UserSession,
)
from app.outbox.events import USER_REGISTERED_EVENT_TYPE
from app.registration.validation import (
    normalize_email,
    normalize_username,
    validate_email,
    validate_password,
    validate_profile_name,
    validate_username,
)

_LIFECYCLE_LOCK_KEY = 2_026_092_105
_BOOTSTRAP_ACTION = "SUPER_ADMIN_BOOTSTRAPPED"
_ROLE_CHANGE_ACTION = "SYSTEM_ROLE_CHANGED"
_SUCCESS_OUTCOME = "SUCCESS"


class BootstrapConfigurationError(RuntimeError):
    """Raised when the one-shot command has no complete local-only credentials."""


class BootstrapAlreadyCompletedError(RuntimeError):
    """Raised when the one-shot command would create a second initial authority."""


class BootstrapCredentialConflictError(RuntimeError):
    """Raised when bootstrap identity values are already reserved by User Service."""


class BootstrapCredentials:
    """Validated command-only credentials; password stays only in process memory."""

    def __init__(self, *, username: str, email: str, password: str, display_name: str) -> None:
        self.username = username
        self.email = email
        self.password = password
        self.display_name = display_name

    @classmethod
    def from_settings(cls, settings: Settings) -> BootstrapCredentials:
        username = settings.bootstrap_super_admin_username
        email = settings.bootstrap_super_admin_email
        password_secret = settings.bootstrap_super_admin_password
        display_name = settings.bootstrap_super_admin_display_name
        if username is None or email is None or password_secret is None:
            raise BootstrapConfigurationError(
                "Set all BOOTSTRAP_SUPER_ADMIN_USERNAME, BOOTSTRAP_SUPER_ADMIN_EMAIL, and "
                "BOOTSTRAP_SUPER_ADMIN_PASSWORD values in a local secret file."
            )
        try:
            validated_username = validate_username(username)
            validated_email = validate_email(email)
            validated_password = validate_password(password_secret.get_secret_value())
            validated_display_name = validate_profile_name(display_name or validated_username)
        except ValueError as error:
            raise BootstrapConfigurationError(
                "Bootstrap credentials do not meet User Service validation rules."
            ) from error
        return cls(
            username=validated_username,
            email=validated_email,
            password=validated_password,
            display_name=validated_display_name,
        )


async def acquire_lifecycle_lock(session: AsyncSession) -> None:
    """Serialize changes that could leave the service without an active Super Admin."""

    await session.execute(
        text("SELECT pg_advisory_xact_lock(CAST(:lock_key AS bigint))"),
        {"lock_key": _LIFECYCLE_LOCK_KEY},
    )


async def active_super_admins_locked(session: AsyncSession) -> list[User]:
    """Return and lock every active Super Admin while the lifecycle lock is held."""

    return list(
        (
            await session.scalars(
                select(User)
                .where(
                    User.system_role == SystemRole.SUPER_ADMIN,
                    User.account_status == AccountStatus.ACTIVE,
                )
                .with_for_update()
            )
        ).all()
    )


async def ensure_not_last_active_super_admin(session: AsyncSession, *, user_id: UUID) -> None:
    """Reject a state transition that would remove the sole active Super Admin."""

    super_admins = await active_super_admins_locked(session)
    if len(super_admins) == 1 and super_admins[0].id == user_id:
        raise ApiError(
            409,
            "LAST_SUPER_ADMIN_REQUIRED",
            "At least one active Super Admin must remain.",
        )


class AdminLifecycleService:
    """Apply Super Admin role transitions with revocation and immutable evidence."""

    async def change_system_role(
        self,
        session: AsyncSession,
        *,
        actor_id: UUID,
        target_user_id: UUID,
        requested_role: SystemRole,
        correlation_id: str,
    ) -> User:
        """Change another active user's system role in one committed transaction."""

        now = datetime.now(UTC)
        async with session.begin():
            await acquire_lifecycle_lock(session)
            actor = await self._locked_user(session, actor_id)
            if (
                actor.account_status != AccountStatus.ACTIVE
                or actor.system_role != SystemRole.SUPER_ADMIN
            ):
                raise ApiError(403, "INSUFFICIENT_ROLE", "Super Admin access is required.")
            if actor_id == target_user_id:
                raise ApiError(
                    400,
                    "SELF_ROLE_CHANGE_FORBIDDEN",
                    "A user cannot change their own system role.",
                )

            target = await self._locked_user(session, target_user_id)
            if target.account_status != AccountStatus.ACTIVE:
                raise ApiError(
                    409,
                    "TARGET_ACCOUNT_INACTIVE",
                    "Only an active account can receive a system role.",
                )
            if target.system_role == requested_role:
                raise ApiError(
                    409,
                    "SYSTEM_ROLE_UNCHANGED",
                    "The requested system role is already assigned.",
                )
            if target.system_role == SystemRole.SUPER_ADMIN:
                await ensure_not_last_active_super_admin(session, user_id=target.id)

            role_before = target.system_role
            target.system_role = requested_role
            target.role_version += 1
            await session.execute(
                update(UserSession)
                .where(
                    UserSession.user_id == target.id,
                    UserSession.revoked_at.is_(None),
                )
                .values(revoked_at=now)
            )
            session.add(
                AdminAuditEntry(
                    actor_id=actor.id,
                    target_user_id=target.id,
                    action=_ROLE_CHANGE_ACTION,
                    outcome=_SUCCESS_OUTCOME,
                    role_before=role_before,
                    role_after=requested_role,
                    correlation_id=correlation_id,
                )
            )
        return target

    @staticmethod
    async def _locked_user(session: AsyncSession, user_id: UUID) -> User:
        user = (
            await session.execute(select(User).where(User.id == user_id).with_for_update())
        ).scalar_one_or_none()
        if user is None:
            raise ApiError(404, "USER_NOT_FOUND", "The requested user does not exist.")
        return user


class BootstrapSuperAdminService:
    """Create the first verified Super Admin exactly once, outside public routes."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def bootstrap(
        self,
        session: AsyncSession,
        *,
        credentials: BootstrapCredentials,
        correlation_id: str,
    ) -> User:
        """Create an audited authority only while no active Super Admin exists."""

        now = datetime.now(UTC)
        user: User | None = None
        try:
            async with session.begin():
                await acquire_lifecycle_lock(session)
                if await active_super_admins_locked(session):
                    raise BootstrapAlreadyCompletedError(
                        "Bootstrap refused because an active Super Admin already exists."
                    )
                await self._reject_reserved_identity(session, credentials)
                user = User(
                    username=credentials.username,
                    normalized_username=normalize_username(credentials.username),
                    email=credentials.email,
                    normalized_email=normalize_email(credentials.email),
                    display_name=credentials.display_name,
                    system_role=SystemRole.SUPER_ADMIN,
                    account_status=AccountStatus.ACTIVE,
                    email_verified_at=now,
                    role_version=1,
                )
                session.add(user)
                await session.flush()
                session.add(
                    Credential(
                        user_id=user.id,
                        password_hash=self._hash_password(credentials.password),
                        password_changed_at=now,
                    )
                )
                session.add(
                    OutboxEvent(
                        event_type=USER_REGISTERED_EVENT_TYPE,
                        aggregate_id=user.id,
                        occurred_at=now,
                    )
                )
                session.add(
                    AdminAuditEntry(
                        actor_id=user.id,
                        target_user_id=user.id,
                        action=_BOOTSTRAP_ACTION,
                        outcome=_SUCCESS_OUTCOME,
                        role_before=None,
                        role_after=SystemRole.SUPER_ADMIN,
                        correlation_id=correlation_id,
                    )
                )
        except IntegrityError as error:
            raise BootstrapCredentialConflictError(
                "Bootstrap credentials conflict with an existing identity."
            ) from error
        assert user is not None
        return user

    async def _reject_reserved_identity(
        self,
        session: AsyncSession,
        credentials: BootstrapCredentials,
    ) -> None:
        normalized_email = normalize_email(credentials.email)
        normalized_username = normalize_username(credentials.username)
        existing_user = (
            await session.execute(
                select(User.id).where(
                    (User.normalized_email == normalized_email)
                    | (User.normalized_username == normalized_username)
                )
            )
        ).scalar_one_or_none()
        existing_challenge = (
            await session.execute(
                select(RegistrationChallenge.id).where(
                    (RegistrationChallenge.normalized_email == normalized_email)
                    | (RegistrationChallenge.normalized_username == normalized_username)
                )
            )
        ).scalar_one_or_none()
        if existing_user is not None or existing_challenge is not None:
            raise BootstrapCredentialConflictError(
                "Bootstrap credentials conflict with an existing or pending identity."
            )

    def _hash_password(self, password: str) -> str:
        return bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(rounds=self._settings.bcrypt_rounds),
        ).decode("ascii")
