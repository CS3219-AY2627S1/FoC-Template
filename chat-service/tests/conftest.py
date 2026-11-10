# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-13
# Scope: Implemented test fixtures for service identity, database access, and upstream errors.
# Author review: I validated correctness and added boundary checks where needed.

import os
import time
from uuid import uuid4

import httpx
import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy.engine import make_url

from app.config import Settings
from app.db import Database
from app.identity import IdentityClient
from app.service import ChatService


class Directory:
    """Contract fake only. Its signing key is generated in memory, never a User Service key."""

    def __init__(self):
        self.people = {}
        self.revoked = set()
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.jwk = jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key(), as_dict=True)
        self.jwk.update(kid="test", alg="RS256", use="sig")
        self.calls = []

    def user(self, name="Alex", username="alex"):
        uid = uuid4()
        self.people[uid] = {
            "userId": str(uid),
            "displayName": name,
            "username": username,
            "accountStatus": "ACTIVE",
        }
        return uid

    def token(self, uid, **overrides):
        claims = {
            "sub": str(uid),
            "sid": str(uuid4()),
            "roleVersion": 1,
            "iat": int(time.time()),
            "exp": int(time.time()) + 900,
            "iss": "foc-user-service",
            "aud": "foc-services",
        }
        claims.update(overrides)
        return jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "test"})

    async def handle(self, request):
        self.calls.append(request)
        if request.url.path == "/.well-known/jwks.json":
            return httpx.Response(200, json={"keys": [self.jwk]})
        if request.url.path == "/v1/users/me":
            token = request.headers.get("Authorization", "")[7:]
            if token in self.revoked:
                return httpx.Response(401)
            uid = jwt.decode(
                token, self.key.public_key(), algorithms=["RS256"], audience="foc-services"
            )["sub"]
            person = self.people.get(__import__("uuid").UUID(uid))
            return httpx.Response(200, json=person) if person else httpx.Response(401)
        if request.headers.get("X-FoC-Service-Secret") != "test-chat-secret":
            return httpx.Response(401, json={"error": {"code": "INVALID_SERVICE_IDENTITY"}})
        if request.url.path == "/v1/internal/chat/participants":
            import json
            from uuid import UUID

            ids = [UUID(i) for i in json.loads(request.content)["userIds"]]
            return httpx.Response(
                200,
                json={
                    "items": [self.people[i] for i in ids if i in self.people],
                    "missingUserIds": [str(i) for i in ids if i not in self.people],
                },
            )
        if request.url.path == "/v1/internal/chat/users":
            return httpx.Response(200, json={"items": [], "nextCursor": "next-page"})
        return httpx.Response(404)


@pytest.fixture
def directory():
    return Directory()


@pytest_asyncio.fixture
async def identity(directory):
    client = IdentityClient(
        Settings(_env_file=None, chat_service_shared_secret="test-chat-secret"),
        httpx.MockTransport(directory.handle),
    )
    yield client
    await client.close()


@pytest_asyncio.fixture
async def database():
    value = os.getenv("CHAT_TEST_DATABASE_URL")
    if not value:
        pytest.skip("CHAT_TEST_DATABASE_URL is not configured")
    url = make_url(value)
    if url.host not in {"127.0.0.1", "localhost"} or url.port != 17422:
        pytest.fail("Tests only accept the isolated local Chat Service port 17422")
    db = Database(value)
    await db.ready()
    yield db
    await db.close()


@pytest.fixture
def chat(database, identity):
    return ChatService(database, identity)
