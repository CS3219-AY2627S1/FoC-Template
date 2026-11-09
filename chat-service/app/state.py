# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, TypeVar

from fastapi import Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.errors import ChatError
from app.realtime.broker import Broker
from app.realtime.hub import Hub
from app.services.chat import ChatService

if TYPE_CHECKING:
    from app.services.photos import PhotoStore

T = TypeVar("T")


@dataclass
class AppState:
    settings: Settings
    sessionmaker: async_sessionmaker[AsyncSession]
    hub: Hub
    broker: Broker
    # Photo storage; None when photo sharing is switched off (no bucket configured).
    photos: PhotoStore | None = None

    async def run(self, op: Callable[[ChatService], Awaitable[T]]) -> T:
        """Run `op` in one transaction, then publish its fan-outs (only after commit).

        A unique-constraint race (two identical sends at once, two creators of the same
        unique_key) is retried once; the retry then sees the committed row."""
        for attempt in range(2):
            try:
                async with self.sessionmaker() as session, session.begin():
                    service = ChatService(session, self.settings)
                    result = await op(service)
                break
            except IntegrityError as exc:
                if attempt == 1:
                    raise ChatError(
                        "conflict", "request conflicts with existing data", 409
                    ) from exc
        await self.broker.publish(service.fanouts)
        return result


def get_state(request: Request) -> AppState:
    return request.app.state.chat
