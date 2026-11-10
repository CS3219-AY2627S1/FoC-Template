# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Added or extended tests for unread counts and read cursor boundaries.
# Author review: I validated correctness and added boundary checks where needed.

import asyncio
from uuid import UUID

import pytest

from app.errors import ApiError
from app.schemas import HistoryQuery, PageQuery
from tests.test_messages import send

pytestmark = pytest.mark.integration


async def test_unread_snapshot_pages_and_monotonic_cursor(chat, directory):
    a, b = directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])
    for i in range(65):
        await chat.send(a, send(cid, str(i)))
    await chat.send(b, send(cid, "own message"))
    summary = (await chat.conversations(b, PageQuery()))["items"][0]
    assert summary["unreadCount"] == 65
    latest = await chat.history(b, cid, HistoryQuery())
    assert [r["sequence"] for r in latest["items"]] == list(range(17, 67))
    assert latest["hasMore"] and latest["boundarySequence"] == 66
    older = await chat.history(b, cid, HistoryQuery(beforeSequence=17))
    assert [r["sequence"] for r in older["items"]] == list(range(1, 17))
    catchup = await chat.history(b, cid, HistoryQuery(afterSequence=0))
    assert [r["sequence"] for r in catchup["items"]] == list(range(1, 51))
    assert catchup["hasMore"]
    # GET never silently marks a hidden/unfocused tab read.
    assert (await chat.unread_state(b, cid))["unreadCount"] == 65
    assert (await chat.read(b, cid, latest["boundarySequence"]))["unreadCount"] == 0
    assert (await chat.read(b, cid, 1))["lastReadSequence"] == 66
    await chat.send(a, send(cid, "after snapshot"))
    assert (await chat.unread_state(b, cid))["unreadCount"] == 1
    with pytest.raises(ApiError) as caught:
        await chat.read(b, cid, 68)
    assert caught.value.code == "INVALID_READ_BOUNDARY"
    await asyncio.gather(chat.read(b, cid, 66), chat.read(b, cid, 67), chat.read(b, cid, 5))
    assert (await chat.unread_state(b, cid))["lastReadSequence"] == 67


async def test_concurrent_incoming_does_not_get_read_past_snapshot(chat, directory):
    a, b, c = directory.user(), directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])
    await chat.send(a, send(cid))
    boundary = (await chat.history(b, cid, HistoryQuery()))["boundarySequence"]
    await asyncio.gather(chat.send(a, send(cid)), chat.read(b, cid, boundary))
    assert (await chat.unread_state(b, cid))["unreadCount"] == 1
    with pytest.raises(ApiError) as caught:
        await chat.read(c, cid, 1)
    assert caught.value.status == 404
