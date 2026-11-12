import os
from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient


USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8081")
JWT_ISSUER = os.getenv("JWT_ISSUER", "campuscouriers-user-service")

bearer_scheme = HTTPBearer()
jwk_client = PyJWKClient(f"{USER_SERVICE_URL}/.well-known/jwks.json")


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: UUID
    access_token: str


def verified_claims(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    try:
        signing_key = jwk_client.get_signing_key_from_jwt(credentials.credentials)
        return jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            issuer=JWT_ISSUER,
            options={"require": ["sub", "exp", "iss"]},
        )
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(503, "User Service keys are unavailable") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            401,
            "Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def authenticated_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    claims: dict = Depends(verified_claims),
) -> AuthenticatedUser:
    """The verified caller plus the raw token to forward to downstream services.

    FastAPI caches `bearer_scheme` per request, so `credentials` is the same
    token that `verified_claims` just verified.
    """
    try:
        user_id = UUID(claims["sub"])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            401,
            "Access token contains an invalid user ID",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    return AuthenticatedUser(user_id=user_id, access_token=credentials.credentials)
