from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError

from auth.models import UserRoleResponse
from common.gateway import get_internal_gateway_client


bearer_scheme = HTTPBearer(auto_error=False)


async def get_authenticated_user(
    request: Request,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Security(bearer_scheme),
    ],
    client: Annotated[httpx.AsyncClient, Depends(get_internal_gateway_client)],
) -> UserRoleResponse:
    if request.headers.get("Authorization") is not None and credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please sign in.",
        )

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
    if any(ord(character) < 33 or ord(character) > 126 for character in token):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please sign in.",
        )

    try:
        response = await client.get(
            "/user-api/authentication/sessions/current",
            headers={"Authorization": f"Bearer {token}"},
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Authentication is temporarily unavailable.",
        ) from None

    if response.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please sign in.",
        )
    if not response.is_success:
        raise HTTPException(
            status_code=503,
            detail="Authentication is temporarily unavailable.",
        )

    try:
        return UserRoleResponse.model_validate(response.json())
    except (ValidationError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Authentication is temporarily unavailable.",
        ) from None


AuthenticatedUser = Annotated[UserRoleResponse, Depends(get_authenticated_user)]