# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
# Scope: Passed the selected role and search query to managed-user retrieval
# Author review: I reviewed correctness and edited the changes to fit the project
#
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: The registration and UserCreated outbox transaction boundary was later moved here
# Author review: I reviewed correctness and edited the changes to fit the project

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from uuid import UUID, uuid4

import bcrypt
import jwt
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from common.config_manager import settings
from auth.exceptions import (
    AuthenticationUnavailableError,
    InvalidCredentialsError,
    UserAlreadyExistsError,
    UserNotFoundError,
)
from auth.models import (
    AccessTokenClaims,
    CurrentUserResponse,
    ManagedUserRole,
    ManagedUserResponse,
    ParticipantResponse,
    SignInRequest,
    SignUpRequest,
    UpdateCurrentUserRequest,
    UpdateUserRoleRequest,
    UserRecord,
    UserRoleResponse,
)
from auth.repository import (
    authentication_session_exists,
    create_authentication_session,
    create_user,
    delete_authentication_session,
    find_managed_users,
    find_participant_profiles,
    find_user_by_email,
    find_user_profile_by_id,
    find_user_by_username,
    find_user_role_by_id,
    update_managed_user_role,
    update_user_profile,
)


def hash_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    encoded = password.encode("utf-8")
    if not 1 <= len(encoded) <= 72:
        raise ValueError("Password must contain between 1 and 72 UTF-8 bytes.")
    return bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    encoded = password.encode("utf-8")
    if not 1 <= len(encoded) <= 72:
        return False
    try:
        return bcrypt.checkpw(encoded, hashed_password.encode("utf-8"))
    except ValueError:
        return False


def get_access_token_secret() -> str:
    secret = settings.access_token_secret
    if secret is None or len(secret.get_secret_value().encode("utf-8")) < 32:
        raise AuthenticationUnavailableError("Authentication is temporarily unavailable.")
    return secret.get_secret_value()


def create_access_token(user: UserRecord) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user.id),
            "email": str(user.email),
            "tokenType": "access",
            "iat": now,
            "exp": now + timedelta(seconds=settings.access_token_duration_seconds),
            "jti": str(uuid4()),
        },
        get_access_token_secret(),
        algorithm="HS256",
    )


def verify_access_token(token: str) -> AccessTokenClaims:
    payload = jwt.decode(
        token,
        get_access_token_secret(),
        algorithms=["HS256"],
        options={"require": ["sub", "email", "tokenType", "iat", "exp"]},
    )
    try:
        return AccessTokenClaims.model_validate(payload)
    except ValidationError:
        raise jwt.InvalidTokenError("Invalid access token claims.") from None


async def authenticate_user(credentials: SignInRequest, session: AsyncSession) -> str:
    password = credentials.password.get_secret_value()
    if len(password.encode("utf-8")) > 72:
        raise InvalidCredentialsError()

    get_access_token_secret()
    async with _operation_transaction(session):
        user = await find_user_by_email(session, str(credentials.email))
        fallback_password_hash = hash_password(secrets.token_urlsafe(32))
        matches = verify_password(password, user.hashed_password if user else fallback_password_hash)

        if user is None or not matches:
            raise InvalidCredentialsError()

        token = create_access_token(user)
        claims = verify_access_token(token)
        await create_authentication_session(
            session,
            hash_access_token(token),
            user.id,
            datetime.fromtimestamp(claims.exp, timezone.utc),
        )
    return token


async def get_current_user_role(user_id: UUID, session: AsyncSession) -> UserRoleResponse:
    role = await find_user_role_by_id(session, user_id)
    if role is None:
        raise jwt.InvalidTokenError("The authenticated user no longer exists.")
    return role


async def get_authenticated_user_role(
    token: str,
    user_id: UUID,
    session: AsyncSession,
) -> UserRoleResponse:
    if not await authentication_session_exists(
        session,
        hash_access_token(token),
        user_id,
    ):
        raise jwt.InvalidTokenError("The authentication session is invalid or expired.")
    return await get_current_user_role(user_id, session)


async def invalidate_authentication_session(
    token: str,
    session: AsyncSession,
) -> None:
    async with _operation_transaction(session):
        await delete_authentication_session(session, hash_access_token(token))


async def get_current_user_profile(user_id: UUID, session: AsyncSession) -> CurrentUserResponse:
    profile = await find_user_profile_by_id(session, user_id)
    if profile is None:
        raise jwt.InvalidTokenError("The authenticated user no longer exists.")
    return profile


async def get_participant_profiles(
    user_ids: list[UUID],
    session: AsyncSession,
) -> list[ParticipantResponse]:
    return await find_participant_profiles(session, user_ids)


async def get_users_for_access_management(
    role: ManagedUserRole,
    query: str | None,
    session: AsyncSession,
) -> list[ManagedUserResponse]:
    return await find_managed_users(session, role, query)


async def update_user_role(
    user_id: UUID,
    request: UpdateUserRoleRequest,
    session: AsyncSession,
) -> ManagedUserResponse:
    async with _operation_transaction(session):
        user = await update_managed_user_role(session, user_id, request.role)
        if user is None:
            raise UserNotFoundError("User not found.")
    return user


async def update_current_user_profile(
    user_id: UUID,
    request: UpdateCurrentUserRequest, 
    session: AsyncSession
) -> CurrentUserResponse:
    try:
        async with _operation_transaction(session):
            if request.username is not None:
                existing_username = await find_user_by_username(session, request.username)
                if existing_username is not None and existing_username.id != str(user_id):
                    raise UserAlreadyExistsError("Username already exists")

            if request.email is not None:
                existing_email = await find_user_by_email(session, str(request.email))
                if existing_email is not None and existing_email.id != str(user_id):
                    raise UserAlreadyExistsError("Email already exists")

            profile = await update_user_profile(
                session=session,
                user_id=user_id,
                username=request.username,
                email=str(request.email) if request.email is not None else None,
            )
            if profile is None:
                raise jwt.InvalidTokenError("The authenticated user no longer exists.")
    except IntegrityError as exc:
        constraint = getattr(exc.orig.diag, "constraint_name", None)
        if constraint == "users_username_key" or constraint == "users_email_key":
            raise UserAlreadyExistsError("Username or Email already exists.") from None
        raise
    return profile


async def register_user(request: SignUpRequest, session: AsyncSession) -> UserRecord:
    try:
        async with _operation_transaction(session):
            existing_email = await find_user_by_email(session, str(request.email))
            if existing_email is not None:
                raise UserAlreadyExistsError("Email already exists")

            existing_username = await find_user_by_username(session, request.username)
            if existing_username is not None:
                raise UserAlreadyExistsError("Username already exists")

            hashed_password = hash_password(request.password.get_secret_value())
            user = await create_user(
                session=session, username=request.username,
                email=str(request.email), hashed_password=hashed_password,
            )
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint in {"users_username_key", "users_email_key", "users_user_email_key"}:
            raise UserAlreadyExistsError("Username or Email already exists.") from None
        raise
    return user


@asynccontextmanager
async def _operation_transaction(session: AsyncSession) -> AsyncIterator[None]:
    """Commit or roll back the write operation using SQLAlchemy's automatic transaction."""
    try:
        yield
        await session.commit()
    except BaseException:
        await session.rollback()
        raise
