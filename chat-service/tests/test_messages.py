# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10
# Scope: Added or extended tests for message acceptance, deduplication, and blocking.
# Author review: I validated correctness and added boundary checks where needed.

import asyncio
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import text

from app.errors import ApiError
from app.schemas import HistoryQuery, Send


def send(cid, value="hello", client_id=None):
    return Send(
        type="message.send",
        requestId=uuid4(),
        conversationId=cid,
        clientMessageId=client_id or uuid4(),
        text=value,
    )


@pytest.mark.parametrize("value", ["", " \t\n", "x" * 4097, " " + "x" * 4096, "\x00", "\ud800"])
def test_reject_raw_text(value):
    with pytest.raises(ValidationError):
        send(uuid4(), value)


@pytest.mark.parametrize("length", [4095, 4096])
def test_codepoints_and_internal_whitespace(length):
    assert send(uuid4(), "😀" * length).text == "😀" * length
    assert send(uuid4(), " \tA  \n\t😀 \n").text == "A  \n\t😀"


@pytest.mark.integration
async def test_concurrent_retries_order_and_blocking(chat, database, directory):
    a, b = directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])
    command = send(cid)
    results = await asyncio.gather(*[chat.send(a, command) for _ in range(12)])
    assert len({r["messageId"] for r in results}) == 1
    async with database.transaction() as session:
        assert (
            await session.execute(
                text(
                    "SELECT count(*) FROM chat_service.outbox_events "
                    "WHERE payload->>'conversationId'=:c"
                ),
                {"c": str(cid)},
            )
        ).scalar_one() == 1
    with pytest.raises(ApiError) as caught:
        await chat.send(a, send(cid, "edited", command.clientMessageId))
    assert caught.value.code == "RETRY_ID_CONFLICT"
    await asyncio.gather(*[chat.send(a, send(cid, str(i))) for i in range(15)])
    rows = (await chat.history(b, cid, HistoryQuery()))["items"]
    assert [r["sequence"] for r in rows] == list(range(1, 17))
    await chat.set_block(b, a, True)
    assert await chat.send(a, command) == results[0]  # lost acceptance, now blocked
    for sender in (a, b):
        with pytest.raises(ApiError) as caught:
            await chat.send(sender, send(cid))
        assert caught.value.code == "MESSAGING_BLOCKED"
    await chat.set_block(a, b, True)
    await chat.set_block(b, a, False)
    with pytest.raises(ApiError):
        await chat.send(a, send(cid))
    await chat.set_block(a, b, False)
    assert (await chat.send(b, send(cid)))["sequence"] == 17
    directory.people[b]["accountStatus"] = "DELETED"
    with pytest.raises(ApiError) as caught:
        await chat.send(a, send(cid))
    assert caught.value.code == "RECIPIENT_UNAVAILABLE"
    assert len((await chat.history(a, cid, HistoryQuery()))["items"]) == 17


@pytest.mark.integration
async def test_message_outbox_rollback(chat, database, directory, monkeypatch):
    a, b = directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])

    async def fail(*args):
        raise RuntimeError("injected outbox failure")

    monkeypatch.setattr("app.service.enqueue", fail)
    with pytest.raises(RuntimeError):
        await chat.send(a, send(cid))
    assert (await chat.history(a, cid, HistoryQuery()))["boundarySequence"] == 0
    async with database.transaction() as session:
        assert (
            await session.execute(
                text("SELECT count(*) FROM chat_service.messages WHERE conversation_id=:c"),
                {"c": cid},
            )
        ).scalar_one() == 0


@pytest.mark.integration
async def test_block_and_send_serialization(chat, database, directory):
    a, b = directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])
    for _i in range(5):
        await chat.set_block(b, a, False)
        result = await asyncio.gather(
            chat.send(a, send(cid)), chat.set_block(b, a, True), return_exceptions=True
        )
        assert isinstance(result[0], dict) or isinstance(result[0], ApiError)
        with pytest.raises(ApiError):
            await chat.send(a, send(cid))
    # A block completed before pair creation denies the creation entirely.
    c = directory.user()
    await chat.set_block(a, c, True)
    with pytest.raises(ApiError):
        await chat.create(a, c)


@pytest.mark.integration
async def test_retry_key_across_conversations_and_outsider(chat, directory):
    a, b, c = directory.user(), directory.user(), directory.user()
    ab = UUID((await chat.create(a, b))["conversationId"])
    ac = UUID((await chat.create(a, c))["conversationId"])
    client = uuid4()
    results = await asyncio.gather(
        chat.send(a, send(ab, client_id=client)),
        chat.send(a, send(ac, client_id=client)),
        return_exceptions=True,
    )
    assert sum(isinstance(r, dict) for r in results) == 1
    assert [r for r in results if isinstance(r, ApiError)][0].code == "RETRY_ID_CONFLICT"
    with pytest.raises(ApiError) as caught:
        await chat.send(c, send(ab))
    assert caught.value.status == 404
