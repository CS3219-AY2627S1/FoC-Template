# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11
# Scope: Added or extended tests for caller-scoped username search.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import AccountStatus, SystemRole, User, UserSession

pytestmark = pytest.mark.integration
PATH = "/v1/internal/chat/users"


async def test_literal_middle_search_and_complete_keyset_traversal(chat_harness) -> None:
    h = chat_harness
    fragment = uuid4().hex[:12]
    caller = await h.seed_user(f"Caller-{fragment}")
    headers = await h.login(caller)
    expected = []
    for number in range(105):
        name = f"Start-{fragment}-{number:03}-End"
        expected.append((await h.seed_user(name), name))
    await h.seed_user("NameOnly-" + uuid4().hex[:12], display_name=fragment)
    await h.seed_user("EmailOnly-" + uuid4().hex[:12], email=f"{fragment}@u.nus.edu")
    deleted_id = await h.seed_user("Deleted-" + fragment, deleted=True)
    async for session in h.database.session():
        async with session.begin():
            legacy_tombstone = await session.get(User, deleted_id)
            legacy_tombstone.username = "Deleted-" + fragment
            legacy_tombstone.normalized_username = "deleted-" + fragment
    params = {"username": f"  {fragment.upper()}  ", "limit": 7}
    seen = []
    while True:
        response = await h.client.get(PATH, headers=headers, params=params)
        assert response.status_code == 200, response.text
        assert response.headers["Cache-Control"] == "no-store"
        data = response.json()
        assert set(data) == {"items", "nextCursor"}
        assert len(data["items"]) <= 7
        assert all(set(item) == {"userId", "username"} for item in data["items"])
        seen.extend((item["userId"], item["username"]) for item in data["items"])
        if data["nextCursor"] is None:
            break
        params["cursor"] = data["nextCursor"]
    assert seen == [(str(user_id), name) for user_id, name in expected]
    assert len(set(user_id for user_id, _ in seen)) == 105
    empty = await h.client.get(PATH, headers=headers, params={"username": uuid4().hex})
    assert empty.json() == {"items": [], "nextCursor": None}
    for query in (expected[0][1], "Start-" + fragment, fragment + "-000"):
        exact = await h.client.get(PATH, headers=headers, params={"username": query, "limit": 100})
        assert exact.status_code == 200
        assert exact.json()["items"][0]["userId"] == str(expected[0][0])


@pytest.mark.parametrize("literal", ["%", "_"])
async def test_sql_pattern_characters_are_literal(chat_harness, literal) -> None:
    h = chat_harness
    fragment = uuid4().hex[:10]
    headers = await h.login(await h.seed_user("Caller-" + fragment))
    wanted = await h.seed_user(f"Start{fragment}{literal}End")
    await h.seed_user(f"Start{fragment}XEnd")
    response = await h.client.get(PATH, headers=headers, params={"username": fragment + literal})
    assert response.status_code == 200
    assert [item["userId"] for item in response.json()["items"]] == [str(wanted)]


@pytest.mark.parametrize("role", list(SystemRole))
async def test_every_active_role_can_search_and_authenticate_first(chat_harness, role) -> None:
    h = chat_harness
    fragment = uuid4().hex[:10]
    headers = await h.login(await h.seed_user("Caller-" + fragment, role=role))
    wanted_name = "Other-" + fragment
    wanted_id = await h.seed_user(wanted_name)
    for bad_headers in (
        {},
        {"Authorization": headers["Authorization"]},
        {**headers, "X-FoC-Service-Secret": "separate-supplier-test-secret"},
    ):
        denied = await h.client.get(PATH, headers=bad_headers, params={"username": fragment})
        assert denied.status_code == 401
        assert denied.json()["error"]["code"] == "INVALID_SERVICE_IDENTITY"
    allowed = await h.client.get(PATH, headers=headers, params={"username": fragment})
    assert allowed.status_code == 200
    assert allowed.json() == {
        "items": [{"userId": str(wanted_id), "username": wanted_name}],
        "nextCursor": None,
    }
    missing_bearer = await h.client.get(
        PATH,
        headers={
            "X-FoC-Service-Secret": "isolated-chat-test-secret",
        },
        params={"username": fragment},
    )
    assert missing_bearer.status_code == 401


@pytest.mark.parametrize(
    "failure",
    ["expired", "revoked", "idle", "deleted", "stale-role", "session-expired", "malformed"],
)
async def test_current_session_failures_are_rejected(chat_harness, failure) -> None:
    h = chat_harness
    caller = await h.seed_user("Caller-" + uuid4().hex[:12])
    headers = await h.login(caller)
    async for session in h.database.session():
        async with session.begin():
            stored = (
                await session.scalars(
                    select(UserSession).where(
                        UserSession.user_id == caller,
                    )
                )
            ).one()
            user = await session.get(User, caller)
            now = datetime.now(UTC)
            if failure == "expired":
                token, _ = h.key_store.issue_access_token(
                    subject_id=caller,
                    session_id=stored.id,
                    role_version=1,
                    now=now - timedelta(seconds=121),
                )
                headers["Authorization"] = "Bearer " + token
            elif failure == "revoked":
                stored.revoked_at = now
            elif failure == "idle":
                stored.last_active_at = now - timedelta(seconds=61)
            elif failure == "deleted":
                user.account_status = AccountStatus.DELETED
                user.deleted_at = now
            elif failure == "stale-role":
                user.role_version += 1
            elif failure == "session-expired":
                stored.issued_at = now - timedelta(hours=2)
                stored.expires_at = now - timedelta(seconds=1)
            elif failure == "malformed":
                headers["Authorization"] = "Bearer invalid-sensitive-token"
    response = await h.client.get(PATH, headers=headers, params={"username": "Caller"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_ACCESS_TOKEN"
    assert "invalid-sensitive-token" not in response.text


async def test_query_cursor_validation_and_deletion_between_pages(chat_harness) -> None:
    h = chat_harness
    fragment = uuid4().hex[:12]
    headers = await h.login(await h.seed_user("Caller-" + fragment))
    first = await h.seed_user("A-" + fragment)
    second = await h.seed_user("B-" + fragment)
    third = await h.seed_user("C-" + fragment)
    response = await h.client.get(PATH, headers=headers, params={"username": fragment, "limit": 1})
    cursor = response.json()["nextCursor"]
    assert response.json()["items"][0]["userId"] == str(first)
    async for session in h.database.session():
        async with session.begin():
            user = await session.get(User, first)
            user.account_status = AccountStatus.DELETED
            user.deleted_at = datetime.now(UTC)
            user.username = user.normalized_username = None
    continued = await h.client.get(
        PATH,
        headers=headers,
        params={
            "username": fragment.upper(),
            "cursor": cursor,
            "limit": 100,
        },
    )
    assert [item["userId"] for item in continued.json()["items"]] == [str(second), str(third)]
    assert continued.json()["nextCursor"] is None
    malicious_cursor = (
        base64.urlsafe_b64encode(
            json.dumps(
                {
                    "v": 9,
                    "query": fragment,
                    "username": "secret-value",
                    "user_id": "invalid",
                }
            ).encode()
        )
        .decode()
        .rstrip("=")
    )
    for query in (
        {},
        {"username": ""},
        {"username": " "},
        {"username": "a" * 65},
        {"username": "a b"},
        {"username": "x", "limit": "no"},
        {"username": "x", "limit": 0},
        {"username": "x", "limit": 101},
        {"username": "x", "cursor": "***"},
        {"username": "x", "cursor": cursor},
        {"username": fragment, "cursor": malicious_cursor},
        {"username": fragment, "private-field-name": "private-field-value"},
    ):
        invalid = await h.client.get(
            PATH, headers={**headers, "X-Correlation-ID": "chat-trace"}, params=query
        )
        assert invalid.status_code == 422, invalid.text
        assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
        assert invalid.headers["X-Correlation-ID"] == "chat-trace"
        assert invalid.headers["Cache-Control"] == "no-store"
        for sensitive in ("secret-value", "private-field-value", "private-field-name"):
            assert sensitive not in invalid.text
