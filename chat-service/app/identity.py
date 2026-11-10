# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11, 2026-10-13
# Scope: Implemented identity and session checks and corrected upstream error mapping.
# Author review: I validated correctness and added boundary checks where needed.

"""Public-key verification plus authoritative current-session/status HTTP checks."""

import asyncio
import time
from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

import httpx
import jwt
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.correlation import correlation_id
from app.errors import ApiError, unauthorized, unavailable


class Participant(BaseModel):
    model_config = ConfigDict(extra="forbid")
    userId: UUID
    displayName: str = Field(min_length=1, max_length=64)
    username: str | None = Field(max_length=64)
    accountStatus: Literal["ACTIVE", "DELETED"]


class Participants(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[Participant] = Field(max_length=100)
    missingUserIds: list[UUID] = Field(max_length=100)


class SearchItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    userId: UUID
    username: str = Field(min_length=1, max_length=64)


class SearchPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[SearchItem] = Field(max_length=100)
    nextCursor: str | None = Field(max_length=2048)


class Me(BaseModel):
    userId: UUID
    accountStatus: Literal["ACTIVE", "DELETED"]


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    expires_at: float
    token: str = field(repr=False)


class IdentityClient:
    def __init__(self, settings, transport=None):
        self.settings = settings
        self.http = httpx.AsyncClient(
            base_url=settings.user_service_base_url.rstrip("/"),
            timeout=settings.user_timeout_seconds,
            transport=transport,
            follow_redirects=False,
        )
        self.keys = {}
        self.keys_until = 0.0
        self.key_lock = asyncio.Lock()
        self.last_refresh = 0.0

    async def close(self):
        await self.http.aclose()

    def service_headers(self):
        secret = self.settings.chat_service_shared_secret
        if not secret or not secret.get_secret_value():
            raise unavailable()
        return {"X-FoC-Service-Secret": secret.get_secret_value()}

    async def request(self, method, path, *, user_session=False, **kwargs):
        headers = kwargs.pop("headers", {})
        if correlation_id.get():
            headers = {**headers, "X-Correlation-ID": correlation_id.get()}
        try:
            response = await self.http.request(method, path, headers=headers, **kwargs)
            if response.status_code == 401:
                # A service-identity failure says nothing about the caller's bearer token.
                # Background/public calls have no caller session to reject.
                try:
                    upstream_code = response.json().get("error", {}).get("code")
                except (ValueError, AttributeError):
                    upstream_code = None
                if not user_session or upstream_code == "INVALID_SERVICE_IDENTITY":
                    raise unavailable()
                raise unauthorized()
            if response.status_code == 422:
                raise ApiError(422, "VALIDATION_ERROR", "Invalid directory query.")
            if response.status_code != 200:
                raise unavailable()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise unavailable() from error

    async def key(self, kid):
        async with self.key_lock:
            now = time.monotonic()
            if now >= self.keys_until or (kid not in self.keys and now - self.last_refresh > 5):
                data = await self.request("GET", "/.well-known/jwks.json")
                try:
                    keys = data["keys"]
                    if not isinstance(keys, list) or not 1 <= len(keys) <= 20:
                        raise ValueError()
                    if any(not isinstance(k, dict) for k in keys):
                        raise ValueError()
                    self.keys = {
                        k["kid"]: jwt.PyJWK.from_dict(k).key
                        for k in keys
                        if k.get("kty") == "RSA"
                        and k.get("alg") == "RS256"
                        and k.get("use", "sig") == "sig"
                    }
                    if not self.keys:
                        raise ValueError()
                except (KeyError, TypeError, ValueError, jwt.PyJWTError) as error:
                    raise unavailable() from error
                self.keys_until = now + self.settings.jwks_ttl_seconds
                self.last_refresh = now
            if kid not in self.keys:
                raise unauthorized()
            return self.keys[kid]

    async def authenticate(self, token: str) -> Principal:
        if not token or len(token) > 8192:
            raise unauthorized()
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
                raise unauthorized()
            key = await self.key(header["kid"])
            claims = await asyncio.to_thread(
                jwt.decode,
                token,
                key,
                algorithms=["RS256"],
                issuer=self.settings.jwt_issuer,
                audience=self.settings.jwt_audience,
                options={"require": ["sub", "exp", "iat", "iss", "aud", "sid", "roleVersion"]},
            )
            subject = UUID(claims["sub"])
            UUID(claims["sid"])
            if (
                type(claims["exp"]) is not int
                or type(claims["iat"]) is not int
                or type(claims["roleVersion"]) is not int
                or claims["roleVersion"] < 1
            ):
                raise unauthorized()
        except (jwt.PyJWTError, ValueError, TypeError, KeyError) as error:
            raise unauthorized() from error
        data = await self.request(
            "GET", "/v1/users/me", user_session=True, headers={"Authorization": f"Bearer {token}"}
        )
        try:
            me = Me.model_validate(data)
        except ValidationError as error:
            raise unavailable() from error
        if me.userId != subject or me.accountStatus != "ACTIVE":
            raise unauthorized()
        return Principal(subject, claims["exp"], token)

    async def participants(self, ids):
        ids = list(dict.fromkeys(ids))
        result = {}
        for start in range(0, len(ids), 100):
            batch = ids[start : start + 100]
            data = await self.request(
                "POST",
                "/v1/internal/chat/participants",
                headers=self.service_headers(),
                json={"userIds": [str(i) for i in batch]},
            )
            try:
                page = Participants.model_validate(data)
                returned = [p.userId for p in page.items] + page.missingUserIds
                if len(set(returned)) != len(returned) or set(returned) != set(batch):
                    raise ValueError()
            except (ValueError, ValidationError) as error:
                raise unavailable() from error
            for person in page.items:
                if person.accountStatus == "DELETED":
                    person = person.model_copy(
                        update={"displayName": "Deleted User", "username": None}
                    )
                result[person.userId] = person.model_dump(mode="json")
        return result

    async def search(self, principal, query):
        headers = {**self.service_headers(), "Authorization": f"Bearer {principal.token}"}
        data = await self.request(
            "GET", "/v1/internal/chat/users", user_session=True, headers=headers, params=query
        )
        try:
            page = SearchPage.model_validate(data)
            if any(p.userId == principal.user_id for p in page.items):
                raise ValueError()
            return page.model_dump(mode="json")
        except (ValidationError, ValueError) as error:
            raise unavailable() from error
