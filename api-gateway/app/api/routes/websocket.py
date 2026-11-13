from __future__ import annotations

from fastapi import APIRouter, WebSocket

from app.services.websocket import WebSocketRelay

router = APIRouter()
relay = WebSocketRelay()


@router.websocket("/api/{path:path}")
async def websocket_proxy(websocket: WebSocket, path: str) -> None:
    """Relay an allowlisted WebSocket (see EXPOSED_WEBSOCKET_ROUTES); refuse the rest."""
    await relay.handle(websocket)
