# AI-influenced: ported from the standalone chat-service with Claude (Opus 5.5);
# see ai/usage-log.md.
"""Service-to-service API (X-Service-Key). The gateway never exposes these routes."""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import require_service
from app.errors import invalid
from app.schemas.conversations import (
    AddMemberBody,
    CreateConversationBody,
    SystemMessageBody,
    UpdateConversationBody,
)
from app.state import AppState, get_state

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(require_service)])


@router.post("/conversations")
async def create_conversation(
    body: CreateConversationBody, response: Response, state: AppState = Depends(get_state)
) -> dict[str, Any]:
    """Get or create. With a `unique_key`, repeating the call returns the same conversation
    (members are only added on creation) — safe to retry."""
    conversation, created = await state.run(lambda s: s.create_conversation(body))
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return {"conversation": conversation, "created": created}


@router.get("/conversations")
async def find_conversations(
    unique_key: str | None = None,
    metadata: str | None = Query(default=None, description='JSON object, e.g. {"order_id":"123"}'),
    limit: int = Query(default=100, ge=1, le=500),
    state: AppState = Depends(get_state),
) -> list[dict[str, Any]]:
    """Look up by unique_key and/or metadata containment (`metadata @> {...}`)."""
    filters: dict[str, Any] | None = None
    if metadata:
        try:
            filters = json.loads(metadata)
        except json.JSONDecodeError as exc:
            raise invalid("metadata must be a JSON object") from exc
        if not isinstance(filters, dict):
            raise invalid("metadata must be a JSON object")
    return await state.run(
        lambda s: s.find_conversations(unique_key=unique_key, metadata=filters, limit=limit)
    )


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: uuid.UUID, state: AppState = Depends(get_state)
) -> dict[str, Any]:
    return await state.run(lambda s: s.get_conversation(conversation_id))


@router.patch("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: uuid.UUID, body: UpdateConversationBody, state: AppState = Depends(get_state)
) -> dict[str, Any]:
    """Only the fields present in the body change. `metadata` is replaced, not merged."""
    return await state.run(lambda s: s.update_conversation(conversation_id, body))


@router.post("/conversations/{conversation_id}/members")
async def add_member(
    conversation_id: uuid.UUID, body: AddMemberBody, state: AppState = Depends(get_state)
) -> dict[str, Any]:
    """`include_history: false` hides everything before the join (e.g. a reassigned agent)."""
    return await state.run(lambda s: s.add_member(conversation_id, body))


@router.delete("/conversations/{conversation_id}/members/{user_id}")
async def remove_member(
    conversation_id: uuid.UUID, user_id: uuid.UUID, state: AppState = Depends(get_state)
) -> dict[str, Any]:
    return await state.run(lambda s: s.remove_member(conversation_id, user_id))


@router.post("/conversations/{conversation_id}/close")
async def close_conversation(
    conversation_id: uuid.UUID, state: AppState = Depends(get_state)
) -> dict[str, Any]:
    """Makes the conversation read-only. Idempotent."""
    return await state.run(lambda s: s.close(conversation_id))


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def post_system_message(
    conversation_id: uuid.UUID, body: SystemMessageBody, state: AppState = Depends(get_state)
) -> dict[str, Any]:
    """Post a system message: a template key + params that clients render (and translate)."""
    return await state.run(lambda s: s.post_system_message(conversation_id, body.key, body.params))
