# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
# Scope: Implemented role-filtered user listing and partial username/email search
# Author review: I reviewed correctness and edited the changes to fit the project
#
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Recorded the UserCreated outbox entry alongside the new user
# Author review: I reviewed correctness and edited the changes to fit the project

from uuid import UUID

import datetime

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from auth.orm_models import AuthenticationSession, User, UserCreatedOutbox
from auth.models import (
    CurrentUserResponse,
    ManagedUserRole,
    ManagedUserResponse,
    MessageType,
    ParticipantResponse,
    UserRecord,
    UserRole,
    UserRoleResponse,
)


async def create_authentication_session(
    session: AsyncSession,
    access_token_hash: str,
    user_id: UUID,
    expires_at: datetime.datetime,
) -> None:
    session.add(
        AuthenticationSession(
            access_token_hash=access_token_hash,
            user_id=user_id,
            expires_at=expires_at,
        )
    )


async def authentication_session_exists(
    session: AsyncSession,
    access_token_hash: str,
    user_id: UUID,
) -> bool:
    stored_hash = await session.scalar(
        select(AuthenticationSession.access_token_hash).where(
            AuthenticationSession.access_token_hash == access_token_hash,
            AuthenticationSession.user_id == user_id,
            AuthenticationSession.expires_at > func.current_timestamp(),
        )
    )
    return stored_hash is not None


async def delete_authentication_session(
    session: AsyncSession,
    access_token_hash: str,
) -> None:
    await session.execute(
        delete(AuthenticationSession).where(
            AuthenticationSession.access_token_hash == access_token_hash
        )
    )

async def create_user(session: AsyncSession,
                      username: str,email: str, hashed_password: str,) -> UserRecord:

    user = User(username=username, user_email=email, password_hash=hashed_password,)

    session.add(user)

    await session.flush()
    await session.refresh(user)
    session.add(UserCreatedOutbox(
        user_id=user.user_id,
        event=MessageType.USER_CREATED,
        created_at=user.created_at,
        published_at=None,
    ))

    return UserRecord(id=str(user.user_id), username=user.username,
        email=user.user_email, hashed_password=user.password_hash, user_role=user.user_role,)


async def enqueue_user_created_events(session: AsyncSession) -> None:
    """Queue existing users for replay; Credit ignores wallets already initialized."""
    users = await session.stream(
        select(User.user_id, User.created_at).order_by(User.user_id)
    )
    try:
        async for batch in users.partitions(1_000):
            pending = [
                {
                    "user_id": user.user_id,
                    "event": MessageType.USER_CREATED,
                    "created_at": user.created_at,
                    "published_at": None,
                }
                for user in batch
            ]
            await session.execute(
                insert(UserCreatedOutbox).values(pending).on_conflict_do_update(
                    index_elements=[UserCreatedOutbox.user_id],
                    set_={"published_at": None},
                )
            )
    finally:
        await users.close()


async def find_user_by_email(session: AsyncSession, email: str,) -> UserRecord | None:

    result = await session.execute(
        select(User).where(User.user_email == email)
    )

    user = result.scalar_one_or_none()

    if user is None:
        return None

    return UserRecord(id=str(user.user_id), username=user.username,
        email=user.user_email, hashed_password=user.password_hash, user_role=user.user_role,)

async def find_user_by_username(session: AsyncSession, username: str,) -> UserRecord | None:

    result = await session.execute(
        select(User).where(User.username == username)
    )

    user = result.scalar_one_or_none()

    if user is None:
        return None

    return UserRecord(id=str(user.user_id), username=user.username,
        email=user.user_email, hashed_password=user.password_hash, user_role=user.user_role,)

async def find_user_role_by_id(session: AsyncSession, user_id: UUID,) -> UserRoleResponse | None:

    result = await session.execute(
        select(User.user_id, User.user_role).where(User.user_id == user_id)
    )

    user = result.one_or_none()

    if user is None:
        return None

    return UserRoleResponse(user_id=user.user_id, role=user.user_role)


async def find_participant_profiles(
    session: AsyncSession,
    user_ids: list[UUID],
) -> list[ParticipantResponse]:
    # Select only public identity fields; include participants of every role.
    result = await session.execute(
        select(User.user_id, User.username, User.user_email).where(
            User.user_id.in_(set(user_ids))
        ).order_by(User.user_id)
    )
    return [
        ParticipantResponse(user_id=user.user_id, username=user.username, email=user.user_email)
        for user in result.all()
    ]


async def find_managed_users(
    session: AsyncSession,
    role: ManagedUserRole,
    query: str | None,
) -> list[ManagedUserResponse]:
    statement = select(User).where(User.user_role == role)

    if query is not None:
        identifier = query.strip()
        statement = statement.where(
            or_(
                User.username.icontains(identifier, autoescape=True),
                User.user_email.icontains(identifier, autoescape=True),
            )
        )

    result = await session.scalars(statement.order_by(User.username))
    return [
        ManagedUserResponse(
            user_id=user.user_id,
            username=user.username,
            email=user.user_email,
            role=user.user_role,
        )
        for user in result.all()
    ]


async def update_managed_user_role(
    session: AsyncSession,
    user_id: UUID,
    role: UserRole,
) -> ManagedUserResponse | None:
    result = await session.execute(
        select(User).where(
            User.user_id == user_id,
            User.user_role != UserRole.ADMIN_MANAGER,
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        return None

    user.user_role = role
    user.updated_at = datetime.datetime.now(datetime.timezone.utc)
    await session.flush()
    await session.refresh(user)

    return ManagedUserResponse(
        user_id=user.user_id,
        username=user.username,
        email=user.user_email,
        role=user.user_role,
    )

async def find_user_profile_by_id(session: AsyncSession, user_id: UUID,) -> CurrentUserResponse | None:

    result = await session.execute(
        select(User.username, User.user_email).where(User.user_id == user_id)
    )

    user = result.one_or_none()

    if user is None:
        return None

    return CurrentUserResponse(username=user.username, email=user.user_email)

async def update_user_profile(session: AsyncSession, user_id: UUID, 
                              username: str | None, email: str | None,) -> CurrentUserResponse | None:

    result = await session.execute(
        select(User).where(User.user_id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None:
        return None

    if username is not None:
        user.username = username
    if email is not None:
        user.user_email = email

    user.updated_at = datetime.datetime.now(datetime.timezone.utc)

    await session.flush()
    await session.refresh(user)

    return CurrentUserResponse(username=user.username, email=user.user_email)


async def find_pending_user_event(session: AsyncSession) -> UserCreatedOutbox | None:
    statement = (
        select(UserCreatedOutbox)
        .where(UserCreatedOutbox.published_at.is_(None))
        .order_by(UserCreatedOutbox.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    return await session.scalar(statement)
