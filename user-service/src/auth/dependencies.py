from typing import Annotated

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError

from sqlalchemy.ext.asyncio import AsyncSession

from common.db import get_session
from auth.exceptions import AuthenticationUnavailableError
from auth.models import UserRole, UserRoleResponse
from auth.service import get_authenticated_user_role, verify_access_token


bearer_scheme = HTTPBearer(auto_error=False)


async def get_authenticated_user(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Security(bearer_scheme),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRoleResponse:
    token = (
        credentials.credentials
        if credentials is not None
        else request.cookies.get("access_token")
    )
    if not token:
        raise HTTPException(
            status_code=401,
            detail="No authentication token found. Please sign in.",
        )

    try:
        claims = verify_access_token(token)
        return await get_authenticated_user_role(token, claims.sub, session)
    except InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please sign in.",
        ) from None
    except AuthenticationUnavailableError:
        raise HTTPException(
            status_code=503,
            detail="Authentication is temporarily unavailable.",
        ) from None


AuthenticatedUser = Annotated[UserRoleResponse, Depends(get_authenticated_user)]


async def get_admin_manager_user(user: AuthenticatedUser) -> UserRoleResponse:
    if user.role != UserRole.ADMIN_MANAGER:
        raise HTTPException(status_code=403, detail="Admin manager access required.")
    return user


AdminManagerUser = Annotated[UserRoleResponse, Depends(get_admin_manager_user)]


async def get_admin_user(user: AuthenticatedUser) -> UserRoleResponse:
    if user.role not in (UserRole.ADMIN, UserRole.ADMIN_MANAGER):
        raise HTTPException(status_code=403, detail="Administrator access required.")
    return user


AdminUser = Annotated[UserRoleResponse, Depends(get_admin_user)]
