# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Added or extended tests for WebSocket origin, authentication, and participant checks.
# Author review: I validated correctness and added boundary checks where needed.

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import Settings
from app.main import create_app


@pytest.mark.parametrize(
    "origin,path",
    [
        ("https://outsider.example", "/v1/chat/ws"),
        (None, "/v1/chat/ws"),
        ("http://localhost:3000", "/v1/chat/ws?token=never-in-url"),
    ],
)
def test_reject_origins_and_url_credentials(origin, path):
    with TestClient(create_app(Settings(_env_file=None))) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(path, headers={"origin": origin} if origin else {}):
                pass


def test_first_frame_and_timeout():
    settings = Settings(_env_file=None, websocket_auth_timeout_seconds=0.05)
    with TestClient(create_app(settings)) as client:
        for data in ({"type": "ping"}, {"type": "authenticate", "accessToken": "expired"}, {}):
            with client.websocket_connect(
                "/v1/chat/ws", headers={"origin": "http://localhost:3000"}
            ) as ws:
                ws.send_json(data)
                with pytest.raises(WebSocketDisconnect) as caught:
                    ws.receive_json()
                assert caught.value.code == 4401
        with client.websocket_connect(
            "/v1/chat/ws", headers={"origin": "http://localhost:3000"}
        ) as ws:
            with pytest.raises(WebSocketDisconnect) as caught:
                ws.receive_json()
            assert caught.value.code == 4401
