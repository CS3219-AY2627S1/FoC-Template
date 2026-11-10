# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Implemented RSA token signing, verification, and public JWKS output.
# Author review: I validated correctness and added boundary checks where needed.

"""Minimal RS256 JWT signing, validation, and JWKS publication."""

from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from app.core.config import Settings


class JwtConfigurationError(RuntimeError):
    """Raised when the configured key material is missing or invalid."""


class JwtValidationError(RuntimeError):
    """Raised when a bearer token cannot be trusted."""


@dataclass(frozen=True)
class AccessTokenClaims:
    """Claims required to authorize a current User Service session."""

    subject_id: UUID
    session_id: UUID
    role_version: int
    expires_at: datetime


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64url_decode(value: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (ValueError, UnicodeEncodeError) as error:
        raise JwtValidationError("JWT segment is not base64url.") from error


def _decode_json(value: str) -> dict[str, Any]:
    try:
        decoded = json.loads(_base64url_decode(value))
    except (TypeError, json.JSONDecodeError) as error:
        raise JwtValidationError("JWT segment is not JSON.") from error
    if not isinstance(decoded, dict):
        raise JwtValidationError("JWT segment is not an object.")
    return decoded


def _integer_claim(payload: dict[str, Any], name: str) -> int:
    value = payload.get(name)
    if isinstance(value, bool) or not isinstance(value, int):
        raise JwtValidationError(f"JWT {name} claim is invalid.")
    return value


class JwtKeyStore:
    """Load the locally managed RSA key pair only when auth is invoked."""

    def __init__(
        self,
        settings: Settings,
        *,
        private_key: rsa.RSAPrivateKey | None = None,
        public_key: rsa.RSAPublicKey | None = None,
    ) -> None:
        self._settings = settings
        self._private_key = private_key
        self._public_key = public_key
        self._key_id: str | None = None

    def issue_access_token(
        self,
        *,
        subject_id: UUID,
        session_id: UUID,
        role_version: int,
        now: datetime,
    ) -> tuple[str, datetime]:
        """Create a short-lived signed bearer token for one active session."""

        private_key, _, key_id = self._load_keys()
        issued_at = now.replace(microsecond=0)
        expires_at = issued_at + timedelta(seconds=self._settings.jwt_access_token_ttl_seconds)
        payload = {
            "aud": self._settings.jwt_audience,
            "exp": int(expires_at.timestamp()),
            "iat": int(issued_at.timestamp()),
            "iss": self._settings.jwt_issuer,
            "roleVersion": role_version,
            "sid": str(session_id),
            "sub": str(subject_id),
        }
        header = {"alg": "RS256", "kid": key_id, "typ": "JWT"}
        signing_input = ".".join(
            (
                _base64url_encode(
                    json.dumps(header, separators=(",", ":"), sort_keys=True).encode()
                ),
                _base64url_encode(
                    json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
                ),
            )
        )
        signature = private_key.sign(
            signing_input.encode("ascii"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return f"{signing_input}.{_base64url_encode(signature)}", expires_at

    def validate_access_token(self, token: str, *, now: datetime) -> AccessTokenClaims:
        """Verify signature and every authorization-relevant registered claim."""

        _, public_key, key_id = self._load_keys()
        parts = token.split(".")
        if len(parts) != 3:
            raise JwtValidationError("JWT must have three segments.")
        header = _decode_json(parts[0])
        if header.get("alg") != "RS256" or header.get("kid") != key_id:
            raise JwtValidationError("JWT header is not trusted.")
        try:
            public_key.verify(
                _base64url_decode(parts[2]),
                f"{parts[0]}.{parts[1]}".encode("ascii"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
        except InvalidSignature as error:
            raise JwtValidationError("JWT signature is invalid.") from error

        payload = _decode_json(parts[1])
        if payload.get("iss") != self._settings.jwt_issuer:
            raise JwtValidationError("JWT issuer is invalid.")
        if payload.get("aud") != self._settings.jwt_audience:
            raise JwtValidationError("JWT audience is invalid.")
        expires_at = datetime.fromtimestamp(_integer_claim(payload, "exp"), tz=UTC)
        issued_at = datetime.fromtimestamp(_integer_claim(payload, "iat"), tz=UTC)
        if expires_at <= now or issued_at > now + timedelta(seconds=30):
            raise JwtValidationError("JWT is expired or not yet valid.")
        try:
            subject_id = UUID(str(payload["sub"]))
            session_id = UUID(str(payload["sid"]))
        except (KeyError, ValueError, TypeError) as error:
            raise JwtValidationError("JWT subject or session is invalid.") from error
        role_version = _integer_claim(payload, "roleVersion")
        if role_version < 1:
            raise JwtValidationError("JWT role version is invalid.")
        return AccessTokenClaims(
            subject_id=subject_id,
            session_id=session_id,
            role_version=role_version,
            expires_at=expires_at,
        )

    def public_jwk(self) -> dict[str, str]:
        """Return only public information suitable for JWKS consumers."""

        _, public_key, key_id = self._load_keys()
        numbers = public_key.public_numbers()
        modulus_size = (numbers.n.bit_length() + 7) // 8
        exponent_size = (numbers.e.bit_length() + 7) // 8
        return {
            "alg": "RS256",
            "e": _base64url_encode(numbers.e.to_bytes(exponent_size, "big")),
            "kid": key_id,
            "kty": "RSA",
            "n": _base64url_encode(numbers.n.to_bytes(modulus_size, "big")),
            "use": "sig",
        }

    def _load_keys(self) -> tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey, str]:
        if (
            self._private_key is not None
            and self._public_key is not None
            and self._key_id is not None
        ):
            return self._private_key, self._public_key, self._key_id
        if self._private_key is None or self._public_key is None:
            private_path = self._settings.jwt_private_key_path
            public_path = self._settings.jwt_public_key_path
            if private_path is None or public_path is None:
                raise JwtConfigurationError("JWT key paths are not configured.")
            try:
                private_key = serialization.load_pem_private_key(
                    private_path.read_bytes(), password=None
                )
                public_key = serialization.load_pem_public_key(public_path.read_bytes())
            except (OSError, TypeError, ValueError) as error:
                raise JwtConfigurationError("JWT key material could not be loaded.") from error
        else:
            private_key = self._private_key
            public_key = self._public_key
        if not isinstance(private_key, rsa.RSAPrivateKey) or not isinstance(
            public_key, rsa.RSAPublicKey
        ):
            raise JwtConfigurationError("JWT keys must be RSA keys.")
        if private_key.public_key().public_numbers() != public_key.public_numbers():
            raise JwtConfigurationError("JWT public key does not match the private key.")
        public_der = public_key.public_bytes(
            serialization.Encoding.DER,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        self._private_key = private_key
        self._public_key = public_key
        self._key_id = _base64url_encode(hashlib.sha256(public_der).digest()[:16])
        return private_key, public_key, self._key_id
