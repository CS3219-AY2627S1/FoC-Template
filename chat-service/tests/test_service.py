# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Service-level tests that need direct database access (outbox, purge, concurrency)."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db import make_engine, make_sessionmaker
from app.models.conversations import Conversation
from app.models.messages import Message
from app.models.outbox import Outbox
from app.realtime.broker import LocalBroker
from app.realtime.hub import Hub
from app.schemas.conversations import CreateConversationBody, MemberSpec
from app.schemas.frames import SendData
from app.services.outbox import OutboxRelay
from app.state import AppState
from tests.conftest import make_settings, truncate_all


@pytest.fixture
async def state() -> AsyncIterator[AppState]:
    settings = make_settings()
    await truncate_all()
    engine = make_engine(settings.database_url)
    hub = Hub()
    yield AppState(settings, make_sessionmaker(engine), hub, LocalBroker(hub))
    await engine.dispose()


async def _conversation(state: AppState, *members: uuid.UUID, **kw: Any) -> str:
    body = CreateConversationBody(members=[MemberSpec(user_id=m) for m in members], **kw)
    conv, _ = await state.run(lambda s: s.create_conversation(body))
    return conv["id"]


async def test_concurrent_sends_get_distinct_consecutive_seqs(state: AppState) -> None:
    alice = uuid.uuid4()
    conv = uuid.UUID(await _conversation(state, alice))

    async def one(i: int) -> int:
        data = SendData(conversation_id=conv, client_msg_id=uuid.uuid4(), body=f"m{i}")
        return (await state.run(lambda s: s.send(alice, data))).message["seq"]

    seqs = await asyncio.gather(*(one(i) for i in range(20)))
    assert sorted(seqs) == list(range(1, 21))


async def test_concurrent_duplicate_sends_store_one_message(state: AppState) -> None:
    alice = uuid.uuid4()
    conv = uuid.UUID(await _conversation(state, alice))
    data = SendData(conversation_id=conv, client_msg_id=uuid.uuid4(), body="double tap")
    results = await asyncio.gather(*(state.run(lambda s: s.send(alice, data)) for _ in range(5)))
    assert len({r.message["id"] for r in results}) == 1
    async with state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(Message)) == 1
        assert await session.scalar(select(Conversation.last_seq)) == 1


async def test_concurrent_get_or_create_by_unique_key(state: AppState) -> None:
    ids = await asyncio.gather(
        *(_conversation(state, uuid.uuid4(), unique_key="order:1") for _ in range(5))
    )
    assert len(set(ids)) == 1


class FakePublisher:
    def __init__(self) -> None:
        self.events: list[tuple[int, str, dict[str, Any]]] = []

    async def start(self) -> None: ...
    async def stop(self) -> None: ...

    async def publish(self, event_id: int, topic: str, body: dict[str, Any]) -> None:
        self.events.append((event_id, topic, body))


async def test_outbox_is_written_in_transaction_and_relayed_once(state: AppState) -> None:
    alice = uuid.uuid4()
    conv = uuid.UUID(await _conversation(state, alice, metadata={"order_id": "42"}))
    await state.run(
        lambda s: s.send(
            alice, SendData(conversation_id=conv, client_msg_id=uuid.uuid4(), body="x")
        )
    )

    publisher = FakePublisher()
    relay = OutboxRelay(state.sessionmaker, state.settings, publisher)
    assert await relay.run_once() == 2
    assert [t for _, t, _ in publisher.events] == ["conversation.created", "message.created"]
    created = publisher.events[1][2]["payload"]
    assert created["message"]["body"] == "x" and created["member_ids"] == [str(alice)]
    assert await relay.run_once() == 0  # marked published

    async with state.sessionmaker() as session:
        assert (
            await session.scalar(
                select(func.count()).select_from(Outbox).where(Outbox.published_at.is_(None))
            )
            == 0
        )


async def test_failed_transaction_writes_no_outbox_rows(state: AppState) -> None:
    from app.errors import ChatError

    alice = uuid.uuid4()
    conv = uuid.UUID(await _conversation(state, alice))
    await state.run(lambda s: s.close(conv))
    async with state.sessionmaker() as session:
        before = await session.scalar(select(func.count()).select_from(Outbox))
    with pytest.raises(ChatError):
        await state.run(
            lambda s: s.send(
                alice, SendData(conversation_id=conv, client_msg_id=uuid.uuid4(), body="x")
            )
        )
    async with state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(Outbox)) == before


async def test_purge_deletes_expired_conversations(state: AppState) -> None:
    alice = uuid.uuid4()
    expired = await _conversation(
        state, alice, purge_after=datetime.now(UTC) - timedelta(minutes=1)
    )
    kept = await _conversation(state, alice, purge_after=datetime.now(UTC) + timedelta(days=1))
    assert await state.run(lambda s: s.purge_expired()) == 1
    sm: async_sessionmaker[AsyncSession] = state.sessionmaker
    async with sm() as session:
        ids = {str(i) for i in await session.scalars(select(Conversation.id))}
    assert ids == {kept}
    assert expired not in ids


async def test_purge_loop_helpers_drop_expired_tickets_and_old_inbox_ids(state: AppState) -> None:
    from sqlalchemy import update

    from app.integrations.order_events import prune_processed_events
    from app.models.processed_events import ProcessedEvent
    from app.models.ws_tickets import WsTicket
    from app.services import tickets

    async with state.sessionmaker() as session, session.begin():
        await tickets.issue(session, uuid.uuid4(), ttl_s=0)
        await tickets.issue(session, uuid.uuid4(), ttl_s=60)
        session.add_all(
            [
                ProcessedEvent(event_id="old", event_type="OrderAccepted"),
                ProcessedEvent(event_id="new", event_type="OrderAccepted"),
            ]
        )
    async with state.sessionmaker() as session, session.begin():
        await session.execute(
            update(ProcessedEvent)
            .where(ProcessedEvent.event_id == "old")
            .values(processed_at=datetime.now(UTC) - timedelta(days=31))
        )
    async with state.sessionmaker() as session, session.begin():
        assert await tickets.delete_expired(session) == 1
        await prune_processed_events(session)
    async with state.sessionmaker() as session:
        assert await session.scalar(select(func.count()).select_from(WsTicket)) == 1
        assert list(await session.scalars(select(ProcessedEvent.event_id))) == ["new"]
