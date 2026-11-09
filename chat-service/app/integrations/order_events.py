# AI-influenced: order-event consumer written with Claude (Opus 5.5); see ai/usage-log.md.
"""Optional FoC integration: order lifecycle events drive order chats.

The chat core knows nothing about orders. This adapter consumes the order-service's
facts from ``foc.order.events`` and turns them into the same generic operations other
backends reach through ``/internal`` (get-or-create by ``unique_key``, add/remove
member, system message, close). It is enabled with ``CHAT_ORDER_EVENTS_ENABLED=true``.

| Order event        | Effect on the conversation ``order:<order_id>``                      |
| ------------------ | -------------------------------------------------------------------- |
| OrderAccepted      | create it with requester + courier (or add the new courier without   |
|                    | earlier history after a withdrawal); system ``order.accepted``       |
| OrderPickedUp      | system ``order.picked_up`` (creates the chat if it is missing)       |
| OrderDelivered     | system ``order.delivered`` (creates the chat if it is missing)       |
| CourierWithdrawn   | system ``order.courier_withdrawn``, then the courier is removed      |
| OrderApproved      | system ``order.completed``, closed (read-only)                       |
| OrderCancelled     | system ``order.cancelled`` with the reason, closed                   |
| OrderExpired       | closed if it exists (an expired order never had a courier)           |

Closed chats are kept unless ``CHAT_CLOSED_RETENTION_DAYS`` is set, in which case closing
also schedules the purge (``purge_after``).

Each event is applied exactly once: its id goes into ``processed_events`` in the same
transaction as its effects. One consumer is active at a time (single-active-consumer
queue), so events are applied in the order the order-service published them.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import aio_pika
from aio_pika.abc import AbstractIncomingMessage
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ChatError
from app.repositories import processed_events as processed_event_repo
from app.schemas.conversations import (
    AddMemberBody,
    CreateConversationBody,
    MemberSpec,
    UpdateConversationBody,
)
from app.services.chat import ChatService
from app.state import AppState
from foc_shared.events import OrderEventType

log = logging.getLogger(__name__)

# OrderApproved is the order-service's completion fact (it has no shared enum member).
ORDER_APPROVED = "OrderApproved"
REQUESTER, COURIER = "requester", "courier"


class OrderFact(BaseModel):
    """The fields this adapter reads. Every order fact it binds to carries them
    (``foc_shared.events.OrderEvent`` and the order-service's ``OrderApprovedEvent``)."""

    model_config = ConfigDict(extra="ignore")

    event_type: str
    order_id: str
    requester_id: str
    courier_id: str | None = None
    reason: str | None = None


def conversation_key(order_id: str) -> str:
    return f"order:{order_id}"


# ---------------------------------------------------------------------------------------
# Mapping (runs inside one ChatService transaction)


async def _existing(s: ChatService, fact: OrderFact) -> dict[str, Any] | None:
    found = await s.find_conversations(unique_key=conversation_key(fact.order_id), metadata=None)
    return found[0] if found else None


async def _ensure(s: ChatService, fact: OrderFact) -> dict[str, Any] | None:
    """The order chat with the event's courier as a member (created if missing)."""
    if not fact.courier_id:
        return await _existing(s, fact)
    courier = uuid.UUID(fact.courier_id)
    view, created = await s.create_conversation(
        CreateConversationBody(
            kind="group",
            unique_key=conversation_key(fact.order_id),
            title=f"Order {fact.order_id[:8]}",
            metadata={"order_id": fact.order_id},
            members=[
                MemberSpec(user_id=uuid.UUID(fact.requester_id), label=REQUESTER),
                MemberSpec(user_id=courier, label=COURIER),
            ],
        )
    )
    if created or view["closed_at"]:
        return view
    if str(courier) not in {m["user_id"] for m in view["members"]}:
        # A new courier after a withdrawal does not see the previous courier's messages.
        view = await s.add_member(
            uuid.UUID(view["id"]),
            AddMemberBody(user_id=courier, label=COURIER, include_history=False),
        )
    return view


async def _post(s: ChatService, view: dict[str, Any] | None, key: str, **params: Any) -> None:
    if view is not None and not view["closed_at"]:
        await s.post_system_message(uuid.UUID(view["id"]), key, params)


async def _finish(s: ChatService, fact: OrderFact, key: str, retention_days: int) -> None:
    view = await _existing(s, fact)
    if view is None or view["closed_at"]:
        return
    params = {"order_id": fact.order_id}
    if fact.reason:
        params["reason"] = fact.reason
    await _post(s, view, key, **params)
    conv_id = uuid.UUID(view["id"])
    await s.close(conv_id)
    if retention_days > 0:
        purge_after = datetime.now(UTC) + timedelta(days=retention_days)
        await s.update_conversation(conv_id, UpdateConversationBody(purge_after=purge_after))


async def _accepted(s: ChatService, fact: OrderFact, _: int) -> None:
    view = await _ensure(s, fact)
    await _post(s, view, "order.accepted", order_id=fact.order_id, courier_id=fact.courier_id)


async def _picked_up(s: ChatService, fact: OrderFact, _: int) -> None:
    await _post(s, await _ensure(s, fact), "order.picked_up", order_id=fact.order_id)


async def _delivered(s: ChatService, fact: OrderFact, _: int) -> None:
    await _post(s, await _ensure(s, fact), "order.delivered", order_id=fact.order_id)


async def _withdrawn(s: ChatService, fact: OrderFact, _: int) -> None:
    view = await _existing(s, fact)
    if view is None or view["closed_at"] or not fact.courier_id:
        return
    await _post(
        s, view, "order.courier_withdrawn", order_id=fact.order_id, courier_id=fact.courier_id
    )
    if fact.courier_id in {m["user_id"] for m in view["members"]}:
        await s.remove_member(uuid.UUID(view["id"]), uuid.UUID(fact.courier_id))


async def _completed(s: ChatService, fact: OrderFact, days: int) -> None:
    await _finish(s, fact, "order.completed", days)


async def _cancelled(s: ChatService, fact: OrderFact, days: int) -> None:
    await _finish(s, fact, "order.cancelled", days)


async def _expired(s: ChatService, fact: OrderFact, days: int) -> None:
    await _finish(s, fact, "order.expired", days)


Handler = Callable[[ChatService, OrderFact, int], Awaitable[None]]
HANDLERS: dict[str, Handler] = {
    OrderEventType.ORDER_ACCEPTED.value: _accepted,
    OrderEventType.ORDER_PICKED_UP.value: _picked_up,
    OrderEventType.ORDER_DELIVERED.value: _delivered,
    OrderEventType.COURIER_WITHDRAWN.value: _withdrawn,
    ORDER_APPROVED: _completed,
    # Declared in foc_shared but not published today; handled the same way if it ever is.
    OrderEventType.ORDER_COMPLETED.value: _completed,
    OrderEventType.ORDER_CANCELLED.value: _cancelled,
    OrderEventType.ORDER_EXPIRED.value: _expired,
}
BINDINGS: tuple[str, ...] = tuple(HANDLERS)


async def apply_order_event(
    s: ChatService, fact: OrderFact, *, event_id: str, retention_days: int
) -> bool:
    """Apply one fact. Returns False when this event id was already applied."""
    if not await processed_event_repo.record(s.session, event_id, fact.event_type):
        return False
    handler = HANDLERS.get(fact.event_type)
    if handler is not None:
        await handler(s, fact, retention_days)
    return True


async def prune_processed_events(session: AsyncSession, keep_days: int = 30) -> None:
    """Redeliveries arrive within minutes; ids older than this are not needed."""
    await processed_event_repo.prune(session, keep_days)


# ---------------------------------------------------------------------------------------
# RabbitMQ consumer


class OrderEventConsumer:
    """Long-running consumer started from the app lifespan. Reconnects on failure."""

    def __init__(self, state: AppState) -> None:
        self.state = state
        self.settings = state.settings

    async def run(self) -> None:
        while True:
            try:
                connection = await aio_pika.connect_robust(self.settings.rabbitmq_url)
                async with connection:
                    await self._consume(connection)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("order event consumer failed; reconnecting in 5s")
                await asyncio.sleep(5)

    async def _consume(self, connection: aio_pika.abc.AbstractRobustConnection) -> None:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=1)
        exchange = await channel.declare_exchange(
            self.settings.order_events_exchange, aio_pika.ExchangeType.TOPIC, durable=True
        )
        queue = await channel.declare_queue(
            self.settings.chat_order_events_queue,
            durable=True,
            arguments={"x-single-active-consumer": True},
        )
        for routing_key in BINDINGS:
            await queue.bind(exchange, routing_key=routing_key)
        log.info("consuming %s from %r", ", ".join(BINDINGS), self.settings.order_events_exchange)
        async with queue.iterator() as messages:
            async for message in messages:
                await self.handle(message)

    async def handle(self, message: AbstractIncomingMessage) -> None:
        try:
            fact = OrderFact.model_validate_json(message.body)
        except ValidationError:
            log.warning("dropping malformed order event %s", message.message_id)
            await message.reject(requeue=False)
            return
        # The order-service sets message_id to its outbox event id.
        event_id = message.message_id or hashlib.sha256(message.body).hexdigest()
        days = self.settings.chat_closed_retention_days
        try:
            await self.state.run(
                lambda s: apply_order_event(s, fact, event_id=event_id, retention_days=days)
            )
        except ChatError as exc:
            if exc.code == "conflict":  # concurrent write; try again
                await self._retry_later(message)
                return
            log.warning("order event %s ignored: %s", fact.event_type, exc.message)
        except ValueError:
            log.warning("order event %s has a non-UUID user id; ignored", fact.event_type)
        except Exception:
            log.exception("order event %s failed; will retry", fact.event_type)
            await self._retry_later(message)
            return
        await message.ack()

    @staticmethod
    async def _retry_later(message: AbstractIncomingMessage) -> None:
        await asyncio.sleep(1)  # avoid a hot redelivery loop while e.g. the DB is down
        await message.nack(requeue=True)
