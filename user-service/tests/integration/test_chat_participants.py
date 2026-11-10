# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11
# Scope: Added or extended tests for batch identity and tombstone lookup.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import event, func, select

from app.models import Credential, OutboxEvent, User, UserSession

pytestmark = pytest.mark.integration
PATH = "/v1/internal/chat/participants"
SERVICE_HEADERS = {"X-FoC-Service-Secret": "isolated-chat-test-secret"}
PASSWORD = "ChatTestSecurePass1!"


async def test_batch_order_deduplication_single_query_and_no_side_effects(chat_harness) -> None:
    h = chat_harness
    first = await h.seed_user("First-" + uuid4().hex[:12])
    second = await h.seed_user("Second-" + uuid4().hex[:12])
    deleted = await h.seed_user("Old-" + uuid4().hex[:12], deleted=True)
    unknown, other_unknown = uuid4(), uuid4()
    await h.login(first)

    async def snapshot():
        async for session in h.database.session():
            counts = [
                await session.scalar(select(func.count()).select_from(model))
                for model in (User, UserSession, Credential, OutboxEvent)
            ]
            timestamps = (await session.execute(select(User.id, User.updated_at))).all()
            activity = (
                await session.execute(select(UserSession.id, UserSession.last_active_at))
            ).all()
            return counts, timestamps, activity

    before = await snapshot()
    statements = []

    def record_query(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    engine = h.database._engine.sync_engine
    event.listen(engine, "before_cursor_execute", record_query)
    try:
        response = await h.client.post(
            PATH,
            headers=SERVICE_HEADERS,
            json={
                "userIds": [
                    str(value)
                    for value in (unknown, second, first, second, deleted, unknown, other_unknown)
                ],
            },
        )
    finally:
        event.remove(engine, "before_cursor_execute", record_query)
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "no-store"
    data = response.json()
    assert set(data) == {"items", "missingUserIds"}
    assert [item["userId"] for item in data["items"]] == list(map(str, (second, first, deleted)))
    assert data["missingUserIds"] == list(map(str, (unknown, other_unknown)))
    assert all(
        set(item) == {"userId", "displayName", "username", "accountStatus"}
        for item in data["items"]
    )
    assert data["items"][0]["displayName"] == data["items"][1]["displayName"] == "SameName"
    assert data["items"][2] == {
        "userId": str(deleted),
        "displayName": "Deleted User",
        "username": None,
        "accountStatus": "DELETED",
    }
    assert len(statements) == 1
    assert statements[0].startswith("SELECT")
    assert "email" not in statements[0]
    assert " IN (" in statements[0]
    assert await snapshot() == before


async def test_current_name_deletion_and_released_username_registration(chat_harness) -> None:
    h = chat_harness
    username = "Reuse-" + uuid4().hex[:12]
    old_id = await h.seed_user(username, display_name="Before")
    old_headers = await h.login(old_id)
    body = {"userIds": [str(old_id)]}
    before = await h.client.post(PATH, headers=SERVICE_HEADERS, json=body)
    assert before.json()["items"][0]["displayName"] == "Before"
    updated = await h.client.patch(
        "/v1/users/me", headers=old_headers, json={"displayName": "After"}
    )
    assert updated.status_code == 200
    after = await h.client.post(PATH, headers=SERVICE_HEADERS, json=body)
    assert after.json()["items"][0]["displayName"] == "After"
    deleted = await h.client.request(
        "DELETE",
        "/v1/users/me",
        headers=old_headers,
        json={
            "currentPassword": PASSWORD,
            "acknowledgeDeletion": True,
        },
    )
    assert deleted.status_code == 204
    new_email = f"new-{uuid4().hex}@u.nus.edu"
    registered = await h.client.post(
        "/v1/auth/registrations",
        json={
            "username": username,
            "email": new_email,
            "password": PASSWORD,
            "displayName": "NewOwner",
        },
    )
    assert registered.status_code == 202, registered.text
    verified = await h.client.post(
        "/v1/auth/email-verifications",
        json={
            "email": new_email,
            "otp": h.sender.sent[-1][1],
        },
    )
    assert verified.status_code == 201, verified.text
    new_id = verified.json()["userId"]
    assert new_id != str(old_id)
    lookup = await h.client.post(
        PATH,
        headers=SERVICE_HEADERS,
        json={
            "userIds": [str(old_id), new_id],
        },
    )
    assert lookup.json() == {
        "items": [
            {
                "userId": str(old_id),
                "displayName": "Deleted User",
                "username": None,
                "accountStatus": "DELETED",
            },
            {
                "userId": new_id,
                "displayName": "NewOwner",
                "username": username,
                "accountStatus": "ACTIVE",
            },
        ],
        "missingUserIds": [],
    }
    # Even a legacy tombstone retaining identity fields must project only its safe label.
    async for session in h.database.session():
        async with session.begin():
            tombstone = await session.get(User, old_id)
            tombstone.display_name = "private-former-name"
            tombstone.username = "private-former-" + old_id.hex[:12]
    safe = await h.client.post(PATH, headers=SERVICE_HEADERS, json=body)
    assert safe.json()["items"][0]["displayName"] == "Deleted User"
    assert safe.json()["items"][0]["username"] is None
    assert "private-former" not in safe.text


async def test_batch_boundaries_unknowns_validation_and_optional_bearer(chat_harness) -> None:
    h = chat_harness
    user_id = await h.seed_user("Batch-" + uuid4().hex[:12])
    for count in (1, 100):
        response = await h.client.post(
            PATH,
            headers={
                **SERVICE_HEADERS,
                "Authorization": "Bearer invalid-ignored-browser-token",
            },
            json={"userIds": [str(user_id)] * count},
        )
        assert response.status_code == 200
        assert len(response.json()["items"]) == 1
    unknowns = [str(uuid4()) for _ in range(100)]
    missing = await h.client.post(PATH, headers=SERVICE_HEADERS, json={"userIds": unknowns})
    assert missing.status_code == 200
    assert missing.json() == {"items": [], "missingUserIds": unknowns}
    for body in (
        {},
        {"userIds": []},
        {"userIds": [str(user_id)] * 101},
        {"userIds": [str(user_id), "invalid-private-uuid"]},
        {"userIds": [str(user_id)], "private-name": "private-value"},
        {"userIds": str(user_id)},
    ):
        invalid = await h.client.post(PATH, headers=SERVICE_HEADERS, json=body)
        assert invalid.status_code == 422, invalid.text
        assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
        for value in ("private-name", "private-value", "invalid-private-uuid"):
            assert value not in invalid.text
    invalid_query = await h.client.post(
        PATH + "?private-name=private-value",
        headers=SERVICE_HEADERS,
        json={"userIds": [str(user_id)]},
    )
    assert invalid_query.status_code == 422
    assert "private-value" not in invalid_query.text
    malformed = await h.client.post(
        PATH,
        headers={**SERVICE_HEADERS, "Content-Type": "application/json"},
        content=b'{"userIds": ["private-unterminated',
    )
    assert malformed.status_code == 422
    assert "private-unterminated" not in malformed.text
    for headers in (
        {},
        {"Authorization": "Bearer ordinary-token"},
        {"X-FoC-Service-Secret": "separate-supplier-test-secret"},
    ):
        denied = await h.client.post(PATH, headers=headers, json={"userIds": [str(user_id)]})
        assert denied.status_code == 401
        assert denied.json()["error"]["code"] == "INVALID_SERVICE_IDENTITY"
