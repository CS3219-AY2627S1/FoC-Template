# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Added or extended tests for token signing, verification, and JWKS.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.auth.jwt import JwtKeyStore, JwtValidationError
from app.core.config import Settings


def test_rs256_access_token_and_jwks_expose_only_public_material(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    private_key, public_key = jwt_key_pair
    settings = Settings(
        _env_file=None,
        environment="test",
        jwt_access_token_ttl_seconds=60,
    )
    key_store = JwtKeyStore(settings, private_key=private_key, public_key=public_key)
    now = datetime.now(UTC)
    subject_id = uuid4()
    session_id = uuid4()

    token, expires_at = key_store.issue_access_token(
        subject_id=subject_id,
        session_id=session_id,
        role_version=3,
        now=now,
    )
    claims = key_store.validate_access_token(token, now=now)
    jwk = key_store.public_jwk()

    assert claims.subject_id == subject_id
    assert claims.session_id == session_id
    assert claims.role_version == 3
    assert claims.expires_at == expires_at
    assert jwk["alg"] == "RS256"
    assert jwk["kty"] == "RSA"
    assert "d" not in jwk


def test_access_token_validation_rejects_tampering_and_expiry(
    jwt_key_pair: tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey],
) -> None:
    private_key, public_key = jwt_key_pair
    settings = Settings(
        _env_file=None,
        environment="test",
        jwt_access_token_ttl_seconds=60,
    )
    key_store = JwtKeyStore(settings, private_key=private_key, public_key=public_key)
    now = datetime.now(UTC)
    token, expires_at = key_store.issue_access_token(
        subject_id=uuid4(),
        session_id=uuid4(),
        role_version=1,
        now=now,
    )

    with pytest.raises(JwtValidationError):
        key_store.validate_access_token(f"{token}x", now=now)
    with pytest.raises(JwtValidationError):
        key_store.validate_access_token(token, now=expires_at + timedelta(seconds=1))
