# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-10, 2026-10-11
# Scope: Implemented WebSocket authentication, live event delivery, unread updates, and
# recovery.
# Author review: I validated correctness and added boundary checks where needed.

"""Transient per-process fan-out. Every protected frame is freshly authorized at write time."""

import asyncio
import contextlib
import json
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from uuid import UUID, uuid4

import aio_pika
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.correlation import correlation_id
from app.errors import ApiError, payload
from app.events import Envelope, MessageEvent, ReadEvent
from app.schemas import Authenticate, Ping, ReadCommand, Send

router = APIRouter()
logger = logging.getLogger("chat.live")


@dataclass(eq=False)
class Connection:
    socket: WebSocket
    principal: object
    queue: asyncio.Queue
    correlation_id: str = field(default_factory=lambda: str(uuid4()))
    seen: OrderedDict = field(default_factory=OrderedDict)
    sequences: dict = field(default_factory=dict)
    stopped: asyncio.Event = field(default_factory=asyncio.Event)
    close_code: int = 1013

    def offer(self, frame):
        if self.stopped.is_set():
            return
        try:
            self.queue.put_nowait(frame)
        except asyncio.QueueFull:
            self.close_code = 1013
            self.stopped.set()

    def remember(self, mid):
        self.seen[mid] = None
        while len(self.seen) > 2048:
            self.seen.popitem(last=False)


class Hub:
    def __init__(self, chat, settings):
        self.chat, self.settings = chat, settings
        self.connections = set()
        self.subscribed = False

    def sync(self):
        for connection in tuple(self.connections):
            connection.offer({"type": "sync.required", "reason": "delivery_subscription_changed"})

    async def event(self, envelope):
        if envelope.eventType == "chat.unread.updated.v1":
            event = ReadEvent.model_validate(envelope.data)
            # Only the reader receives this update; it is never a sender-facing receipt.
            await self.chat.unread_state(event.userId, event.conversationId)
            for connection in tuple(self.connections):
                if connection.principal.user_id == event.userId:
                    connection.offer(event)
            return
        event = MessageEvent.model_validate(envelope.data)
        users = await self.chat.event_participants(event)
        for connection in tuple(self.connections):
            if connection.principal.user_id in users:
                connection.offer(event)

    async def consume(self):
        # Explicit reconnect loop creates a new exclusive queue for this API process each time.
        while True:
            connection = None
            try:
                if not self.settings.rabbitmq_url:
                    await asyncio.sleep(2)
                    continue
                connection = await aio_pika.connect(
                    self.settings.rabbitmq_url.get_secret_value(), timeout=3
                )
                channel = await connection.channel()
                await channel.set_qos(prefetch_count=32)
                exchange = await channel.declare_exchange(
                    self.settings.exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
                )
                queue = await channel.declare_queue(
                    "",
                    exclusive=True,
                    auto_delete=True,
                )
                await queue.bind(exchange, routing_key="chat.#")
                self.subscribed = True
                self.sync()
                async with queue.iterator() as iterator:
                    async for incoming in iterator:
                        async with incoming.process(requeue=False):
                            try:
                                if len(incoming.body) > 4096:
                                    raise ValueError()
                                await self.event(Envelope.model_validate_json(incoming.body))
                            except (ValueError, ValidationError):
                                logger.warning("invalid delivery event discarded")
                            except ApiError:
                                self.sync()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("delivery subscription unavailable")
            finally:
                self.subscribed = False
                self.sync()
                if connection and not connection.is_closed:
                    with contextlib.suppress(Exception):
                        await connection.close()
            await asyncio.sleep(1)


async def writer(connection, chat, identity):
    while True:
        item = await connection.queue.get()
        if isinstance(item, ReadEvent):
            await identity.authenticate(connection.principal.token)
            if item.userId == connection.principal.user_id:
                state = await chat.unread_state(item.userId, item.conversationId)
                await connection.socket.send_json({"type": "unread.updated", **state})
        elif isinstance(item, MessageEvent):
            if str(item.messageId) in connection.seen:
                continue
            await identity.authenticate(connection.principal.token)
            stored = await chat.live_message(connection.principal.user_id, item)
            if stored is None:
                # Consume blocked/deleted events. Do not hold them for an unblock replay.
                connection.remember(str(item.messageId))
                continue
            cid, seq = stored["conversationId"], stored["sequence"]
            previous = connection.sequences.get(cid, 0)
            if seq > previous + 1:
                await connection.socket.send_json(
                    {"type": "sync.required", "conversationId": cid, "reason": "sequence_gap"}
                )
            connection.sequences[cid] = max(previous, seq)
            # Bound metadata as well as payload buffers; reconnect/catch-up stays authoritative.
            if len(connection.sequences) > 2048:
                connection.sequences.clear()
            await connection.socket.send_json({"type": "message.created", "message": stored})
            connection.remember(stored["messageId"])
        else:
            # Durable acceptance survives blocking changes; the caller still needs a session.
            if item["type"] in ("message.accepted", "unread.updated"):
                await identity.authenticate(connection.principal.token)
            await connection.socket.send_json(item)


async def reader(connection, chat, identity):
    while True:
        raw = await connection.socket.receive_text()
        request_id = None
        try:
            if len(raw) > 65536:
                raise ValueError()
            data = json.loads(raw)
            if isinstance(data, dict):
                with contextlib.suppress(ValueError, TypeError, AttributeError):
                    request_id = str(UUID(data.get("requestId")))
            kind = data.get("type") if isinstance(data, dict) else None
            model = {"message.send": Send, "conversation.read": ReadCommand, "ping": Ping}.get(kind)
            if model is None:
                raise ValueError()
            command = model.model_validate(data)
            principal = await identity.authenticate(connection.principal.token)
            if isinstance(command, Send):
                stored = await chat.send(principal.user_id, command)
                connection.offer(
                    {
                        "type": "message.accepted",
                        "requestId": str(command.requestId),
                        "message": stored,
                    }
                )
            elif isinstance(command, ReadCommand):
                state = await chat.read(
                    principal.user_id, command.conversationId, command.upToSequence
                )
                connection.offer(
                    {"type": "unread.updated", "requestId": str(command.requestId), **state}
                )
            else:
                connection.offer({"type": "pong", "requestId": str(command.requestId)})
        except (ValueError, ValidationError):
            connection.offer(
                {
                    "type": "error",
                    "requestId": request_id,
                    **payload(
                        ApiError(422, "VALIDATION_ERROR", "Invalid command."),
                        connection.correlation_id,
                    ),
                }
            )
        except ApiError as error:
            if error.status in (401, 503):
                raise
            connection.offer(
                {
                    "type": "error",
                    "requestId": request_id,
                    **payload(error, connection.correlation_id),
                }
            )


async def monitor(connection, identity, settings):
    while True:
        remaining = connection.principal.expires_at - time.time()
        if remaining <= 0:
            raise ApiError(401, "INVALID_SESSION", "Session expired.")
        await asyncio.sleep(min(remaining, settings.websocket_session_check_seconds))
        await identity.authenticate(connection.principal.token)


@router.websocket("/v1/chat/ws")
async def websocket(socket: WebSocket):
    trace_id = str(uuid4())
    context_token = correlation_id.set(trace_id)
    settings, identity = socket.app.state.settings, socket.app.state.identity
    if socket.headers.get("origin") not in settings.allowed_origins or socket.query_params:
        await socket.close(code=1008)
        correlation_id.reset(context_token)
        return
    await socket.accept()
    connection = None
    tasks = []
    code = 1000
    try:
        frame = await asyncio.wait_for(
            socket.receive_text(), timeout=settings.websocket_auth_timeout_seconds
        )
        if len(frame) > 10000:
            raise ValueError()
        auth = Authenticate.model_validate_json(frame)
        principal = await identity.authenticate(auth.accessToken)
        connection = Connection(socket, principal, asyncio.Queue(settings.outgoing_buffer_size))
        connection.correlation_id = trace_id
        socket.app.state.hub.connections.add(connection)
        connection.offer(
            {
                "type": "ready",
                "userId": str(principal.user_id),
                "correlationId": connection.correlation_id,
            }
        )
        tasks = [
            asyncio.create_task(reader(connection, socket.app.state.chat, identity)),
            asyncio.create_task(writer(connection, socket.app.state.chat, identity)),
            asyncio.create_task(monitor(connection, identity, settings)),
            asyncio.create_task(connection.stopped.wait()),
        ]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
        code = connection.close_code
    except (ValidationError, ValueError, TimeoutError):
        code = 4401
    except ApiError as error:
        code = 4401 if error.status == 401 else 1013
    except WebSocketDisconnect:
        pass
    except Exception:
        code = 1013
        logger.warning("websocket processing interrupted")
    finally:
        if connection:
            socket.app.state.hub.connections.discard(connection)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        with contextlib.suppress(RuntimeError, WebSocketDisconnect):
            await socket.close(code=code)
        correlation_id.reset(context_token)
