# AI-influenced: ported from the standalone chat-service and switched to ticket
# authentication with Claude (Opus 5.5); see ai/usage-log.md.
"""The WebSocket endpoint: ticket handshake, frame dispatch, rate limiting, re-auth.

Connect with ``/chat/ws?ticket=<one-time ticket from POST /chat/ws-ticket>``. A missing,
used or expired ticket is refused before the upgrade (the client sees HTTP 403), so an
unauthenticated socket never exists.

Wire format: every frame is a JSON object with a `type`. Client requests may carry a
`req_id`; the reply (`ack` or `error`) echoes it. Server payloads live under `data`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter, ValidationError

from app.errors import ChatError
from app.realtime.hub import Connection
from app.schemas.frames import (
    ClientFrame,
    DeleteFrame,
    DeliveredFrame,
    EditFrame,
    PingFrame,
    ReadFrame,
    SendFrame,
    TypingFrame,
)
from app.services import tickets
from app.state import AppState

log = logging.getLogger(__name__)
router = APIRouter()
_frames: TypeAdapter[Any] = TypeAdapter(ClientFrame)

# Application close codes (4000-4999 are reserved for applications).
CLOSE_AUTH_FAILED = 4001  # policy: ticket rejected (sent as HTTP 403 before the upgrade)
CLOSE_SESSION_EXPIRED = 4002  # re-authenticate: fetch a new ticket and reconnect
CLOSE_RATE_LIMITED = 4008


class TokenBucket:
    def __init__(self, rate: float, burst: int):
        self.rate, self.capacity = rate, float(burst)
        self.tokens, self.updated = float(burst), time.monotonic()

    def take(self) -> bool:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


async def _expire(conn: Connection, after_s: float) -> None:
    await asyncio.sleep(after_s)
    conn.close(CLOSE_SESSION_EXPIRED, "session expired, reconnect with a new ticket")


@router.websocket("/chat/ws")
async def websocket_endpoint(websocket: WebSocket, ticket: str = Query(default="")) -> None:
    state: AppState = websocket.app.state.chat
    settings = state.settings
    async with state.sessionmaker() as session, session.begin():
        user_id = await tickets.redeem(session, ticket)
    if user_id is None:
        await websocket.close(CLOSE_AUTH_FAILED, "invalid or expired ticket")
        return
    await websocket.accept()

    conn = Connection(websocket, user_id, settings.outbound_queue_size)
    state.hub.add(conn)
    writer = asyncio.create_task(conn.run_writer())
    max_s = settings.chat_ws_max_session_s
    expiry = asyncio.create_task(_expire(conn, max_s)) if max_s > 0 else None
    conn.send(
        {
            "type": "ready",
            "data": {
                "user_id": str(user_id),
                "connection_id": conn.id,
                "server_time": datetime.now(UTC).isoformat(),
            },
        }
    )

    session_ = _Session(state, conn)
    try:
        while not conn.closing:
            raw = await websocket.receive_text()
            await session_.handle(raw)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("websocket loop crashed")
    finally:
        state.hub.remove(conn)
        conn.close()
        if expiry:
            expiry.cancel()
        try:
            await asyncio.wait_for(writer, timeout=2)
        except (TimeoutError, asyncio.CancelledError):
            writer.cancel()


class _Session:
    def __init__(self, state: AppState, conn: Connection):
        self.state = state
        self.conn = conn
        self.user_id = conn.user_id
        self.limiter = TokenBucket(state.settings.send_rate_per_s, state.settings.send_burst)
        self.violations = 0
        self.last_typing: dict[str, float] = {}

    def _error(self, req_id: str | None, code: str, message: str) -> None:
        self.conn.send(
            {"type": "error", "req_id": req_id, "data": {"code": code, "message": message}}
        )

    def _ack(self, req_id: str | None, data: dict[str, Any]) -> None:
        self.conn.send({"type": "ack", "req_id": req_id, "data": data})

    async def handle(self, raw: str) -> None:
        if not self.limiter.take():
            self.violations += 1
            self._error(_req_id_of(raw), "rate_limited", "too many frames, slow down")
            if self.violations >= self.state.settings.max_rate_violations:
                self.conn.close(CLOSE_RATE_LIMITED, "rate limit exceeded")
            return
        try:
            frame = _frames.validate_json(raw)
        except ValidationError as exc:
            first = exc.errors()[0]
            where = ".".join(str(p) for p in first.get("loc", ()))
            self._error(_req_id_of(raw), "invalid_payload", f"{where}: {first['msg']}")
            return
        try:
            await self._dispatch(frame)
        except ChatError as exc:
            self._error(getattr(frame, "req_id", None), exc.code, exc.message)
        except Exception:
            log.exception("frame %s failed", frame.type)
            self._error(getattr(frame, "req_id", None), "internal", "internal error")

    async def _dispatch(self, frame: Any) -> None:
        run, uid = self.state.run, self.user_id
        match frame:
            case PingFrame():
                self.conn.send({"type": "pong", "req_id": frame.req_id})
            case SendFrame():
                res = await run(lambda s: s.send(uid, frame.data, conn_id=self.conn.id))
                self._ack(frame.req_id, {"message": res.message, "duplicate": res.duplicate})
            case EditFrame():
                msg = await run(lambda s: s.edit(uid, frame.data.message_id, frame.data.body))
                self._ack(frame.req_id, {"message": msg})
            case DeleteFrame():
                msg = await run(lambda s: s.delete(uid, frame.data.message_id))
                self._ack(frame.req_id, {"message": msg})
            case DeliveredFrame() | ReadFrame():
                what = "read" if isinstance(frame, ReadFrame) else "delivered"
                await run(lambda s: s.mark(uid, frame.data.conversation_id, frame.data.seq, what))
                if frame.req_id:
                    self._ack(frame.req_id, {})
            case TypingFrame():
                key = str(frame.data.conversation_id)
                now = time.monotonic()
                if (
                    now - self.last_typing.get(key, 0.0)
                    >= self.state.settings.typing_min_interval_s
                ):
                    self.last_typing[key] = now
                    await run(lambda s: s.typing(uid, frame.data.conversation_id))
                if frame.req_id:
                    self._ack(frame.req_id, {})


def _req_id_of(raw: str) -> str | None:
    try:
        value = json.loads(raw).get("req_id")
        return value if isinstance(value, str) else None
    except Exception:
        return None
