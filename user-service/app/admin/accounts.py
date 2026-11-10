# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-24
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
# Scope: Implemented account lookup and the active administrator list.
# Author review: I validated correctness and added boundary checks where needed.

"""Safe exact-identity lookup for authorised User Service administrators."""

from __future__ import annotations

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import ApiError
from app.models import AccountStatus, SystemRole, User
from app.registration.validation import normalize_email, normalize_username


class AdminAccountService:
    """Read administrative identities without touching credentials or session state."""

    async def list_admins(self, session: AsyncSession) -> list[User]:
        """List non-deleted administrators, ordered by role and normalized username."""

        statement = (
            select(User)
            .where(
                User.system_role.in_((SystemRole.SUPER_ADMIN, SystemRole.ADMIN)),
                User.account_status != AccountStatus.DELETED,
            )
            .order_by(
                case((User.system_role == SystemRole.SUPER_ADMIN, 0), else_=1),
                User.normalized_username.asc(),
            )
        )
        async with session.begin():
            return list((await session.scalars(statement)).all())

    async def find_by_identity(
        self,
        session: AsyncSession,
        *,
        username: str | None,
        email: str | None,
    ) -> User:
        """Find the exact account identified by the validated username or email."""

        if username is not None:
            criterion = User.normalized_username == normalize_username(username)
        elif email is not None:
            criterion = User.normalized_email == normalize_email(email)
        else:
            raise ValueError("A validated identity criterion is required.")

        async with session.begin():
            user = (await session.execute(select(User).where(criterion))).scalar_one_or_none()
        if user is None:
            raise ApiError(404, "USER_NOT_FOUND", "No user account matches that identifier.")
        return user
