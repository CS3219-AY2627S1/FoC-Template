# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Added or extended tests for conversation access and concurrent creation.
# Author review: I validated correctness and added boundary checks where needed.

import asyncio
from uuid import UUID

import httpx
import pytest
from sqlalchemy import text

from app.config import Settings
from app.errors import ApiError
from app.main import create_app
from app.schemas import HistoryQuery, PageQuery

pytestmark = pytest.mark.integration


async def test_concurrent_pair_and_private_access(chat, database, directory):
    a, b, c = directory.user(), directory.user(), directory.user()
    results = await asyncio.gather(
        *[chat.create(a, b) if i % 2 else chat.create(b, a) for i in range(12)]
    )
    assert len({r["conversationId"] for r in results}) == 1
    cid = UUID(results[0]["conversationId"])
    async with database.transaction() as session:
        assert (
            await session.execute(
                text(
                    "SELECT count(*) FROM chat_service."
                    "conversation_participants WHERE conversation_id=:c"
                ),
                {"c": cid},
            )
        ).scalar_one() == 2
    for operation in (chat.conversation(c, cid), chat.history(c, cid, HistoryQuery())):
        with pytest.raises(ApiError) as caught:
            await operation
        assert caught.value.status == 404
    directory.people[b]["displayName"] = "Current Name"
    assert (await chat.conversation(a, cid))["counterpart"]["displayName"] == "Current Name"
    directory.people[b].update(accountStatus="DELETED", username=None, displayName="Deleted User")
    assert (await chat.create(a, b))["conversationId"] == str(cid)
    assert (await chat.conversations(a, PageQuery()))["items"][0]["counterpart"]["username"] is None
    replacement = directory.user(username="alex")
    assert (await chat.create(a, replacement))["conversationId"] != str(cid)


async def test_http_authorization_and_strict_query(database, identity, directory):
    a, b = directory.user(), directory.user()
    app = create_app(Settings(_env_file=None), database, identity)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://chat"
    ) as client:
        assert (await client.get("/v1/chat/conversations")).status_code == 401
        headers = {"Authorization": f"Bearer {directory.token(a)}"}
        r = await client.post(
            "/v1/chat/conversations",
            headers=headers,
            json={"recipientUserId": str(b), "senderUserId": str(a)},
        )
        assert r.status_code == 422
        r = await client.get("/v1/chat/conversations", headers=headers, params={"extra": "secret"})
        assert r.status_code == 422 and "secret" not in r.text
