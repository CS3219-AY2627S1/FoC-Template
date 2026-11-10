# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Sockets connected to THIS instance, indexed by user."""

import asyncio
import json
import logging
import uuid
from typing import Any

from starlette.websockets import WebSocket

log = logging.getLogger(__name__)


def dumps(frame: dict[str, Any]) -> str:
    return json.dumps(frame, separators=(",", ":"), default=str)


class Connection:
    """One socket. Outbound frames go through a bounded queue drained by a single writer
    task, so sends never interleave and a slow client can't make the server buffer forever."""

    def __init__(self, websocket: WebSocket, user_id: uuid.UUID, queue_size: int):
        self.id = uuid.uuid4().hex
        self.websocket = websocket
        self.user_id = user_id
        self._queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=queue_size)
        self._close: tuple[int, str] | None = None

    @property
    def closing(self) -> bool:
        return self._close is not None

    def send_text(self, text: str) -> None:
        if self.closing:
            return
        try:
            self._queue.put_nowait(text)
        except asyncio.QueueFull:
            log.warning("closing slow connection %s (user %s)", self.id, self.user_id)
            self.close(1013, "client too slow", drop_pending=True)

    def send(self, frame: dict[str, Any]) -> None:
        self.send_text(dumps(frame))

    def close(self, code: int = 1000, reason: str = "", *, drop_pending: bool = False) -> None:
        """Stop accepting frames; the writer flushes what is queued (unless dropped),
        then closes."""
        if self.closing:
            return
        self._close = (code, reason)
        if drop_pending or self._queue.full():
            while not self._queue.empty():
                self._queue.get_nowait()
        self._queue.put_nowait(None)

    async def run_writer(self) -> None:
        try:
            while (item := await self._queue.get()) is not None:
                await self.websocket.send_text(item)
            code, reason = self._close or (1000, "")
            await self.websocket.close(code, reason)
        except Exception:  # socket already gone
            pass


class Hub:
    def __init__(self) -> None:
        self._by_user: dict[str, set[Connection]] = {}

    def add(self, conn: Connection) -> None:
        self._by_user.setdefault(str(conn.user_id), set()).add(conn)

    def remove(self, conn: Connection) -> None:
        conns = self._by_user.get(str(conn.user_id))
        if conns is not None:
            conns.discard(conn)
            if not conns:
                del self._by_user[str(conn.user_id)]

    def deliver(
        self, user_ids: list[str], frame: dict[str, Any], skip_conn: str | None = None
    ) -> None:
        text: str | None = None
        for uid in user_ids:
            for conn in list(self._by_user.get(uid, ())):
                if conn.id == skip_conn:
                    continue
                text = text or dumps(frame)
                conn.send_text(text)

    def close_all(self, code: int = 1001, reason: str = "server going away") -> None:
        for conns in list(self._by_user.values()):
            for conn in list(conns):
                conn.close(code, reason)

    @property
    def connection_count(self) -> int:
        return sum(len(c) for c in self._by_user.values())
