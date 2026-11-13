# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-08
# Scope: Writing implementation code — API test settings and a User Service test double (ai-20261108-001).
# Author review: Keith confirmed on 2026-11-08: full pytest suite with PostgreSQL 16, 790 passed and 5 real-broker tests skipped; code read and verified; manual checks against the full Compose stack with the real User Service (ai-20261108-001).
# Details: notification-service/ai/usage-log.md; ai-20261108-001

"""Helpers for the notification API tests: settings and a User Service double."""

from uuid import UUID

import certifi

from app.clients import AuthenticationUnavailableError, Identity, InvalidSessionError
from app.config import ApiSettings

ALICE_ID = UUID("aaaaaaaa-0000-4000-8000-000000000001")
BOB_ID = UUID("bbbbbbbb-0000-4000-8000-000000000002")
ALICE_TOKEN = "alice-token"
BOB_TOKEN = "bob-token"
EMPTY_TOKEN = "carol-token"
CAROL_ID = UUID("cccccccc-0000-4000-8000-000000000003")


def api_settings(database_url: str) -> ApiSettings:
    return ApiSettings(
        database_url=database_url,
        user_service_url="https://user-service.test",
        user_service_ca_file=certifi.where(),
    )


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class FakeUserClient:
    """Stands in for UserServiceClient: known tokens resolve, others are rejected."""

    def __init__(self) -> None:
        self.identities = {
            ALICE_TOKEN: Identity(id=ALICE_ID, role="user", status="active"),
            BOB_TOKEN: Identity(id=BOB_ID, role="user", status="active"),
            EMPTY_TOKEN: Identity(id=CAROL_ID, role="user", status="active"),
        }
        self.unavailable = False
        self.tokens_seen: list[str] = []
        self.closed = False

    def resolve_identity(self, token: str) -> Identity:
        self.tokens_seen.append(token)
        if self.unavailable:
            raise AuthenticationUnavailableError
        try:
            return self.identities[token]
        except KeyError:
            raise InvalidSessionError from None

    def close(self) -> None:
        self.closed = True
