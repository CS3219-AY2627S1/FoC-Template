# AI-influenced: WebSocket relay written with Claude (Opus 5.5); see ai/usage-log.md.
"""Relays allowlisted WebSocket connections to backend services.

The gateway stays the only public entry point for live connections too. Browsers
cannot send a bearer token on a WebSocket handshake, so these routes are not
authenticated here: the backend authenticates the handshake itself (chat-service
redeems a one-time ticket the client obtained through an authenticated HTTP route).
The gateway still:

* only relays paths listed in ``EXPOSED_WEBSOCKET_ROUTES`` (default deny),
* refuses handshakes from browser origins outside ``CORS_ALLOWED_ORIGINS``
  (cross-site WebSocket hijacking; WebSockets are not covered by CORS),
* never forwards client headers, so no client can assert ``X-User-Id``,
* caps frames at ``MAX_FRAME_BYTES`` in both directions (1009 to the client),
* refuses the client if the backend refuses the handshake, and passes the backend's
  close code (e.g. 4002 "re-authenticate") through to the client.

A refusal before the upgrade reaches the browser as HTTP 403.

No subprotocol is negotiated: ``Sec-WebSocket-Protocol`` is not forwarded and the
gateway accepts without one, so a browser that asks for a subprotocol fails the
connection. Never carry tokens in it; use the query-string ticket.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from enum import Enum

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake, InvalidStatus

from app.config import settings
from app.services.routing import resolve_websocket_upstream

logger = logging.getLogger(__name__)

NORMAL_CLOSURE = 1000
NO_STATUS_RECEIVED = 1005
POLICY_VIOLATION = 1008
MESSAGE_TOO_BIG = 1009
INTERNAL_ERROR = 1011
MAX_FRAME_BYTES = 1 << 20
# How long to wait for the backend's closing handshake before reading its close code.
CLOSE_WAIT_S = 2.0
# Close codes a server may send (RFC 6455 §7.4.1; 1010 is client-only); anything else
# becomes 1011, except 1005 "no status", which is a clean close.
_SENDABLE = {1000, 1001, 1003, 1007, 1008, 1009, 1011, 1012, 1013, 1014, *range(3000, 5000)}


class _End(Enum):
    CLIENT_GONE = "client gone"  # the client left, or the gateway already closed it
    BACKEND_CLOSED = "backend closed"


def allowed_origins() -> set[str]:
    return set(settings.allowed_origins)


def upstream_url(base_url: str, path: str, query: str) -> str:
    """http://chat-service:8000 + /api/chat/ws -> ws://chat-service:8000/chat/ws?..."""
    ws_base = "ws" + base_url[4:] if base_url.startswith("http") else base_url
    backend_path = path[4:] if path.startswith("/api/") else path
    return ws_base.rstrip("/") + backend_path + (f"?{query}" if query else "")


def client_close_code(backend_code: int | None) -> int:
    """The code to close the client with after the backend closed with ``backend_code``."""
    if backend_code == NO_STATUS_RECEIVED:
        return NORMAL_CLOSURE
    return backend_code if backend_code in _SENDABLE else INTERNAL_ERROR


class WebSocketRelay:
    async def handle(self, websocket: WebSocket) -> None:
        path = websocket.url.path
        upstream = resolve_websocket_upstream(path)
        if upstream is None:
            await websocket.close(POLICY_VIOLATION)
            return
        origin = websocket.headers.get("origin")
        if origin is not None and origin.lower().rstrip("/") not in allowed_origins():
            logger.info("refused WebSocket from origin %r", origin)
            await websocket.close(POLICY_VIOLATION)
            return

        forwarded = {}
        if websocket.client is not None:
            forwarded["X-Forwarded-For"] = websocket.client.host
        url = upstream_url(upstream, path, websocket.url.query)
        try:
            backend = await connect(
                url,
                additional_headers=forwarded,
                open_timeout=5,
                max_size=MAX_FRAME_BYTES,
                ping_interval=20,
                ping_timeout=20,
            )
        except InvalidStatus:
            # The backend refused the handshake (e.g. bad ticket): refuse the client too.
            await websocket.close(POLICY_VIOLATION)
            return
        except (OSError, TimeoutError, InvalidHandshake):
            logger.warning("WebSocket upstream %s unavailable", upstream)
            await websocket.close(INTERNAL_ERROR)
            return

        await websocket.accept()
        try:
            await self._relay(websocket, backend)
        finally:
            await backend.close()

    async def _relay(self, websocket: WebSocket, backend: ClientConnection) -> None:
        to_backend = asyncio.create_task(self._client_to_backend(websocket, backend))
        to_client = asyncio.create_task(self._backend_to_client(websocket, backend))
        done, pending = await asyncio.wait(
            {to_backend, to_client}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)

        ends = set()
        for task in done:
            if task.exception() is not None:
                logger.error("WebSocket relay failed", exc_info=task.exception())
            else:
                ends.add(task.result())
        # Decide on what ended, not on which task noticed first: a backend close can
        # surface in either direction (a send to it fails, or its stream ends).
        if _End.BACKEND_CLOSED in ends:
            # close_code is only set once the closing handshake is over.
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(backend.wait_closed(), CLOSE_WAIT_S)
            code = client_close_code(backend.close_code)
            try:
                await websocket.close(code, backend.close_reason or "")
            except RuntimeError:
                pass  # the client is already gone

    @staticmethod
    async def _client_to_backend(websocket: WebSocket, backend: ClientConnection) -> _End:
        try:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return _End.CLIENT_GONE
                data = message.get("text")
                if data is None:
                    data = message.get("bytes")
                if data is None:
                    continue
                size = len(data.encode()) if isinstance(data, str) else len(data)
                if size > MAX_FRAME_BYTES:
                    await websocket.close(MESSAGE_TOO_BIG)
                    return _End.CLIENT_GONE
                await backend.send(data)
        except (WebSocketDisconnect, RuntimeError):
            return _End.CLIENT_GONE
        except ConnectionClosed:
            return _End.BACKEND_CLOSED

    @staticmethod
    async def _backend_to_client(websocket: WebSocket, backend: ClientConnection) -> _End:
        try:
            async for data in backend:
                if isinstance(data, str):
                    await websocket.send_text(data)
                else:
                    await websocket.send_bytes(data)
        except ConnectionClosed:
            pass
        except (WebSocketDisconnect, RuntimeError):
            return _End.CLIENT_GONE  # client went away mid-send
        return _End.BACKEND_CLOSED
