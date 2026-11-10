# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20, 2026-09-21, 2026-09-22, 2026-09-24
# Scope: Implemented profile editing, deletion and tombstones, and password updates.
# Author review: I validated correctness and added boundary checks where needed.

"""Transactional mutations for the authenticated caller's own profile."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import bcrypt
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.lifecycle import acquire_lifecycle_lock, ensure_not_last_active_super_admin
from app.api.errors import ApiError
from app.api.schemas import ProfileUpdateRequest
from app.models import AccountStatus, Credential, SystemRole, User, UserSession

_DELETED_DISPLAY_NAME = "Deleted User"


class ProfileService:
    """Apply the Phase 3 allow-list without trusting request identity fields."""

    async def update_profile(
        self,
        session: AsyncSession,
        *,
        user_id: UUID,
        changes: ProfileUpdateRequest,
    ) -> User:
        """Persist the caller's validated display name."""

        async with session.begin():
            user = await self._locked_user(session, user_id=user_id)
            if changes.display_name is not None:
                user.display_name = changes.display_name
        return user

    async def delete_account(
        self,
        session: AsyncSession,
        *,
        user_id: UUID,
        current_password: str,
    ) -> None:
        """Anonymize the caller and remove their authentication material atomically.

        The stable User Service ID remains for de-identified history owned by
        other services. No request can revive this terminal account state.
        """

        now = datetime.now(UTC)
        async with session.begin():
            await acquire_lifecycle_lock(session)
            row = (
                await session.execute(
                    select(User, Credential)
                    .join(Credential, Credential.user_id == User.id)
                    .where(User.id == user_id)
                    .with_for_update()
                )
            ).one_or_none()
            if row is None:
                raise self._invalid_access_error()
            user, credential = row
            if not self._password_matches(current_password, credential.password_hash):
                raise ApiError(
                    403,
                    "INVALID_CURRENT_PASSWORD",
                    "The current password is not valid.",
                )
            if user.system_role == SystemRole.SUPER_ADMIN:
                await ensure_not_last_active_super_admin(session, user_id=user.id)
            await session.execute(delete(UserSession).where(UserSession.user_id == user_id))
            await session.delete(credential)
            user.username = None
            user.normalized_username = None
            user.email = None
            user.normalized_email = None
            user.email_verified_at = None
            user.display_name = _DELETED_DISPLAY_NAME
            user.role_version += 1
            user.account_status = AccountStatus.DELETED
            user.deleted_at = now

    async def change_password(
        self,
        session: AsyncSession,
        *,
        user_id: UUID,
        current_password: str,
        new_password: str,
        bcrypt_rounds: int,
    ) -> None:
        """Replace a caller's credential and revoke every existing session atomically."""

        now = datetime.now(UTC)
        async with session.begin():
            row = (
                await session.execute(
                    select(User, Credential)
                    .join(Credential, Credential.user_id == User.id)
                    .where(User.id == user_id)
                    .with_for_update()
                )
            ).one_or_none()
            if row is None:
                raise self._invalid_access_error()
            _, credential = row
            if not self._password_matches(current_password, credential.password_hash):
                raise ApiError(
                    403,
                    "INVALID_CURRENT_PASSWORD",
                    "The current password is not valid.",
                )
            if self._password_matches(new_password, credential.password_hash):
                raise ApiError(
                    409,
                    "PASSWORD_UNCHANGED",
                    "Choose a password that is different from the current password.",
                )
            credential.password_hash = self._hash_password(
                new_password,
                bcrypt_rounds=bcrypt_rounds,
            )
            credential.password_changed_at = now
            await session.execute(
                update(UserSession)
                .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )

    @staticmethod
    async def _locked_user(session: AsyncSession, *, user_id: UUID) -> User:
        user = (
            await session.execute(select(User).where(User.id == user_id).with_for_update())
        ).scalar_one_or_none()
        if user is None:
            raise ProfileService._invalid_access_error()
        return user

    @staticmethod
    def _password_matches(password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
        except ValueError:
            return False

    @staticmethod
    def _hash_password(password: str, *, bcrypt_rounds: int) -> str:
        return bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(rounds=bcrypt_rounds),
        ).decode("ascii")

    @staticmethod
    def _invalid_access_error() -> ApiError:
        return ApiError(401, "INVALID_ACCESS_TOKEN", "Authentication is required.")
