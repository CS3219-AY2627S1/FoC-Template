# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), dates: 2026-11-08 to 2026-11-10
# Scope: Implementation and test assistance for Chat Service.

import asyncio
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, conversation_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[conversation_id].add(websocket)

    async def disconnect(self, conversation_id: UUID, websocket: WebSocket) -> None:
        async with self._lock:
            connections = self._connections.get(conversation_id)
            if connections is None:
                return
            connections.discard(websocket)
            if not connections:
                self._connections.pop(conversation_id, None)

    async def broadcast(self, conversation_id: UUID, payload: dict) -> None:
        async with self._lock:
            connections = list(self._connections.get(conversation_id, ()))
        failed: list[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                failed.append(websocket)
        for websocket in failed:
            await self.disconnect(conversation_id, websocket)


manager = ConnectionManager()

