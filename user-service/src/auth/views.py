# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
# Scope: Added role and query parameters to the managed-user listing endpoint
# Author review: I reviewed correctness and edited the changes to fit the project
#
# Tool: ChatGPT (model: GPT-6.1 Sol Max), date: 2026-10-07
# Scope: Integrated signup with publication of the committed registration event
# Author review: I reviewed correctness and edited the changes to fit the project
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, Security
from fastapi.security import HTTPAuthorizationCredentials
from jwt import InvalidTokenError

from typing import Annotated
from uuid import UUID

from fastapi.security import HTTPAuthorizationCredentials
from jwt import InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import (
    AdminManagerUser,
    AdminUser,
    AuthenticatedUser,
    bearer_scheme,
)
from auth.exceptions import (
    AuthenticationUnavailableError,
    InvalidCredentialsError,
    UserAlreadyExistsError,
    UserNotFoundError,
)
from auth.models import (
    AuthenticationResponse,
    CurrentUserResponse,
    ManagedUserResponse,
    ManagedUserRole,
    ParticipantLookupRequest,
    ParticipantResponse,
    SignInRequest,
    SignUpRequest,
    UpdateCurrentUserRequest,
    UpdateUserRoleRequest,
    UserRole,
    UserRoleResponse,
)
from auth.responses import clear_access_token_cookie, unauthorized_response
from auth.service import (
    authenticate_user,
    get_current_user_profile,
    get_participant_profiles,
    get_users_for_access_management,
    invalidate_authentication_session,
    register_user,
    update_current_user_profile,
    update_user_role,
)
from common.config_manager import settings
from common.db import get_session

router = APIRouter(prefix="/authentication", tags=["Authentication"])
logger = logging.getLogger(__name__)


@router.post("/users", status_code=201)
async def sign_up(credentials: SignUpRequest,
                  session: Annotated[AsyncSession, Depends(get_session)],):
    try:
        await register_user(credentials, session)
    except UserAlreadyExistsError as e:
        raise HTTPException(status_code=409, detail=str(e)) from None

    logger.info("user.registered")
    return {"message": "Account created successfully. Please sign in to continue."}


@router.post("/sessions")
async def sign_in(
    credentials: SignInRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AuthenticationResponse:
    try:
        token = await authenticate_user(credentials, session)
    except InvalidCredentialsError:
        logger.warning("authentication.sign_in_rejected")
        raise HTTPException(status_code=401, detail="Invalid email or password.") from None
    except AuthenticationUnavailableError:
        logger.warning("authentication.unavailable")
        raise HTTPException(status_code=503, detail="Authentication is temporarily unavailable.") from None

    logger.info("authentication.signed_in")
    response.set_cookie(
        "access_token",
        token,
        max_age=settings.access_token_duration_seconds,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
    return AuthenticationResponse(message="Successfully signed in.")


@router.get("/sessions/current")
async def verify(user: AuthenticatedUser) -> UserRoleResponse:
    return user


@router.get("/users/current", response_model=CurrentUserResponse)
async def get_current_user(
    user: AuthenticatedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CurrentUserResponse | Response:
    try:
        return await get_current_user_profile(user.user_id, session)
    except InvalidTokenError:
        return unauthorized_response()


@router.post("/users/lookup")
async def lookup_participants(
    request: ParticipantLookupRequest,
    _admin: AdminUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ParticipantResponse]:
    """Resolve known participant IDs; missing users are omitted from the result."""
    return await get_participant_profiles(request.user_ids, session)


@router.get("/users")
async def get_users(
    _admin_manager: AdminManagerUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    role: Annotated[
        ManagedUserRole,
        Query(description="Account role to list or search."),
    ] = UserRole.ADMIN,
    query: Annotated[
        str | None,
        Query(
            min_length=1,
            max_length=254,
            description="Optional case-insensitive username or email search within the selected role.",
        ),
    ] = None,
) -> list[ManagedUserResponse]:
    return await get_users_for_access_management(role, query, session)


@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: UUID,
    update: UpdateUserRoleRequest,
    _admin_manager: AdminManagerUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ManagedUserResponse:
    try:
        return await update_user_role(user_id, update, session)
    except UserNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from None


@router.patch("/users/current", response_model=CurrentUserResponse)
async def update_current_user(
    update: UpdateCurrentUserRequest,
    user: AuthenticatedUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CurrentUserResponse | Response:
    try:
        return await update_current_user_profile(user.user_id, update, session)
    except UserAlreadyExistsError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    except InvalidTokenError:
        return unauthorized_response()


@router.delete("/sessions/current", status_code=204)
async def sign_out(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Security(bearer_scheme),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    token = (
        credentials.credentials
        if credentials is not None
        else request.cookies.get("access_token")
    )
    if token:
        await invalidate_authentication_session(token, session)

    response = Response(status_code=204)
    clear_access_token_cookie(response)
    return response
