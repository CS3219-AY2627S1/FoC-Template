# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Added or extended tests for outbox retry and recovery.
# Author review: I validated correctness and added boundary checks where needed.

import asyncio
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text

from app.config import Settings
from app.outbox import Publisher
from tests.test_messages import send

pytestmark = pytest.mark.integration


async def test_expired_lease_and_stale_worker_cannot_finish(chat, database, directory):
    a, b = directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])
    stored = await chat.send(a, send(cid))
    token = uuid4()
    async with database.transaction() as session:
        row = (
            (
                await session.execute(
                    text("""UPDATE chat_service.outbox_events
            SET lease_token=:token,lease_until=now()-interval '1 second'
            WHERE payload->>'messageId'=:mid RETURNING *"""),
                    {"token": token, "mid": stored["messageId"]},
                )
            )
            .mappings()
            .one()
        )
    publisher = Publisher(Settings(_env_file=None), database)
    # An old worker that loses its lease cannot mark a new worker's event published.
    async with database.transaction() as session:
        await session.execute(
            text("UPDATE chat_service.outbox_events SET lease_token=:token WHERE id=:id"),
            {"token": uuid4(), "id": row["id"]},
        )
    await publisher.finish(row, True)
    async with database.transaction() as session:
        assert (
            await session.execute(
                text("SELECT published_at FROM chat_service.outbox_events WHERE id=:id"),
                {"id": row["id"]},
            )
        ).scalar_one() is None
    claimed = []
    for _ in range(500):
        current = await publisher.claim()
        if current is None:
            break
        claimed.append(current)
        if current["id"] == row["id"]:
            assert current["lease_token"] != token
            break
    assert any(c["id"] == row["id"] for c in claimed)
    for current in claimed:
        await publisher.finish(current, False)


async def test_publication_failure_retains_message_and_schedules_retry(
    chat, database, directory, monkeypatch
):
    a, b = directory.user(), directory.user()
    cid = UUID((await chat.create(a, b))["conversationId"])
    stored = await chat.send(a, send(cid))
    publisher = Publisher(Settings(_env_file=None), database)
    async with database.transaction() as session:
        row = dict(
            (
                await session.execute(
                    text(
                        "SELECT * FROM chat_service.outbox_events WHERE payload->>'messageId'=:mid"
                    ),
                    {"mid": stored["messageId"]},
                )
            )
            .mappings()
            .one()
        )
    row.update(lease_token=uuid4(), attempts=1)
    async with database.transaction() as session:
        await session.execute(
            text("UPDATE chat_service.outbox_events SET lease_token=:token WHERE id=:id"),
            {"token": row["lease_token"], "id": row["id"]},
        )

    async def claim():
        return row

    async def fail(_):
        raise TimeoutError("uncertain broker confirmation")

    monkeypatch.setattr(publisher, "claim", claim)
    monkeypatch.setattr(publisher, "publish", fail)
    await publisher.run_once()
    async with database.transaction() as session:
        event = (
            (
                await session.execute(
                    text(
                        "SELECT *,next_attempt_at>now() AS delayed FROM "
                        "chat_service.outbox_events WHERE id=:id"
                    ),
                    {"id": row["id"]},
                )
            )
            .mappings()
            .one()
        )
        assert event["published_at"] is None and event["lease_token"] is None and event["delayed"]
        assert (
            await session.execute(
                text("SELECT count(*) FROM chat_service.messages WHERE id=:id"),
                {"id": UUID(stored["messageId"])},
            )
        ).scalar_one() == 1
    await asyncio.sleep(0)  # no broker/database sleeps required
