# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
# Scope: Implementation and test assistance for Chat Service.

import os
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient


USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8081")
JWT_ISSUER = os.getenv("JWT_ISSUER", "campuscouriers-user-service")

bearer_scheme = HTTPBearer()
jwk_client = PyJWKClient(f"{USER_SERVICE_URL}/.well-known/jwks.json")


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


def authenticated_user_id(claims: dict = Depends(verified_claims)) -> UUID:
    try:
        return UUID(claims["sub"])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(401, "Access token contains an invalid user ID") from exc

