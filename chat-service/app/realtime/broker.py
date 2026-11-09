# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Gets frames to the right sockets, whichever instance they are connected to.

* LocalBroker: single instance, delivers straight to the local hub.
* AmqpBroker: every instance binds an exclusive queue to a fanout exchange; each published
  frame reaches all instances and each one delivers to the sockets it holds. Simple and
  fine for a handful of instances. At larger scale switch to a direct exchange with one
  routing key per user, bound only while that user is connected here.
"""

import json
import logging
from typing import Protocol

import aio_pika
from aio_pika.abc import AbstractIncomingMessage

from app.realtime.hub import Hub
from app.services.chat import Fanout

log = logging.getLogger(__name__)


class Broker(Protocol):
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def publish(self, fanouts: list[Fanout]) -> None: ...


class LocalBroker:
    def __init__(self, hub: Hub):
        self.hub = hub

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass

    async def publish(self, fanouts: list[Fanout]) -> None:
        for f in fanouts:
            self.hub.deliver(f.user_ids, f.frame, f.skip_conn)


class AmqpBroker:
    def __init__(self, hub: Hub, url: str, exchange: str):
        self.hub = hub
        self.url = url
        self.exchange_name = exchange
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    async def start(self) -> None:
        self._connection = await aio_pika.connect_robust(self.url)
        channel = await self._connection.channel()
        self._exchange = await channel.declare_exchange(
            self.exchange_name, aio_pika.ExchangeType.FANOUT
        )
        queue = await channel.declare_queue("", exclusive=True, auto_delete=True)
        await queue.bind(self._exchange)
        await queue.consume(self._on_message, no_ack=True)
        log.info("fan-out via RabbitMQ exchange %r", self.exchange_name)

    async def stop(self) -> None:
        if self._connection is not None:
            await self._connection.close()

    async def _on_message(self, message: AbstractIncomingMessage) -> None:
        try:
            data = json.loads(message.body)
            self.hub.deliver(data["user_ids"], data["frame"], data.get("skip_conn"))
        except Exception:
            log.exception("bad fan-out message")

    async def publish(self, fanouts: list[Fanout]) -> None:
        assert self._exchange is not None
        for f in fanouts:
            body = json.dumps(
                {"user_ids": f.user_ids, "frame": f.frame, "skip_conn": f.skip_conn}
            ).encode()
            try:
                await self._exchange.publish(
                    aio_pika.Message(body, content_type="application/json"), routing_key=""
                )
            except Exception:
                # The data is committed; clients recover it through gap detection / sync.
                log.exception("fan-out publish failed")
