# AI Assistance Disclosure
# Tool and date: Anthropic Claude (model unrecorded), 2026-11-10 to 2026-11-11
# Scope (AI-29): Generated manifests, secret wiring and service changes to deploy the AI assistant and RAG services.
# Usage log: AI_USAGE_LOG.md
# Author review: Pending confirmation by Melodi Joy Halim.

import os

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient


# Same check as chat-service: the access token must be signed by user-service (keys from its JWKS
# endpoint), issued by it, and unexpired. Only signed-in users can ask questions, so the Claude API
# can't be used (and billed) by anyone on the internet.
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
