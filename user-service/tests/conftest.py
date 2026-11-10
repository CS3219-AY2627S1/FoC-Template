# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-20
# Scope: Added signing-key fixtures for authentication tests.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa


@pytest.fixture
def jwt_key_pair() -> tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey]:
    """Create an in-memory RSA pair; no test key is stored on disk."""

    private_key = rsa.generate_private_key(public_exponent=65_537, key_size=2_048)
    return private_key, private_key.public_key()
