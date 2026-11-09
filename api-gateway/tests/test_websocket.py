# AI-influenced: WebSocket relay tests written with Claude (Opus 5.5); see ai/usage-log.md.
"""The gateway's WebSocket relay, against a real WebSocket server standing in for
chat-service (it runs on its own event loop in a background thread)."""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import Iterator
from http import HTTPStatus

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed
from websockets.frames import Close

from app import exposed_routes
from app.config import Settings, settings
from app.main import app
from app.services.routing import resolve_websocket_upstream
from app.services.websocket import (
    MAX_FRAME_BYTES,
    WebSocketRelay,
    client_close_code,
    upstream_url,
)

ORIGIN = "http://localhost:5173"


class FakeChatService:
    """Accepts /chat/ws?ticket=good, refuses other tickets with 403, echoes frames and
    reports the request headers it saw. Sending "close-4002" makes it close with 4002."""

    received: list[str]

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self.port = 0
        self.seen_headers: list[dict[str, str]] = []
        self.received = []
        self._ready = threading.Event()
        self._stop: asyncio.Future[None] | None = None
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _process_request(self, connection: ServerConnection, request):  # noqa: ANN001
        self.seen_headers.append({k.lower(): v for k, v in request.headers.raw_items()})
        if request.path != "/chat/ws?ticket=good":
            return connection.respond(HTTPStatus.FORBIDDEN, "bad ticket\n")
        return None

    async def _handler(self, ws: ServerConnection) -> None:
        await ws.send(json.dumps({"type": "ready", "path": ws.request.path}))
        async for message in ws:
            self.received.append(message)
            if message == "close-4002":
                await ws.close(4002, "session expired")
                return
            await ws.send(f"echo:{message}")

    async def _main(self) -> None:
        self._stop = self.loop.create_future()
        async with serve(self._handler, "127.0.0.1", 0, process_request=self._process_request) as s:
            self.port = s.sockets[0].getsockname()[1]
            self._ready.set()
            await self._stop

    def _run(self) -> None:
        self.loop.run_until_complete(self._main())

    def __enter__(self) -> FakeChatService:
        self._thread.start()
        self._ready.wait(5)
        return self

    def __exit__(self, *_: object) -> None:
        self.loop.call_soon_threadsafe(self._stop.set_result, None)
        self._thread.join(5)


@pytest.fixture
def chat(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeChatService]:
    with FakeChatService() as fake:
        monkeypatch.setitem(
            exposed_routes.ROUTE_TABLE, "/api/chat", f"http://127.0.0.1:{fake.port}"
        )
        monkeypatch.setattr(settings, "cors_allowed_origins", ORIGIN)
        yield fake


client = TestClient(app)


def test_upstream_url_maps_the_public_path_to_the_backend_path():
    assert (
        upstream_url("http://chat-service:8000", "/api/chat/ws", "ticket=t")
        == "ws://chat-service:8000/chat/ws?ticket=t"
    )
    assert upstream_url("https://chat.example/", "/api/chat/ws", "") == "wss://chat.example/chat/ws"


@pytest.mark.parametrize(
    "path",
    ["/api/chat/ws/extra", "/api/chat/conversations", "/api/users/ws", "/api/chat/./ws"],
)
def test_only_allowlisted_paths_are_relayed(path):
    assert resolve_websocket_upstream(path) is None
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(path):
            pass
    assert exc.value.code == 1008


def test_frames_are_relayed_both_ways_with_the_query_string(chat: FakeChatService):
    with client.websocket_connect("/api/chat/ws?ticket=good", headers={"Origin": ORIGIN}) as ws:
        assert ws.receive_json() == {"type": "ready", "path": "/chat/ws?ticket=good"}
        ws.send_text("hello")
        assert ws.receive_text() == "echo:hello"


def test_client_headers_never_reach_the_backend(chat: FakeChatService):
    spoofed = {
        "Origin": ORIGIN,
        "X-User-Id": "admin",
        "X-User-Role": "admin",
        "Authorization": "Bearer stolen",
        "Cookie": "session=1",
    }
    with client.websocket_connect("/api/chat/ws?ticket=good", headers=spoofed) as ws:
        ws.receive_json()
    seen = chat.seen_headers[-1]
    for header in ("x-user-id", "x-user-role", "authorization", "cookie", "origin"):
        assert header not in seen, header
    assert "x-forwarded-for" in seen


def test_foreign_origins_are_refused(chat: FakeChatService):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(
            "/api/chat/ws?ticket=good", headers={"Origin": "https://evil.example"}
        ):
            pass
    assert exc.value.code == 1008
    assert chat.seen_headers == []  # never reached the backend


def test_backend_refusal_refuses_the_client(chat: FakeChatService):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/chat/ws?ticket=forged", headers={"Origin": ORIGIN}):
            pass
    assert exc.value.code == 1008


def test_backend_close_code_reaches_the_client(chat: FakeChatService):
    with client.websocket_connect("/api/chat/ws?ticket=good", headers={"Origin": ORIGIN}) as ws:
        ws.receive_json()
        ws.send_text("close-4002")
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 4002


def test_unreachable_backend_is_refused(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setitem(exposed_routes.ROUTE_TABLE, "/api/chat", "http://127.0.0.1:9")
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/chat/ws?ticket=good"):
            pass
    assert exc.value.code == 1011


def test_oversized_client_frames_are_refused_before_the_backend(chat: FakeChatService):
    with client.websocket_connect("/api/chat/ws?ticket=good", headers={"Origin": ORIGIN}) as ws:
        ws.receive_json()
        ws.send_text("x" * (MAX_FRAME_BYTES + 1))
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 1009
    assert chat.received == []


@pytest.mark.parametrize(
    ("backend_code", "expected"),
    [
        (4002, 4002),
        (4008, 4008),
        (1000, 1000),
        (1005, 1000),
        (1006, 1011),
        (1010, 1011),
        (None, 1011),
    ],
)
def test_backend_close_codes_map_to_codes_a_server_may_send(backend_code, expected):
    assert client_close_code(backend_code) == expected


class _ClientMidSend:
    """A client that keeps sending; records how the gateway closes it."""

    def __init__(self) -> None:
        self.closed_with: tuple[int, str] | None = None

    async def receive(self) -> dict[str, str]:
        return {"type": "websocket.receive", "text": "hello"}

    async def close(self, code: int, reason: str = "") -> None:
        self.closed_with = (code, reason)


class _BackendClosingMidSend:
    """A backend that has started closing with 4002: sends fail at once, its stream has
    not ended yet, and close_code is only set once the closing handshake is over."""

    def __init__(self) -> None:
        self.close_code: int | None = None
        self.close_reason: str | None = None
        self._never = asyncio.Event()

    async def send(self, _data: str) -> None:
        raise ConnectionClosed(Close(4002, "session expired"), None)

    def __aiter__(self) -> _BackendClosingMidSend:
        return self

    async def __anext__(self) -> str:
        await self._never.wait()
        raise StopAsyncIteration

    async def wait_closed(self) -> None:
        self.close_code, self.close_reason = 4002, "session expired"


def test_backend_close_code_survives_a_client_sending_at_the_same_time():
    # The send to the backend fails before the backend's stream ends, so the
    # client-to-backend direction finishes first; the 4002 must still reach the client.
    ws, backend = _ClientMidSend(), _BackendClosingMidSend()
    asyncio.run(WebSocketRelay()._relay(ws, backend))  # type: ignore[arg-type]
    assert ws.closed_with == (4002, "session expired")


def test_allowed_origins_are_normalized_like_browser_origins():
    configured = Settings(cors_allowed_origins=" HTTP://Localhost:5173/ ,https://foc.example,, ")
    assert configured.allowed_origins == ["http://localhost:5173", "https://foc.example"]


def test_origin_config_with_a_trailing_slash_still_accepts_the_browser(
    chat: FakeChatService, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "cors_allowed_origins", ORIGIN.upper() + "/")
    with client.websocket_connect("/api/chat/ws?ticket=good", headers={"Origin": ORIGIN}) as ws:
        assert ws.receive_json()["type"] == "ready"
