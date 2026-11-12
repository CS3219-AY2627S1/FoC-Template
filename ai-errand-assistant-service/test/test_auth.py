
#  AI Assistance Disclosure
#  Tool: Anthropic Claude (model unrecorded), date: 2026-11-10 to 2026-11-11
#  Scope (AI-64): Generated unit tests for the authentication module of the AI Errand Assistant Service
#  Author review: Code changes were checked and validated

from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from main import auth


USER_ID = UUID(int=7)
SIGNING_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeJWKClient:
    """Stands in for User Service's JWKS endpoint with one trusted key."""

    def get_signing_key_from_jwt(self, token):
        jwt.get_unverified_header(token)  # malformed tokens fail like the real client

        class Key:
            key = SIGNING_KEY.public_key()

        return Key()


@pytest.fixture(autouse=True)
def trusted_jwks(monkeypatch):
    monkeypatch.setattr(auth, "jwk_client", FakeJWKClient())


def make_token(key=SIGNING_KEY, algorithm="RS256", **overrides):
    claims = {
        "sub": str(USER_ID),
        "iss": auth.JWT_ISSUER,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    claims.update(overrides)
    claims = {name: value for name, value in claims.items() if value is not None}
    return jwt.encode(claims, key, algorithm=algorithm)


def verify(token):
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    claims = auth.verified_claims(credentials)
    return auth.authenticated_user(credentials, claims)


def assert_rejected(token):
    with pytest.raises(HTTPException) as error:
        verify(token)
    assert error.value.status_code == 401


def test_valid_token_yields_user_id_and_raw_token():
    token = make_token()
    user = verify(token)
    assert user.user_id == USER_ID
    assert user.access_token == token


def test_expired_token_is_rejected():
    assert_rejected(make_token(exp=datetime.now(timezone.utc) - timedelta(seconds=1)))


def test_wrong_issuer_is_rejected():
    assert_rejected(make_token(iss="someone-else"))


def test_token_signed_by_untrusted_key_is_rejected():
    assert_rejected(make_token(key=OTHER_KEY))


def test_symmetric_algorithm_is_rejected():
    assert_rejected(make_token(key="shared-secret-that-is-long-enough-for-hs256", algorithm="HS256"))


@pytest.mark.parametrize("missing", ["sub", "exp", "iss"])
def test_required_claims_must_be_present(missing):
    assert_rejected(make_token(**{missing: None}))


def test_subject_must_be_a_uuid():
    assert_rejected(make_token(sub="not-a-uuid"))


def test_malformed_token_is_rejected():
    assert_rejected("not-a-jwt")


def test_unreachable_jwks_is_reported_as_unavailable(monkeypatch):
    class DownJWKClient:
        def get_signing_key_from_jwt(self, token):
            raise jwt.PyJWKClientConnectionError("down")

    monkeypatch.setattr(auth, "jwk_client", DownJWKClient())
    with pytest.raises(HTTPException) as error:
        verify(make_token())
    assert error.value.status_code == 503
